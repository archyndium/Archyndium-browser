// --- ★ 歌詞抽出エンジン ---
// ▼ 変更：タイトルの分解と結果の照合は main/lyrics-query.js に移動。
//   ここでは「動画タイトル + mediaSession/チャンネル名 + 再生時間」をそのまま main に渡すだけ。
let lyricsRequestSeq = 0; // 曲が変わった後に古い検索結果が上書きしないようにする

function renderLyricsHeader(song, artist) {
  document.getElementById('lyrics-title').textContent = song || '—';
  document.getElementById('lyrics-artist').textContent = artist || 'Unknown Artist';
}

// ---------- 選んだ歌詞の記憶 ----------
// 「候補から選ぶ」や手動検索で決めた歌詞を、曲ごと（タイトル + アーティスト）に覚えておき、
// 次にその曲を再生した時は検索せずに同じ歌詞を出す
const LYRICS_CHOICE_KEY = 'archyndium_lyrics_choice';
let lastLyricsTrackKey = '';
let lastLyricsAlternatives = [];

function trackKeyOf(query) {
  return `${(query.title || query.song || '').trim()}|${(query.artist || '').trim()}`.toLowerCase();
}
function loadLyricsChoices() {
  try { return JSON.parse(localStorage.getItem(LYRICS_CHOICE_KEY)) || {}; } catch(e) { return {}; }
}
function rememberLyricsChoice(trackKey, id) {
  if (!trackKey || !id) return;
  const all = loadLyricsChoices();
  all[trackKey] = id;
  const keys = Object.keys(all);
  if (keys.length > 500) delete all[keys[0]];
  localStorage.setItem(LYRICS_CHOICE_KEY, JSON.stringify(all));
}
function forgetLyricsChoice(trackKey) {
  const all = loadLyricsChoices();
  delete all[trackKey];
  localStorage.setItem(LYRICS_CHOICE_KEY, JSON.stringify(all));
}

let lyricsSearching = false;

function showLyricsSearching(song, artist) {
  lyricsSearching = true;
  renderLyricsHeader(song, artist);
  // 前の曲の歌詞をミニプレイヤーに出し続けないよう、検索中表示に切り替える
  currentLyricsText = `<p style="color: var(--theme-light);">Searching multiple databases...</p>`;
  lyricsSourceHtml = '';
  setKaraokeLines(null);
  closeLyricsAlternatives();
  renderLyricsBody();
}

function showLyricsResult(result) {
  lyricsSearching = false;
  renderLyricsHeader(result.song, result.artist);
  currentLyricsText = escapeHtml(result.lyrics).replace(/\n/g, '<br>');
  const how = result.mine ? 'あなたが用意した歌詞' : result.picked ? '選択した歌詞' : `一致度 ${result.matchScore}%`;
  // .lyrics-content は white-space: pre-wrap なので、余計な改行・インデントを入れずに組み立てる
  lyricsSourceHtml = `<div class="lyrics-source">Source: ${escapeHtml(result.source)} · ${how}${result.synced ? ' · 同期歌詞' : ''}</div>`;
  setKaraokeLines(result.synced);
  renderLyricsBody();
}

function updateAlternativesButton() {
  const btn = document.getElementById('btn-lyrics-alts');
  btn.style.display = lastLyricsAlternatives.length ? '' : 'none';
  btn.textContent = `候補 ${lastLyricsAlternatives.length}`;
}

// query: 自動 { title, artist, duration } / 手動 { artist, song, manual: true }
async function performLyricsSearch(query, isManual = false) {
  const seq = ++lyricsRequestSeq;
  if (!isManual) lastLyricsTrackKey = trackKeyOf(query);
  showLyricsSearching(query.song || query.title, query.artist);

  let result;
  try { result = await window.electronAPI.fetchLyrics(query); } catch (err) { result = { success: false }; }
  if (seq !== lyricsRequestSeq) return;
  currentLyricsSyncManual = isManual;
  lastLyricsAlternatives = result.alternatives || [];
  updateAlternativesButton();

  // ▼ 修正：Edit 欄は「検索に使った値」を表示する。手動検索ではユーザーの入力をそのまま残す
  //   （以前は見つかった曲の名前で上書きしていたため、勝手に書き換わったように見えていた）
  if (!isManual && result.query) {
    document.getElementById('manual-artist').value = result.query.artist || '';
    document.getElementById('manual-song').value = result.query.song || '';
  }

  if (result.success && result.lyrics) {
    showLyricsResult(result);
    if (isManual && result.id) rememberLyricsChoice(lastLyricsTrackKey, result.id); // 手動で探した歌詞はこの曲用に覚える
  } else {
    const guess = result.guess || { artist: query.artist || '', song: query.song || query.title || '' };
    lyricsSearching = false;
    const alts = lastLyricsAlternatives.length ? `<br>上の「候補」から近い曲を選べます。` : '';
    currentLyricsText = `<p style="color: #E81123;">Lyrics not found.</p><p style="color: rgba(255,255,255,0.5); font-size:12px; margin-top:10px;">Artist: ${escapeHtml(guess.artist || '—')}<br>Song: ${escapeHtml(guess.song || '—')}<br>Edit から曲名・アーティストを直して再検索できます。${alts}<br>見つからない曲は「マイ歌詞」から .lrc ファイルを読み込むか、歌詞エディタで作れます。</p>`;
    lyricsSourceHtml = '';
    setKaraokeLines(null);
    renderLyricsBody();
  }
}

// 候補一覧から選んだ歌詞を表示し、この曲用に記憶する
async function loadLyricsById(id, { remember = true } = {}) {
  const seq = ++lyricsRequestSeq;
  let result;
  try { result = await window.electronAPI.fetchLyricsById(id); } catch(e) { result = { success: false }; }
  if (seq !== lyricsRequestSeq) return false;
  if (!result.success) return false;
  currentLyricsSyncManual = true; // 選んだ歌詞を自動検索で上書きしない
  showLyricsResult(result);
  if (remember) rememberLyricsChoice(lastLyricsTrackKey, id);
  return true;
}

function renderLyricsAlternatives() {
  const box = document.getElementById('lyrics-alts');
  const fmt = (sec) => sec ? formatTime(sec) : '';
  box.innerHTML = `<div class="la-head">別の歌詞を選ぶ<span class="la-close" id="la-close">×</span></div>` +
    lastLyricsAlternatives.map(a => `
      <div class="la-item" data-lyrics-id="${a.id}">
        <div class="la-main"><b>${escapeHtml(a.song)}</b><span>${escapeHtml(a.artist)}${a.album ? ' · ' + escapeHtml(a.album) : ''}</span></div>
        <div class="la-meta">${a.synced ? '<i>同期</i>' : ''}${fmt(a.duration)}</div>
      </div>`).join('') +
    (loadLyricsChoices()[lastLyricsTrackKey] ? `<div class="la-reset" id="la-reset">この曲の選択を解除して自動検索に戻す</div>` : '');
}

function closeLyricsAlternatives() {
  document.getElementById('lyrics-alts').classList.remove('show');
}

document.getElementById('btn-lyrics-alts').addEventListener('click', (e) => {
  e.stopPropagation();
  const box = document.getElementById('lyrics-alts');
  if (box.classList.toggle('show')) renderLyricsAlternatives();
});
document.getElementById('lyrics-alts').addEventListener('click', async (e) => {
  if (e.target.closest('#la-close')) { closeLyricsAlternatives(); return; }
  if (e.target.closest('#la-reset')) {
    forgetLyricsChoice(lastLyricsTrackKey);
    closeLyricsAlternatives();
    currentLyricsSyncManual = false;
    autoFetchLyrics(currentTrackTitleStr, { ignoreChoice: true });
    return;
  }
  const item = e.target.closest('[data-lyrics-id]');
  if (!item) return;
  closeLyricsAlternatives();
  await loadLyricsById(Number(item.getAttribute('data-lyrics-id')));
});

// 今プレイヤーで再生中の曲の検索情報
function currentTrackQuery(rawTitle) {
  if (audioPlaylist.length > 0) return { title: rawTitle, artist: '', duration: audioEl.duration || 0 };
  const meta = (mediaTargetTabId && mediaTabs[mediaTargetTabId]?.meta) || {};
  return { title: meta.title || rawTitle, artist: meta.artist || '', duration: meta.duration || currentMediaDuration || 0 };
}

async function autoFetchLyrics(rawTitle, { ignoreChoice = false } = {}) {
  if(!rawTitle || rawTitle === '再生していません' || currentLyricsSyncManual) return; 
  const query = currentTrackQuery(rawTitle);
  // ▼ 追加：利用者が用意した歌詞（マイ歌詞）があれば、検索せずにそれを使う
  if (showMyLyricsIfAny(trackKeyOf(query))) return;
  // 以前この曲で選んだ歌詞があれば、それを使う
  const chosen = !ignoreChoice && loadLyricsChoices()[trackKeyOf(query)];
  if (chosen) {
    lastLyricsTrackKey = trackKeyOf(query);
    showLyricsSearching(query.title, query.artist);
    if (await loadLyricsById(chosen, { remember: false })) return;
  }
  performLyricsSearch(query, false);
}

document.getElementById('btn-lyrics').addEventListener('click', function(e) {
  e.stopPropagation(); this.classList.toggle('active'); const panel = document.getElementById('lyrics-panel');
  if (!this.classList.contains('active')) { 
      panel.classList.remove('show'); 
      return; 
  }
  
  panel.classList.add('show');
  // ▼ 修正：同じ曲の歌詞を読み込み済みなら検索し直さない（以前は開き直すたびに再検索され、
  //   カラオケのタイミング調整などがリセットされていた）
  const q = currentTrackQuery(nowPlayingTitle.textContent);
  if (currentLyricsText && !lyricsSearching && trackKeyOf(q) === lastLyricsTrackKey) { renderLyricsBody(); return; }
  autoFetchLyrics(nowPlayingTitle.textContent);
});

document.getElementById('btn-refresh-lyrics').addEventListener('click', () => { 
    currentLyricsSyncManual = false; 
    autoFetchLyrics(currentTrackTitleStr); 
});

document.getElementById('btn-edit-lyrics-toggle').addEventListener('click', () => { document.getElementById('lyrics-edit-form').classList.toggle('show'); });
document.getElementById('btn-manual-search').addEventListener('click', () => {
  const manualArtist = document.getElementById('manual-artist').value.trim(); const manualSong = document.getElementById('manual-song').value.trim();
  if(manualSong === '') return;
  document.getElementById('lyrics-edit-form').classList.remove('show'); performLyricsSearch({ artist: manualArtist, song: manualSong, manual: true }, true);
});
document.getElementById('btn-close-lyrics').addEventListener('click', () => { 
    document.getElementById('lyrics-panel').classList.remove('show'); 
    document.getElementById('btn-lyrics').classList.remove('active');
});

// ==========================================
// ★ ミニプレイヤー・歌詞・ダウンロード
// ==========================================

const lyricsPanel = document.getElementById('lyrics-panel');
// ▼ 変更：パネルの移動・サイズ変更。ドラッグ中は透明な板で画面全体を覆い、
//   マウスがページ（webview）の上に入っても動きを追えるようにする。位置と大きさは保存する
const LYRICS_GEOMETRY_KEY = 'archyndium_lyrics_panel';
const dragShield = document.getElementById('split-drag-shield');
let lyricsDrag = null; // { mode: 'move' | 'resize', startX, startY, rect }

function clampLyricsPanel() {
    const canvas = document.querySelector('.canvas').getBoundingClientRect();
    const r = lyricsPanel.getBoundingClientRect();
    const w = Math.min(r.width, canvas.width - 16), h = Math.min(r.height, canvas.height - 16);
    let left = Math.min(Math.max(8, r.left - canvas.left), canvas.width - w - 8);
    let top = Math.min(Math.max(8, r.top - canvas.top), canvas.height - h - 8);
    Object.assign(lyricsPanel.style, { left: `${left}px`, top: `${top}px`, right: 'auto', width: `${w}px`, height: `${h}px`, maxHeight: 'none' });
}

function applySavedLyricsGeometry() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(LYRICS_GEOMETRY_KEY)); } catch(e) {}
    if (!g) return;
    Object.assign(lyricsPanel.style, { left: `${g.left}px`, top: `${g.top}px`, right: 'auto', width: `${g.width}px`, height: `${g.height}px`, maxHeight: 'none' });
    requestAnimationFrame(clampLyricsPanel); // ウィンドウが小さくなっていても画面内に収める
}

function saveLyricsGeometry() {
    const canvas = document.querySelector('.canvas').getBoundingClientRect();
    const r = lyricsPanel.getBoundingClientRect();
    localStorage.setItem(LYRICS_GEOMETRY_KEY, JSON.stringify({ left: r.left - canvas.left, top: r.top - canvas.top, width: r.width, height: r.height }));
}

function startLyricsDrag(e, mode) {
    e.preventDefault();
    lyricsDrag = { mode, startX: e.clientX, startY: e.clientY, rect: lyricsPanel.getBoundingClientRect(), canvas: document.querySelector('.canvas').getBoundingClientRect() };
    lyricsPanel.style.transition = 'none';
    dragShield.classList.add('show', mode);
}

document.getElementById('lyrics-drag-handle').addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('#btn-close-lyrics')) return;
    startLyricsDrag(e, 'move');
});
document.getElementById('lyrics-resize').addEventListener('mousedown', (e) => { if (e.button === 0) startLyricsDrag(e, 'resize'); });

document.addEventListener('mousemove', (e) => {
    if (!lyricsDrag) return;
    const { rect, canvas, startX, startY } = lyricsDrag;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (lyricsDrag.mode === 'move') {
        const left = Math.min(Math.max(8, rect.left - canvas.left + dx), canvas.width - rect.width - 8);
        const top = Math.min(Math.max(8, rect.top - canvas.top + dy), canvas.height - 60);
        Object.assign(lyricsPanel.style, { left: `${left}px`, top: `${top}px`, right: 'auto', width: `${rect.width}px`, height: `${rect.height}px`, maxHeight: 'none' });
    } else {
        const width = Math.min(Math.max(300, rect.width + dx), canvas.right - rect.left - 8);
        const height = Math.min(Math.max(260, rect.height + dy), canvas.bottom - rect.top - 8);
        Object.assign(lyricsPanel.style, { left: `${rect.left - canvas.left}px`, top: `${rect.top - canvas.top}px`, right: 'auto', width: `${width}px`, height: `${height}px`, maxHeight: 'none' });
    }
});

document.addEventListener('mouseup', () => {
    if (!lyricsDrag) return;
    lyricsDrag = null;
    dragShield.classList.remove('show', 'move', 'resize');
    lyricsPanel.style.transition = 'opacity 0.3s';
    saveLyricsGeometry();
});
window.addEventListener('resize', () => { if (lyricsPanel.style.left) clampLyricsPanel(); });
// ダブルクリックで元の位置（右上）に戻す
document.getElementById('lyrics-drag-handle').addEventListener('dblclick', (e) => {
    if (e.target.closest('#btn-close-lyrics')) return;
    localStorage.removeItem(LYRICS_GEOMETRY_KEY);
    Object.assign(lyricsPanel.style, { left: '', top: '', right: '', width: '', height: '', maxHeight: '' });
});
applySavedLyricsGeometry();
