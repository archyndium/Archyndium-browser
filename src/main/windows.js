// ==========================================
// ★ ブラウザウィンドウの管理（複数ウィンドウ対応）
// ==========================================
// 以前は「ウィンドウは 1 つ」の前提で、ダウンロード・権限・ショートカットなどの通知を
// すべて mainWindow に送っていた。ここでは「そのタブ（webview）が入っているウィンドウ」に送る。
const { BrowserWindow } = require('electron');

const browserWindows = new Set();
let lastActive = null;

function register(win) {
  browserWindows.add(win);
  lastActive = win;
  win.on('focus', () => { lastActive = win; });
  win.on('closed', () => {
    browserWindows.delete(win);
    if (lastActive === win) lastActive = [...browserWindows].pop() || null;
  });
}

function alive(win) {
  return win && !win.isDestroyed() && browserWindows.has(win) ? win : null;
}

// webview のページ → それを表示しているブラウザウィンドウ
function hostWindowOf(contents) {
  if (!contents || contents.isDestroyed?.()) return null;
  let wc = contents;
  if (wc.getType?.() === 'webview' && wc.hostWebContents) wc = wc.hostWebContents;
  return alive(BrowserWindow.fromWebContents(wc));
}

// いま操作しているブラウザウィンドウ（フォーカス中 → 最後に使った → どれか）
function activeWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  return alive(focused) || alive(lastActive) || [...browserWindows][0] || null;
}

function sendTo(win, channel, data) {
  if (alive(win)) win.webContents.send(channel, data);
}

// contents の持ち主のウィンドウへ（分からなければ操作中のウィンドウへ）
function sendToHost(contents, channel, data) {
  sendTo(hostWindowOf(contents) || activeWindow(), channel, data);
}

function sendToAll(channel, data) {
  browserWindows.forEach(w => sendTo(w, channel, data));
}

module.exports = { register, hostWindowOf, activeWindow, sendTo, sendToHost, sendToAll, all: () => [...browserWindows], count: () => browserWindows.size };
