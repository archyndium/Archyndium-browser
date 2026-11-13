// ==========================================
// ★ ページのスクリーンショット（見えている範囲）
// ==========================================
// mode = 'copy'：クリップボードにコピー / 'save'：「ダウンロード」フォルダに PNG で保存
const { app, ipcMain, webContents, clipboard, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function init() {
  ipcMain.handle('capture-page', async (event, webContentsId, mode) => {
    const wc = webContents.fromId(webContentsId);
    if (!wc || wc.isDestroyed()) return { ok: false };
    const image = await wc.capturePage();
    if (mode === 'copy') {
      clipboard.writeImage(image);
      return { ok: true };
    }
    const file = path.join(app.getPath('downloads'), `screenshot-${timestamp()}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, filePath: file };
  });
  ipcMain.on('show-file', (event, filePath) => { if (filePath) shell.showItemInFolder(filePath); });
}

module.exports = { init };
