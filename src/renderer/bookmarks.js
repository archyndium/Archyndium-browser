// ==========================================
// ★ ブックマーク永続化＆ポップアップシステム
// ==========================================
// ▼ 追加：アイコン表示（'site' = サイトのアイコン / 'star' = 星マーク）。設定画面で切り替え
const BM_ICON_KEY = 'archyndium_bm_icon';
function bookmarkIconMode() {
    try { return localStorage.getItem(BM_ICON_KEY) || 'site'; } catch(e) { return 'site'; }
}
function setBookmarkIconMode(mode) {
    localStorage.setItem(BM_ICON_KEY, mode);
    document.querySelectorAll('#bookmarks-list .bookmark-item').forEach(updateBookmarkIcon);
}

const BM_STAR_ICON = '<div class="favicon bm-star">★</div>';

function updateBookmarkIcon(card) {
    const icon = bookmarkIconMode() === 'site'
        ? siteIconHtml(card.getAttribute('data-url'), card.getAttribute('data-favicon') || '')
        : BM_STAR_ICON;
    card.querySelector('.favicon').outerHTML = icon;
}

// ブックマーク 1 件のカード。クリック時は data-url を読むので、編集後の URL にもちゃんと移動する
function createBookmarkCard({ url, title, favicon = '' }) {
    const card = document.createElement('div');
    card.className = 'tab-card bookmark-item';
    card.setAttribute('data-url', url);
    if (favicon) card.setAttribute('data-favicon', favicon);
    card.innerHTML = `<div class="favicon"></div>
        <div class="bm-text"><span class="tab-title"></span><span class="bm-url"></span></div>
        <span class="bm-edit-btn" title="名前と URL を編集"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>`;
    card.querySelector('.tab-title').textContent = title || url;
    card.querySelector('.bm-url').textContent = url;
    updateBookmarkIcon(card);
    setupDraggable(card, 'bookmark');
    return card;
}

function saveBookmarks() {
    const data = [];
    document.querySelectorAll('#bookmarks-list .bm-folder').forEach(folder => {
        const folderName = folder.querySelector('.group-title').textContent;
        const items = [];
        folder.querySelectorAll('.bookmark-item').forEach(item => {
            items.push({
                url: item.getAttribute('data-url'),
                title: item.querySelector('.tab-title').textContent,
                favicon: item.getAttribute('data-favicon') || '',
            });
        });
        data.push({ name: folderName, items: items });
    });
    localStorage.setItem('archyndium_bookmarks', JSON.stringify(data));
}

function loadBookmarks() {
    let stored = null;
    try { stored = localStorage.getItem('archyndium_bookmarks'); } catch(e) {}
    const container = document.getElementById('bookmarks-list');
    
    if (window.bmObserver) window.bmObserver.disconnect();
    container.innerHTML = ''; 

    let data = [{ name: 'Saved Pages', items: [] }];
    if (stored) {
        try { data = JSON.parse(stored); } catch(e) {}
    }

    data.forEach((folder, fIdx) => {
        const folderEl = document.createElement('div');
        folderEl.className = 'tab-group bm-folder';
        const folderId = 'bm-folder-' + Date.now() + '-' + fIdx;
        folderEl.innerHTML = `
            <div class="group-header">
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              <span class="group-title">${escapeHtml(folder.name)}</span>
              <div class="group-actions"><div class="group-action-btn edit-group-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></div></div>
            </div><div class="group-list bm-list" id="${folderId}"></div>`;
        
        const listEl = folderEl.querySelector('.bm-list');
        folder.items.forEach(item => listEl.appendChild(createBookmarkCard(item)));
        container.appendChild(folderEl);
        initDropZone(listEl);
        setupDraggable(folderEl, 'group');
    });

    window.bmObserver = new MutationObserver(() => saveBookmarks());
    window.bmObserver.observe(container, { childList: true, subtree: true, characterData: true });
}

// ---------- 編集・右クリックメニュー ----------
async function editBookmark(card) {
    const values = await showForm({
        title: 'ブックマークを編集',
        fields: [
            { key: 'title', label: '名前', value: card.querySelector('.tab-title').textContent },
            { key: 'url', label: 'URL', value: card.getAttribute('data-url') },
        ],
    });
    if (!values) return;
    const url = resolveOmniboxInput(values.url) || card.getAttribute('data-url');
    if (url !== card.getAttribute('data-url')) {
        card.setAttribute('data-url', url);
        card.removeAttribute('data-favicon'); // 別サイトになったらアイコンも取り直す
    }
    card.querySelector('.tab-title').textContent = values.title || url;
    card.querySelector('.bm-url').textContent = url;
    updateBookmarkIcon(card);
    saveBookmarks();
    refreshBookmarkStar();
}

function refreshBookmarkStar() {
    const card = activeTabId && getTabCard(activeTabId);
    const url = card ? card.getAttribute('data-url') : urlInput.value;
    btnBookmark.classList.toggle('active-star', !!document.querySelector(`.bookmark-item[data-url="${CSS.escape(url || '')}"]`));
}

const bookmarksList = document.getElementById('bookmarks-list');
// ▼ 追加：ブックマークを開く場所（'new' = 新しいタブ（既定）/ 'current' = 表示中のタブ）。設定画面で切り替え
const BM_OPEN_KEY = 'archyndium_bm_open';
function bookmarkOpenMode() {
    try { return localStorage.getItem(BM_OPEN_KEY) || 'new'; } catch(e) { return 'new'; }
}
function setBookmarkOpenMode(mode) {
    localStorage.setItem(BM_OPEN_KEY, mode);
}

bookmarksList.addEventListener('click', (e) => {
    const edit = e.target.closest('.bm-edit-btn');
    const card = e.target.closest('.bookmark-item');
    if (!edit && !card) return;
    e.stopPropagation(); // カードのクリック（ページ移動）より先に処理する
    if (edit) { editBookmark(edit.closest('.bookmark-item')); return; }
    const url = card.getAttribute('data-url');
    // Ctrl / Cmd を押しながらのクリックは、設定と逆の開き方にする
    const newTab = (bookmarkOpenMode() === 'new') !== (e.ctrlKey || e.metaKey);
    if (newTab) openNewTab(url); else navigateActiveTab(url);
    card.style.transform = 'scale(0.97)'; setTimeout(() => card.style.transform = '', 100);
}, true);
// 中クリックは常に裏の新しいタブで開く
bookmarksList.addEventListener('auxclick', (e) => {
    const card = e.target.closest('.bookmark-item');
    if (card && e.button === 1) { e.preventDefault(); openNewTab(card.getAttribute('data-url'), { background: true }); }
});

// ▼ 追加：新しいフォルダを作る（+ Folder ボタンと同じ）
function createBookmarkFolder(name = 'New Folder') {
    document.getElementById('btn-new-bm-folder').click();
    const folders = document.querySelectorAll('#bookmarks-list .bm-folder');
    const folder = folders[folders.length - 1];
    if (folder) {
        folder.querySelector('.group-title').textContent = name;
        // 同じ瞬間に続けて作ると ID が重なることがあるので、必ず別の ID にする
        folder.querySelector('.bm-list').id = 'bm-folder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    }
    return folder;
}
async function renameBookmarkFolder(folder) {
    const values = await showForm({ title: 'フォルダの名前を変更', fields: [{ key: 'name', label: '名前', value: folder.querySelector('.group-title').textContent }] });
    if (values && values.name.trim()) { folder.querySelector('.group-title').textContent = values.name.trim(); saveBookmarks(); }
}
// 表示中のページを、指定したフォルダ（省略時は最初のフォルダ）に追加する
function addActivePageToFolder(folder) {
    const card = activeTabId && getTabCard(activeTabId);
    const url = card?.getAttribute('data-url') || '';
    if (!/^(https?|file):/i.test(url)) { showToast('このページはブックマークできません'); return; }
    if (findBookmarkCard(url)) { showToast('このページはブックマーク済みです'); return; }
    const list = (folder || document.querySelector('#bookmarks-list .bm-folder'))?.querySelector('.bm-list');
    if (!list) return;
    list.appendChild(createBookmarkCard({ url, title: card.querySelector('.tab-title')?.textContent || url, favicon: card.querySelector('.favicon img')?.getAttribute('src') || '' }));
    saveBookmarks(); refreshBookmarkStar();
    showToast('ブックマークに追加しました');
}

// ▼ 追加：フォルダの見出し・何もない所の右クリック（ページの追加・フォルダの操作）
bookmarksList.addEventListener('contextmenu', async (e) => {
    if (e.target.closest('.bookmark-item') || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const folder = e.target.closest('.bm-folder');
    const pageUrl = (activeTabId && getTabCard(activeTabId)?.getAttribute('data-url')) || '';
    const canAdd = /^(https?|file):/i.test(pageUrl) && !findBookmarkCard(pageUrl);
    const items = folder ? [
        { id: 'add-here', label: '表示中のページをこのフォルダに追加', enabled: canAdd },
        { type: 'separator' },
        { id: 'rename', label: 'フォルダの名前を変更…' },
        { id: 'new-folder', label: '新しいフォルダ' },
        { type: 'separator' },
        { id: 'delete-folder', label: 'フォルダを削除', enabled: document.querySelectorAll('#bookmarks-list .bm-folder').length > 1 },
    ] : [
        { id: 'add', label: '表示中のページをブックマークに追加…', enabled: canAdd },
        { id: 'new-folder', label: '新しいフォルダ' },
    ];
    const choice = await window.electronAPI.popupMenu(items);
    if (choice === 'add-here') addActivePageToFolder(folder);
    else if (choice === 'add') openBookmarkPopupForTab(activeTabId);
    else if (choice === 'rename') renameBookmarkFolder(folder);
    else if (choice === 'new-folder') { const f = createBookmarkFolder(); if (f) renameBookmarkFolder(f); }
    else if (choice === 'delete-folder') {
        const n = folder.querySelectorAll('.bookmark-item').length;
        const { ok } = await showConfirm({ title: 'フォルダを削除', message: n ? `中のブックマーク ${n} 件も削除されます。` : '空のフォルダを削除します。', confirmLabel: '削除', danger: true });
        if (ok) { folder.remove(); saveBookmarks(); refreshBookmarkStar(); }
    }
});

bookmarksList.addEventListener('contextmenu', async (e) => {
    const card = e.target.closest('.bookmark-item');
    if (!card || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const url = card.getAttribute('data-url');
    // ▼ 変更：項目を増やした（裏で開く・分割表示・フォルダに移動・並べ替え・ブックマークの小窓で編集）
    const folders = [...document.querySelectorAll('#bookmarks-list .bm-folder')];
    const here = card.closest('.bm-folder');
    const choice = await window.electronAPI.popupMenu([
        { id: 'open', label: '開く' },
        { id: 'new-tab', label: '新しいタブで開く' },
        { id: 'bg-tab', label: '裏の新しいタブで開く' },
        { id: 'private', label: 'シークレットタブで開く' },
        { id: 'split', label: '表示中のタブと左右に並べて開く', enabled: !!activeTabId },
        { type: 'separator' },
        { id: 'edit-popup', label: '名前とフォルダを編集…' },
        { id: 'edit', label: '名前と URL を編集…' },
        { label: 'フォルダに移動', enabled: folders.length > 1, submenu: folders.map((f, i) => ({ id: 'move:' + i, label: f.querySelector('.group-title').textContent, enabled: f !== here })) },
        { id: 'up', label: '上へ移動', enabled: !!card.previousElementSibling },
        { id: 'down', label: '下へ移動', enabled: !!card.nextElementSibling },
        { type: 'separator' },
        { id: 'copy', label: 'URL をコピー' },
        { id: 'copy-md', label: 'タイトルと URL をコピー' },
        { type: 'separator' },
        { id: 'delete', label: '削除' },
    ]);
    const title = card.querySelector('.tab-title').textContent;
    if (choice === 'open') navigateActiveTab(url);
    else if (choice === 'new-tab') openNewTab(url);
    else if (choice === 'bg-tab') openNewTab(url, { background: true });
    else if (choice === 'private') openNewTab(url, { isPrivate: true });
    else if (choice === 'split') { const base = activeTabId; const t = await openNewTab(url, { background: true }); if (t && typeof startSplit === 'function') startSplit(base, t.getAttribute('data-tab-id'), 'h'); }
    else if (choice === 'edit-popup') openBookmarkPopup({ url, title });
    else if (choice === 'edit') editBookmark(card);
    else if (choice && choice.startsWith('move:')) { folders[+choice.slice(5)]?.querySelector('.bm-list').appendChild(card); saveBookmarks(); }
    else if (choice === 'up') { card.previousElementSibling?.before(card); saveBookmarks(); }
    else if (choice === 'down') { card.nextElementSibling?.after(card); saveBookmarks(); }
    else if (choice === 'copy') navigator.clipboard.writeText(url).catch(() => {});
    else if (choice === 'copy-md') navigator.clipboard.writeText(`${title}\n${url}`).catch(() => {});
    else if (choice === 'delete') { card.remove(); refreshBookmarkStar(); showToast('ブックマークを削除しました'); }
});

const btnBookmark = document.getElementById('btn-bookmark');

// ▼ 変更：ブックマークの追加・編集の小窓を、表示中のタブ以外（右クリックしたタブ・リンク）にも使えるようにした。
//   すでにブックマークしてあるページなら「編集」になり、名前・フォルダの変更と削除ができる
//   （以前は ★ を押すと確認なしで削除されていた）
let pendingBookmark = null;   // { url, favicon, existing: 既存のカード | null }
const findBookmarkCard = (url) => document.querySelector(`#bookmarks-list .bookmark-item[data-url="${CSS.escape(url || '')}"]`);

function bmFolderChip(folder, selected) {
    const item = document.createElement('div');
    item.className = 'bm-folder-item' + (selected ? ' selected' : '');
    item.setAttribute('data-target-id', folder.querySelector('.bm-list').id);
    item.innerHTML = `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span></span>`;
    item.querySelector('span').textContent = folder.querySelector('.group-title').textContent;
    return item;
}
function renderBmFolderChips(selectedId) {
    const listEl = document.getElementById('bm-folder-list');
    listEl.innerHTML = '';
    const folders = [...document.querySelectorAll('#bookmarks-list .bm-folder')];
    folders.forEach((f, i) => listEl.appendChild(bmFolderChip(f, selectedId ? f.querySelector('.bm-list').id === selectedId : i === 0)));
    const add = document.createElement('div');
    add.className = 'bm-folder-item new';
    add.textContent = '＋ 新しいフォルダ';
    add.setAttribute('data-new-folder', '1');
    listEl.appendChild(add);
}
document.getElementById('bm-folder-list').addEventListener('click', async (e) => {
    const chip = e.target.closest('.bm-folder-item');
    if (!chip) return;
    if (chip.hasAttribute('data-new-folder')) {
        const values = await showForm({ title: '新しいフォルダ', fields: [{ key: 'name', label: '名前', value: '' }], confirmLabel: '作成' });
        if (!values || !values.name.trim()) return;
        const folder = createBookmarkFolder(values.name.trim());
        if (folder) renderBmFolderChips(folder.querySelector('.bm-list').id);
        return;
    }
    document.querySelectorAll('.bm-folder-item').forEach(el => el.classList.remove('selected'));
    chip.classList.add('selected');
});

// ★ ボタンが見えていればその下、無ければ画面の上の中央に出す
function positionBookmarkPopup() {
    const pop = document.getElementById('bookmark-popup');
    const r = btnBookmark.getBoundingClientRect();
    const w = pop.offsetWidth || 340;
    if (r.width && r.bottom > 0) {
        pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.right - w + 8))}px`;
        pop.style.top = `${r.bottom + 10}px`;
    } else {
        pop.style.left = `${Math.max(12, (innerWidth - w) / 2)}px`;
        pop.style.top = '72px';
    }
}

function openBookmarkPopup({ url, title = '', favicon = '' }) {
    if (!/^(https?|file):/i.test(url || '')) { showToast('このページはブックマークできません'); return; }
    const existing = findBookmarkCard(url);
    pendingBookmark = { url, favicon, existing };
    document.getElementById('bm-popup-title').textContent = existing ? 'ブックマークを編集' : 'ブックマークに追加';
    document.getElementById('bm-popup-url').textContent = url.replace(/^https?:\/\/(www\.)?/, '');
    document.getElementById('bm-popup-icon').innerHTML = siteIconHtml(url, favicon || existing?.getAttribute('data-favicon') || '');
    document.getElementById('bm-input-name').value = existing ? existing.querySelector('.tab-title').textContent : (title || url);
    document.getElementById('bm-btn-remove').style.display = existing ? '' : 'none';
    document.getElementById('bm-btn-done').textContent = existing ? '完了' : '保存';
    renderBmFolderChips(existing?.closest('.bm-list')?.id);
    document.getElementById('bm-overlay').classList.add('show');
    const pop = document.getElementById('bookmark-popup');
    pop.classList.add('show');
    positionBookmarkPopup();
    setTimeout(() => { const n = document.getElementById('bm-input-name'); n.focus(); n.select(); }, 50);
}
window.addEventListener('resize', () => { if (document.getElementById('bookmark-popup').classList.contains('show')) positionBookmarkPopup(); });

// タブ（またはタブのカード）からブックマークの小窓を開く
function openBookmarkPopupForTab(tabId) {
    const card = getTabCard(tabId);
    if (!card) return;
    openBookmarkPopup({
        url: card.getAttribute('data-url') || '',
        title: card.querySelector('.tab-title')?.textContent || '',
        favicon: card.querySelector('.favicon img')?.getAttribute('src') || '',
    });
}

btnBookmark.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeTabId) return;
    btnBookmark.style.transform = 'scale(1.2)';
    setTimeout(() => btnBookmark.style.transform = 'scale(1)', 200);
    openBookmarkPopupForTab(activeTabId);
});

function closeBmPopup() {
    document.getElementById('bm-overlay').classList.remove('show');
    document.getElementById('bookmark-popup').classList.remove('show');
    pendingBookmark = null;
}
document.getElementById('bm-overlay').addEventListener('click', closeBmPopup);
document.getElementById('bm-btn-cancel').addEventListener('click', closeBmPopup);
document.getElementById('bm-popup-close').addEventListener('click', closeBmPopup);
document.getElementById('bm-btn-remove').addEventListener('click', () => {
    if (pendingBookmark?.existing) { pendingBookmark.existing.remove(); showToast('ブックマークを削除しました'); }
    closeBmPopup();
    refreshBookmarkStar();
});
document.getElementById('bm-input-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('bm-btn-done').click();
    if (e.key === 'Escape') closeBmPopup();
});

document.getElementById('bm-btn-done').addEventListener('click', () => {
    if (!pendingBookmark) { closeBmPopup(); return; }
    const { url, favicon, existing } = pendingBookmark;
    const name = document.getElementById('bm-input-name').value.trim() || url;
    const selected = document.querySelector('.bm-folder-item.selected');
    const targetFolder = selected && document.getElementById(selected.getAttribute('data-target-id'));
    if (existing) {
        existing.querySelector('.tab-title').textContent = name;
        if (targetFolder && existing.closest('.bm-list') !== targetFolder) targetFolder.appendChild(existing);
    } else if (targetFolder && !findBookmarkCard(url)) {
        targetFolder.appendChild(createBookmarkCard({ url, title: name, favicon }));
        showToast(`「${name.length > 24 ? name.slice(0, 24) + '…' : name}」をブックマークしました`);
    }
    saveBookmarks();
    closeBmPopup();
    refreshBookmarkStar();
});

// ▼ 追加：ページの右クリックメニュー（main/context-menu.js）からのブックマーク
window.electronAPI?.onPageAction?.(({ action, webContentsId, url, title }) => {
    if (action !== 'bookmark-page' && action !== 'bookmark-link') return;
    const tabId = Object.keys(webviews).find(id => { try { return webviews[id].getWebContentsId() === webContentsId; } catch (e) { return false; } }) || activeTabId;
    if (action === 'bookmark-page') openBookmarkPopupForTab(tabId);
    else openBookmarkPopup({ url, title: title || url });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('bookmark-popup').classList.contains('show')) closeBmPopup(); });
