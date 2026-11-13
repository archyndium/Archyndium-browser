// ==========================================
// ★ ウィンドウを掴んで動かす（本体・ミニプレイヤー共通）
// ==========================================
// 以前は CSS の -webkit-app-region: drag（OS に「ここを掴めば動かせる」と伝える仕組み）を使っていた。
// Windows の枠なし・透明ウィンドウでは、メニューやポップアップを出したり、大きさを変えたりした後に
// この「掴める範囲」の情報が古いまま残り、掴めていた所が掴めなくなることがあった（本体・ミニプレイヤーとも）。
// ここでは画面側でマウスを押したことを受け取り、マウスの位置に合わせてアプリ自身がウィンドウを動かす。
//   ・最大化中に掴んで動かすと、元の大きさに戻してマウスの下に付いてくる（Windows と同じ）
//   ・本体ウィンドウは、画面の上端で離すと最大化 / 左右の端で離すと画面の半分（スナップ）
//   ・ダブルクリックで最大化 / 元に戻す（画面側から 'maximize' を送る）
const { BrowserWindow, ipcMain, screen } = require('electron');
const windows = require('./windows');

const EDGE = 4;    // 画面の端とみなす幅（px）
let drag = null;   // { win, offsetX, offsetY, width, height, timer, snap }

function stopDrag(applySnap) {
  if (!drag) return;
  clearInterval(drag.timer);
  const { win, snap } = drag;
  drag = null;
  if (!applySnap || !snap || win.isDestroyed()) return;
  // 離した場所が画面の端なら、最大化 / 半分の大きさに合わせる
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  if (p.y <= wa.y + EDGE) win.maximize();
  else if (p.x <= wa.x + EDGE) win.setBounds({ x: wa.x, y: wa.y, width: Math.round(wa.width / 2), height: wa.height });
  else if (p.x >= wa.x + wa.width - EDGE) win.setBounds({ x: wa.x + Math.round(wa.width / 2), y: wa.y, width: wa.width - Math.round(wa.width / 2), height: wa.height });
}

function startDrag(win, clientX, clientY) {
  stopDrag(false);
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const p = screen.getCursorScreenPoint();
  let b = win.getBounds();
  let offsetX = Math.round(clientX), offsetY = Math.round(clientY);
  if (win.isMaximized() || win.__snapped) {
    // 最大化中（または端に寄せた状態）から動かす：元の大きさに戻し、掴んだ位置の割合を保つ
    const ratio = b.width > 0 ? offsetX / b.width : 0.5;
    if (win.isMaximized()) win.unmaximize();
    const restore = win.__restoreBounds || { width: Math.min(1280, b.width), height: Math.min(800, b.height) };
    offsetX = Math.round(restore.width * ratio);
    b = { x: p.x - offsetX, y: p.y - offsetY, width: restore.width, height: restore.height };
    win.setBounds(b);
  }
  win.__snapped = false;
  // 大きさは掴んだ時のまま固定する（解像度の違うモニターをまたぐ時に大きさが変わらないように）
  const width = b.width, height = b.height;
  const snap = windows.all().includes(win); // 端へのスナップは本体ウィンドウだけ（ミニプレイヤーはしない）
  let last = null;
  const timer = setInterval(() => {
    if (win.isDestroyed()) { stopDrag(false); return; }
    const c = screen.getCursorScreenPoint();
    if (last && last.x === c.x && last.y === c.y) return;
    last = c;
    win.setBounds({ x: c.x - offsetX, y: c.y - offsetY, width, height });
  }, 8);
  drag = { win, timer, snap };
}

function init() {
  ipcMain.on('window-drag', (event, { phase, x, y } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (phase === 'start') startDrag(win, x, y);
    else if (phase === 'end') stopDrag(true);
    else if (phase === 'cancel') stopDrag(false);
  });
}

// 端に寄せる前の大きさを覚えておく（端から離して動かした時に戻すため）
function track(win) {
  const remember = () => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen() || drag?.win === win) return;
    const b = win.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const halfSnapped = b.y === wa.y && b.height === wa.height && (b.x === wa.x || b.x + b.width === wa.x + wa.width) && Math.abs(b.width - wa.width / 2) <= 2;
    win.__snapped = halfSnapped;
    if (!halfSnapped) win.__restoreBounds = { width: b.width, height: b.height };
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.once('ready-to-show', remember);
  setTimeout(remember, 500);
}

module.exports = { init, track };
