// ==========================================
// ★ メモ（サイドバーの Notes パネル）
// ==========================================
// ・ちょっとしたメモや URL の控えをサクッと書き残す。入力した瞬間に自動保存（全ウィンドウで共有）
// ・「＋」で新しいメモ、鎖ボタンで表示中のページのタイトルと URL を差し込む
// ・本文中の URL は下にリンクとして並び、クリックで新しいタブで開く
// ・ページの文字を選んで右クリック →「選択したテキストをメモに追加」でも追記できる
// ・Ctrl+Shift+E で開く。コマンドパレットからも作成・追加できる
const NOTES_KEY = 'archyndium_notes';
const notesPanelList = document.getElementById('notes-list');
const notesEditor = document.getElementById('notes-editor');
const notesTextarea = document.getElementById('notes-textarea');
const notesSearch = document.getElementById('notes-search');
let notes = [];          // { id, text, updated, created }
let editingNoteId = null;

function loadNotes() {
    try { notes = JSON.parse(localStorage.getItem(NOTES_KEY)) || []; } catch(e) { notes = []; }
    if (editingNoteId && !notes.some(n => n.id === editingNoteId)) closeNoteEditor();
    else if (editingNoteId && document.activeElement !== notesTextarea) notesTextarea.value = notes.find(n => n.id === editingNoteId).text;
    renderNotesList();
}

function saveNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch(e) {}
}

function noteTitle(n) {
    const first = (n.text || '').split('\n').find(l => l.trim()) || '';
    return first.trim().slice(0, 60) || '無題のメモ';
}

function notePreview(n) {
    const lines = (n.text || '').split('\n').filter(l => l.trim());
    return (lines[1] || '').trim().slice(0, 80);
}

function relativeTime(t) {
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'たった今';
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function extractUrls(text) {
    return [...new Set((text || '').match(/https?:\/\/[^\s<>"'）)」]+/g) || [])].slice(0, 20);
}

function renderNotesList() {
    const q = (notesSearch.value || '').trim().toLowerCase();
    const items = [...notes].sort((a, b) => b.updated - a.updated).filter(n => !q || n.text.toLowerCase().includes(q));
    notesPanelList.innerHTML = items.length ? items.map(n => `
        <div class="note-card" data-note-id="${n.id}">
          <div class="note-title">${escapeHtml(noteTitle(n))}</div>
          ${notePreview(n) ? `<div class="note-preview">${escapeHtml(notePreview(n))}</div>` : ''}
          <div class="note-meta">${relativeTime(n.updated)}${extractUrls(n.text).length ? ` · リンク ${extractUrls(n.text).length}` : ''}</div>
        </div>`).join('')
        : `<div class="dl-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4"></path></svg>${q ? '一致するメモはありません' : '「＋」でメモを作成できます'}</div>`;
}

function renderNoteLinks() {
    const n = notes.find(x => x.id === editingNoteId);
    const urls = n ? extractUrls(n.text) : [];
    document.getElementById('notes-links').innerHTML = urls.map(u => `
        <div class="note-link" data-note-url="${escapeHtml(u)}" title="${escapeHtml(u)}">${siteIconHtml(u)}<span>${escapeHtml(u.replace(/^https?:\/\/(www\.)?/, ''))}</span></div>`).join('');
}

function openNoteEditor(id) {
    editingNoteId = id;
    const n = notes.find(x => x.id === id);
    notesTextarea.value = n ? n.text : '';
    document.getElementById('panel-notes').classList.add('editing');
    renderNoteLinks();
    setTimeout(() => { notesTextarea.focus(); notesTextarea.setSelectionRange(notesTextarea.value.length, notesTextarea.value.length); }, 30);
}

function closeNoteEditor() {
    // 空のまま閉じたメモは残さない
    const n = notes.find(x => x.id === editingNoteId);
    if (n && !n.text.trim()) { notes = notes.filter(x => x !== n); saveNotes(); }
    editingNoteId = null;
    document.getElementById('panel-notes').classList.remove('editing');
    renderNotesList();
}

function createNote(text = '') {
    const n = { id: 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, created: Date.now(), updated: Date.now() };
    notes.push(n);
    saveNotes();
    return n;
}

function openNotesPanel() {
    openPanel('panel-notes');
}

function newNote(text = '') {
    openNotesPanel();
    const n = createNote(text);
    renderNotesList();
    openNoteEditor(n.id);
}

// 表示中のページの「タイトル + URL」
function currentPageRef() {
    const card = activeTabId && getTabCard(activeTabId);
    if (!card) return '';
    const url = card.getAttribute('data-url') || '';
    return `${card.querySelector('.tab-title')?.textContent || url}\n${url}`;
}

function insertIntoEditor(text) {
    const ta = notesTextarea;
    const start = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, start), after = ta.value.slice(ta.selectionEnd ?? start);
    const pre = before && !before.endsWith('\n') ? '\n' : '';
    ta.value = before + pre + text + '\n' + after;
    ta.dispatchEvent(new Event('input'));
}

// 右クリックやコマンドから：開いているメモ（無ければ一番最近のメモ、それも無ければ新規）に追記
function appendToNote(text) {
    let n = notes.find(x => x.id === editingNoteId) || [...notes].sort((a, b) => b.updated - a.updated)[0];
    if (!n) n = createNote('クイックメモ');
    n.text = (n.text.trimEnd() + '\n\n' + text).trimStart();
    n.updated = Date.now();
    saveNotes();
    openNotesPanel();
    openNoteEditor(n.id);
}

let notesSaveTimer = null;
notesTextarea.addEventListener('input', () => {
    const n = notes.find(x => x.id === editingNoteId);
    if (!n) return;
    n.text = notesTextarea.value;
    n.updated = Date.now();
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => { saveNotes(); renderNoteLinks(); }, 300);
});

notesPanelList.addEventListener('click', (e) => {
    const card = e.target.closest('[data-note-id]');
    if (card) openNoteEditor(card.getAttribute('data-note-id'));
});
notesPanelList.addEventListener('contextmenu', async (e) => {
    const card = e.target.closest('[data-note-id]');
    if (!card || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const id = card.getAttribute('data-note-id');
    const choice = await window.electronAPI.popupMenu([{ id: 'copy', label: '内容をコピー' }, { type: 'separator' }, { id: 'delete', label: '削除' }]);
    const n = notes.find(x => x.id === id);
    if (choice === 'copy' && n) navigator.clipboard.writeText(n.text).catch(() => {});
    if (choice === 'delete') deleteNote(id);
});
document.getElementById('notes-links').addEventListener('click', (e) => {
    const link = e.target.closest('[data-note-url]');
    if (link) openNewTab(link.getAttribute('data-note-url'));
});

async function deleteNote(id) {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    const { ok } = await showConfirm({ title: 'メモを削除しますか？', message: `<b>${escapeHtml(noteTitle(n))}</b> を削除します。`, confirmLabel: '削除する', danger: true });
    if (!ok) return;
    notes = notes.filter(x => x.id !== id);
    saveNotes();
    if (editingNoteId === id) { editingNoteId = null; document.getElementById('panel-notes').classList.remove('editing'); }
    renderNotesList();
}

document.getElementById('notes-new').addEventListener('click', () => newNote());
document.getElementById('notes-back').addEventListener('click', closeNoteEditor);
document.getElementById('notes-add-page').addEventListener('click', () => insertIntoEditor(currentPageRef()));
document.getElementById('notes-delete').addEventListener('click', () => deleteNote(editingNoteId));
notesSearch.addEventListener('input', renderNotesList);
notesTextarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeNoteEditor(); } });

// ページの右クリック「選択したテキストをメモに追加」
window.electronAPI?.onAddToNote?.(({ text, url, title }) => {
    appendToNote(`${text}\n— ${title || url}\n${url}`);
});

loadNotes();
