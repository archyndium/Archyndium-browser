// ==========================================
// ARCHYNDIUM Browser - メインプロセス（エントリーポイント）
// ==========================================
// 機能ごとに src/main/ 以下へ分割しています：
//   network.js         常時HTTPS + アドブロックの統合リクエストハンドラ
//   private-session.js シークレットモード用のメモリ専用セッション
//   adblock.js         @cliqz/adblocker-electron の 3 モード制御 + サイト例外
//   permissions.js     カメラ・マイク・位置情報・通知などの権限確認
//   context-menu.js    ページの右クリックメニュー
//   search-suggest.js  アドレスバーの検索候補
//   capture.js         ページのスクリーンショット
//   media-info.js      再生中の曲名（YouTube oEmbed。裏のタブでも最新の曲名を取る）
//   store.js           userData への JSON 保存ヘルパー
//   popup-guard.js     webview のポップアップブロック + Ctrl/中クリックで新規タブ
//   shortcuts.js       キーボードショートカット（before-input-event）
//   downloads.js       ダウンロードマネージャー
//   lyrics.js          歌詞取得 API（lyrics-query.js でタイトル解析・照合）
//   window-controls.js ウィンドウ操作 & ミニプレイヤー
//   windows.js         複数ウィンドウの管理（通知を「そのタブのウィンドウ」に送る）
//   browser-views.js   BrowserView 方式のタブ管理（レガシー・現在未使用）
//   security.js        IPC の送り主チェック・本体ウィンドウの移動禁止・webview の強制設定など
//   extensions.js      Chrome 拡張機能の読み込み・インストール
//   window-drag.js     ウィンドウを掴んで動かす（本体・ミニプレイヤー）
//   compat.js          ブックマークの取り込み・既定のブラウザ・PDF 保存・DRM の状態
//   updater.js         自動アップデート（GitHub Releases）
const { app, BrowserWindow, session, screen } = require('electron');
const path = require('path');

// ▼ セキュリティ：サンドボックス等はアプリの準備完了より前に設定する必要がある
const security = require('./main/security');
security.init();
// ここから下で登録する IPC は「ブラウザ本体の画面から来たものだけ」受け付ける（removeIpcGuard まで）
security.installIpcGuard();

const network = require('./main/network');
const privateSession = require('./main/private-session');
const permissions = require('./main/permissions');
const popupGuard = require('./main/popup-guard');
const shortcuts = require('./main/shortcuts');
const downloads = require('./main/downloads');
const lyrics = require('./main/lyrics');
const windowControls = require('./main/window-controls');
const browserViews = require('./main/browser-views');
const contextMenu = require('./main/context-menu');
const searchSuggest = require('./main/search-suggest');
const capture = require('./main/capture');
const mediaInfo = require('./main/media-info');
const extensions = require('./main/extensions');
const windowDrag = require('./main/window-drag');
const compat = require('./main/compat');
const updater = require('./main/updater');
const appSettings = require('./main/app-settings');
const linkPreview = require('./main/link-preview');
const newtabProtocol = require('./main/newtab-protocol');
const translator = require('./main/translator');

// Windows：通知やタスクバーでアプリを正しく識別させる（package.json の build.appId と同じ値）
if (process.platform === 'win32') app.setAppUserModelId('com.archyndium.browser');

// ▼ 追加：アプリは 1 つだけ起動する。2 回目に起動された時（他のアプリでリンクを開いた時など）は、
//   今のウィンドウの新しいタブでその URL を開く
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) app.exit(0);
let startupUrls = compat.urlsFromArgv(process.argv); // 起動時に渡された URL（画面の準備ができたら開く）
app.on('second-instance', (event, argv) => {
  const urls = compat.urlsFromArgv(argv);
  const win = windows.activeWindow();
  if (!win) { createWindow(urls[0] ? { url: urls[0] } : {}); return; }
  if (win.isMinimized()) win.restore();
  win.focus();
  urls.forEach(url => windows.sendTo(win, 'open-in-new-tab', { url, background: false }));
});
// macOS：他のアプリからリンクを開いた時
app.on('open-url', (event, url) => {
  event.preventDefault();
  const win = windows.activeWindow();
  if (win) windows.sendTo(win, 'open-in-new-tab', { url, background: false });
  else startupUrls.push(url);
});

const windows = require('./main/windows');
const { ipcMain } = require('electron');

// ▼ 変更：複数ウィンドウ対応。query はウィンドウの役割を renderer に伝える
//   first=1   … 起動時の最初のウィンドウ（保存されている全ウィンドウを復元する）
//   session=… … 復元するウィンドウの保存キー
//   url=…     … 新しいウィンドウで最初に開くページ（タブを別ウィンドウへ移動した時など）
//   private=1 … 最初のタブをシークレットにする
function createWindow(query = {}, bounds = {}) {
  // ▼ 変更：軽量化のため、初期値は不透明なウィンドウ（設定 → Performance で以前の透明なウィンドウに戻せる）
  const opaque = appSettings.get('opaqueWindow') !== false;
  if (opaque) query = { ...query, opaque: '1' };
  const win = new BrowserWindow({
    width: 1280, height: 800, ...bounds,
    frame: false,
    ...(opaque
      // 不透明：Windows の標準の枠（角の丸み・影・スナップ）を使う。描画が軽い
      ? { transparent: false, backgroundColor: '#0B0B0D', thickFrame: true, hasShadow: true }
      // 透明：アプリで角を丸める（以前の形）。Windows で枠なしウィンドウに付く四角い薄い枠を出さない
      : { transparent: true, backgroundColor: '#00000000', thickFrame: false, hasShadow: false }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      webviewTag: true,
      // ▼ 追加：最小化・裏に回っている間もミニプレイヤーとの同期や歌詞の更新を止めない
      backgroundThrottling: false
    }
  });
  windows.register(win);
  windowDrag.track(win);
  // 最大化中は角を丸めない
  // ▼ 修正：Windows の透明ウィンドウは最大化しても isMaximized() が false になることがあり、角丸と縁が残って
  //   画面の端に余白ができていた。ウィンドウが画面（作業領域）いっぱいかどうかでも判定する
  const fillsScreen = () => {
    const b = win.getBounds();
    const d = screen.getDisplayMatching(b);
    const T = 2; // 1px ずれることがあるので少しだけ許容する
    return [d.workArea, d.bounds].some(a => b.x <= a.x + T && b.y <= a.y + T && b.x + b.width >= a.x + a.width - T && b.y + b.height >= a.y + a.height - T);
  };
  let lastMax = null;
  const sendMaxState = (force) => {
    if (win.isDestroyed()) return;
    const on = win.isMaximized() || win.isFullScreen() || fillsScreen();
    if (on !== lastMax || force === true) { lastMax = on; win.webContents.send('window-maximized', on); }
  };
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'enter-html-full-screen', 'leave-html-full-screen', 'resize'].forEach(ev => win.on(ev, sendMaxState));
  win.webContents.on('did-finish-load', () => sendMaxState(true));
  win.loadFile(path.join(__dirname, 'index.html'), { query });

  // URLバーや歌詞入力欄にフォーカスがある時もショートカットを効かせる
  shortcuts.attach(win.webContents);
  shortcuts.attachWindow(win);
  return win;
}

// 新しいウィンドウは今のウィンドウから少しずらして開く
function openNewWindow(event, opts = {}) {
  const from = event && BrowserWindow.fromWebContents(event.sender);
  const bounds = {};
  if (from && !from.isMaximized()) {
    const b = from.getBounds();
    Object.assign(bounds, { x: b.x + 32, y: b.y + 32, width: b.width, height: b.height });
  }
  const query = {};
  if (opts.url) query.url = opts.url;
  if (opts.sessionKey) query.session = opts.sessionKey;
  if (opts.isPrivate) query.private = '1';
  createWindow(query, bounds);
}

ipcMain.on('open-new-window', (event, opts) => openNewWindow(event, opts || {}));

// ▼ 追加：タブをウィンドウの外へドラッグした。別のブラウザウィンドウの上ならそちらへ移し、
//   何も無い所なら、その位置に新しいウィンドウを作る
ipcMain.handle('tab-tear-off', (event, { url, isPrivate, screenX, screenY, onlyMerge }) => {
  if (!url) return null;
  const from = BrowserWindow.fromWebContents(event.sender);
  const target = windows.all().find(w => w !== from && !w.isMinimized() && (() => {
    const b = w.getBounds();
    return screenX >= b.x && screenX <= b.x + b.width && screenY >= b.y && screenY <= b.y + b.height;
  })());
  if (target) {
    // ▼ 変更：引き出し中にそのウィンドウのタブバーで開いていた場所へ入れる（tab-drag.js）
    windows.sendTo(target, 'tab-drop-in', { url, isPrivate: !!isPrivate });
    target.focus();
    return 'moved';
  }
  // ▼ 変更：ウィンドウの最後の 1 枚は、何も無い所で離したらウィンドウごとそこへ動かす（Chrome と同じ）
  if (onlyMerge) {
    if (from && !from.isMaximized() && !from.isFullScreen()) from.setPosition(Math.round(screenX - 100), Math.round(screenY - 22));
    return null;
  }
  const size = from && !from.isMaximized() ? from.getBounds() : { width: 1280, height: 800 };
  const query = { url };
  if (isPrivate) query.private = '1';
  createWindow(query, { x: Math.round(screenX - 100), y: Math.round(screenY - 22), width: size.width, height: size.height });   // 離したタブがマウスの下に来る位置
  return 'new';
});
// ▼ 追加：ウィンドウをまとめる。to = 'all'（ほかのウィンドウのタブをすべてこのウィンドウへ）
ipcMain.on('merge-windows', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) return;
  windows.all().filter(w => w !== target).forEach(w => windows.sendTo(w, 'merge-into-window', { targetId: target.id }));
  target.focus();
});
// ほかのウィンドウから送られてきたタブを、指定のウィンドウで開く（裏で開く）
ipcMain.on('move-tabs-to-window', (event, { targetId, tabs } = {}) => {
  const target = windows.all().find(w => w.id === targetId);
  if (!target || !Array.isArray(tabs)) return;
  tabs.slice(0, 200).forEach(t => { if (t && typeof t.url === 'string') windows.sendTo(target, 'open-in-new-tab', { url: t.url, background: true, isPrivate: !!t.isPrivate }); });
});
// タブを「ほかのウィンドウ」（最後に使った別のウィンドウ）へ移す
ipcMain.handle('move-tab-to-other-window', (event, { url, isPrivate } = {}) => {
  const from = BrowserWindow.fromWebContents(event.sender);
  const target = windows.all().filter(w => w !== from).pop();
  if (!target || typeof url !== 'string') return false;
  windows.sendTo(target, 'open-in-new-tab', { url, background: false, isPrivate: !!isPrivate });
  target.focus();
  return true;
});
ipcMain.on('window-count-sync', (event) => { event.returnValue = windows.count(); });

// アプリごと終了する時は全ウィンドウを保存させたいので、「残りのウィンドウ数」を 1 として返す
//（renderer はウィンドウ数が 2 以上だと「このウィンドウだけ閉じた」とみなして保存を消すため）
let appQuitting = false;
app.on('before-quit', () => { appQuitting = true; });
ipcMain.on('window-count', (event) => { event.returnValue = appQuitting ? 1 : windows.count(); });

// IPC ハンドラはウィンドウ生成前に一度だけ登録する
popupGuard.init(app);
privateSession.init();
permissions.init({ isPrivate: (ses) => ses === privateSession.getPrivateSession() });
downloads.init();
network.init();
lyrics.init();
windowControls.init();
contextMenu.init();
searchSuggest.init();
capture.init();
mediaInfo.init();
browserViews.init(() => windows.activeWindow());
extensions.init();
windowDrag.init();
compat.init();
updater.init();
appSettings.init();
linkPreview.init();
newtabProtocol.init({ privatePartition: privateSession.PRIVATE_PARTITION });
translator.init();
ipcMain.handle('take-startup-urls', () => { const urls = startupUrls; startupUrls = []; return urls; });
require('./main/tab-drag').init();   // ▼ 追加：タブを引き出している間の見た目
security.removeIpcGuard();

app.whenReady().then(async () => {
  if (!gotSingleLock) return;
  // ▼ 追加：castLabs 版 Electron（Widevine 入り）で起動した時は、保護された動画の部品の準備を待つ
  //   （Netflix・Amazon Prime Video などに必要。通常の Electron では components が無いので何もしない）
  const { components } = require('electron');
  if (components && typeof components.whenReady === 'function') {
    try { await components.whenReady(); } catch (e) { console.log('Widevine の準備に失敗しました:', e.message); }
  }
  for (const ses of [session.defaultSession, privateSession.getPrivateSession()]) {
    network.addSession(ses);
    downloads.addSession(ses);
    permissions.addSession(ses);
  }
  extensions.load(session.defaultSession); // 拡張機能は通常のタブだけ（シークレットでは動かさない＝Chrome と同じ）
  session.defaultSession.clearStorageData({ origin: 'https://www.youtube.com', storages: ['localstorage'] }).catch(()=>{});
  createWindow({ first: '1' });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
// macOS：Dock のアイコンを押した時にウィンドウが無ければ開く
app.on('activate', () => { if (windows.count() === 0) createWindow(); });
