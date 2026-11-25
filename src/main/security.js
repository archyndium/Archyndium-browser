// ==========================================
// ★ セキュリティ強化
// ==========================================
// Web ページ（webview の中）とブラウザ本体（index.html・ミニプレイヤー）をしっかり分けるための仕組み。
//   1. IPC の送り主チェック … ブラウザ本体の画面以外から来た命令（ファイルを開く・削除する等）は無視する
//   2. 本体ウィンドウの移動禁止 … リンクやファイルを本体の画面へドロップしても、本体がそのページに置き換わらない
//      （置き換わると、そのページがブラウザ本体の機能を使えてしまうため）
//   3. webview の強制設定 … Node.js 無効・サンドボックス有効・preload を付けさせない・http(s) 以外は開かない
//   4. サイトが開いた小窓の中からさらに開くウィンドウも、ポップアップと同じ扱いにする
//   5. User-Agent から "Electron" とアプリ名を外す（Google ログイン等で「安全でないブラウザ」と弾かれにくくする）
//   6. DNS over HTTPS（対応している DNS なら暗号化して名前解決する）
const { app, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const windows = require('./windows');

const APP_ROOT = pathToFileURL(path.join(__dirname, '..')).href + '/';

function isAppUrl(url) {
  return typeof url === 'string' && url.startsWith(APP_ROOT);
}

// ---------- 1. IPC の送り主チェック ----------
function isTrustedSender(event) {
  try {
    if (event.sender.getType() !== 'window') return false;
    const url = event.senderFrame?.url || event.sender.getURL();
    // 本体の画面のメインフレームだけ（iframe 等からは受け付けない）
    if (event.senderFrame && event.senderFrame.parent) return false;
    return isAppUrl(url);
  } catch (e) {
    return false;
  }
}

function reject(channel, event) {
  let from = '';
  try { from = event.senderFrame?.url || event.sender.getURL(); } catch (e) {}
  console.warn(`[security] 本体以外からの IPC を拒否しました: ${channel} (${from})`);
}

// installIpcGuard() 〜 removeIpcGuard() の間に登録された ipcMain のハンドラは、送り主チェック付きになる。
// （アドブロッカーがページ側に入れる見た目フィルター用の IPC は対象外にしたいので、アプリ自身の登録だけを包む）
let original = null;
function installIpcGuard() {
  if (original) return;
  original = { on: ipcMain.on, once: ipcMain.once, handle: ipcMain.handle, handleOnce: ipcMain.handleOnce };
  const wrapListener = (channel, fn) => function (event, ...args) {
    if (!isTrustedSender(event)) { reject(channel, event); event.returnValue = null; return; }
    return fn.call(this, event, ...args);
  };
  const wrapHandler = (channel, fn) => function (event, ...args) {
    if (!isTrustedSender(event)) { reject(channel, event); throw new Error('forbidden'); }
    return fn.call(this, event, ...args);
  };
  ipcMain.on = function (channel, fn) { return original.on.call(ipcMain, channel, wrapListener(channel, fn)); };
  ipcMain.addListener = ipcMain.on;
  ipcMain.once = function (channel, fn) { return original.once.call(ipcMain, channel, wrapListener(channel, fn)); };
  ipcMain.handle = function (channel, fn) { return original.handle.call(ipcMain, channel, wrapHandler(channel, fn)); };
  ipcMain.handleOnce = function (channel, fn) { return original.handleOnce.call(ipcMain, channel, wrapHandler(channel, fn)); };
}

function removeIpcGuard() {
  if (!original) return;
  ipcMain.on = ipcMain.addListener = original.on;
  ipcMain.once = original.once;
  ipcMain.handle = original.handle;
  ipcMain.handleOnce = original.handleOnce;
  original = null;
}

// ---------- 2〜4. ウィンドウ・webview の制限 ----------
// archyndium://newtab/ … アプリ同梱の新しいタブのページ（main/newtab-protocol.js）
const ALLOWED_WEBVIEW_SRC = /^(https?:|about:blank|view-source:https?:|chrome-extension:|archyndium:\/\/newtab\/)/i;

function hardenContents(contents) {
  if (contents.getType() !== 'window') return;

  // 本体の画面にだけ webview を置ける。設定は強制的に安全な値にする
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.experimentalFeatures = false;
    if (!isAppUrl(contents.getURL()) || (params.src && !ALLOWED_WEBVIEW_SRC.test(params.src))) {
      console.warn('[security] webview の作成を拒否しました:', params.src);
      event.preventDefault();
    }
  });

  // 本体の画面は別のページへ移動させない（ドロップしたリンク・ファイル等）
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(contents.getURL()) && !isAppUrl(url)) {
      event.preventDefault();
      // リンクを本体にドロップした場合は、新しいタブで開いてあげる
      if (/^https?:/i.test(url)) windows.sendTo(windows.activeWindow(), 'open-in-new-tab', { url, background: false });
    }
  });
  contents.on('will-redirect', (event, url) => {
    if (isAppUrl(contents.getURL()) && !isAppUrl(url)) event.preventDefault();
  });

  // 新しいウィンドウ：本体からは開かせない。サイトの小窓（ログイン画面など）から開くものはタブで開く
  contents.setWindowOpenHandler((details) => {
    if (!isAppUrl(contents.getURL()) && /^https?:/i.test(details.url)) {
      windows.sendTo(windows.activeWindow(), 'open-in-new-tab', { url: details.url, background: false });
    }
    return { action: 'deny' };
  });
}

// ---------- 5. User-Agent ----------
function cleanUserAgent() {
  const ua = app.userAgentFallback || '';
  const name = (app.getName() || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  app.userAgentFallback = ua
    .replace(/\sElectron\/\S+/i, '')
    .replace(name ? new RegExp(`\\s${name}\\/\\S+`, 'i') : /$^/, '');
}

function init() {
  // すべての画面・ページをサンドボックス（OS の権限を絞ったプロセス）で動かす
  // （開発・検証用に --no-sandbox を付けて起動した時だけは従う。Linux の root 実行ではサンドボックスが使えないため）
  if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
  cleanUserAgent();
  app.on('web-contents-created', (event, contents) => hardenContents(contents));
  app.whenReady().then(() => {
    // ---------- 6. DNS over HTTPS（自動：使っている DNS が対応していれば暗号化） ----------
    try { app.configureHostResolver({ secureDnsMode: 'automatic' }); } catch (e) {}
  });
}

module.exports = { init, installIpcGuard, removeIpcGuard, isAppUrl, isTrustedSender };
