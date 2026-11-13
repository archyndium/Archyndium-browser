// ==========================================
// ★ ダウンロードマネージャー（進捗・完了をフロントへ通知）
// ==========================================
// ▼ 追加：一時停止 / 再開 / キャンセル / 再試行。ダウンロード中の DownloadItem を id で保持する
// ▼ 追加：Chrome と同じく、標準では「ダウンロード」フォルダへ自動保存する（同名があれば "名前 (1).zip"）。
//   設定の「保存前に保存先を確認する」を ON にすると、従来どおり保存ダイアログを出す。
const { app, ipcMain, shell, session, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');
const windows = require('./windows');

const settings = createStore('download-settings', { askWhereToSave: false });

// ▼ セキュリティ：「開く・フォルダに表示・削除」はこのブラウザでダウンロードしたファイルだけに限る
//   （画面から任意のパスを渡されても、PC 上の関係ないファイルを開いたり消したりしない）
const known = createStore('download-paths', { paths: [] });
function rememberPath(p) {
  const list = known.get('paths').filter(x => x !== p);
  list.push(p);
  known.set('paths', list.slice(-1000));
}
function isInside(dir, p) {
  const rel = path.relative(dir, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function isKnownDownload(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return false;
  const n = path.normalize(p);
  return known.get('paths').includes(n) || isInside(app.getPath('downloads'), n);
}

// 実行すると PC を操作できる種類のファイル。開く前に確認する
const DANGEROUS_EXT = new Set(['.exe', '.msi', '.msix', '.appx', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.hta', '.lnk', '.reg', '.jar', '.dll', '.sys', '.iso', '.img', '.vhd', '.vhdx', '.docm', '.xlsm', '.pptm', '.sh', '.command', '.app', '.pkg', '.dmg', '.deb', '.rpm', '.appimage']);
function isDangerous(p) {
  return DANGEROUS_EXT.has(path.extname(p || '').toLowerCase());
}

// Windows：ダウンロードしたファイルに「インターネットから来た」印（Mark of the Web）を付ける。
//   これで実行時に Windows SmartScreen の確認が出たり、Office が保護ビューで開いたりする（Chrome と同じ）
function markOfTheWeb(filePath, url, referrer) {
  if (process.platform !== 'win32' || !/^https?:/i.test(url || '')) return;
  const lines = ['[ZoneTransfer]', 'ZoneId=3'];
  if (/^https?:/i.test(referrer || '')) lines.push(`ReferrerUrl=${referrer}`);
  lines.push(`HostUrl=${url}`);
  try { fs.writeFileSync(`${filePath}:Zone.Identifier`, lines.join('\r\n') + '\r\n'); } catch (e) {}
}

function uniqueSavePath(fileName) {
  const dir = app.getPath('downloads');
  const safe = (fileName || 'download').replace(/[\\/:*?"<>|]/g, '_');
  const ext = path.extname(safe), stem = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let i = 1; fs.existsSync(candidate) && i < 1000; i++) candidate = path.join(dir, `${stem} (${i})${ext}`);
  return candidate;
}
const items = new Map(); // id -> DownloadItem（終わったら消す）

// 通常セッション・シークレットセッションそれぞれに登録する
function addSession(ses) {
  ses.on('will-download', (event, item, webContents) => {
    // ダウンロードを始めたタブのウィンドウに進捗を送る
    const win = windows.hostWindowOf(webContents) || windows.activeWindow();
    const send = (channel, data) => windows.sendTo(win, channel, data);
    const downloadId = Date.now().toString() + Math.floor(Math.random() * 1000); // 識別ID
    items.set(downloadId, item);
    if (!settings.get('askWhereToSave')) {
      try { item.setSavePath(uniqueSavePath(item.getFilename())); } catch (e) {}
    }

    // ダウンロード開始をフロントに通知
    send('download-started', {
      id: downloadId,
      fileName: item.getFilename(),
      totalBytes: item.getTotalBytes(),
      url: item.getURL(),
      mimeType: item.getMimeType(),
      dangerous: isDangerous(item.getFilename()),
      startTime: Date.now(),
      isPrivate: ses !== session.defaultSession,
    });

    // 進行状況をフロントに送信
    item.on('updated', (event, state) => {
      send('download-progress', {
        id: downloadId,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing',
        canResume: item.canResume(),
      });
    });

    // 完了・失敗をフロントに通知
    item.once('done', (event, state) => {
      items.delete(downloadId);
      if (state === 'completed') {
        rememberPath(path.normalize(item.getSavePath()));
        markOfTheWeb(item.getSavePath(), item.getURL(), webContents && !webContents.isDestroyed() ? webContents.getURL() : '');
      }
      send('download-completed', {
        id: downloadId,
        state: state, // 'completed', 'cancelled', 'interrupted'
        filePath: item.getSavePath(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
    });
  });
}

function init() {

  // ▼ ダウンロードしたファイルを開く連携処理
  ipcMain.on('open-download-item', async (event, filePath) => {
    if (!isKnownDownload(filePath)) return;
    if (isDangerous(filePath)) {
      // 実行ファイル等は、本当に開くか確認する（既定は「キャンセル」）
      const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
        type: 'warning', buttons: ['キャンセル', '開く'], defaultId: 0, cancelId: 0, noLink: true,
        title: 'ファイルを開く', message: `「${path.basename(filePath)}」を開きますか？`,
        detail: 'このファイルはプログラムとして実行され、PC を変更できる種類のファイルです。\n入手元を信頼できる場合だけ開いてください。',
      });
      if (response !== 1) return;
    }
    shell.openPath(filePath);
  });
  ipcMain.on('show-download-item', (event, filePath) => {
    if (isKnownDownload(filePath)) shell.showItemInFolder(filePath);
  });

  ipcMain.on('download-control', (event, { id, action }) => {
    const item = items.get(id);
    if (!item) return;
    const send = (channel, data) => event.sender.send(channel, data);
    if (action === 'pause' && !item.isPaused()) item.pause();
    else if (action === 'resume' && item.canResume()) item.resume();
    else if (action === 'cancel') item.cancel();
    // pause/resume は 'updated' が来ないことがあるので状態をすぐ知らせる
    if (action !== 'cancel') {
      send('download-progress', {
        id, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(),
        state: item.isPaused() ? 'paused' : 'progressing', canResume: item.canResume(),
      });
    }
  });
  // ▼ 追加：ファイルが PC に残っているか（エクスプローラー等で消された物を一覧で斜線表示するため）
  ipcMain.handle('downloads-check-exists', (event, paths) => {
    const out = {};
    (paths || []).forEach(p => { if (isKnownDownload(p)) out[p] = fs.existsSync(p); });
    return out;
  });
  // ▼ 追加：ブラウザからファイルを本当に削除する（ごみ箱へ移動するので、間違えても戻せる）
  ipcMain.handle('download-trash-file', async (event, filePath) => {
    if (!isKnownDownload(filePath)) return { ok: false, error: 'このブラウザでダウンロードしたファイルではありません' };
    if (!fs.existsSync(filePath)) return { ok: true, alreadyGone: true };
    try { await shell.trashItem(filePath); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
  });
  ipcMain.handle('download-settings-get', () => settings.all());
  ipcMain.handle('download-settings-set', (event, key, value) => { settings.set(key, value); return settings.all(); });

  // 失敗・キャンセルしたものをもう一度ダウンロードする
  ipcMain.on('download-retry', (event, { url, isPrivate }) => {
    if (!/^https?:/.test(url || '')) return;
    const ses = isPrivate ? session.fromPartition('archyndium-private') : session.defaultSession;
    ses.downloadURL(url);
  });
}

module.exports = { init, addSession };
