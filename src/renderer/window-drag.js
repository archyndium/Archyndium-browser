// ==========================================
// ★ ウィンドウを掴んで動かす（画面側）
// ==========================================
// 本体（index.html）とミニプレイヤー（mini-player.html）の両方で使う。
// 掴める場所でマウスを押して少し動かしたら main（main/window-drag.js）に知らせ、
// 離すまでの間は main がマウスの位置に合わせてウィンドウを動かす。
// ※ 以前の CSS の -webkit-app-region: drag は、Windows で操作の後に掴めなくなることがあったため使わない

function setupWindowDrag({ handles, maximizeOnDoubleClick = false }) {
    // 掴める場所の中にあっても、ボタンや入力欄などは普通に操作できるようにする
    const INTERACTIVE = 'button, input, textarea, select, a, [contenteditable="true"], .no-drag, .win-btn, .icon-btn, .glass-pill, .tab-card, .chip, .ts-tab, .ts-group, .ts-new';
    const THRESHOLD = 3; // これだけ動かしたら「ドラッグ」とみなす（クリック・ダブルクリックと区別する）
    let pending = null;  // { screenX, screenY, clientX, clientY }
    let dragging = false;

    const isHandle = (target) => target instanceof Element && target.closest(handles) && !target.closest(INTERACTIVE);

    const end = (phase) => {
        if (dragging) window.electronAPI?.windowDrag?.(phase);
        dragging = false;
        pending = null;
    };

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.detail > 1 || !isHandle(e.target)) return;
        e.preventDefault(); // 文字の選択を始めない
        pending = { screenX: e.screenX, screenY: e.screenY, clientX: e.clientX, clientY: e.clientY };
    }, true);

    document.addEventListener('mousemove', (e) => {
        if (!pending) return;
        if (!(e.buttons & 1)) { end('end'); return; } // ボタンを離したのに mouseup が届かなかった
        if (!dragging && Math.hypot(e.screenX - pending.screenX, e.screenY - pending.screenY) >= THRESHOLD) {
            dragging = true;
            // 掴んだ位置（ウィンドウの左上からの距離）を渡し、その点がマウスの下に来るように動かしてもらう
            window.electronAPI?.windowDrag?.('start', pending.clientX, pending.clientY);
        }
    }, true);

    document.addEventListener('mouseup', (e) => { if (e.button === 0 && pending) end('end'); }, true);
    window.addEventListener('blur', () => { if (pending) end('cancel'); });

    if (maximizeOnDoubleClick) {
        document.addEventListener('dblclick', (e) => {
            if (isHandle(e.target)) window.electronAPI?.windowControl('maximize');
        }, true);
    }
}
