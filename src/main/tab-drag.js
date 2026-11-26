// ==========================================
// ★ タブの切り離し・合体（Chrome と同じく、引き出した瞬間に別のウィンドウになる）
// ==========================================
// ・タブをタブバーから引き出した瞬間に新しいウィンドウを作り、離すまでマウスについて動かす
// ・タブが 1 枚だけのウィンドウは、タブをつかむとウィンドウごと動く
// ・ほかのウィンドウのタブバーに重ねると、動かしていたウィンドウは隠れ（1 枚だけのウィンドウは薄くなり）、
//   そのタブバーに「ここに入る」場所が開く。離すとそこに入る
// ・元のタブバーに戻すと、作ったウィンドウは隠れる（離すと取りやめ）
// ページはウィンドウをまたいで持ち運べないため、新しいウィンドウでは読み込み直しになる。
// 再生中の動画・音楽は、同じ位置から続きを再生する（resume）
const { BrowserWindow, ipcMain } = require('electron');
const windows = require('./windows');

const STRIP_ZONE = 56;   // ウィンドウの上から何 px までを「タブバーの上」とみなすか
let drag = null;   // { mode: 'new' | 'window', from, win, off, url, isPrivate, resume, title, hoverWin }
let createWindow = null;

function setHover(win, payload) {
  if (!drag) return;
  if (drag.hoverWin && drag.hoverWin !== win) windows.sendTo(drag.hoverWin, 'tab-drag-hover', { leave: true });
  drag.hoverWin = win || null;
  if (win) windows.sendTo(win, 'tab-drag-hover', payload);
}

// (x, y) の下にある、ほかのブラウザウィンドウのタブバー
function stripWindowAt(x, y, except) {
  return windows.all().find(w => !except.includes(w) && !w.isDestroyed() && !w.isMinimized() && w.isVisible() && (() => {
    const b = w.getContentBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + STRIP_ZONE;
  })()) || null;
}

const alive = (w) => w && !w.isDestroyed();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

function init(opts = {}) {
  createWindow = opts.createWindow;

  // 引き出した（または 1 枚だけのウィンドウのタブをつかんだ）
  ipcMain.handle('tab-detach', (event, p = {}) => {
    finish({});
    const from = BrowserWindow.fromWebContents(event.sender);
    if (!from || typeof p.url !== 'string' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const base = { from, url: p.url, isPrivate: !!p.isPrivate, title: String(p.title || '').slice(0, 200), resume: Number(p.resume) > 0 ? Number(p.resume) : 0, hoverWin: null };
    if (p.single) {
      // ウィンドウごと動かす。最大化中は元の大きさに戻し、つかんだタブがマウスの下に来るようにする
      if (from.isFullScreen()) return false;
      if (from.isMaximized()) from.unmaximize();
      const b = from.getBounds();
      const off = { x: clamp(p.x - b.x, 8, Math.max(60, Math.min(b.width - 160, 260))), y: clamp(p.y - b.y, 4, 40) };
      drag = { ...base, mode: 'window', win: from, off };
      from.setPosition(Math.round(p.x - off.x), Math.round(p.y - off.y));
      return true;
    }
    if (typeof createWindow !== 'function') return false;
    const size = from.isMaximized() || from.isFullScreen() ? { width: 1280, height: 800 } : from.getBounds();
    // 新しいウィンドウの 1 枚目のタブ（左から 8px・上から 11px）の、つかんだ所がマウスの下に来るように置く
    const off = { x: 8 + clamp(p.grabX, 10, 180), y: 11 + clamp(p.grabY, 4, 30) };
    const query = { url: p.url };
    if (p.isPrivate) query.private = '1';
    if (base.resume) query.resume = String(base.resume);
    const win = createWindow(query, { x: Math.round(p.x - off.x), y: Math.round(p.y - off.y), width: size.width, height: size.height, show: false });
    win.showInactive();   // 元のウィンドウがマウスをつかんだままにするため、フォーカスは移さない
    drag = { ...base, mode: 'new', win, off };
    return true;
  });

  // 動かしている間（画面座標）。inside = 元のウィンドウのタブバーに戻っている
  ipcMain.on('tab-drag-move', (event, { x, y, inside } = {}) => {
    if (!drag || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { win, mode, from } = drag;
    if (!alive(win)) { drag = null; return; }
    const target = inside ? null : stripWindowAt(x, y, [win, from]);
    if (target) {
      const b = target.getContentBounds();
      setHover(target, { clientX: x - b.x, clientY: y - b.y, title: drag.title });
    } else setHover(null);
    if (mode === 'new') {
      if (inside || target) { if (win.isVisible()) win.hide(); return; }
      win.setPosition(Math.round(x - drag.off.x), Math.round(y - drag.off.y));
      if (!win.isVisible()) win.showInactive();
    } else {
      // 1 枚だけのウィンドウ：隠すとマウスのつかみが外れるので、重ねている間は薄くするだけ
      win.setOpacity(target ? 0.35 : 1);
      win.setPosition(Math.round(x - drag.off.x), Math.round(y - drag.off.y));
    }
  });

  // 離した
  ipcMain.handle('tab-drag-finish', (event, p = {}) => finish(p));
}

function finish({ inside } = {}) {
  if (!drag) return 'none';
  const d = drag; drag = null;
  const target = alive(d.hoverWin) ? d.hoverWin : null;
  if (target && !inside) {
    // 入る場所を開いていたウィンドウへ（開いた場所は tab-drop-in を受けた側が使う）
    windows.sendTo(target, 'tab-drop-in', { url: d.url, isPrivate: d.isPrivate, resume: d.resume });
    target.focus();
    if (d.mode === 'new') { if (alive(d.win)) d.win.close(); return 'moved'; }
    return 'merged';   // 1 枚だけのウィンドウ：元のウィンドウは自分で閉じる
  }
  if (d.hoverWin && alive(d.hoverWin)) windows.sendTo(d.hoverWin, 'tab-drag-hover', { leave: true });
  if (d.mode === 'new') {
    if (!alive(d.win)) return 'cancel';
    if (inside) { d.win.close(); return 'cancel'; }
    d.win.show(); d.win.focus();
    return 'new';
  }
  if (alive(d.win)) d.win.setOpacity(1);
  return 'window';
}

module.exports = { init };
