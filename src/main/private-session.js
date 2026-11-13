// ==========================================
// ★ シークレット（プライベート）モード用セッション
// ==========================================
// "persist:" を付けないパーティションはメモリ上だけに作られ、ディスクに履歴・Cookie・
// キャッシュが残らない。シークレットタブはすべてこの 1 つのセッションを共有し
// （Chrome のシークレットウィンドウと同じ）、最後のシークレットタブを閉じた時に中身を消去する。
const { ipcMain, session } = require('electron');

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
}

module.exports = { init, getPrivateSession, PRIVATE_PARTITION };
