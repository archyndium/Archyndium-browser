// ==========================================
// ★ 歌詞取得（LRCLIB）
// ==========================================
// 1. lyrics-query.js でタイトル/メタデータから「アーティスト × 曲名」の候補を複数作る
// 2. LRCLIB を候補ごとに検索し、結果を 曲名・アーティスト・再生時間 で採点して一番良いものを採用
//    （以前は 1 件目を無条件で採用していたため、別の曲の歌詞が出ることがあった）
// 3. LRCLIB で見つからない曲は、利用者が自分の .lrc ファイルを読み込むか、
//    歌詞エディタで作って保存できる（renderer/lyrics-local.js）
const { ipcMain, net, dialog, app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { buildCandidates, scoreResult, stripTimestamps, parseSynced } = require('./lyrics-query');

const ACCEPT_SCORE = 0.62;   // これ未満は「別の曲」とみなして採用しない
const GOOD_ENOUGH = 0.88;    // これ以上が見つかったら残りの検索を打ち切る
const REQUEST_TIMEOUT_MS = 8000;
// 同じ曲を何度も検索しない（自動検索だけ。キー：候補すべて + 再生時間）
// ▼ 修正：以前はキーが「最初の候補」だけで、手動検索も同じキャッシュを引いていたため、
//   一度間違った歌詞を採用すると Edit から手動で検索し直しても同じ結果が返り続けていた
const cache = new Map();
// LRCLIB のレコード（id → 内容）。「他の候補から選ぶ」で使う
const lrcRecords = new Map();

function rememberRecord(r) {
  lrcRecords.set(r.id, r);
  if (lrcRecords.size > 300) lrcRecords.delete(lrcRecords.keys().next().value);
}

function lrcResult(r, score) {
  return {
    lyrics: r.plainLyrics || stripTimestamps(r.syncedLyrics || ''),
    synced: parseSynced(r.syncedLyrics),
    artist: r.artistName, song: r.trackName,
    source: 'LRCLIB', score, id: r.id,
  };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, headers: { 'User-Agent': 'ARCHYNDIUM/1.0' } });
    const timer = setTimeout(() => { request.abort(); reject(new Error('timeout')); }, REQUEST_TIMEOUT_MS);
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => { clearTimeout(timer); resolve(body); });
    });
    request.on('error', (err) => { clearTimeout(timer); reject(err); });
    request.end();
  });
}

// ---------- LRCLIB ----------
// 戻り値 { found, alternatives }。alternatives は採点順の候補一覧（別アーティストの同名曲も含む）
async function searchLrclib(candidates, duration, knownArtists) {
  let best = null;
  const scored = new Map(); // id -> { score, r }
  const tried = new Set();
  const queries = [];
  for (const c of candidates) {
    if (c.artist) queries.push({ c, qs: `track_name=${encodeURIComponent(c.song)}&artist_name=${encodeURIComponent(c.artist)}` });
    queries.push({ c, qs: `q=${encodeURIComponent(`${c.artist} ${c.song}`.trim())}` });
  }
  for (const { c, qs } of queries.slice(0, 8)) {
    if (tried.has(qs)) continue;
    tried.add(qs);
    let results;
    try { results = JSON.parse(await fetchText(`https://lrclib.net/api/search?${qs}`)); } catch (e) { continue; }
    if (!Array.isArray(results)) continue;
    for (const r of results.slice(0, 20)) {
      if (r.instrumental || !(r.plainLyrics || r.syncedLyrics)) continue;
      rememberRecord(r);
      // 同点ならカラオケ表示できる同期歌詞つきを優先
      const score = scoreResult(r, c, duration, knownArtists) + (r.syncedLyrics ? 0.02 : 0);
      if (!scored.has(r.id) || scored.get(r.id).score < score) scored.set(r.id, { score, r });
      if (!best || score > best.score) best = { score, r };
    }
    if (best && best.score >= GOOD_ENOUGH) break;
  }
  // 見つからない時は、アーティスト名だけでも検索して「候補から選ぶ」に並べる（英語表記の曲名などに対応）
  if ((!best || best.score < ACCEPT_SCORE) && knownArtists.length) {
    try {
      const results = JSON.parse(await fetchText(`https://lrclib.net/api/search?q=${encodeURIComponent(knownArtists[0])}`));
      for (const r of (Array.isArray(results) ? results : []).slice(0, 30)) {
        if (r.instrumental || !(r.plainLyrics || r.syncedLyrics)) continue;
        rememberRecord(r);
        const score = Math.max(...candidates.map(c => scoreResult(r, c, duration, knownArtists)));
        if (!scored.has(r.id)) scored.set(r.id, { score, r });
        if (!best || score > best.score) best = { score, r };
      }
    } catch (e) {}
  }
  const alternatives = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 12)
    .map(({ score, r }) => ({ id: r.id, artist: r.artistName, song: r.trackName, album: r.albumName || '', duration: r.duration || 0, synced: !!r.syncedLyrics, score: Math.round(Math.min(score, 1) * 100) }));
  const found = best && best.score >= ACCEPT_SCORE ? lrcResult(best.r, best.score) : null;
  return { found, alternatives };
}

/**
 * payload:
 *   自動検索：{ title, artist?, duration? }   … title は動画/ページのタイトル、artist は mediaSession やチャンネル名
 *   手動検索：{ artist, song, manual: true }  … ユーザーが入力した値を最優先
 */
async function findLyrics(payload) {
  const duration = Number(payload.duration) || 0;
  let candidates;
  if (payload.manual) {
    // 手動検索：入力された値をそのまま最優先（整形した候補は後ろに足すだけ）
    candidates = [{ artist: (payload.artist || '').trim(), song: (payload.song || '').trim() }]
      .concat(buildCandidates({ title: payload.song || '', artist: payload.artist }));
  } else {
    candidates = buildCandidates({ title: payload.title || payload.song || '', artist: payload.artist });
  }
  candidates = candidates.filter(c => c.song);
  if (candidates.length === 0) return { success: false, error: '曲名を読み取れませんでした。', alternatives: [] };
  // 手動でアーティストを入れた時はそれだけを、自動の時はメタデータ由来の名前を「分かっているアーティスト」とする
  const knownArtists = payload.manual
    ? [(payload.artist || '').trim()].filter(Boolean)
    : [...new Set([payload.artist, ...candidates.map(c => c.artist)].filter(Boolean))];

  const key = JSON.stringify([candidates, Math.round(duration)]);
  if (!payload.manual && cache.has(key)) return cache.get(key);

  let found = null, alternatives = [];
  try { ({ found, alternatives } = await searchLrclib(candidates, duration, knownArtists)); } catch (e) {}

  const query = candidates[0];
  const result = found
    ? { success: true, lyrics: found.lyrics, synced: found.synced || null, source: found.source, artist: found.artist, song: found.song, id: found.id || null,
        matchScore: Math.min(100, Math.round(found.score * 100)), query, alternatives }
    : { success: false, error: '歌詞が見つかりませんでした。', guess: query, query, alternatives };
  if (found && !payload.manual) cache.set(key, result);
  return result;
}

// 「他の候補から選ぶ」：LRCLIB のレコード id を指定して歌詞を取得する
async function lyricsById(id) {
  let r = lrcRecords.get(id);
  if (!r) {
    try { r = JSON.parse(await fetchText(`https://lrclib.net/api/get/${encodeURIComponent(id)}`)); } catch (e) { r = null; }
    if (r && r.id) rememberRecord(r);
  }
  if (!r || !(r.plainLyrics || r.syncedLyrics)) return { success: false, error: '歌詞を取得できませんでした。' };
  const res = lrcResult(r, 1);
  return { success: true, lyrics: res.lyrics, synced: res.synced, source: 'LRCLIB', artist: res.artist, song: res.song, id: r.id, matchScore: 100, picked: true };
}

function init() {
  ipcMain.handle('fetch-lyrics', (event, payload) => findLyrics(payload || {}));
  ipcMain.handle('fetch-lyrics-by-id', (event, id) => lyricsById(id));
  // マイ歌詞を .lrc ファイルとして保存する
  ipcMain.handle('lyrics-export-lrc', async (event, content, name) => {
    const safe = String(name || 'lyrics').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'lyrics';
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: '歌詞を .lrc ファイルとして保存', defaultPath: path.join(app.getPath('documents'), `${safe}.lrc`),
      filters: [{ name: 'LRC 歌詞ファイル', extensions: ['lrc'] }, { name: 'テキスト', extensions: ['txt'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(content || ''), 'utf8');
    return r.filePath;
  });
}

module.exports = { init };
