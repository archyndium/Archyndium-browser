// ==========================================
// ★ 拡張機能（Chrome 拡張機能の読み込み・インストール）
// ==========================================
// Electron が持っている「Chrome 拡張機能の読み込み」機能を使う。入れ方は 3 通り：
//   ・Chrome ウェブストアの URL（または拡張機能の ID）… ストアから .crx を取得して展開する
//   ・.crx ファイル
//   ・展開済みのフォルダ（manifest.json があるフォルダ。開発中の拡張機能など）
// 入れた拡張機能は userData/extensions.json に記録し、次回の起動時にも読み込む。
// 注意：Electron が対応している拡張機能 API は Chrome の一部だけ（content script・storage・runtime・
//   一部の tabs・webRequest など）。広告ブロック系・見た目を変える系・ページに機能を足す系は動きやすく、
//   ブラウザのタブやウィンドウ全体を操作する系（タブ管理・パスワード管理など）は動かないことが多い。
const { app, ipcMain, dialog, session, net, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { createStore } = require('./store');
const windows = require('./windows');

const store = createStore('extensions', { list: [] }); // [{ dir, managed, enabled, storeId, source, addedAt }]
const EXT_ROOT = () => path.join(app.getPath('userData'), 'extensions');
let ses = null;

function extApi(s) {
  // Electron 36 以降は session.extensions に移った。どちらでも動くようにする
  return s.extensions && typeof s.extensions.loadExtension === 'function' ? s.extensions : s;
}

// ---------- .crx の展開 ----------
// CRX = 署名ヘッダ + ZIP。ヘッダを読み飛ばして ZIP 部分を展開する。
// CRX3 の場合は公開鍵を manifest.json の "key" に入れて、Chrome と同じ拡張機能 ID になるようにする
function readVarint(buf, pos) {
  let result = 0, shift = 0, b;
  do { b = buf[pos++]; result += (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b & 0x80);
  return [result, pos];
}

function parseProto(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let key; [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8), type = key & 7;
    if (type === 0) { let v; [v, pos] = readVarint(buf, pos); fields.push({ field, value: v }); }
    else if (type === 2) { let len; [len, pos] = readVarint(buf, pos); fields.push({ field, bytes: buf.subarray(pos, pos + len) }); pos += len; }
    else if (type === 5) pos += 4;
    else if (type === 1) pos += 8;
    else break;
  }
  return fields;
}

function idFromPublicKey(der) {
  const hash = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hash].map(c => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}

function splitCrx(buf) {
  if (buf.toString('ascii', 0, 4) !== 'Cr24') {
    if (buf.readUInt32LE(0) === 0x04034b50) return { zip: buf, publicKey: null }; // ただの ZIP
    throw new Error('.crx ファイルではありません');
  }
  const version = buf.readUInt32LE(4);
  if (version === 2) {
    const keyLen = buf.readUInt32LE(8), sigLen = buf.readUInt32LE(12);
    return { zip: buf.subarray(16 + keyLen + sigLen), publicKey: buf.subarray(16, 16 + keyLen) };
  }
  if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    const header = buf.subarray(12, 12 + headerLen);
    let publicKey = null;
    try {
      const fields = parseProto(header);
      const signed = fields.find(f => f.field === 10000);
      const crxId = signed ? parseProto(signed.bytes).find(f => f.field === 1)?.bytes : null;
      const wantId = crxId ? [...crxId].map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('') : null;
      const keys = fields.filter(f => f.field === 2).map(f => parseProto(f.bytes).find(x => x.field === 1)?.bytes).filter(Boolean);
      publicKey = keys.find(k => idFromPublicKey(k) === wantId) || keys[0] || null;
    } catch (e) {}
    return { zip: buf.subarray(12 + headerLen), publicKey };
  }
  throw new Error(`対応していない .crx の形式です（version ${version}）`);
}

function unzipTo(zip, destDir) {
  // 中央ディレクトリ終端（EOCD）を後ろから探す
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP の形式が正しくありません');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const root = path.resolve(destDir);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP の形式が正しくありません');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // "../" などで展開先の外に書き出させない
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('不正なファイル名が含まれています');
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }

    const lNameLen = zip.readUInt16LE(localOffset + 26), lExtraLen = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(start, start + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`対応していない圧縮形式です（${method}）`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

function installCrxBuffer(buf, { storeId = null, source = 'crx' } = {}) {
  const { zip, publicKey } = splitCrx(buf);
  const id = storeId || (publicKey ? idFromPublicKey(publicKey) : crypto.randomBytes(8).toString('hex'));
  const dir = path.join(EXT_ROOT(), id);
  const tmp = dir + '.tmp-' + Date.now();
  fs.mkdirSync(tmp, { recursive: true });
  try {
    unzipTo(zip, tmp);
    const manifestPath = path.join(tmp, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('manifest.json が見つかりません');
    if (publicKey) {
      const manifest = JSON.parse(stripBom(fs.readFileSync(manifestPath, 'utf8')));
      if (!manifest.key) {
        manifest.key = Buffer.from(publicKey).toString('base64');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }
    // 古いバージョンを置き換える
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return { dir, managed: true, storeId, source };
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// ---------- ウェブストア ----------
function storeIdFrom(input) {
  const m = String(input || '').match(/(?:^|[/?=])([a-p]{32})(?:$|[/?#&])/) || String(input || '').trim().match(/^([a-p]{32})$/);
  return m ? m[1] : null;
}

async function downloadFromStore(storeId) {
  const prodversion = process.versions.chrome;
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${prodversion}&acceptformat=crx2,crx3&x=id%3D${storeId}%26installsource%3Dondemand%26uc`;
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`ストアから取得できませんでした（${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('ストアにこの拡張機能が見つかりませんでした（非公開・地域制限・有料の可能性があります）');
  return buf;
}

// ---------- 読み込み・一覧 ----------
function readManifest(dir) {
  return JSON.parse(stripBom(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
}

// "__MSG_appName__" のような多言語の名前を実際の文字に置き換える
function localize(dir, manifest, text) {
  const m = /^__MSG_(.+)__$/.exec(text || '');
  if (!m) return text || '';
  const locales = [app.getLocale().replace('-', '_'), app.getLocale().split('-')[0], manifest.default_locale, 'en'].filter(Boolean);
  for (const loc of locales) {
    try {
      const msgs = JSON.parse(stripBom(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8')));
      const key = Object.keys(msgs).find(k => k.toLowerCase() === m[1].toLowerCase());
      if (key) return msgs[key].message;
    } catch (e) {}
  }
  return text;
}

function iconDataUrl(dir, manifest) {
  const sets = [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon];
  for (const set of sets) {
    if (!set) continue;
    const file = typeof set === 'string' ? set : set[Object.keys(set).map(Number).sort((a, b) => a - b).find(s => s >= 32) || Object.keys(set).pop()];
    if (!file) continue;
    try {
      const img = nativeImage.createFromPath(path.join(dir, file));
      if (!img.isEmpty()) return img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL();
    } catch (e) {}
  }
  return '';
}

function loadedById() {
  const map = {};
  if (ses) extApi(ses).getAllExtensions().forEach(e => { map[path.normalize(e.path)] = e; });
  return map;
}

async function loadOne(entry) {
  if (!ses || !entry.enabled || !fs.existsSync(path.join(entry.dir, 'manifest.json'))) return null;
  try {
    return await extApi(ses).loadExtension(entry.dir, { allowFileAccess: true });
  } catch (e) {
    console.log('[extensions] 読み込みに失敗しました:', entry.dir, e.message);
    entry.error = String(e.message || e);
    return null;
  }
}

async function load(s) {
  ses = s;
  for (const entry of store.get('list')) await loadOne(entry);
}

function describe(entry) {
  const loaded = loadedById()[path.normalize(entry.dir)];
  let manifest = {};
  try { manifest = readManifest(entry.dir); } catch (e) {}
  const popup = manifest.action?.default_popup || manifest.browser_action?.default_popup || '';
  const options = manifest.options_ui?.page || manifest.options_page || '';
  return {
    key: entry.dir,
    id: loaded?.id || '',
    name: localize(entry.dir, manifest, manifest.name) || path.basename(entry.dir),
    description: localize(entry.dir, manifest, manifest.description),
    version: manifest.version || '',
    manifestVersion: manifest.manifest_version || 2,
    enabled: !!entry.enabled,
    loaded: !!loaded,
    error: !loaded && entry.enabled ? (entry.error || '読み込めませんでした') : '',
    icon: iconDataUrl(entry.dir, manifest),
    hasPopup: !!popup,
    popup,
    options,
    source: entry.source,
    storeId: entry.storeId || '',
  };
}

function list() {
  return store.get('list').map(describe);
}

async function addEntry(entry) {
  const all = store.get('list').filter(e => path.normalize(e.dir) !== path.normalize(entry.dir));
  // 同じ拡張機能の古いものが読み込まれていれば外す
  const old = loadedById()[path.normalize(entry.dir)];
  if (old) try { extApi(ses).removeExtension(old.id); } catch (e) {}
  const full = { ...entry, enabled: true, addedAt: Date.now() };
  all.push(full);
  store.set('list', all);
  const ext = await loadOne(full);
  store.set('list', all); // error を保存
  if (!ext) throw new Error(full.error || '拡張機能を読み込めませんでした');
  windows.sendToAll('extensions-changed');
  return describe(full);
}

// ---------- ポップアップ（ツールバーのボタンを押した時の小窓） ----------
let popupWin = null;
function openPopup(event, key, anchor) {
  const info = list().find(e => e.key === key);
  if (!info || !info.id || !info.popup) return false;
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
  const parent = BrowserWindow.fromWebContents(event.sender);
  const cb = parent.getContentBounds();
  const w = new BrowserWindow({
    width: 360, height: 200, show: false, frame: false, resizable: false, skipTaskbar: true, parent,
    minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#ffffff',
    // enablePreferredSizeMode … 中身の大きさを教えてもらい、Chrome と同じく中身に合わせた大きさにする
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, enablePreferredSizeMode: true },
  });
  popupWin = w;
  // ボタンの右端に揃えて、その下に出す
  const place = (width, height) => {
    const x = Math.round(cb.x + (anchor?.right || cb.width) - width);
    const y = Math.round(cb.y + (anchor?.bottom || 60) + 6);
    w.setBounds({ x: Math.max(cb.x, x), y, width, height });
  };
  place(360, 200);
  w.loadURL(`chrome-extension://${info.id}/${info.popup.replace(/^\//, '')}`);
  const fit = (size) => place(Math.min(Math.max(size.width, 120), 800), Math.min(Math.max(size.height, 40), 600));
  w.webContents.on('preferred-size-changed', (e, size) => { if (!w.isDestroyed()) fit(size); });
  w.webContents.once('did-finish-load', () => { setTimeout(() => { if (!w.isDestroyed()) w.show(); }, 60); });
  w.on('blur', () => { if (!w.isDestroyed()) w.close(); });
  w.on('closed', () => { if (popupWin === w) popupWin = null; });
  return true;
}

function init() {
  ipcMain.handle('extensions-list', () => list());

  ipcMain.handle('extensions-install-folder', async (event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: '展開済みの拡張機能フォルダを選択（manifest.json があるフォルダ）', properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const dir = r.filePaths[0];
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) return { error: 'このフォルダには manifest.json がありません' };
    try { return { ok: true, ext: await addEntry({ dir, managed: false, source: 'folder' }) }; } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('extensions-install-crx', async (event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: '拡張機能ファイル（.crx / .zip）を選択', properties: ['openFile'], filters: [{ name: '拡張機能', extensions: ['crx', 'zip'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    try {
      const entry = installCrxBuffer(fs.readFileSync(r.filePaths[0]), { source: 'crx' });
      return { ok: true, ext: await addEntry(entry) };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('extensions-install-store', async (event, input) => {
    const storeId = storeIdFrom(input);
    if (!storeId) return { error: 'ウェブストアの URL か、32 文字の拡張機能 ID を入力してください' };
    try {
      const entry = installCrxBuffer(await downloadFromStore(storeId), { storeId, source: 'store' });
      return { ok: true, ext: await addEntry(entry) };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('extensions-set-enabled', async (event, key, enabled) => {
    const all = store.get('list');
    const entry = all.find(e => e.dir === key);
    if (!entry) return list();
    entry.enabled = !!enabled;
    delete entry.error;
    if (enabled) await loadOne(entry);
    else {
      const loaded = loadedById()[path.normalize(entry.dir)];
      if (loaded) try { extApi(ses).removeExtension(loaded.id); } catch (e) {}
    }
    store.set('list', all);
    windows.sendToAll('extensions-changed');
    return list();
  });

  ipcMain.handle('extensions-remove', async (event, key) => {
    const all = store.get('list');
    const entry = all.find(e => e.dir === key);
    if (!entry) return list();
    const loaded = loadedById()[path.normalize(entry.dir)];
    if (loaded) try { extApi(ses).removeExtension(loaded.id); } catch (e) {}
    // ストア・.crx から入れた物はこちらで展開したフォルダなので消す（自分で選んだフォルダは消さない）
    if (entry.managed && path.normalize(entry.dir).startsWith(path.normalize(EXT_ROOT()) + path.sep)) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
    }
    store.set('list', all.filter(e => e !== entry));
    windows.sendToAll('extensions-changed');
    return list();
  });

  ipcMain.handle('extensions-open-popup', (event, key, anchor) => openPopup(event, key, anchor));
}

module.exports = { init, load, storeIdFrom, installCrxBuffer, unzipTo };
