// ==========================================
// ★ アプリ全体の設定（main プロセスが起動時に使うもの）
// ==========================================
// opaqueWindow … ウィンドウを不透明にして描画を軽くする（初期値 true）。
//   透明なウィンドウは Windows では描画・リサイズ・ドラッグが重くなりやすいため。
//   不透明の時、角の丸みと影は Windows 11 の標準のものになる。次に開くウィンドウから反映。
const { ipcMain, session } = require('electron');
const { createStore } = require('./store');

const store = createStore('app-settings', { opaqueWindow: true });
const ALLOWED = { opaqueWindow: 'boolean' };

function get(key) { return store.get(key); }

// ▼ 追加：サイトのデータ（Cookie・保存データ・キャッシュ）の削除
//   host を渡すとそのサイト（例：google.com なら www.google.com なども含む）だけ、無ければすべて
const SECOND_LEVEL = /^(co|ne|or|ac|go|ed|gr|lg|com|net|org|gov|edu)$/;
function siteDomain(host) {
  const parts = String(host).toLowerCase().replace(/^\.+/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const n = SECOND_LEVEL.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}
async function clearSiteData(host) {
  const ses = session.defaultSession;
  if (!host) {
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
    return { cleared: 'all' };
  }
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host)) return { cleared: 0 };
  const domain = siteDomain(host);
  const cookies = await ses.cookies.get({}).catch(() => []);
  let n = 0;
  for (const c of cookies) {
    const d = (c.domain || '').replace(/^\./, '').toLowerCase();
    if (d === domain || d.endsWith('.' + domain)) {
      const url = `http${c.secure ? 's' : ''}://${d}${c.path || '/'}`;
      await ses.cookies.remove(url, c.name).catch(() => {});
      n++;
    }
  }
  for (const origin of new Set([`https://${host}`, `https://${domain}`, `https://www.${domain}`])) {
    await ses.clearStorageData({ origin }).catch(() => {});
  }
  return { cleared: n, domain };
}

function init() {
  ipcMain.handle('site-data-clear', (event, host) => clearSiteData(host || null));
  ipcMain.handle('app-settings-get', () => ({ ...store.all() }));
  ipcMain.handle('app-settings-set', (event, key, value) => {
    if (!(key in ALLOWED) || typeof value !== ALLOWED[key]) return false;
    store.set(key, value);
    return true;
  });
}

module.exports = { init, get };
