// ==========================================
// ★ アプリ全体の設定（main プロセスが起動時に使うもの）
// ==========================================
// opaqueWindow … ウィンドウを不透明にして描画を軽くする（初期値 true）。
//   透明なウィンドウは Windows では描画・リサイズ・ドラッグが重くなりやすいため。
//   不透明の時、角の丸みと影は Windows 11 の標準のものになる。次に開くウィンドウから反映。
const { ipcMain } = require('electron');
const { createStore } = require('./store');

const store = createStore('app-settings', { opaqueWindow: true });
const ALLOWED = { opaqueWindow: 'boolean' };

function get(key) { return store.get(key); }

function init() {
  ipcMain.handle('app-settings-get', () => ({ ...store.all() }));
  ipcMain.handle('app-settings-set', (event, key, value) => {
    if (!(key in ALLOWED) || typeof value !== ALLOWED[key]) return false;
    store.set(key, value);
    return true;
  });
}

module.exports = { init, get };
