// 新しいタブのページの動き。表示する内容は本体（renderer/newtab-host.js）が
// window.__archyndiumNewTab(state) で渡す。ページから本体へは console.log('ARCHYNDIUM_NTP:…') で伝える
{
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
let state = { light: false, motion: true, private: false, engine: { name: 'Google', template: 'https://www.google.com/search?q=__Q__' }, shield: null, music: { state: 'none' }, sites: [] };
let sitesKey = '', lineShown = null;

// ---- あいさつ ----
function greet() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'こんばんは。' : h < 11 ? 'おはようございます。' : h < 17 ? 'こんにちは。' : 'こんばんは。';
  $('greet').innerHTML = `<span>${hello}</span><span>今日は何を調べますか。</span>`;
}

// ---- 検索 ----
function resolve(text) {
  const t = text.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return /^https?:/i.test(t) ? t : null;
  if (!/\s/.test(t) && /^([a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  if (!/\s/.test(t) && /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  return state.engine.template.replace('__Q__', encodeURIComponent(t));
}
$('search').addEventListener('submit', (e) => { e.preventDefault(); const url = resolve($('q').value); if (url) location.href = url; });

// ---- 検索エンジンの切り替え（本体の設定を変える） ----
function iconHtml(e) {
  return e.icon ? `<img src="${esc(e.icon)}" alt="" width="18" height="18" data-letter="${esc(e.name[0])}">` : `<span class="letter">${esc(e.name[0])}</span>`;
}
// 読み込めないアイコンは頭文字にする（CSP で onerror 属性は使えないので、ここでまとめて）
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.dataset.letter) { const s = document.createElement('span'); s.className = 'letter'; s.textContent = img.dataset.letter; img.replaceWith(s); }
}, true);
let engineKey = '';
function renderEngine() {
  const list = state.engines || [], cur = list.find(e => e.id === state.engine.id) || state.engine;
  const key = cur.id + '|' + list.length;
  if (key === engineKey) return;
  engineKey = key;
  $('engine').innerHTML = iconHtml(cur);
  $('engine').title = `${cur.name}（押すと検索エンジンを切り替え）`;
  $('engineMenu').innerHTML = `<small>${state.private ? 'シークレットタブの検索エンジン' : '検索エンジン'}</small>` + list.map(e =>
    `<button type="button" role="menuitemradio" aria-checked="${e.id === cur.id}" data-engine="${esc(e.id)}">${iconHtml(e)}<span class="name">${esc(e.name)}</span>${e.id === cur.id ? '<b>✓</b>' : ''}</button>`).join('');
}
function closeEngineMenu() { $('engineMenu').classList.remove('show'); $('engine').setAttribute('aria-expanded', 'false'); }
$('engine').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !$('engineMenu').classList.contains('show');
  $('engineMenu').classList.toggle('show', open);
  $('engine').setAttribute('aria-expanded', String(open));
});
$('engineMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-engine]');
  if (!b) return;
  console.log('ARCHYNDIUM_NTP:engine:' + b.dataset.engine);
  closeEngineMenu();
  $('q').focus();
});
document.addEventListener('click', (e) => { if (!e.target.closest('#engine, #engineMenu')) closeEngineMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEngineMenu(); });

// ---- Work / Focus ----
function renderSites() {
  const key = JSON.stringify(state.sites);
  if (key === sitesKey) return;
  sitesKey = key;
  $('chips').innerHTML = state.sites.map((s, i) => s.items.length === 1
    ? `<div class="chip"><button type="button" data-url="${esc(s.items[0].url)}"><i data-color="${esc(s.color)}"></i>${esc(s.name)}</button></div>`
    : `<div class="chip" data-i="${i}"><button type="button" aria-expanded="false"><i data-color="${esc(s.color)}"></i>${esc(s.name)}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
       <div class="menu">${s.items.map(it => `<a href="${esc(it.url)}">${esc(it.title)}<small>${esc(it.host)}</small></a>`).join('')}</div></div>`).join('');
  // 色は CSP（インラインの style 属性を禁止）に引っかからないよう、スクリプトから付ける
  $('chips').querySelectorAll('i[data-color]').forEach(i => { if (/^#[0-9a-f]{3,8}$/i.test(i.dataset.color)) i.style.background = i.dataset.color; });
}
$('chips').addEventListener('click', (e) => {
  const direct = e.target.closest('button[data-url]');
  if (direct) { location.href = direct.dataset.url; return; }
  const chip = e.target.closest('.chip');
  if (!chip || e.target.closest('.menu')) return;
  const open = !chip.classList.contains('open');
  document.querySelectorAll('.chip').forEach(c => { c.classList.remove('open'); c.firstElementChild.setAttribute('aria-expanded', 'false'); });
  chip.classList.toggle('open', open);
  chip.firstElementChild.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => { if (!e.target.closest('.chip')) document.querySelectorAll('.chip').forEach(c => c.classList.remove('open')); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.chip').forEach(c => c.classList.remove('open')); });

// ---- 再生中の曲と歌詞 ----
function renderMusic() {
  const m = state.music || { state: 'none' };
  const none = m.state === 'none', play = m.state === 'play';
  $('now').hidden = false;
  $('nowHead').textContent = none ? '音楽' : [m.title, m.artist].filter(Boolean).join(' ・ ') + (play ? '' : '（一時停止中）');
  const line = none ? '音楽を流すと、波が動き、今の歌詞がここに出ます。' : (m.line || m.title || '');
  if (line !== lineShown) {
    const p = $('nowLine');
    if (lineShown === null || !state.motion) { p.textContent = line; }
    else { p.classList.add('swap'); setTimeout(() => { p.textContent = line; p.classList.remove('swap'); }, 300); }
    lineShown = line;
  }
  $('nowPlay').hidden = none;
  $('nowPlay').innerHTML = (play ? PAUSE : PLAY) + (play ? '一時停止' : '再生');
}
$('nowPlay').addEventListener('click', () => console.log('ARCHYNDIUM_NTP:toggle-play'));

// ---- 本体から受け取る ----
window.__archyndiumNewTab = (s) => {
  state = { ...state, ...s };
  document.documentElement.classList.toggle('light', !!state.light);
  document.documentElement.classList.toggle('still', !state.motion);
  $('private').hidden = !state.private;
  $('q').placeholder = `${state.engine.name} で検索、または URL を入力`;
  // まだ 1 件もブロックしていない時（起動直後など）は出さない
  if (typeof state.shield === 'number' && state.shield > 0) { $('shield').hidden = false; $('shieldCount').textContent = state.shield.toLocaleString(); }
  else $('shield').hidden = true;
  renderEngine(); renderSites(); renderMusic();
  if (!running) start();
};

// ---- 波（再生中は大きく揺れ、止まると静かな線になる） ----
const cv = $('wave'), cx = cv.getContext('2d');
const COLORS = ['#FBC12E', '#F15A29', '#C4177B', '#5E36B4', '#1F6FD8', '#3DB5F0'];
let amp = 0.12, t = 0, running = false;
function size() { const r = devicePixelRatio || 1; cv.width = Math.round(cv.clientWidth * r); cv.height = Math.round(cv.clientHeight * r); cx.setTransform(r, 0, 0, r, 0, 0); draw(); }
function draw() {
  const W = cv.clientWidth, H = cv.clientHeight;
  cx.clearRect(0, 0, W, H);
  COLORS.forEach((c, k) => {
    const base = H * (0.38 + k * 0.1), a = (H * 0.16) * amp * (1 - k * 0.08);
    const g = cx.createLinearGradient(0, base - a, 0, H);
    g.addColorStop(0, c); g.addColorStop(1, c + '00');
    cx.globalAlpha = state.light ? 0.42 : 0.55;
    cx.fillStyle = g;
    cx.beginPath(); cx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      cx.lineTo(x, base + Math.sin(x / (140 + k * 30) + t * (0.8 + k * 0.15) + k) * a + Math.sin(x / 47 + t * 2.1 + k) * a * 0.18);
    }
    cx.lineTo(W, H); cx.closePath(); cx.fill();
  });
  cx.globalAlpha = 1;
}
function frame() {
  const playing = state.music?.state === 'play';
  amp += ((playing ? 1 : 0.12) - amp) * 0.04;
  t += playing ? 0.016 : 0.004;
  draw();
  if (state.motion) requestAnimationFrame(frame); else running = false;
}
function start() { if (!state.motion) { amp = state.music?.state === 'play' ? 0.6 : 0.12; draw(); return; } running = true; requestAnimationFrame(frame); }
new ResizeObserver(size).observe(cv);

greet(); setInterval(greet, 60000);
renderMusic();
start();
}
