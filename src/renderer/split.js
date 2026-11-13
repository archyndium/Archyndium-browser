// ==========================================
// ★ 分割表示（1 つの画面に 2 つのタブを左右 / 上下に並べる）
// ==========================================
// ・URL 欄左の分割ボタン、タブの右クリック、Ctrl+\ 、コマンドパレットから使う
// ・間の仕切りをドラッグして比率を変更。仕切りのボタンで「入れ替え」「縦横切り替え」「解除」
// ・クリックした側のページが操作対象（URL 欄・戻る/進む・検索などはそちらに効く）。操作中の側は縁が光る
// ・ペアのどちらかのタブを開くと分割表示に戻る。片方を閉じると解除。ウィンドウの保存・復元にも対応

let split = null; // { a: tabId, b: tabId, dir: 'h' | 'v', ratio: 0〜1 }
const splitContainer = document.getElementById('webview-container');
const splitDivider = document.getElementById('split-divider');

function isSplitVisible() {
    return !!split && (activeTabId === split.a || activeTabId === split.b);
}

function isInSplit(tabId) {
    return !!split && (split.a === tabId || split.b === tabId);
}

function applySplitLayout() {
    document.querySelectorAll('#panel-tabs .tab-card.in-split').forEach(c => c.classList.remove('in-split', 'split-a', 'split-b'));
    Object.values(webviews).forEach(wv => { wv.classList.remove('split-pane', 'pane-active'); wv.style.flex = ''; wv.style.order = ''; });

    if (!isSplitVisible()) {
        splitContainer.classList.remove('split', 'split-h', 'split-v');
        splitDivider.style.display = 'none';
        document.getElementById('btn-split')?.classList.remove('active');
        if (split) markSplitCards();
        return;
    }
    // 休止中の相方は起こしてから並べる
    [split.a, split.b].forEach(id => { if (!webviews[id] && typeof wakeTab === 'function') wakeTab(id); });
    splitContainer.classList.add('split');
    splitContainer.classList.toggle('split-h', split.dir === 'h');
    splitContainer.classList.toggle('split-v', split.dir === 'v');
    const pct = Math.round(split.ratio * 1000) / 10;
    [[split.a, 1, pct], [split.b, 3, 100 - pct]].forEach(([id, order, size]) => {
        const wv = webviews[id];
        if (!wv) return;
        wv.style.display = 'flex';
        wv.style.order = order;
        wv.style.flex = `0 1 calc(${size}% - 5px)`;
        wv.classList.add('split-pane');
        wv.classList.toggle('pane-active', id === activeTabId);
    });
    splitDivider.style.display = '';
    splitDivider.style.order = 2;
    document.getElementById('btn-split')?.classList.add('active');
    markSplitCards();
}

function markSplitCards() {
    getTabCard(split.a)?.classList.add('in-split', 'split-a');
    getTabCard(split.b)?.classList.add('in-split', 'split-b');
}

function startSplit(a, b, dir = 'h') {
    if (!a || !b || a === b) return;
    split = { a, b, dir, ratio: 0.5 };
    if (activeTabId !== a && activeTabId !== b) activateTab(a);
    else applySplitLayout();
    scheduleSaveSession?.();
}

async function splitWithNewTab(dir = 'h') {
    const base = activeTabId;
    const card = await openNewTab(getHomeUrl(), { background: true, isPrivate: isPrivateTab(base) });
    startSplit(base, card.getAttribute('data-tab-id'), dir);
    focusUrlBar?.();
}

function unsplit() {
    if (!split) return;
    split = null;
    applySplitLayout();
    // 解除後は今のタブだけを表示する
    Object.entries(webviews).forEach(([id, wv]) => { wv.style.display = id === activeTabId ? 'flex' : 'none'; });
    scheduleSaveSession?.();
}

function swapSplit() {
    if (!split) return;
    [split.a, split.b] = [split.b, split.a];
    applySplitLayout();
}

function toggleSplitDir() {
    if (!split) return;
    split.dir = split.dir === 'h' ? 'v' : 'h';
    applySplitLayout();
}

// 分割中のもう片方のページがクリックされた
function onSplitPaneFocus(tabId) {
    if (!isSplitVisible() || !isInSplit(tabId) || tabId === activeTabId) return;
    activateTab(tabId);
}

function onSplitTabClosed(tabId) {
    if (isInSplit(tabId)) {
        split = null;
        splitContainer.classList.remove('split', 'split-h', 'split-v');
        splitDivider.style.display = 'none';
        document.querySelectorAll('.tab-card.in-split').forEach(c => c.classList.remove('in-split', 'split-a', 'split-b'));
        Object.values(webviews).forEach(wv => { wv.classList.remove('split-pane', 'pane-active'); wv.style.flex = ''; wv.style.order = ''; });
    }
}

// URL 欄左の分割ボタン：分割中なら解除、そうでなければ「何と並べるか」を選ぶ
async function openSplitMenu() {
    if (isSplitVisible()) { unsplit(); return; }
    const others = getTabCards().filter(c => c.getAttribute('data-tab-id') !== activeTabId).slice(0, 12);
    const items = [
        { id: 'new-h', label: '新しいタブと左右に並べる' },
        { id: 'new-v', label: '新しいタブと上下に並べる' },
    ];
    if (others.length) {
        items.push({ type: 'separator' });
        others.forEach(c => items.push({ id: 'tab:' + c.getAttribute('data-tab-id'), label: `「${(c.querySelector('.tab-title')?.textContent || 'Tab').slice(0, 30)}」と左右に並べる` }));
    }
    const choice = await window.electronAPI.popupMenu(items);
    if (!choice) return;
    if (choice === 'new-h' || choice === 'new-v') splitWithNewTab(choice === 'new-h' ? 'h' : 'v');
    else if (choice.startsWith('tab:')) startSplit(activeTabId, choice.slice(4), 'h');
}

// ---------- 仕切りのドラッグ ----------
let splitDragging = false;
splitDivider.addEventListener('mousedown', (e) => {
    if (e.target.closest('.split-ctl')) return;
    e.preventDefault();
    splitDragging = true;
    // ドラッグ中は webview の上でもマウスを追えるよう、全体を覆う透明な板を出す
    document.getElementById('split-drag-shield').classList.add('show', split.dir === 'h' ? 'col' : 'row');
});
document.addEventListener('mousemove', (e) => {
    if (!splitDragging || !split) return;
    const r = splitContainer.getBoundingClientRect();
    const pos = split.dir === 'h' ? (e.clientX - r.left - 16) / (r.width - 32) : (e.clientY - r.top) / (r.height - 16);
    split.ratio = Math.min(0.85, Math.max(0.15, pos));
    applySplitLayout();
});
document.addEventListener('mouseup', () => {
    if (!splitDragging) return;
    splitDragging = false;
    document.getElementById('split-drag-shield').classList.remove('show', 'col', 'row');
    scheduleSaveSession?.();
});
splitDivider.addEventListener('dblclick', (e) => { if (!e.target.closest('.split-ctl') && split) { split.ratio = 0.5; applySplitLayout(); } });
splitDivider.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-split]');
    if (!btn) return;
    const act = btn.getAttribute('data-split');
    if (act === 'swap') swapSplit();
    else if (act === 'dir') toggleSplitDir();
    else if (act === 'close') unsplit();
});
document.getElementById('btn-split').addEventListener('click', (e) => { e.stopPropagation(); openSplitMenu(); });

// ---------- 保存・復元（session.js から呼ばれる） ----------
function serializeSplit() {
    if (!split) return null;
    const ids = getTabCards().map(c => c.getAttribute('data-tab-id'));
    const a = ids.indexOf(split.a), b = ids.indexOf(split.b);
    if (a < 0 || b < 0 || isPrivateTab(split.a) || isPrivateTab(split.b)) return null;
    return { a, b, dir: split.dir, ratio: split.ratio };
}

function restoreSplit(saved) {
    const ids = getTabCards().map(c => c.getAttribute('data-tab-id'));
    if (!saved || !ids[saved.a] || !ids[saved.b]) return;
    split = { a: ids[saved.a], b: ids[saved.b], dir: saved.dir || 'h', ratio: saved.ratio || 0.5 };
    applySplitLayout();
}
