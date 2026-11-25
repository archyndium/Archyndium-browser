// ▼ 追加：不透明なウィンドウ（軽量化。角の丸みと影は Windows 標準のものを使う）の時は、アプリ側で角を丸めない
if (new URLSearchParams(location.search).get('opaque') === '1') document.body.classList.add('opaque-window');
// ▼ 追加：最大化・全画面中は角を丸めない
window.electronAPI?.onWindowMaximized?.((on) => document.body.classList.toggle('window-maximized', !!on));

if (window.electronAPI) {
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.windowControl('minimize'));
  document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.windowControl('maximize'));
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.windowControl('close'));
}

const urlInput = document.getElementById('url-input');
const nowPlayingTitle = document.getElementById('track-name');
const webviewContainer = document.getElementById('webview-container');

let tabCounter = 0;
let activeTabId = null;
let mediaTargetTabId = null;
let currentLyricsText = "";
let currentLyricsSyncManual = false;

// ▼ 追加：YouTubeの再生時間を保持するための変数
let currentMediaTime = 0;
let currentMediaDuration = 0;

// ▼ 追加：サイトのアイコン（ファビコン）表示。白い背景は付けず、読み込めない時はサイト名の頭文字を出す
// iconUrl が無ければ、そのサイトの /favicon.ico を試す
function siteHostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e) { return ''; }
}
function defaultFaviconUrl(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? `${u.origin}/favicon.ico` : ''; } catch(e) { return ''; }
}
function siteIconHtml(url, iconUrl = '', extraClass = '') {
    const letter = (siteHostOf(url)[0] || '•').toUpperCase();
    const src = iconUrl || defaultFaviconUrl(url);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<div class="favicon site-icon ${src ? '' : 'no-img'} ${extraClass}" data-letter="${esc(letter)}">` +
        (src ? `<img src="${esc(src)}" alt="" data-err="remove">` : '') + `</div>`;
}

// ▼ 追加：秒数を「1:23」のような時間表記に変換する関数
function formatTime(seconds) {
    if (!isFinite(seconds)) return "0:00"; // ▼ 修正：ライブ配信など長さ不明（Infinity）で "Infinity:NaN" になっていた
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ▼ セキュリティ：画面の HTML にインラインのイベント属性（onerror="..."）を書かず、ここでまとめて処理する
//   （Content-Security-Policy でインラインスクリプトを禁止しているため）
//   data-err="remove" … 読み込めない画像を消して頭文字アイコンにする / "hide" … 隠すだけ（後で別の画像を入れ直す）
document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.err) return;
    img.parentNode?.classList.add('no-img');
    if (img.dataset.err === 'remove') img.remove();
    else { img.style.display = 'none'; img.removeAttribute('src'); }
}, true);

// ▼ 変更：ウィンドウを掴んで動かす（上部のバー・サイドパネルの見出し）。ダブルクリックで最大化
// ▼ 変更：不透明なウィンドウ（初期設定）では、Windows 標準のウィンドウ移動（CSS の -webkit-app-region: drag）を使う。
//   最大化中に掴んで動かすと元の大きさに戻る・画面の上端や左右に寄せると拡大表示（スナップ）が出る、など
//   Windows と同じ動きになる。アプリ自身で動かす処理（window-drag.js）は、透明なウィンドウの時だけ使う
//   （透明なウィンドウでは、標準の移動だと操作の後に掴めなくなることがあったため）
// ▼ 修正：パネルの開閉などで画面の並びが変わっても、Windows 側の「掴める範囲」が古いまま残り、
//   掴めない場所ができることがあった。並びが変わったら、掴める範囲をいったん外して付け直す（作り直させる）
function refreshDragRegions() {
  if (!document.body.classList.contains('opaque-window')) return;
  document.body.classList.add('drag-refresh');
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('drag-refresh')));
}
if (document.body.classList.contains('opaque-window')) {
  let lastLayoutClass = '';
  const layoutKey = () => ['panel-open', 'layout-top', 'app-fullscreen', 'window-maximized'].filter(c => document.body.classList.contains(c)).join(' ');
  new MutationObserver(() => {
    const k = layoutKey();
    if (k === lastLayoutClass) return;
    lastLayoutClass = k;
    refreshDragRegions();
    setTimeout(refreshDragRegions, 380);   // パネルの開閉のアニメーション（0.3 秒）が終わった後にも
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => { clearTimeout(window.__dragRegionTimer); window.__dragRegionTimer = setTimeout(refreshDragRegions, 150); });
  document.addEventListener('transitionend', (e) => { if (e.target.id === 'command-center') refreshDragRegions(); });
}
// ▼ 変更：不透明なウィンドウでも、アプリ自身で動かす処理を「予備」として入れておく。
//   Windows 標準の移動が効いている場所では、押した時点で Windows が受け取るので、画面側にはマウスの操作が届かない。
//   画面側に届いた ＝ 掴める範囲が古いまま残っていた場所なので、そこではアプリ自身で動かし、範囲も作り直す。
//   こうすると、空いている所はいつでも掴める
setupWindowDrag({ handles: '.header-drag-area, .command-header, .command-header-area, .ts-drag, .tabstrip', maximizeOnDoubleClick: true });
if (document.body.classList.contains('opaque-window')) {
  document.addEventListener('mousedown', (e) => {
    if (e.target instanceof Element && e.target.closest('.tabstrip, .header-drag-area, .command-header-area') && !e.target.closest('.ts-tab, .ts-group, .ts-new, .window-controls, button, input')) refreshDragRegions();
  }, true);
}

// ▼ 追加：タブの URL が変わった時に呼ばれる処理の登録先（拡張機能のストア検知・DRM の案内など）
const tabUrlChangeHooks = [];
function onTabUrlChanged(tabId, url) {
    tabUrlChangeHooks.forEach(fn => { try { fn(tabId, url); } catch (e) {} });
}
