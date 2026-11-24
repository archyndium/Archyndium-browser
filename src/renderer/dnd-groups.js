// --- ドラッグ＆ドロップ機能 ---
let draggedElement = null; let dragType = null; 

// ---------- ゴミ箱 ----------
const TRASH_CONFIRM_KEY = 'archyndium_trash_confirm';
function trashConfirmEnabled() {
  try { return localStorage.getItem(TRASH_CONFIRM_KEY) !== 'off'; } catch(e) { return true; }
}
function setTrashConfirmEnabled(on) {
  localStorage.setItem(TRASH_CONFIRM_KEY, on ? 'on' : 'off');
}

// 捨てる物の説明（確認ダイアログ用）
function describeTrashItem(el, type) {
  const name = (sel) => escapeHtml(el.querySelector(sel)?.textContent || '');
  if (type === 'tab') return { title: 'タブを閉じますか？', message: `<b>${name('.tab-title')}</b> を閉じます。<br>Ctrl+Shift+T で元に戻せます。`, label: '閉じる' };
  if (type === 'group' && el.classList.contains('bm-folder')) {
    const n = el.querySelectorAll('.bookmark-item').length;
    return { title: 'ブックマークフォルダを削除しますか？', message: `<b>${name('.group-title')}</b> と、中の <b>${n} 件</b>のブックマークを削除します。`, label: '削除する' };
  }
  if (type === 'group') {
    const n = el.querySelectorAll('.tab-card[data-tab-id]').length;
    return { title: 'グループを削除しますか？', message: `<b>${name('.group-title')}</b> と、中の <b>${n} 個</b>のタブを閉じます。`, label: '削除する' };
  }
  if (type === 'workspace') return { title: 'アプリを削除しますか？', message: `Work / Focus から <b>${name('.ws-name')}</b> を削除します。<br>登録したサイトは開いているタブには影響しません。`, label: '削除する' };
  if (type === 'bookmark') return { title: 'ブックマークを削除しますか？', message: `<b>${name('.tab-title')}</b> を削除します。`, label: '削除する' };
  return { title: '削除しますか？', message: '', label: '削除する' };
}

async function trashDropped(el, type) {
  if (!el) return;
  if (trashConfirmEnabled()) {
    const d = describeTrashItem(el, type);
    const { ok, dontAsk } = await showConfirm({ title: d.title, message: d.message, confirmLabel: d.label, danger: true, dontAskLabel: '今後は確認しない（設定から戻せます）' });
    if (!ok) return;
    if (dontAsk) setTrashConfirmEnabled(false);
  }
  // ▼ 修正：closeTab() に一本化（Ctrl+Shift+T で復元可能 & アクティブタブを捨てても隣のタブへ移る）
  if (type === 'tab') {
    closeTab(el.getAttribute('data-tab-id'));
  } else if (type === 'group') {
    // ▼ 修正：以前は BrowserView 用の IPC を呼んでいたため、グループ内の webview が裏で残り続けていた
    el.querySelectorAll('.tab-card[data-tab-id]').forEach(tab => closeTab(tab.getAttribute('data-tab-id')));
  } else if (type === 'workspace') {
    // ▼ 追加：アプリアイコンをゴミ箱へ捨てた時の処理
    const wsId = el.getAttribute('data-ws-id');
    workspaces = workspaces.filter(w => w.id !== wsId);
    saveWorkspaces(); renderWorkspaces();
  }
  el.remove();
  if (type === 'bookmark' || type === 'group') refreshBookmarkStar();
}

// ▼ 追加：タブをウィンドウの外へドラッグして離したら、別ウィンドウにする（設定で OFF にできる）
//   別の ARCHYNDIUM ウィンドウの上で離した時は、そのウィンドウのタブとして移す
const TEAROFF_KEY = 'archyndium_tab_tearoff';
function tabTearOffEnabled() {
  try { return localStorage.getItem(TEAROFF_KEY) !== 'off'; } catch(e) { return true; }
}
function setTabTearOffEnabled(on) {
  localStorage.setItem(TEAROFF_KEY, on ? 'on' : 'off');
}
let lastDragScreen = null; // ドラッグ中の最後のマウス位置（離した瞬間の座標が 0 になる環境があるため）

function isOutsideWindow(x, y) {
  return x < window.screenX || y < window.screenY || x > window.screenX + window.outerWidth || y > window.screenY + window.outerHeight;
}

async function tearOffTab(card, screenX, screenY) {
  const tabId = card.getAttribute('data-tab-id');
  // このウィンドウの最後の 1 枚なら何もしない（ウィンドウを空にしないため）
  if (getTabCards().length <= 1) return;
  const result = await window.electronAPI?.tearOffTab({ url: card.getAttribute('data-url'), isPrivate: isPrivateTab(tabId), screenX, screenY });
  if (result) closeTab(tabId);
}

function setupDraggable(element, type) {
  element.setAttribute('draggable', 'true');
  element.addEventListener('dragstart', function(e) {
    if (e.target.hasAttribute('contenteditable')) { e.preventDefault(); return; }
    e.stopPropagation(); draggedElement = this; dragType = type;
    lastDragScreen = null;
    setTimeout(() => this.classList.add('dragging'), 0);
  });
  element.addEventListener('drag', function(e) {
    if (e.screenX || e.screenY) lastDragScreen = { x: e.screenX, y: e.screenY };
  });
  element.addEventListener('dragend', function(e) {
    e.stopPropagation(); this.classList.remove('dragging'); draggedElement = null; dragType = null;
    document.querySelectorAll('.drag-hover').forEach(el => el.classList.remove('drag-hover'));
    if (type === 'tab' && tabTearOffEnabled() && e.dataTransfer.dropEffect === 'none') {
      const pos = (e.screenX || e.screenY) ? { x: e.screenX, y: e.screenY } : lastDragScreen;
      if (pos && isOutsideWindow(pos.x, pos.y)) tearOffTab(this, pos.x, pos.y);
    }
  });
}

function initDropZone(zone) {
  // ▼ 修正：以前は dragover・drop などの処理が二重に登録されていて、タブを Work / Focus の空いている所に
  //   落とすと同じアプリが 2 つできていた。1 つにまとめ、受け取れる組み合わせを canAccept で判定する
  const canAccept = (el) => {
    if (el.id === 'btn-trash') return true;
    const isWs = el.id === 'workspace-grid' || el.classList.contains('ws-app');
    // ▼ 追加：グループ（ブックマークのフォルダも）を Work / Focus へ。タブのグループはタブ一覧の中でも並べ替えられる
    if (dragType === 'group') return isWs || (el.id === 'tabs-container' && !draggedElement.classList.contains('bm-folder'));
    if (dragType === 'tab') return isWs || el.id === 'tabs-container' || (el.classList.contains('group-list') && !el.classList.contains('bm-list'));
    if (dragType === 'bookmark') return el.classList.contains('bm-list') || el.id === 'bookmarks-list';
    return false;
  };
  zone.addEventListener('dragover', function(e) {
    e.preventDefault(); e.stopPropagation();
    if (draggedElement && canAccept(this)) this.classList.add('drag-hover');
  });
  zone.addEventListener('dragleave', function(e) { e.stopPropagation(); this.classList.remove('drag-hover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); e.stopPropagation(); this.classList.remove('drag-hover');
    if (!draggedElement || !canAccept(this)) return;

    if (this.id === 'btn-trash') {
      // 捨てる前に確認する（設定で OFF にできる）。await の間に drag 状態が消えるので先に控える
      trashDropped(draggedElement, dragType);
      return;
    }
    // Work / Focus へのドロップ（アイコン・タイトルも一緒に覚える。workspaces.js）
    if (this.id === 'workspace-grid' || this.classList.contains('ws-app')) {
      const wsId = this.getAttribute('data-ws-id');
      if (dragType === 'group') addGroupToWorkspace(draggedElement, wsId); // グループはまとめてフォルダに
      else addTabToWorkspace(draggedElement, wsId);
      return;
    }
    if (dragType === 'group') {
      const afterElement = getDragAfterElement(this, e.clientY, ':scope > .tab-card:not(.dragging), :scope > .tab-group:not(.dragging)');
      if (afterElement == null) this.appendChild(draggedElement); else this.insertBefore(draggedElement, afterElement);
    } else if (dragType === 'tab') {
      const afterElement = getDragAfterElement(this, e.clientY, '.tab-card:not(.dragging)');
      if (afterElement == null) this.appendChild(draggedElement); else this.insertBefore(draggedElement, afterElement);
      // 固定タブを一覧へドラッグしたら固定を外す
      if (draggedElement.classList.contains('pinned')) { draggedElement.classList.remove('pinned'); draggedElement.removeAttribute('title'); document.getElementById('pinned-tabs').classList.toggle('has-tabs', !!document.getElementById('pinned-tabs').children.length); }
    } else if (dragType === 'bookmark') {
      const afterElement = getDragAfterElement(this, e.clientY, '.tab-card:not(.dragging)');
      if (afterElement == null) this.appendChild(draggedElement); else this.insertBefore(draggedElement, afterElement);
    }
  });
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(selector)];
  const afterObj = draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child }; else return closest;
  }, { offset: Number.NEGATIVE_INFINITY });
  return afterObj ? afterObj.element : null;
}

const GROUP_COLORS = ['#AAB7B7', '#25C2A0', '#F24E1E', '#E5A93B', '#6E3482', '#3498db'];
document.getElementById('command-center').addEventListener('click', async function(e) {
  const header = e.target.closest('.group-header');
  const editBtn = e.target.closest('.edit-group-btn');
  const addBtn = e.target.closest('.add-tab-btn');
  const indicator = e.target.closest('.group-indicator');
  
  if (addBtn) {
    e.preventDefault(); e.stopPropagation();
    const groupList = addBtn.closest('.tab-group').querySelector('.group-list');
    const newTab = await createNewTabElement(getHomeUrl()); 
    groupList.appendChild(newTab);
    if(groupList.classList.contains('collapsed')) { groupList.classList.remove('collapsed'); addBtn.closest('.group-header').querySelector('.chevron').classList.remove('collapsed'); }
    newTab.click(); return;
  }
  if (editBtn) {
    e.preventDefault(); e.stopPropagation();
    const titleSpan = editBtn.closest('.group-header').querySelector('.group-title');
    titleSpan.contentEditable = "true"; titleSpan.focus();
    const range = document.createRange(); range.selectNodeContents(titleSpan);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const saveEdit = (ev) => {
      if (ev.type === 'keydown' && ev.key !== 'Enter') return;
      ev.preventDefault(); titleSpan.contentEditable = "false";
      if(titleSpan.textContent.trim() === '') titleSpan.textContent = 'Unnamed Group';
      titleSpan.removeEventListener('blur', saveEdit); titleSpan.removeEventListener('keydown', saveEdit);
    };
    titleSpan.addEventListener('blur', saveEdit); titleSpan.addEventListener('keydown', saveEdit); return;
  }
  if (indicator) {
    e.preventDefault(); e.stopPropagation();
    let idx = parseInt(indicator.getAttribute('data-color-idx') || '0'); idx = (idx + 1) % GROUP_COLORS.length;
    indicator.style.backgroundColor = GROUP_COLORS[idx]; indicator.style.color = GROUP_COLORS[idx];
    indicator.setAttribute('data-color-idx', idx); return;
  }
  if (header) {
    const list = header.nextElementSibling; const chevron = header.querySelector('.chevron');
    if(list && list.classList.contains('group-list')) { list.classList.toggle('collapsed'); chevron.classList.toggle('collapsed'); }
  }
});

// ▼ 変更：グループ作成を共通化（+ Group ボタン・初期グループ・セッション復元で使う）
function createGroupElement(title = 'New Group', colorIdx = Math.floor(Math.random() * GROUP_COLORS.length), { collapsed = false } = {}) {
  const color = GROUP_COLORS[colorIdx] || GROUP_COLORS[0];
  const newGroup = document.createElement('div'); newGroup.className = 'tab-group';
  newGroup.innerHTML = `
    <div class="group-header">
      <svg class="chevron${collapsed ? ' collapsed' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      <div class="group-indicator" style="background: ${color}; color: ${color};" data-color-idx="${colorIdx}"></div>
      <span class="group-title"></span>
      <div class="group-actions"><div class="group-action-btn add-tab-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div><div class="group-action-btn edit-group-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></div></div>
    </div><div class="group-list${collapsed ? ' collapsed' : ''}"></div>`;
  newGroup.querySelector('.group-title').textContent = title;
  initDropZone(newGroup.querySelector('.group-list')); setupDraggable(newGroup, 'group');
  return newGroup;
}

document.getElementById('btn-new-group').addEventListener('click', () => {
  document.getElementById('tabs-container').appendChild(createGroupElement());
});

document.getElementById('btn-new-bm-folder').addEventListener('click', () => {
  const container = document.getElementById('bookmarks-list');
  const newFolder = document.createElement('div'); newFolder.className = 'tab-group bm-folder';
  const folderId = 'bm-folder-' + Date.now(); // ▼ 追加：フォルダに一意のIDを付与
  newFolder.innerHTML = `
    <div class="group-header">
      <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      <span class="group-title">New Folder</span>
      <div class="group-actions"><div class="group-action-btn edit-group-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></div></div>
    </div><div class="group-list bm-list" id="${folderId}"></div>`; // ▼ 変更：IDをセット
  container.appendChild(newFolder); initDropZone(newFolder.querySelector('.bm-list')); setupDraggable(newFolder, 'group');
});

document.getElementById('btn-new-tab').addEventListener('click', () => openNewTab());
document.getElementById('btn-new-private').addEventListener('click', () => openNewTab(getHomeUrl(), { isPrivate: true }));
