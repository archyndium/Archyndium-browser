// ==========================================
// ★ 他のブラウザにある機能（Chrome / Edge / Firefox / Arc を参考に追加）
// ==========================================
//   ・通知トースト（右下に小さく表示）
//   ・タブの固定（ピン留め）… サイドバー上部にアイコンだけで並ぶ
//   ・ページの翻訳（Google 翻訳で日本語に）
//   ・スクリーンショット（コピー / 保存）
//   ・ズーム率の表示（URL 欄）とサイトごとのズームの記憶
//   ・ページのソースを表示（Ctrl+U）
//   ・全画面表示（F11）… サイドバーとツールバーを隠す
//   ・強制ダークモード（サイトごと）
//   ・リーダーモード（F9）… 記事を読みやすく整形して表示
//   ・選択したテキストを読み上げ / 選んだ検索エンジンで検索（右クリック）

// ---------- トースト ----------
const toastBox = document.getElementById('toast-box');

function showToast(message, { action = null, actionLabel = '', timeout = 3500 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${message}</span>${action ? `<b class="toast-action">${escapeHtml(actionLabel)}</b>` : ''}`;
    if (action) el.querySelector('.toast-action').addEventListener('click', () => { action(); el.remove(); });
    toastBox.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, timeout);
    return el;
}

function activePageUrl() {
    const card = activeTabId && getTabCard(activeTabId);
    return card?.getAttribute('data-url') || '';
}

// ---------- タブの固定 ----------
const pinnedStrip = document.getElementById('pinned-tabs');

function setTabPinned(tabId, on) {
    const card = getTabCard(tabId);
    if (!card) return;
    if (on) {
        card.classList.add('pinned');
        card.title = card.querySelector('.tab-title')?.textContent || '';
        pinnedStrip.appendChild(card);
    } else {
        card.classList.remove('pinned');
        card.removeAttribute('title');
        const container = document.getElementById('tabs-container');
        container.insertBefore(card, container.firstChild);
    }
    pinnedStrip.classList.toggle('has-tabs', !!pinnedStrip.children.length);
    scheduleSaveSession?.();
}

function isTabPinned(tabId) {
    return !!getTabCard(tabId)?.classList.contains('pinned');
}

// ---------- 翻訳 ----------
function translatePage(lang = 'ja') {
    const url = activePageUrl();
    if (!/^https?:/.test(url)) return;
    if (/translate\.goog|translate\.google\./.test(url)) { showToast('すでに翻訳表示です'); return; }
    navigateActiveTab(`https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(url)}`);
}

// ---------- スクリーンショット ----------
async function takeScreenshot(mode = 'copy') {
    const wv = activeWebview();
    if (!wv) return;
    let id;
    try { id = wv.getWebContentsId(); } catch(e) { return; }
    const res = await window.electronAPI.capturePage(id, mode);
    if (!res?.ok) { showToast('スクリーンショットを撮れませんでした'); return; }
    if (mode === 'copy') showToast('表示中の範囲をクリップボードにコピーしました');
    else showToast('スクリーンショットを保存しました', { action: () => window.electronAPI.showFile(res.filePath), actionLabel: 'フォルダを開く' });
}

// ---------- ズーム表示とサイトごとの記憶 ----------
const SITE_ZOOM_KEY = 'archyndium_site_zoom';
function loadSiteZooms() { try { return JSON.parse(localStorage.getItem(SITE_ZOOM_KEY)) || {}; } catch(e) { return {}; } }

function saveSiteZoom(url, level) {
    const host = siteHostOf(url);
    if (!host) return;
    const all = loadSiteZooms();
    if (level) all[host] = level; else delete all[host];
    localStorage.setItem(SITE_ZOOM_KEY, JSON.stringify(all));
}

// dom-ready のたびに、そのサイトで前回使ったズームに戻す
function applySiteZoom(tabId) {
    const wv = webviews[tabId];
    if (!wv) return;
    let url = '';
    try { url = wv.getURL(); } catch(e) { return; }
    const level = loadSiteZooms()[siteHostOf(url)] || 0;
    try { if (wv.getZoomLevel() !== level) wv.setZoomLevel(level); } catch(e) {}
    if (tabId === activeTabId) refreshZoomIndicator();
}

function refreshZoomIndicator() {
    const el = document.getElementById('zoom-indicator');
    let level = 0;
    try { level = activeWebview()?.getZoomLevel() || 0; } catch(e) {}
    // Chromium のズームレベル → 倍率（1 段階 = 1.2 倍）
    const pct = Math.round(Math.pow(1.2, level) * 100);
    el.textContent = `${pct}%`;
    el.classList.toggle('show', level !== 0);
}
document.getElementById('zoom-indicator').addEventListener('click', () => { changeZoom(0); });

// ---------- ソース表示・全画面 ----------
function viewSource() {
    const url = activePageUrl();
    if (/^https?:/.test(url)) openNewTab('view-source:' + url);
}

function toggleFullscreen() {
    const on = !document.body.classList.contains('app-fullscreen');
    document.body.classList.toggle('app-fullscreen', on);
    window.electronAPI?.windowControl('fullscreen');
    if (on) showToast('全画面表示中：F11 で終了します');
}

// ---------- 強制ダークモード（サイトごと） ----------
const FORCE_DARK_KEY = 'archyndium_force_dark';
const FORCE_DARK_CSS = `html { filter: invert(0.92) hue-rotate(180deg) !important; background: #fff !important; }
  img, video, picture, canvas, iframe, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`;
const forceDarkKeys = {}; // tabId -> insertCSS のキー

function forceDarkHosts() { try { return JSON.parse(localStorage.getItem(FORCE_DARK_KEY)) || []; } catch(e) { return []; } }

async function applyForceDark(tabId) {
    const wv = webviews[tabId];
    if (!wv) return;
    let url = '';
    try { url = wv.getURL(); } catch(e) { return; }
    const on = forceDarkHosts().includes(siteHostOf(url));
    if (forceDarkKeys[tabId]) { wv.removeInsertedCSS(forceDarkKeys[tabId]).catch(() => {}); delete forceDarkKeys[tabId]; }
    if (on) forceDarkKeys[tabId] = await wv.insertCSS(FORCE_DARK_CSS).catch(() => null);
}

function toggleForceDark() {
    const host = siteHostOf(activePageUrl());
    if (!host) return;
    let hosts = forceDarkHosts();
    const on = !hosts.includes(host);
    hosts = on ? [...hosts, host] : hosts.filter(h => h !== host);
    localStorage.setItem(FORCE_DARK_KEY, JSON.stringify(hosts));
    Object.keys(webviews).forEach(applyForceDark);
    showToast(on ? `${escapeHtml(host)} を強制ダークモードで表示します` : `${escapeHtml(host)} の強制ダークモードを解除しました`);
}

// ---------- リーダーモード ----------
// ページ内に読みやすい表示を重ねる（Shadow DOM なのでサイトの CSS の影響を受けない）。もう一度で閉じる
const READER_SCRIPT = `(() => {
  const old = document.getElementById('__archyndium_reader');
  if (old) { old.remove(); document.documentElement.style.overflow = ''; return 'closed'; }
  const textLen = (el) => (el.innerText || '').trim().length;
  let root = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]');
  if (!root || textLen(root) < 500) {
    // 段落が一番多く集まっている要素を本文とみなす
    const scores = new Map();
    document.querySelectorAll('p').forEach(p => { const len = textLen(p); if (len < 40) return; const parent = p.parentElement; scores.set(parent, (scores.get(parent) || 0) + len); });
    let best = null, bestScore = 0;
    scores.forEach((s, el) => { if (s > bestScore) { best = el; bestScore = s; } });
    root = best || document.body;
  }
  const keep = 'h1,h2,h3,h4,p,img,figure,figcaption,blockquote,pre,ul,ol,table';
  const parts = [];
  root.querySelectorAll(keep).forEach(el => {
    if (el.closest('nav,aside,footer,form,[aria-hidden="true"]')) return;
    if (el.parentElement && el.parentElement.closest(keep) && el.parentElement.closest(keep) !== el && root.contains(el.parentElement.closest(keep))) return;
    const c = el.cloneNode(true);
    c.querySelectorAll('script,style,button,iframe,svg').forEach(x => x.remove());
    c.removeAttribute('style'); c.removeAttribute('class');
    if (c.tagName === 'IMG' && !c.getAttribute('src') && c.dataset.src) c.src = c.dataset.src;
    parts.push(c.outerHTML);
  });
  const host = document.createElement('div');
  host.id = '__archyndium_reader';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const title = (document.querySelector('h1')?.innerText || document.title).trim();
  shadow.innerHTML = \`<style>
    :host { all: initial; } .wrap { position: fixed; inset: 0; overflow-y: auto; background: #18181A; color: #E6E6E6; }
    .bar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; background: linear-gradient(#18181A, #18181Ae0); }
    .bar button { font: 600 13px system-ui, sans-serif; color: #E6E6E6; background: #2a2a2e; border: 1px solid #3a3a40; border-radius: 10px; padding: 8px 14px; cursor: pointer; }
    .bar button:hover { background: #3a3a40; }
    .doc { max-width: 720px; margin: 0 auto; padding: 8px 24px 120px; font: 18px/1.9 "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif; }
    .doc h1.t { font: 700 30px/1.4 system-ui, sans-serif; margin: 0 0 8px; } .src { font: 13px system-ui, sans-serif; color: #8A8A8E; margin-bottom: 32px; }
    .doc h1, .doc h2, .doc h3, .doc h4 { font-family: system-ui, sans-serif; line-height: 1.45; margin: 1.6em 0 0.6em; }
    .doc img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 1em auto; }
    .doc a { color: #9EC5FF; } .doc pre { background: #111; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 14px; }
    .doc blockquote { border-left: 3px solid #555; margin: 1em 0; padding-left: 16px; color: #BBB; }
  </style><div class="wrap"><div class="bar"><button data-a="smaller">A−</button><button data-a="bigger">A＋</button><button data-a="close">閉じる (F9)</button></div>
  <div class="doc"><h1 class="t"></h1><div class="src"></div>\${parts.join('')}</div></div>\`;
  shadow.querySelector('.t').textContent = title;
  shadow.querySelector('.src').textContent = location.hostname;
  let size = 18;
  shadow.querySelector('.bar').addEventListener('click', (e) => {
    const a = e.target.getAttribute('data-a');
    if (a === 'close') { host.remove(); document.documentElement.style.overflow = ''; }
    if (a === 'bigger' || a === 'smaller') { size = Math.max(14, Math.min(28, size + (a === 'bigger' ? 2 : -2))); shadow.querySelector('.doc').style.fontSize = size + 'px'; }
  });
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.appendChild(host);
  return 'opened';
})()`;

async function toggleReaderMode() {
    const wv = activeWebview();
    if (!wv) return;
    try { await wv.executeJavaScript(READER_SCRIPT); } catch(e) { showToast('このページはリーダーモードで表示できません'); }
}

// ---------- 読み上げ・検索（右クリックメニューから） ----------
function speakText(text) {
    if (!text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 5000));
    u.lang = /[぀-ヿ一-鿿]/.test(text) ? 'ja-JP' : 'en-US';
    speechSynthesis.speak(u);
    showToast('読み上げ中', { action: () => speechSynthesis.cancel(), actionLabel: '停止', timeout: 6000 });
}
window.electronAPI?.onSpeakText?.(({ text }) => speakText(text));
window.electronAPI?.onSearchText?.(({ text }) => openNewTab(currentEngine().search(text)));

// ---------- その他 ----------
function copyPageUrl() {
    const url = activePageUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => showToast('URL をコピーしました')).catch(() => {});
}

// タブを新しいウィンドウに移す（URL を引き継いで、このウィンドウのタブは閉じる）
function moveTabToNewWindow(tabId) {
    const card = getTabCard(tabId);
    if (!card) return;
    window.electronAPI?.openNewWindow({ url: card.getAttribute('data-url'), isPrivate: isPrivateTab(tabId) });
    closeTab(tabId);
}
