// ==========================================
// ★ ページ内検索（Ctrl+F）
// ==========================================
// Enter / F3 / Ctrl+G で次へ、Shift+Enter / Shift+F3 / Ctrl+Shift+G で前へ、Esc で閉じる。
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
let findTabId = null; // 検索中のタブ

function findWebview() {
    return findTabId ? webviews[findTabId] : null;
}

function openFind() {
    findTabId = activeTabId;
    findBar.classList.add('show');
    findInput.focus();
    findInput.select();
    if (findInput.value) runFind(true);
}

function closeFind() {
    if (!findBar.classList.contains('show')) return;
    findBar.classList.remove('show');
    try { findWebview()?.stopFindInPage('clearSelection'); } catch(e) {}
    findTabId = null;
    findCount.textContent = '';
}

// forward = 検索方向 / step = 同じ語で次の一致へ進む（false なら新しい検索を始める）
// ※ Electron の findInPage の findNext は「新しい検索を始めるか」なので step と逆になる
function runFind(forward = true, step = false) {
    const wv = findWebview();
    const text = findInput.value;
    if (!wv) return;
    if (!text) {
        try { wv.stopFindInPage('clearSelection'); } catch(e) {}
        findCount.textContent = '';
        findBar.classList.remove('no-match');
        return;
    }
    try { wv.findInPage(text, { forward, findNext: !step }); } catch(e) {}
}

function findStep(forward) {
    if (!findBar.classList.contains('show')) { openFind(); return; }
    runFind(forward, true);
}

// createWebviewForTab から各 webview の 'found-in-page' で呼ばれる
function onFoundInPage(tabId, result) {
    if (tabId !== findTabId || !result.finalUpdate) return;
    findCount.textContent = result.matches ? `${result.activeMatchOrdinal} / ${result.matches}` : '0 / 0';
    findBar.classList.toggle('no-match', !!findInput.value && result.matches === 0);
}

findInput.addEventListener('input', () => runFind(true, false));
findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runFind(!e.shiftKey, true); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
document.getElementById('find-prev').addEventListener('click', () => runFind(false, true));
document.getElementById('find-next').addEventListener('click', () => runFind(true, true));
document.getElementById('find-close').addEventListener('click', closeFind);
