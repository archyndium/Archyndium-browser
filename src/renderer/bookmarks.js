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

bookmarksList.addEventListener('contextmenu', async (e) => {
    const card = e.target.closest('.bookmark-item');
    if (!card || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const url = card.getAttribute('data-url');
    const choice = await window.electronAPI.popupMenu([
        { id: 'open', label: '開く' },
        { id: 'new-tab', label: '新しいタブで開く' },
        { id: 'private', label: 'シークレットタブで開く' },
        { type: 'separator' },
        { id: 'edit', label: '名前と URL を編集…' },
        { id: 'copy', label: 'URL をコピー' },
        { type: 'separator' },
        { id: 'delete', label: '削除' },
    ]);
    if (choice === 'open') navigateActiveTab(url);
    else if (choice === 'new-tab') openNewTab(url);
    else if (choice === 'private') openNewTab(url, { isPrivate: true });
    else if (choice === 'edit') editBookmark(card);
    else if (choice === 'copy') navigator.clipboard.writeText(url).catch(() => {});
    else if (choice === 'delete') { card.remove(); refreshBookmarkStar(); }
});

const btnBookmark = document.getElementById('btn-bookmark');
let pendingBookmarkFavicon = '';

btnBookmark.addEventListener('click', async (e) => {
  e.stopPropagation(); 
  if(!activeTabId) return;
  
  // ▼ 修正：URL バーの文字ではなく、表示中のタブの URL・タイトル・アイコンを使う
  //   （以前は音楽の再生中だと、ページ名ではなく曲名がブックマーク名になっていた）
  const tabCard = getTabCard(activeTabId);
  const currentUrl = tabCard?.getAttribute('data-url') || urlInput.value;
  const currentTitle = tabCard?.querySelector('.tab-title')?.textContent || currentUrl;
  pendingBookmarkFavicon = tabCard?.querySelector('.favicon img')?.getAttribute('src') || '';
  
  const isCurrentlyBookmarked = btnBookmark.classList.contains('active-star');
  
  btnBookmark.style.transform = 'scale(1.2)'; 
  setTimeout(() => btnBookmark.style.transform = 'scale(1)', 200);
  
  if (!isCurrentlyBookmarked) {
    document.getElementById('bm-overlay').classList.add('show');
    document.getElementById('bookmark-popup').classList.add('show');
    document.getElementById('bm-input-name').value = currentTitle;
    document.getElementById('bm-btn-remove').textContent = 'Cancel';
    
    const folderListEl = document.getElementById('bm-folder-list');
    folderListEl.innerHTML = '';
    document.querySelectorAll('#bookmarks-list .bm-folder').forEach((folder, idx) => {
        const folderName = folder.querySelector('.group-title').textContent;
        const folderId = folder.querySelector('.bm-list').id;
        
        const item = document.createElement('div');
        item.className = 'bm-folder-item' + (idx === 0 ? ' selected' : '');
        item.setAttribute('data-target-id', folderId);
        item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${escapeHtml(folderName)}`;
        
        item.onclick = () => {
            document.querySelectorAll('.bm-folder-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
        };
        folderListEl.appendChild(item);
    });
  } else {
    btnBookmark.classList.remove('active-star');
    const itemToRemove = document.querySelector(`.bookmark-item[data-url="${CSS.escape(currentUrl)}"]`); 
    if(itemToRemove) itemToRemove.remove();
  }
});

function closeBmPopup() {
    document.getElementById('bm-overlay').classList.remove('show');
    document.getElementById('bookmark-popup').classList.remove('show');
}
document.getElementById('bm-overlay').addEventListener('click', closeBmPopup);
document.getElementById('bm-btn-remove').addEventListener('click', closeBmPopup);

document.getElementById('bm-btn-done').addEventListener('click', () => {
    const tabCard = getTabCard(activeTabId);
    const currentUrl = tabCard?.getAttribute('data-url') || urlInput.value;
    const name = document.getElementById('bm-input-name').value || currentUrl;
    const selected = document.querySelector('.bm-folder-item.selected');
    
    if (selected) {
        const targetFolder = document.getElementById(selected.getAttribute('data-target-id'));
        if (targetFolder && !document.querySelector(`.bookmark-item[data-url="${CSS.escape(currentUrl)}"]`)) {
            targetFolder.appendChild(createBookmarkCard({ url: currentUrl, title: name, favicon: pendingBookmarkFavicon }));
            document.getElementById('btn-bookmark').classList.add('active-star');
        }
    }
    closeBmPopup();
});
