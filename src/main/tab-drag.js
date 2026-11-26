// ==========================================
// ★ タブを引き出している間の見た目（Chrome のような「外れた」感じ）
// ==========================================
// ・タブをタブバーから引き出すと、タブとページの小さな画像がマウスについてくる（ゴースト）
// ・別のブラウザウィンドウの上に来ると、ゴーストは消えて、そのウィンドウのタブバーに「ここに入る」場所が開く
// ・離すと tab-tear-off（main.js）がそのウィンドウへ移す / 新しいウィンドウを作る
const { BrowserWindow, ipcMain, webContents } = require('electron');
const windows = require('./windows');

const GHOST_W = 300, GHOST_H = 214, OFFSET_X = 60, OFFSET_Y = 18;
let drag = null;   // { from, ghost, hoverWin, title }

const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssColor = (s, d) => /^[#a-z0-9(),.%\s-]{1,60}$/i.test(String(s || '')) ? s : d;

function ghostHtml({ title, bg, fg, accent }) {
  bg = cssColor(bg, '#1c1c21'); fg = cssColor(fg, '#ececf0'); accent = cssColor(accent, '#AAB7B7');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
  html,body{margin:0;background:transparent;overflow:hidden;font:12.5px "Segoe UI","Yu Gothic UI",system-ui,sans-serif}
  .g{position:absolute;inset:6px;border-radius:12px;overflow:hidden;background:${bg};color:${fg};box-shadow:0 10px 24px rgba(0,0,0,.38);
     display:flex;flex-direction:column;animation:in .16s cubic-bezier(.2,.8,.2,1)}
  @keyframes in{from{transform:scale(.9);opacity:0}}
  .t{height:30px;flex:none;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:2px solid ${accent};white-space:nowrap}
  .t span{overflow:hidden;text-overflow:ellipsis}
  .p{flex:1;background:rgba(127,127,127,.12) center/cover no-repeat}
  </style></head><body><div class="g"><div class="t"><span id="title">${esc(title)}</span></div><div class="p" id="shot"></div></div></body></html>`;
}

function destroyGhost(fade) {
  const g = drag?.ghost; if (!g || g.isDestroyed()) return;
  if (!fade) { g.destroy(); return; }
  let o = 1;
  const t = setInterval(() => { o -= 0.2; if (g.isDestroyed()) return clearInterval(t); if (o <= 0) { clearInterval(t); g.destroy(); } else g.setOpacity(o); }, 16);
}

function setHover(win, payload) {
  if (!drag) return;
  if (drag.hoverWin && drag.hoverWin !== win) windows.sendTo(drag.hoverWin, 'tab-drag-hover', { leave: true });
  drag.hoverWin = win || null;
  if (win) windows.sendTo(win, 'tab-drag-hover', payload);
}

function windowAt(x, y, except) {
  return windows.all().find(w => w !== except && !w.isMinimized() && w.isVisible() && (() => {
    const b = w.getBounds(); return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  })()) || null;
}

function init() {
  ipcMain.on('tab-drag-start', (event, { title, webContentsId, bg, fg, accent } = {}) => {
    end(false);
    const from = BrowserWindow.fromWebContents(event.sender);
    const ghost = new BrowserWindow({
      width: GHOST_W, height: GHOST_H, show: false, frame: false, transparent: true, resizable: false, movable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: true },
    });
    ghost.setIgnoreMouseEvents(true);
    ghost.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(ghostHtml({ title, bg, fg, accent })));
    drag = { from, ghost, hoverWin: null, title: String(title || '').slice(0, 200), shown: false };
    // ページの小さな画像（取れなければタイトルだけ）
    const wc = Number.isInteger(webContentsId) ? webContents.fromId(webContentsId) : null;
    wc?.capturePage?.().then(img => {
      if (!drag || drag.ghost !== ghost || ghost.isDestroyed() || img.isEmpty()) return;
      const url = img.resize({ width: GHOST_W * 2 }).toDataURL();
      ghost.webContents.executeJavaScript(`document.getElementById('shot').style.backgroundImage = 'url(' + ${JSON.stringify(url)} + ')'`).catch(() => {});
    }).catch(() => {});
  });

  // 引き出し中のマウスの位置（画面座標）。inside = 元のウィンドウのタブバーに戻っている
  ipcMain.on('tab-drag-move', (event, { x, y, inside } = {}) => {
    if (!drag || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { ghost, from } = drag;
    const target = inside ? null : windowAt(x, y, from);
    if (target) {
      const b = target.getContentBounds();
      setHover(target, { clientX: x - b.x, clientY: y - b.y, title: drag.title });
    } else setHover(null);
    if (ghost.isDestroyed()) return;
    if (inside || target) { if (ghost.isVisible()) ghost.hide(); return; }
    ghost.setBounds({ x: Math.round(x - OFFSET_X), y: Math.round(y - OFFSET_Y), width: GHOST_W, height: GHOST_H });
    if (!ghost.isVisible()) ghost.showInactive();
  });

  ipcMain.on('tab-drag-end', () => end(true));
}

// 離した（または取りやめた）。ゴーストを消し、入る場所を開いていたウィンドウの表示を戻す
function end(fade) {
  if (!drag) return;
  setHover(null);
  destroyGhost(fade);
  drag = null;
}

// tab-tear-off で「このウィンドウへ移す」時に、開いていた場所を使えるよう、いま重ねているウィンドウを返す
const hoveredWindow = () => drag?.hoverWin || null;

module.exports = { init, end, hoveredWindow };
