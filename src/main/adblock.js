// ==========================================
// ★ アドブロック（@cliqz/adblocker-electron）3モード制御
// ==========================================
// mode 2 = 標準（ネットワーク + DOM ブロック）/ 1 = 簡易（DOM 側のみ）/ 0 = オフ
// 通常セッションとシークレット用セッションの両方に適用する。
// ▼ 変更：タブごとにモードを上書きできる。ブロッカー自体は常に有効にしておき、
//   通信・見た目のフィルターを「そのタブのモード」と「サイト例外」でリクエストごとに判定する。
const { ipcMain, webContents } = require('electron');
const { createStore } = require('./store');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

let blocker = null;
let currentAdblockMode = 2;
const sessions = new Set();
let onModeApplied = () => {};

// ▼ 追加：サイトごとの例外（このサイトだけオフ）。ホスト名単位で保存する
const siteStore = createStore('shield-sites', { bypass: [] });

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

function isBypassedUrl(url) {
  const host = hostOf(url);
  return !!host && siteStore.get('bypass').includes(host);
}

// リクエストが「どのページから」出たものかを調べる（例外判定はページのホストで行う）
function pageUrlOf(details) {
  if (details.resourceType === 'mainFrame') return details.url;
  try { return (details.webContentsId && webContents.fromId(details.webContentsId)?.getURL()) || ''; } catch (e) { return ''; }
}

// タブ（webContents）ごとのモード上書き。無ければ全体のモードに従う
const tabModes = new Map();
function effectiveMode(webContentsId) {
  return tabModes.has(webContentsId) ? tabModes.get(webContentsId) : currentAdblockMode;
}

// ブロック件数（Shield パネル表示用）：合計と、webContents ごとの「このページ」
const stats = { total: 0, perContents: new Map() };

function applyMode(ses) {
  if (!blocker) return;
  try {
    // 見た目のフィルター（preload）を全タブに入れておくため常に有効化する。
    // 実際に効かせるかは handleRequest / コスメティックの判定でタブごとに決める
    if (blocker.isBlockingEnabled?.(ses) !== true) blocker.enableBlockingInSession(ses);
  } catch (e) {
    console.log('Adblock Toggle Error:', e);
  }
  // enableBlockingInSession は webRequest.onBeforeRequest を上書きするため、
  // その直後に HTTPS Upgrade と統合したハンドラを登録し直してもらう（network.js）
  onModeApplied(ses);
}

// ブロッカーの onBeforeRequest をそのまま呼べる場合だけ判定を委譲する
function handleRequest(details, callback) {
  if (blocker && effectiveMode(details.webContentsId) === 2 && typeof blocker.onBeforeRequest === 'function' && !isBypassedUrl(pageUrlOf(details))) {
    blocker.onBeforeRequest(details, callback);
    return true;
  }
  return false;
}

// メインフレームを移動したら「このページ」の件数をリセットする
function trackContents(contents) {
  const id = contents.id;
  contents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) stats.perContents.delete(id);
  });
  contents.once('destroyed', () => { stats.perContents.delete(id); tabModes.delete(id); });
}

function addSession(ses) {
  sessions.add(ses);
  applyMode(ses);
}

function init({ onApplied } = {}) {
  if (onApplied) onModeApplied = onApplied;

  // フィルターエンジンを100%の力で起動（AdsAndTracking）
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((b) => {
    blocker = b;
    blocker.on('request-blocked', (request) => {
      stats.total++;
      if (request.tabId) stats.perContents.set(request.tabId, (stats.perContents.get(request.tabId) || 0) + 1);
    });
    // 見た目の広告非表示（コスメティックフィルター）は 標準モードのタブだけ。例外サイトでも止める
    const cosmeticOff = (event) => effectiveMode(event.sender.id) !== 2 || isBypassedUrl(event.sender.getURL());
    const origFirst = blocker.onGetCosmeticFiltersFirst;
    const origUpdated = blocker.onGetCosmeticFiltersUpdated;
    blocker.onGetCosmeticFiltersFirst = (event, ...args) => {
      if (cosmeticOff(event)) { event.returnValue = null; return; }
      origFirst(event, ...args);
    };
    blocker.onGetCosmeticFiltersUpdated = (event, ...args) => {
      if (cosmeticOff(event)) return;
      origUpdated(event, ...args);
    };
    sessions.forEach(applyMode);
  }).catch((e) => console.log('Adblock init failed:', e));


  ipcMain.handle('set-adblock-mode', (event, mode) => {
    currentAdblockMode = mode;
    sessions.forEach(applyMode);
    return currentAdblockMode;
  });
  ipcMain.handle('get-adblock-mode', () => currentAdblockMode);
  // タブごとのモード（mode = null で全体の設定に戻す）
  ipcMain.handle('set-tab-shield', (event, webContentsId, mode) => {
    if (!webContentsId) return null;
    if (mode === null || mode === undefined) tabModes.delete(webContentsId); else tabModes.set(webContentsId, mode);
    return effectiveMode(webContentsId);
  });
  ipcMain.handle('shield-site-get', (event, url) => ({ host: hostOf(url), bypassed: isBypassedUrl(url) }));
  ipcMain.handle('shield-site-set', (event, url, bypassed) => {
    const host = hostOf(url);
    if (!host) return false;
    const list = siteStore.get('bypass').filter(h => h !== host);
    if (bypassed) list.push(host);
    siteStore.set('bypass', list);
    return bypassed;
  });
  ipcMain.handle('shield-sites-list', () => siteStore.get('bypass'));
  ipcMain.handle('get-shield-stats', (event, webContentsId) => ({
    total: stats.total,
    page: webContentsId ? (stats.perContents.get(webContentsId) || 0) : 0,
  }));
}

module.exports = { init, addSession, handleRequest, trackContents, isBypassedUrl, getMode: () => currentAdblockMode };
