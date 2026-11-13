// ==========================================
// ★ 自動アップデート（GitHub Releases から）
// ==========================================
// インストーラー（NSIS）で入れたアプリだけが対象。起動時と 6 時間ごとに新しい版を確認し、
// 見つかったら裏でダウンロードして、画面に「再起動して更新」を出す。
//   ・開発中（npm start）… 何もしない
//   ・Microsoft Store 版 … Store が更新するので何もしない
//   ・zip 版            … 自動更新には対応していない（確認しても失敗するだけで、アプリの動作には影響しない）
const { app, ipcMain } = require('electron');
const windows = require('./windows');

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
let autoUpdater = null;
let state = { status: 'idle', version: '' }; // idle | checking | none | downloading | ready | error | unsupported

function setState(next) {
  state = { ...state, ...next };
  windows.sendToAll('update-state', state);
}

function supported() {
  return app.isPackaged && !process.windowsStore;
}

function check() {
  if (!autoUpdater) return Promise.resolve(state);
  setState({ status: 'checking' });
  return autoUpdater.checkForUpdates().then(() => state).catch((e) => { setState({ status: 'error', error: String(e.message || e) }); return state; });
}

function init() {
  const unsupported = () => ({ status: 'unsupported', reason: process.windowsStore ? 'store' : 'dev' });
  const withVersion = (s) => ({ ...s, current: app.getVersion() });
  ipcMain.handle('update-get-state', () => withVersion(supported() ? state : unsupported()));
  ipcMain.handle('update-check', async () => withVersion(supported() ? await check() : unsupported()));
  ipcMain.on('update-install', () => { if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(); });

  if (!supported()) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.log('[updater] electron-updater を読み込めませんでした:', e.message);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // 「再起動して更新」を押さなくても、次に終了した時に更新される
  autoUpdater.on('update-available', (info) => setState({ status: 'downloading', version: info.version }));
  autoUpdater.on('update-not-available', () => setState({ status: 'none' }));
  autoUpdater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version }));
  autoUpdater.on('error', (e) => setState({ status: 'error', error: String(e?.message || e) }));

  app.whenReady().then(() => {
    setTimeout(check, 10 * 1000); // 起動直後の読み込みを邪魔しないよう少し待つ
    setInterval(check, CHECK_INTERVAL);
  });
}

module.exports = { init };
