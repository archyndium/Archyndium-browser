// ==========================================
// ★ タブの複数選択とまとめて閉じる
// ==========================================
//   ・Ctrl（Mac は Cmd）+クリックで 1 枚ずつ選択、Shift+クリックで範囲選択
//   ・タブ一覧下の「選択」ボタンで選択モード（クリックだけで選べる）
//   ・選択中は下に操作バー：閉じる / グループにまとめる / すべて選択 / 解除。Delete キーでも閉じられる
//   ・まとめて閉じた後は「元に戻す」で全部開き直せる（右クリックの「他のタブを閉じる」なども同じ）

const selectedTabIds = new Set();
let tabSelectAnchor = null;  // Shift+クリックの起点
let tabSelectMode = false;   // 選択モード（修飾キーなしのクリックで選べる）
const tabsPanel = document.getElementById('panel-tabs');

const tabSelectBar = document.createElement('div');
tabSelectBar.className = 'tab-select-bar';
tabSelectBar.innerHTML = `
    <span class="tsb-count"></span>
    <button class="tsb-btn" data-tsb="all" title="すべてのタブを選択">すべて</button>
    <button class="tsb-btn" data-tsb="group" title="選択したタブを新しいグループにまとめる">グループ</button>
    <button class="tsb-btn danger" data-tsb="close" title="選択したタブを閉じる (Delete)">閉じる</button>
    <button class="tsb-x" data-tsb="cancel" title="選択を解除 (Esc)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
tabsPanel.querySelector('.action-buttons-row').before(tabSelectBar);

// 「選択」ボタン（選択モードの切り替え）
const btnSelectTabs = document.createElement('div');
btnSelectTabs.className = 'action-btn-sm select-btn';
btnSelectTabs.id = 'btn-select-tabs';
btnSelectTabs.title = 'タブを選んでまとめて閉じる（Ctrl+クリック / Shift+クリックでも選べます）';
btnSelectTabs.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"></rect><polyline points="8 12 11 15 16 9"></polyline></svg>';
tabsPanel.querySelector('.action-buttons-row').appendChild(btnSelectTabs);
btnSelectTabs.addEventListener('click', () => setTabSelectMode(!tabSelectMode));

function setTabSelectMode(on) {
    tabSelectMode = on;
    btnSelectTabs.classList.toggle('active', on);
    tabsPanel.classList.toggle('tab-select-mode', on);
    if (!on) clearTabSelection();
    else renderTabSelection();
}

function renderTabSelection() {
    // 閉じられたタブは選択から外す
    [...selectedTabIds].forEach(id => { if (!getTabCard(id)) selectedTabIds.delete(id); });
    getTabCards().forEach(c => c.classList.toggle('selected', selectedTabIds.has(c.getAttribute('data-tab-id'))));
    const n = selectedTabIds.size;
    tabSelectBar.classList.toggle('show', n > 0 || tabSelectMode);
    tabSelectBar.querySelector('.tsb-count').textContent = n ? `${n} 個選択中` : 'タブを選んでください';
    tabSelectBar.querySelectorAll('[data-tsb="close"], [data-tsb="group"]').forEach(b => { b.disabled = n === 0; });
}

function clearTabSelection() {
    selectedTabIds.clear();
    tabSelectAnchor = null;
    renderTabSelection();
}

function toggleTabSelected(tabId) {
    selectedTabIds.has(tabId) ? selectedTabIds.delete(tabId) : selectedTabIds.add(tabId);
    tabSelectAnchor = tabId;
    renderTabSelection();
}

function selectTabRange(toId) {
    const ids = getTabCards().map(c => c.getAttribute('data-tab-id'));
    const from = ids.indexOf(tabSelectAnchor || activeTabId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) { toggleTabSelected(toId); return; }
    ids.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(id => selectedTabIds.add(id));
    renderTabSelection();
}

// タブのクリック：修飾キー付き / 選択モード中は「開く」代わりに選択する（panels.js のクリックより先に処理）
tabsPanel.addEventListener('click', (e) => {
    const card = e.target.closest('.tab-card[data-tab-id]');
    if (!card || e.target.closest('.tab-audio, .tab-close')) return;
    const multi = e.ctrlKey || e.metaKey, range = e.shiftKey;
    if (!multi && !range && !tabSelectMode) {
        if (selectedTabIds.size) clearTabSelection(); // 普通のクリックで選択は解除
        return;
    }
    e.stopPropagation();
    e.preventDefault();
    const tabId = card.getAttribute('data-tab-id');
    // 最初の Ctrl+クリックでは、今開いているタブも選択に含める（Chrome と同じ）
    if (multi && !tabSelectMode && selectedTabIds.size === 0 && activeTabId && activeTabId !== tabId) selectedTabIds.add(activeTabId);
    if (range) selectTabRange(tabId);
    else toggleTabSelected(tabId);
}, true);

tabSelectBar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tsb]')?.getAttribute('data-tsb');
    if (!act) return;
    e.stopPropagation();
    if (act === 'all') { getTabCards().forEach(c => selectedTabIds.add(c.getAttribute('data-tab-id'))); renderTabSelection(); }
    else if (act === 'group') groupSelectedTabs();
    else if (act === 'close') closeSelectedTabs();
    else if (act === 'cancel') setTabSelectMode(false);
});

document.addEventListener('keydown', (e) => {
    if (!selectedTabIds.size && !tabSelectMode) return;
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedTabIds.size) { e.preventDefault(); closeSelectedTabs(); } }
    else if (e.key === 'Escape') setTabSelectMode(false);
});

function closeSelectedTabs() {
    const ids = [...selectedTabIds];
    setTabSelectMode(false);
    closeTabsBulk(ids);
}

// 複数のタブをまとめて閉じる。閉じた後に「元に戻す」を出す
function closeTabsBulk(ids) {
    ids = ids.filter(id => getTabCard(id));
    if (!ids.length) return;
    if (ids.length === 1) { closeTab(ids[0]); return; }
    const all = getTabCards().map(c => c.getAttribute('data-tab-id'));
    const closing = new Set(ids);
    const restore = ids.map(id => ({ url: getTabCard(id).getAttribute('data-url'), isPrivate: isPrivateTab(id) })).filter(t => t.url && !t.url.startsWith('chrome-error'));
    // 表示中のタブも閉じる時は、先に残るタブ（近い順）へ切り替えておく（閉じる途中のタブを次々に開かないため）
    if (closing.has(activeTabId)) {
        const idx = all.indexOf(activeTabId);
        const survivor = [...all.slice(idx + 1), ...all.slice(0, idx).reverse()].find(id => !closing.has(id));
        if (survivor) getTabCard(survivor)?.click();
    }
    const stackBefore = closedTabStack.length;
    ids.forEach(id => closeTab(id));
    renderTabSelection();
    scheduleSaveSession?.();
    showToast(`${ids.length} 個のタブを閉じました`, {
        actionLabel: '元に戻す', timeout: 6000,
        action: async () => {
            // 1 枚ずつの「閉じたタブを開く」(Ctrl+Shift+T) に積んだ分は取り消す
            closedTabStack.splice(stackBefore);
            for (const t of restore) await openNewTab(t.url, { background: true, isPrivate: t.isPrivate });
        },
    });
}

// 選択したタブを新しいグループにまとめる（最初に選んだタブの位置に作る）
function groupSelectedTabs() {
    const cards = getTabCards().filter(c => selectedTabIds.has(c.getAttribute('data-tab-id')) && c.closest('#tabs-container'));
    if (!cards.length) { showToast('固定したタブはグループに入れられません'); return; }
    const group = createGroupElement(`グループ (${cards.length})`);
    const first = cards[0];
    const anchor = first.closest('.tab-group') || first;
    anchor.before(group);
    const list = group.querySelector('.group-list');
    cards.forEach(c => list.appendChild(c));
    setTabSelectMode(false);
    scheduleSaveSession?.();
    showToast('グループにまとめました。名前は鉛筆ボタンで変更できます');
}

// タブが閉じられたり増えたりしたら選択表示を整える
new MutationObserver(() => { if (selectedTabIds.size) renderTabSelection(); })
    .observe(document.getElementById('tabs-container'), { childList: true, subtree: true });
