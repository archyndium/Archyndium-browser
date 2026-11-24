// ==========================================
// ★ シークレット（プライベート）モード用セッション
// ==========================================
// "persist:" を付けないパーティションはメモリ上だけに作られ、ディスクに履歴・Cookie・
// キャッシュが残らない。シークレットタブはすべてこの 1 つのセッションを共有し
// （Chrome のシークレットウィンドウと同じ）、最後のシークレットタブを閉じた時に中身を消去する。
const { app, ipcMain, session } = require('electron');

const PRIVATE_PARTITION = 'archyndium-private';

function getPrivateSession() {
  return session.fromPartition(PRIVATE_PARTITION, { cache: false });
}

async function clear() {
  const ses = getPrivateSession();
  await Promise.all([
    ses.clearStorageData().catch(() => {}),
    ses.clearCache().catch(() => {}),
    ses.clearAuthCache().catch(() => {}),
    ses.clearHostResolverCache().catch(() => {}),
  ]);
}

function init() {
  ipcMain.handle('clear-private-session', () => clear());
  // ▼ 追加：シークレットタブでは、サイトに「追跡しないで・個人情報を売らないで」と伝える
  //   （Global Privacy Control と Do Not Track。従うかどうかはサイト次第）
  //   セッションは起動の準備ができてからでないと作れないので、whenReady の後に設定する
  app.whenReady().then(() => {
    getPrivateSession().webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      details.requestHeaders['Sec-GPC'] = '1';
      details.requestHeaders['DNT'] = '1';
      callback({ requestHeaders: details.requestHeaders });
    });
  });
}

module.exports = { init, getPrivateSession, PRIVATE_PARTITION };
