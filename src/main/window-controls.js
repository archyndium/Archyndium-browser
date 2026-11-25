// ==========================================
// ★ ウィンドウ操作 & ミニプレイヤー（分離ウィンドウ）との同期
// ==========================================
// ▼ 変更：複数ウィンドウ対応。最小化・最大化・閉じるは「ボタンを押したウィンドウ」に対して行う。
//   ミニプレイヤーは 1 つだけで、「音楽を再生しているウィンドウ」（playerWindow）と同期する。
//   別のウィンドウで再生が始まったら、そちらに乗り換える。
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const windows = require('./windows');
const { createStore } = require('./store');

let miniPlayerWindow = null;
// ミニプレイヤーの大きさ（歌詞を閉じた時 / 開いた時）
const MINI_W = 360, MINI_H = 160, MINI_H_EXPANDED = 540;
// ▼ 追加：大きさを変えられるようにした。幅と、歌詞を開いた時の高さを覚えておく
const MINI_LIMITS = { minW: 300, maxW: 760, minExpandedH: 320, maxH: 1000 };
const miniStore = createStore('mini-player', { width: MINI_W, expandedHeight: MINI_H_EXPANDED });
const miniWidth = () => Math.max(MINI_LIMITS.minW, Math.min(MINI_LIMITS.maxW, Number(miniStore.get('width')) || MINI_W));
const miniExpandedHeight = () => Math.max(MINI_LIMITS.minExpandedH, Math.min(MINI_LIMITS.maxH, Number(miniStore.get('expandedHeight')) || MINI_H_EXPANDED));
let playerWindow = null;   // ミニプレイヤーと同期しているブラウザウィンドウ
let playerIsPlaying = false;
let playerLocked = false;

function setPlayerWindow(win) {
  if (win === playerWindow) return;
  const prev = playerWindow;
  playerWindow = win;
  playerIsPlaying = false; playerLocked = false;
  // 新しい再生元には「他のウィンドウの曲」の表示をやめさせる
  windows.sendTo(win, 'player-remote', null);
  if (!miniPlayerWindow) return;
  // 前のウィンドウには「ミニプレイヤーは閉じた」、新しいウィンドウには「開いている」と伝える
  // （開いている側だけが、曲が変わった時に歌詞を取りに行く）
  windows.sendTo(prev, 'mini-player-state', { open: false });
  windows.sendTo(win, 'mini-player-state', { open: true });
}

// ▼ 修正：Windows では resizable: false のウィンドウに setSize が効かないことがあり、
//   歌詞を閉じても大きいままになっていた。一時的に変更可能にしてから大きさを変える
function resizeMini(height, width = miniWidth()) {
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return;
  const b = miniPlayerWindow.getBounds();
  miniPlayerWindow.setResizable(true);
  miniPlayerWindow.setMinimumSize(MINI_LIMITS.minW, MINI_H);
  miniPlayerWindow.setBounds({ x: b.x, y: b.y, width, height });
  miniPlayerWindow.setResizable(false);
}

function init() {
  ipcMain.on('window-control', (event, command) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (command === 'minimize' && win) win.minimize();
    if (command === 'maximize' && win) win.isMaximized() ? win.unmaximize() : win.maximize();
    if (command === 'close' && win) win.close();
    if (command === 'fullscreen' && win) win.setFullScreen(!win.isFullScreen());

    if (command === 'mini-expand') resizeMini(miniExpandedHeight());
    if (command === 'mini-collapse') resizeMini(MINI_H);
  });

  ipcMain.on('open-mini-player', (event) => {
    // 再生元がまだ無い時だけ、開いたウィンドウを再生元にする（他のウィンドウで再生中ならそちらと同期）
    if (!playerWindow || playerWindow.isDestroyed()) playerWindow = BrowserWindow.fromWebContents(event.sender);
    if (miniPlayerWindow) { miniPlayerWindow.focus(); return; }
    miniPlayerWindow = new BrowserWindow({
      width: miniWidth(), height: MINI_H, frame: false, transparent: true, alwaysOnTop: true, resizable: false,
      thickFrame: false, hasShadow: false, backgroundColor: '#00000000', // 角の外側に四角い枠を出さない
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true }
    });
    miniPlayerWindow.loadFile(path.join(__dirname, '..', 'mini-player.html'));
    // 本体側に開閉を知らせる（ミニプレイヤーだけ開いている時も歌詞を更新するため）
    miniPlayerWindow.webContents.once('did-finish-load', () => windows.sendTo(playerWindow, 'mini-player-state', { open: true }));
    miniPlayerWindow.on('closed', () => { miniPlayerWindow = null; windows.sendTo(playerWindow, 'mini-player-state', { open: false }); });
  });
  ipcMain.on('close-mini-player', () => { if(miniPlayerWindow) miniPlayerWindow.close(); });
  // ▼ 追加：ミニプレイヤーの右下の角・右端をドラッグして大きさを変える
  ipcMain.on('mini-resize', (event, size) => {
    if (!miniPlayerWindow || miniPlayerWindow.isDestroyed() || !size) return;
    const width = Math.max(MINI_LIMITS.minW, Math.min(MINI_LIMITS.maxW, Math.round(Number(size.width) || MINI_W)));
    let height = MINI_H;
    if (size.expanded) height = size.widthOnly ? miniPlayerWindow.getBounds().height : Math.max(MINI_LIMITS.minExpandedH, Math.min(MINI_LIMITS.maxH, Math.round(Number(size.height) || MINI_H_EXPANDED)));
    resizeMini(height, width);
    if (size.done) { miniStore.set('width', width); if (size.expanded) miniStore.set('expandedHeight', height); }
  });

  // Store lyrics text and sync state
  let currentLyricsSync = { text: '', isManual: false };

  // ▼ 変更：「音楽を再生しているウィンドウ」（playerWindow）はミニプレイヤーの有無に関係なく決める。
  //   他のウィンドウには再生中の曲の状態を送り、サイドバーのプレイヤーに表示・操作できるようにする
  //   （以前は再生元ではないウィンドウのプレイヤーが「未選択」のままで、固定が効いていないように見えた）
  //   乗り換えのルール：
  //   ・ユーザーがタブを選んで固定した（claim） … そのウィンドウに乗り換える
  //   ・再生元が無い / 再生元が消えた … 音楽のあるウィンドウに乗り換える
  //   ・再生元が固定されていない時に、別のウィンドウで再生が「始まった」 … そちらに乗り換える
  const wasPlaying = new WeakMap();
  let lastRemoteAt = 0;
  ipcMain.on('sync-to-mini', (event, data) => {
    const from = BrowserWindow.fromWebContents(event.sender);
    if (!from) return;
    // localPlaying … そのウィンドウ自身のタブ（またはローカル音楽）が鳴っているか
    // remote       … そのウィンドウは今、別ウィンドウの曲を映しているだけ（その表示内容は転送しない）
    const startedPlaying = data.localPlaying && !wasPlaying.get(from);
    wasPlaying.set(from, !!data.localPlaying);
    const current = playerWindow && !playerWindow.isDestroyed() ? playerWindow : null;
    if (from !== current) {
      const take = data.hasMedia && (data.claim || !current || (!playerLocked && startedPlaying));
      if (!take) return;
      setPlayerWindow(from);
      if (data.remote) return; // 次の送信から、そのウィンドウ自身の曲の状態が届く
    } else if (!data.hasMedia) {
      // 再生元のウィンドウから音楽が無くなった → 再生元なし（他のウィンドウの表示は自然に消える）
      setPlayerWindow(null);
      return;
    } else if (data.remote) return;
    playerIsPlaying = !!data.isPlaying;
    playerLocked = !!data.source?.locked;

    // 他のウィンドウへ（1 秒に 7 回程度に間引く）
    const now = Date.now();
    if (now - lastRemoteAt > 140) {
      lastRemoteAt = now;
      const remote = {
        title: data.title, artist: data.artist, isPlaying: data.isPlaying, source: data.source,
        progress: data.progress, currentTime: data.currentTime, duration: data.duration,
        rawTime: data.rawTime, rawDuration: data.rawDuration,
      };
      windows.all().forEach(w => { if (w !== from) windows.sendTo(w, 'player-remote', remote); });
    }

    if (!miniPlayerWindow) return;
    if(data.lyricsText !== undefined) {
       currentLyricsSync.text = data.lyricsText;
       currentLyricsSync.isManual = data.isManual;
    }
    miniPlayerWindow.webContents.send('sync-from-main', { ...data, lyricsText: currentLyricsSync.text, isManualLyrics: currentLyricsSync.isManual });
  });
  ipcMain.on('control-from-mini', (event, command) => {
    windows.sendTo(playerWindow || windows.activeWindow(), 'control-to-main', command);
  });
}

module.exports = { init };
