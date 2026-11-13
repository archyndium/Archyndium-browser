// ==========================================
// ★ セキュリティ：ポップアップ（新規ウィンドウ）のブロック
// ==========================================
// 以前は BrowserView（未使用）にしか setWindowOpenHandler が付いていなかったため、
// 実際にタブとして使われている <webview> にも同じポリシーを適用する。
// ▼ 修正：以前は「新しいウィンドウを開く」要求をすべて捨てていたため、target="_blank" のリンクを
//   普通にクリックしても何も起きなかった。今は直前のユーザー操作（クリック・キー）の有無で判断する。
//   ・ユーザーの操作の直後 … リンクは新しいタブで開く（Ctrl+クリック・中クリックは裏で開く）
//                             サイズ指定のある小窓（Google ログインなど）は小さなウィンドウとして開く
//   ・操作なしでスクリプトが勝手に開こうとした … ポップアップ広告とみなしてブロック
const { session } = require('electron');
const shortcuts = require('./shortcuts');
const adblock = require('./adblock');
const contextMenu = require('./context-menu');
const windows = require('./windows');

const USER_GESTURE_MS = 1500;

function parseFeatures(features) {
  const out = {};
  (features || '').split(',').forEach(kv => {
    const [k, v] = kv.split('=').map(s => (s || '').trim().toLowerCase());
    if (k) out[k] = v === undefined ? 'yes' : v;
  });
  return out;
}

function init(app) {
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() !== 'webview') return;

    // 直前のユーザー操作の時刻（マウスのボタン・キー入力）
    let lastUserInput = 0;
    contents.on('input-event', (e, input) => {
      if (input.type === 'mouseDown' || input.type === 'mouseUp' || input.type === 'keyDown' || input.type === 'rawKeyDown') lastUserInput = Date.now();
    });

    contents.setWindowOpenHandler((details) => {
      const isHttp = /^https?:\/\//.test(details.url);
      const isPrivate = contents.session !== session.defaultSession;
      const byUser = Date.now() - lastUserInput < USER_GESTURE_MS;
      if (!isHttp && details.url !== 'about:blank') return { action: 'deny' };

      // Ctrl+クリック / 中クリック → 裏で新しいタブ
      if (details.disposition === 'background-tab' && isHttp) {
        windows.sendToHost(contents, 'open-in-new-tab', { url: details.url, background: true, isPrivate });
        return { action: 'deny' };
      }
      if (!byUser) {
        // ユーザーが何もしていないのに開こうとした → ポップアップ広告としてブロック
        console.log('Blocked popup attempt to:', details.url);
        return { action: 'deny' };
      }
      // サイズ指定のある小窓（ログイン・決済の認証など）は、元のページとやり取りできるよう本物の小窓で開く
      const f = parseFeatures(details.features);
      if (details.disposition === 'new-window' && (f.width || f.height || f.popup === 'yes' || f.popup === '1')) {
        const parent = windows.hostWindowOf(contents);
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: Math.min(Math.max(parseInt(f.width) || 520, 320), 1200),
            height: Math.min(Math.max(parseInt(f.height) || 640, 320), 1000),
            parent: parent || undefined, autoHideMenuBar: true, backgroundColor: '#ffffff',
            webPreferences: { session: contents.session, contextIsolation: true, nodeIntegration: false },
          },
        };
      }
      // target="_blank" のリンクなど → このウィンドウの新しいタブで開く
      if (isHttp) windows.sendToHost(contents, 'open-in-new-tab', { url: details.url, background: false, isPrivate });
      return { action: 'deny' };
    });

    // webview 内にフォーカスがあってもブラウザのショートカットが効くようにする
    shortcuts.attach(contents);

    // Shield パネルの「このページでブロック」件数をページ遷移ごとにリセットする
    adblock.trackContents(contents);

    // ページの右クリックメニュー
    contextMenu.attach(contents);
  });
}

module.exports = { init };
