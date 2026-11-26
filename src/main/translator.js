// ==========================================
// ★ 端末内の翻訳（Bergamot：Firefox の翻訳機能と同じエンジン）
// ==========================================
// ・翻訳はこの PC の中だけで行う。ページの文章や字幕を外部に送らない。無料・回数制限なし・オフラインでも動く
// ・翻訳モデル（言語の組み合わせごとに 1 つ）は、初めて使う時に Mozilla の公開場所からダウンロードする。
//   ダウンロードしたファイルは、下に書いた SHA-256 と一致した時だけ使う（壊れたファイル・差し替えを防ぐ）
// ・エンジン：@browsermt/bergamot-translator 0.4.9（MPL-2.0）を src/vendor/bergamot に同梱
// ・モデル：Mozilla の Firefox Translations のモデル（MPL-2.0）
const { app, ipcMain, utilityProcess, session, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const BASE = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/models';
// 使うモデルを固定する（Mozilla の一覧から「Release」になっているもの）。ファイルは .gz で配られ、展開後の SHA-256 で確認する
const MODELS = {
  'en-ja': {
    label: '英語 → 日本語', downloadSize: 36229257,
    files: {
      model: { url: `${BASE}/en-ja/llmaat_finetune10M_qe8_f2_ApiGGQIwTKuF9i_k3n9Q2Q/exported/model.enja.intgemm.alphas.bin.gz`, sha256: '59ae659f9bb63e4f81f474fe3c03d3f4499434b5f9e779fab7c12a45f31fd562' },
      shortlist: { url: `${BASE}/en-ja/llmaat_finetune10M_qe8_f2_ApiGGQIwTKuF9i_k3n9Q2Q/exported/lex.50.50.enja.s2t.bin.gz`, sha256: 'edfb7eb47b98a2689b804ab3614c31b24f1257aa54b1154da3d85e1ae8152d9f' },
      srcVocab: { url: `${BASE}/en-ja/llmaat_finetune10M_qe8_f2_ApiGGQIwTKuF9i_k3n9Q2Q/exported/srcvocab.enja.spm.gz`, sha256: '970c98d174fc01e0339fbabbf45af36a4be3f26f819ec1a5ea1189f71e091889' },
      trgVocab: { url: `${BASE}/en-ja/llmaat_finetune10M_qe8_f2_ApiGGQIwTKuF9i_k3n9Q2Q/exported/trgvocab.enja.spm.gz`, sha256: '3b3d9f8f3a034d98d0a476f1794fa79c01e4e98a967ceb6777a66ba2d03ec1e1' },
    },
  },
  'ja-en': {
    label: '日本語 → 英語', downloadSize: 48650784,
    files: {
      model: { url: `${BASE}/ja-en/cjk_icu_base_U4VUAW3STh-bF0Sr-dX69g/exported/model.jaen.intgemm.alphas.bin.gz`, sha256: 'a9bf800679bba570520e1161d7b4fbfcb957add32ca35812134add85689752ad' },
      shortlist: { url: `${BASE}/ja-en/cjk_icu_base_U4VUAW3STh-bF0Sr-dX69g/exported/lex.50.50.jaen.s2t.bin.gz`, sha256: '8f858a72fcbaa476c582577b04d6f5f89d645d2335b0b4a794c2706d4b1f75ff' },
      vocab: { url: `${BASE}/ja-en/cjk_icu_base_U4VUAW3STh-bF0Sr-dX69g/exported/vocab.jaen.spm.gz`, sha256: '5cb217758bae05877bb3f0c2f612e4e7c1e4cb03c10db11f4a47098d7ae62919' },
    },
  },
};

const modelsDir = () => path.join(app.getPath('userData'), 'translation-models');
const pairDir = (pair) => path.join(modelsDir(), pair);
const fileOf = (pair, key) => path.join(pairDir(pair), key + '.bin');

function isInstalled(pair) {
  const m = MODELS[pair];
  return !!m && Object.keys(m.files).every(k => fs.existsSync(fileOf(pair, k)));
}
function status() {
  return Object.fromEntries(Object.entries(MODELS).map(([pair, m]) => {
    let size = 0;
    if (isInstalled(pair)) Object.keys(m.files).forEach(k => { try { size += fs.statSync(fileOf(pair, k)).size; } catch (e) {} });
    return [pair, { label: m.label, installed: isInstalled(pair), downloadSize: m.downloadSize, diskSize: size, downloading: downloads.has(pair) }];
  }));
}

// ---------- ダウンロード（進み具合を画面へ知らせる） ----------
const downloads = new Map();   // pair -> Promise
function broadcast(channel, data) { webContents.getAllWebContents().forEach(wc => { try { if (wc.getType() === 'window') wc.send(channel, data); } catch (e) {} }); }

async function fetchGz(url, onBytes) {
  // Cookie などを送らない専用のセッションで取得する
  const res = await session.fromPartition('archyndium-models', { cache: false }).fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）`);
  const reader = res.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value)); onBytes(value.length);
  }
  return zlib.gunzipSync(Buffer.concat(chunks));
}

function downloadModel(pair) {
  const m = MODELS[pair];
  if (!m) return Promise.reject(new Error('unknown model'));
  if (isInstalled(pair)) return Promise.resolve(true);
  if (downloads.has(pair)) return downloads.get(pair);
  const job = (async () => {
    let received = 0;
    const tmp = pairDir(pair) + '.part';
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    try {
      for (const [key, f] of Object.entries(m.files)) {
        const data = await fetchGz(f.url, (n) => { received += n; broadcast('translate-download-progress', { pair, received, total: m.downloadSize }); });
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        if (hash !== f.sha256) throw new Error('ダウンロードしたファイルが正しくありません（SHA-256 が一致しません）');
        fs.writeFileSync(path.join(tmp, key + '.bin'), data);
      }
      fs.rmSync(pairDir(pair), { recursive: true, force: true });
      fs.renameSync(tmp, pairDir(pair));
      broadcast('translate-download-progress', { pair, received: m.downloadSize, total: m.downloadSize, done: true });
      return true;
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      broadcast('translate-download-progress', { pair, error: String(e.message || e) });
      throw e;
    } finally {
      downloads.delete(pair);
    }
  })();
  downloads.set(pair, job);
  return job;
}

function deleteModel(pair) {
  if (!MODELS[pair]) return false;
  fs.rmSync(pairDir(pair), { recursive: true, force: true });
  loaded.delete(pair);
  return true;
}

// ---------- 翻訳エンジン（別プロセス） ----------
let host = null, serial = 0;
const pending = new Map();
const loaded = new Set();   // エンジンに読み込み済みのモデル
let idleTimer = null;

function engineDir() {
  // asar の中の .wasm は worker から読めないので、asarUnpack した場所を使う
  return path.join(__dirname, '..', 'vendor', 'bergamot').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}
function ensureHost() {
  if (host) return host;
  host = utilityProcess.fork(path.join(__dirname, 'translator-host.js'), [engineDir()], { serviceName: 'ARCHYNDIUM Translation' });
  host.on('message', (msg) => {
    if (msg && msg.type === 'fatal') { console.warn('[translator]', msg.message); return; }
    const p = pending.get(msg.id); if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error)) : p.accept(msg.result);
  });
  host.on('exit', () => {
    host = null; loaded.clear();
    pending.forEach(p => p.reject(new Error('翻訳エンジンが終了しました'))); pending.clear();
  });
  return host;
}
function hostCall(name, ...args) {
  const h = ensureHost();
  return new Promise((accept, reject) => { const id = ++serial; pending.set(id, { accept, reject }); h.postMessage({ id, name, args }); });
}
// しばらく使わなければエンジンを止めてメモリを返す
function touchIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (host && !pending.size) { host.kill(); host = null; loaded.clear(); } }, 5 * 60 * 1000);
}

async function ensureLoaded(pair) {
  if (loaded.has(pair)) return;
  if (!isInstalled(pair)) throw new Error('MODEL_NOT_INSTALLED');
  const m = MODELS[pair];
  const read = (k) => { const b = fs.readFileSync(fileOf(pair, k)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const vocabs = m.files.vocab ? [read('vocab')] : [read('srcVocab'), read('trgVocab')];
  const [from, to] = pair.split('-');
  await hostCall('loadTranslationModel', { from, to }, { model: read('model'), shortlist: read('shortlist'), vocabs, config: {} });
  loaded.add(pair);
}

async function translate({ from, to, texts }) {
  const pair = `${from}-${to}`;
  if (!MODELS[pair]) throw new Error('UNSUPPORTED_PAIR');
  if (!Array.isArray(texts) || !texts.length) return [];
  touchIdle();
  await ensureLoaded(pair);
  const clean = texts.slice(0, 400).map(t => ({ text: String(t ?? '').slice(0, 5000), html: false }));
  const out = await hostCall('translate', { models: [{ from, to }], texts: clean });
  touchIdle();
  return out.map(r => r.target.text);
}

function init() {
  ipcMain.handle('translate-status', () => status());
  ipcMain.handle('translate-download', (e, pair) => downloadModel(pair).then(() => true, (err) => ({ error: String(err.message || err) })));
  ipcMain.handle('translate-delete-model', (e, pair) => deleteModel(pair));
  ipcMain.handle('translate-texts', async (e, req) => {
    try { return { result: await translate(req || {}) }; }
    catch (err) { return { error: String(err.message || err) }; }
  });
  app.on('will-quit', () => { if (host) host.kill(); });
}

module.exports = { init };
