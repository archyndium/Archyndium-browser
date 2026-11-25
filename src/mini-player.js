// ARCHYNDIUM ミニプレイヤーの処理（CSP でインラインスクリプトを禁止するため HTML から分離）
const $ = (id) => document.getElementById(id);
const send = (cmd) => window.electronAPI.controlFromMini(cmd);
const mp = $('mp');
let karaokeLines = null, karaokeIdx = -2, lastLyricsHtml = null, currentTitle = '';
let pendingOffset = null; // ボタンを押してから本体の確認が届くまでの表示

// ---- 基本操作 ----
$('btn-close').addEventListener('click', () => window.electronAPI.closeMiniPlayer());
$('btn-prev').addEventListener('click', () => send('prev'));
$('btn-play').addEventListener('click', () => send('play'));
$('btn-next').addEventListener('click', () => send('next'));
$('btn-src-lock').addEventListener('click', () => send({ type: 'toggle-media-lock' }));
$('track-source').addEventListener('click', () => send({ type: 'cycle-media-source' }));
$('progress-container').addEventListener('click', (e) => {
  const r = $('progress-container').getBoundingClientRect();
  send({ type: 'seek', value: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) });
});

// ---- 歌詞欄の開閉（ウィンドウを伸ばしてから表示） ----
$('btn-lyrics-toggle').addEventListener('click', () => {
  const open = !mp.classList.contains('expanded');
  $('btn-lyrics-toggle').classList.toggle('on', open);
  if (open) { window.electronAPI.windowControl('mini-expand'); mp.classList.add('expanded'); }
  else { mp.classList.remove('expanded'); window.electronAPI.windowControl('mini-collapse'); }
});
$('btn-refresh-lyrics').addEventListener('click', () => send({ type: 'refresh-lyrics' }));
$('btn-edit-lyrics-toggle').addEventListener('click', () => $('lyrics-edit-form').classList.toggle('show'));
$('btn-manual-search').addEventListener('click', () => {
  const artist = $('manual-artist').value.trim(), song = $('manual-song').value.trim();
  if (!song) return;
  $('lyrics-edit-form').classList.remove('show');
  send({ type: 'manual-search', artist, song });
});

// ---- タイミング：押したらすぐ表示を変え、本体からの値で確定する ----
const fmtOffset = (o) => `${o > 0 ? '+' : o < 0 ? '−' : '±'}${Math.abs(o).toFixed(1)}s`;
function nudge(delta, reset = false) {
  const cur = pendingOffset !== null ? pendingOffset : parseFloat(($('mini-k-offset').dataset.value || '0'));
  pendingOffset = reset ? 0 : Math.round((cur + delta) * 10) / 10;
  $('mini-k-offset').textContent = fmtOffset(pendingOffset);
  send(reset ? { type: 'karaoke-nudge', reset: true } : { type: 'karaoke-nudge', delta });
  clearTimeout(nudge.t); nudge.t = setTimeout(() => { pendingOffset = null; }, 800);
}
$('mini-k-later').addEventListener('click', () => nudge(-0.5));
$('mini-k-earlier').addEventListener('click', () => nudge(0.5));
$('mini-k-offset').addEventListener('click', () => nudge(0, true));

function updateMarquee() {
  const el = $('track-title');
  el.classList.remove('scrolling');
  setTimeout(() => {
    const over = el.scrollWidth - el.parentElement.clientWidth;
    if (over > 0) { el.style.setProperty('--scroll-dist', `-${over + 12}px`); el.classList.add('scrolling'); }
  }, 100);
}

// ---- 本体からの同期（1 秒に 20 回） ----
window.electronAPI.onSyncFromMain((data) => {
  if (data.accent) document.documentElement.style.setProperty('--accent', data.accent);
  mp.classList.toggle('playing', !!data.isPlaying);
  syncVolumeFromMain(data.volume);

  const title = data.title || 'No Media Playing';
  if (title !== currentTitle) { currentTitle = title; $('track-title').textContent = title; updateMarquee(); }
  $('track-artist').textContent = data.artist || '-';
  if (data.source) {
    $('track-source-label').textContent = data.source.label;
    $('btn-src-lock').classList.toggle('locked', !!data.source.locked);
    $('src-lock-label').textContent = data.source.locked ? '固定中' : '自動';
    $('src-shackle').setAttribute('d', data.source.locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2');
  }

  if (data.currentTime) $('time-current').textContent = data.currentTime;
  if (data.duration) $('time-total').textContent = data.duration;
  const pct = Math.max(0, Math.min(100, (data.progress || 0) * 100));
  $('bar-fill').style.width = pct + '%';
  $('bar-knob').style.left = pct + '%';

  $('btn-play').innerHTML = data.isPlaying
    ? '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1"></rect><rect x="13.5" y="5" width="4" height="14" rx="1"></rect></svg>'
    : '<svg viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';

  // カラオケ（行は変わった時だけ届く）
  const k = data.karaoke || {};
  $('mini-karaoke-ctl').classList.toggle('show', !!k.enabled);
  if (k.offset !== undefined) {
    $('mini-k-offset').dataset.value = k.offset;
    if (pendingOffset === null || pendingOffset === k.offset) { pendingOffset = null; $('mini-k-offset').textContent = fmtOffset(k.offset); }
  }
  if (k.lines !== undefined) { karaokeLines = k.lines; lastLyricsHtml = null; }
  const lyricsEl = $('lyrics-content');
  if (k.enabled && karaokeLines) {
    if (lastLyricsHtml !== 'karaoke') {
      lastLyricsHtml = 'karaoke';
      lyricsEl.classList.add('karaoke');
      lyricsEl.innerHTML = karaokeLines.map(() => '<div class="k-line"></div>').join('');
      lyricsEl.querySelectorAll('.k-line').forEach((el, i) => { el.textContent = karaokeLines[i] || '♪'; });
      karaokeIdx = -2;
    }
    if (k.index !== karaokeIdx) {
      karaokeIdx = k.index;
      lyricsEl.querySelectorAll('.k-line').forEach((el, i) => { el.classList.toggle('active', i === k.index); el.classList.toggle('past', i < k.index); });
      const active = lyricsEl.querySelector('.k-line.active');
      if (active) lyricsEl.scrollTo({ top: active.offsetTop - lyricsEl.clientHeight / 2 + active.clientHeight / 2, behavior: 'smooth' });
    }
  } else if ((data.lyricsText || '') !== lastLyricsHtml) {
    lastLyricsHtml = data.lyricsText || '';
    lyricsEl.classList.remove('karaoke');
    lyricsEl.innerHTML = lastLyricsHtml || '曲を再生すると歌詞を表示します';
  }
});

// ---- 音量：ホイールで調整 / クリックでミュート ----
const volBtn = $('btn-volume'), volIcon = $('vol-icon'), volToast = $('vol-toast');
let currentVol = 1.0, isMuted = false, preMuteVol = 1.0, toastTimeout;
let volChangedAt = 0;
// 本体・サイト側で変えた音量を、送り返さずに表示だけそろえる
function showVolumeIcon(vol) {
  if (vol === 0 || isMuted) volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
  else if (vol < 0.5) volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
  else volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
  volBtn.classList.toggle('on', isMuted);
}
function syncVolumeFromMain(vol) {
  if (typeof vol !== 'number' || Date.now() - volChangedAt < 1200) return;   // 自分で変えた直後は待つ
  const shown = isMuted ? 0 : currentVol;
  if (Math.abs(vol - shown) < 0.005) return;
  if (vol === 0) { if (!isMuted) { preMuteVol = currentVol; isMuted = true; } }
  else { isMuted = false; currentVol = vol; }
  showVolumeIcon(currentVol);
}
function updateVolumeUI(vol) {
  volChangedAt = Date.now();
  if (vol === 0 || isMuted) volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
  else if (vol < 0.5) volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
  else volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
  volBtn.classList.toggle('on', isMuted);
  volToast.textContent = isMuted ? 'ミュート' : Math.round(vol * 100) + '%';
  volToast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { volToast.style.opacity = '0'; }, 1500);
  send({ type: 'volume', value: isMuted ? 0 : vol });
}
volBtn.addEventListener('wheel', (e) => {
  e.preventDefault();
  isMuted = false;
  currentVol = Math.max(0, Math.min(1, currentVol + (e.deltaY < 0 ? 0.05 : -0.05)));
  updateVolumeUI(currentVol);
}, { passive: false });
volBtn.addEventListener('click', () => {
  if (isMuted) { isMuted = false; currentVol = preMuteVol === 0 ? 0.1 : preMuteVol; }
  else { preMuteVol = currentVol; isMuted = true; }
  updateVolumeUI(currentVol);
});

// ▼ 変更：上段（ジャケット・曲名のあたり）を掴んで動かす
setupWindowDrag({ handles: '.drag' });

// ---- ▼ 追加：ガラスモード（本体と同じ保存場所。次に開いた時も同じ状態） ----
const GLASS_KEY = 'archyndium_mini_glass';
function applyGlass(on) {
  mp.classList.toggle('glass', on);
  $('btn-glass').classList.toggle('on', on);
  try { localStorage.setItem(GLASS_KEY, on ? 'on' : 'off'); } catch (e) {}
}
applyGlass((() => { try { return localStorage.getItem(GLASS_KEY) === 'on'; } catch (e) { return false; } })());
$('btn-glass').addEventListener('click', () => applyGlass(!mp.classList.contains('glass')));

// ---- ▼ 追加：右下の角・右端をドラッグして大きさを変える（歌詞を閉じている時は幅だけ） ----
function startResize(e, widthOnly) {
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const sx = e.screenX, sy = e.screenY, w0 = window.innerWidth, h0 = window.innerHeight;
  let raf = 0, next = null;
  const move = (ev) => {
    next = { width: Math.round(w0 + ev.screenX - sx), height: Math.round(h0 + ev.screenY - sy), expanded: mp.classList.contains('expanded'), widthOnly: widthOnly || !mp.classList.contains('expanded') };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; window.electronAPI.miniResize?.(next); });
  };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (next) window.electronAPI.miniResize?.({ ...next, done: true }); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
$('resize-grip').addEventListener('pointerdown', (e) => startResize(e, false));
$('resize-edge').addEventListener('pointerdown', (e) => startResize(e, true));
window.addEventListener('resize', () => updateMarquee());
