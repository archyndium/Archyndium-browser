// ==========================================
// ★ WORK / FOCUS ワークスペース・アプリアイコンシステム
// ==========================================
// ▼ 変更：iOS / Android のホーム画面のような見た目にした
//   ・サイトが 1 つ → そのサイトのアイコンのアプリ。クリックで開く
//   ・サイトが 2 つ以上 → 中のサイトのアイコンが並ぶフォルダ。クリックでフォルダが開き、
//     1 つずつ開く / すべて開く / 外す / 名前の変更ができる
// ws = { id, name, color, icon, urls: [...], icons: { url: ファビコン }, titles: { url: タイトル } }
const workspaceGrid = document.getElementById('workspace-grid');
const wsFolderOverlay = document.getElementById('ws-folder-overlay');
const wsFolder = document.getElementById('ws-folder');
let workspaces = [];
let openFolderId = null;

function saveWorkspaces() {
    localStorage.setItem('archyndium_workspaces', JSON.stringify(workspaces));
}

// 初期内容。urls の順番がフォルダの中の並び順。titles は表示名
function defaultWorkspaces() {
    const folder = (id, name, color, items) => ({
        id, name, color, icon: name[0], urls: items.map(i => i[0]), icons: {},
        titles: Object.fromEntries(items.map(i => [i[0], i[1]])),
    });
    return [
        folder('ws-google', 'Google', '#4285F4', [
            ['https://mail.google.com/', 'Gmail'],
            ['https://www.youtube.com/', 'YouTube'],
            ['https://drive.google.com/', 'Google ドライブ'],
            ['https://calendar.google.com/', 'Google カレンダー'],
            ['https://maps.google.com/', 'Google マップ'],
            ['https://photos.google.com/', 'Google フォト'],
        ]),
        folder('ws-microsoft', 'Microsoft', '#0078D4', [
            ['https://outlook.live.com/', 'Outlook'],
            ['https://onedrive.live.com/', 'OneDrive'],
            ['https://www.microsoft365.com/', 'Microsoft 365'],
            ['https://teams.microsoft.com/', 'Teams'],
            ['https://copilot.microsoft.com/', 'Copilot'],
        ]),
        folder('ws-social', 'Social', '#E1306C', [
            ['https://x.com/', 'X'],
            ['https://www.instagram.com/', 'Instagram'],
            ['https://www.tiktok.com/', 'TikTok'],
            ['https://www.facebook.com/', 'Facebook'],
            ['https://discord.com/app', 'Discord'],
        ]),
    ];
}

const WS_DEFAULTS_V2_KEY = 'archyndium_ws_defaults_v2';
// 初期フォルダ（Google・Microsoft・Social）のうち、まだ無いものを後ろに足す。足した数を返す
function addDefaultWorkspaceFolders({ quiet = false } = {}) {
    let added = 0;
    defaultWorkspaces().forEach(def => {
        const sameName = workspaces.find(w => (w.name || '').toLowerCase() === def.name.toLowerCase());
        // 以前の初期内容の Social（Twitter だけ）は、新しい Social に置き換える
        if (sameName && sameName.id === 'ws-social' && JSON.stringify(sameName.urls) === '["https://twitter.com"]') {
            Object.assign(sameName, def); added++; return;
        }
        if (workspaces.some(w => w.id === def.id) || sameName) return;
        workspaces.push(def); added++;
    });
    if (added) { saveWorkspaces(); renderWorkspaces(); }
    if (!quiet) showToast(added ? `初期フォルダを ${added} 個追加しました` : '初期フォルダはすべて入っています');
    return added;
}

function loadWorkspaces() {
    try {
        const stored = localStorage.getItem('archyndium_workspaces');
        if (stored) workspaces = JSON.parse(stored);
    } catch(e) {}

    // ▼ 変更：初回起動時の内容を「Google」「Microsoft」「Social」の 3 つのフォルダにした。
    //   以前の初期内容（Dev = GitHub / Social = Twitter）から何も変えていない人も、新しい内容に入れ替える
    const isOldDefault = Array.isArray(workspaces) && workspaces.length === 2
        && workspaces[0]?.id === 'ws-dev' && JSON.stringify(workspaces[0].urls) === '["https://github.com"]'
        && workspaces[1]?.id === 'ws-social' && JSON.stringify(workspaces[1].urls) === '["https://twitter.com"]';
    if (!workspaces || workspaces.length === 0 || isOldDefault) {
        workspaces = defaultWorkspaces();
        saveWorkspaces();
    }
    // ▼ 追加：以前から使っていて自分で並べ替え・追加していた人にも、新しい初期フォルダを 1 回だけ足す
    //   （今ある内容は消さない。以前の初期内容の「Social（Twitter だけ）」は新しい Social に置き換える）
    try {
        if (localStorage.getItem(WS_DEFAULTS_V2_KEY) !== 'done') {
            addDefaultWorkspaceFolders({ quiet: true });
            localStorage.setItem(WS_DEFAULTS_V2_KEY, 'done');
        }
    } catch (e) {}
    workspaces.forEach(ws => { ws.icons = ws.icons || {}; ws.titles = ws.titles || {}; });
    renderWorkspaces();
}

// タブを Work / Focus に追加する（新しいアプリを作る or 既存のアプリ・フォルダに入れる）
function addTabToWorkspace(tabCard, wsId = null) {
    const url = tabCard.getAttribute('data-url');
    const title = tabCard.querySelector('.tab-title')?.textContent || siteHostOf(url) || 'New App';
    const img = tabCard.querySelector('.favicon img');
    const icon = img && img.getAttribute('src') && img.style.display !== 'none' ? img.getAttribute('src') : '';
    let ws = wsId && workspaces.find(w => w.id === wsId);
    if (ws) {
        if (ws.urls.includes(url)) return;
        // アプリにサイトを重ねると、フォルダになる。名前はアプリ名のままにする
        ws.urls.push(url);
    } else {
        ws = {
            id: 'ws-' + Date.now(),
            name: title.substring(0, 12), // 長い名前はカット
            color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
            icon: title.charAt(0).toUpperCase(),
            urls: [url], icons: {}, titles: {},
        };
        workspaces.push(ws);
    }
    if (icon) ws.icons[url] = icon;
    ws.titles[url] = title;
    saveWorkspaces(); renderWorkspaces();
}

// ▼ 追加：タブのグループ（またはブックマークのフォルダ）を、まとめて Work / Focus のフォルダにする。
//   wsId を指定すると、そのアプリ・フォルダに追加する。グループ名がフォルダ名になる
function addGroupToWorkspace(groupEl, wsId = null) {
    const cards = [...groupEl.querySelectorAll('.tab-card[data-url]')].filter(c => /^https?:/i.test(c.getAttribute('data-url') || ''));
    if (!cards.length) { showToast('このグループには登録できるページがありません'); return; }
    const groupName = (groupEl.querySelector('.group-title')?.textContent || '').trim() || 'Group';
    let ws = wsId && workspaces.find(w => w.id === wsId);
    if (!ws) {
        ws = { id: 'ws-' + Date.now(), name: groupName.substring(0, 20), color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
            icon: groupName.charAt(0).toUpperCase(), urls: [], icons: {}, titles: {} };
        workspaces.push(ws);
    }
    let added = 0;
    cards.forEach(card => {
        const url = card.getAttribute('data-url');
        if (ws.urls.includes(url)) return;
        ws.urls.push(url);
        ws.titles[url] = card.querySelector('.tab-title')?.textContent || siteHostOf(url) || url;
        const img = card.querySelector('.favicon img');
        const icon = img && img.getAttribute('src') && img.style.display !== 'none' ? img.getAttribute('src') : card.getAttribute('data-favicon') || '';
        if (icon) ws.icons[url] = icon;
        added++;
    });
    saveWorkspaces(); renderWorkspaces();
    showToast(added ? `「${escapeHtml(ws.name)}」に ${added} 個のサイトを登録しました` : 'すべて登録済みです');
}

function wsTitleOf(ws, url) {
    return ws.titles?.[url] || siteHostOf(url) || url;
}

// フォルダの中身の小さなアイコン（最大 4 個、それ以上は 9 個まで 3×3）
function wsIconHtml(ws) {
    if (ws.urls.length <= 1) {
        const url = ws.urls[0] || '';
        return `<div class="ws-icon ws-single">${siteIconHtml(url, ws.icons?.[url], 'ws-app-img')}<div class="ws-badge" id="badge-${ws.id}"></div></div>`;
    }
    const grid = ws.urls.length > 4 ? 3 : 2;
    const shown = ws.urls.slice(0, grid * grid);
    return `<div class="ws-icon ws-folder-icon grid-${grid}">${shown.map(u => siteIconHtml(u, ws.icons?.[u], 'ws-mini')).join('')}<div class="ws-badge" id="badge-${ws.id}"></div></div>`;
}

function renderWorkspaces() {
    workspaceGrid.innerHTML = '';
    workspaces.forEach(ws => {
        const appEl = document.createElement('div');
        appEl.className = 'ws-app' + (ws.urls.length > 1 ? ' is-folder' : '');
        appEl.setAttribute('data-ws-id', ws.id);
        // マウスを乗せると中に登録されているサイトが見える
        appEl.title = ws.urls.map(u => wsTitleOf(ws, u)).join('\n');
        appEl.innerHTML = `${wsIconHtml(ws)}<div class="ws-name">${escapeHtml(ws.name)}</div>`;

        appEl.addEventListener('click', () => {
            // 開いた瞬間に通知バッジを消す
            document.getElementById(`badge-${ws.id}`)?.classList.remove('show');
            if (ws.urls.length > 1) openWorkspaceFolder(ws.id, appEl);
            else openWorkspaceUrls([ws.urls[0]]);
        });
        appEl.addEventListener('contextmenu', (e) => { e.preventDefault(); workspaceMenu(ws); });

        workspaceGrid.appendChild(appEl);
        initDropZone(appEl);            // 重ねて追加（D&D）するための設定
        setupDraggable(appEl, 'workspace'); // ゴミ箱へ捨てる（D&D）ための設定
    });
    if (openFolderId) renderWorkspaceFolder();
}

async function openWorkspaceUrls(urls) {
    for (const url of urls) {
        const newTab = await createNewTabElement(url);
        document.getElementById('tabs-container').appendChild(newTab);
        newTab.click();
    }
}

async function renameWorkspace(ws) {
    const v = await showForm({ title: '名前を変更', fields: [{ key: 'name', label: '名前', value: ws.name }] });
    if (!v || !v.name) return;
    ws.name = v.name.substring(0, 20);
    saveWorkspaces(); renderWorkspaces();
}

async function workspaceMenu(ws) {
    if (!window.electronAPI?.popupMenu) return;
    const choice = await window.electronAPI.popupMenu([
        { id: 'open', label: ws.urls.length > 1 ? `すべて開く（${ws.urls.length} 個）` : '開く' },
        { id: 'rename', label: '名前を変更…' },
        { type: 'separator' },
        { id: 'delete', label: '削除' },
    ]);
    if (choice === 'open') openWorkspaceUrls(ws.urls);
    else if (choice === 'rename') renameWorkspace(ws);
    else if (choice === 'delete') {
        const el = workspaceGrid.querySelector(`[data-ws-id="${ws.id}"]`);
        if (el) trashDropped(el, 'workspace');
    }
}

// ---------- フォルダを開いた画面 ----------
function openWorkspaceFolder(wsId, fromEl) {
    openFolderId = wsId;
    renderWorkspaceFolder();
    // アイコンの位置から広がるように見せる
    const r = fromEl.getBoundingClientRect();
    wsFolder.style.transformOrigin = `${r.left + r.width / 2 - wsFolder.getBoundingClientRect().left}px ${r.top - wsFolder.getBoundingClientRect().top}px`;
    wsFolderOverlay.classList.add('show');
    wsFolder.classList.add('show');
}

function closeWorkspaceFolder() {
    openFolderId = null;
    wsFolderOverlay.classList.remove('show');
    wsFolder.classList.remove('show');
}

function renderWorkspaceFolder() {
    const ws = workspaces.find(w => w.id === openFolderId);
    if (!ws) { closeWorkspaceFolder(); return; }
    wsFolder.innerHTML = `
        <div class="wsf-head">
          <span class="wsf-title" id="wsf-title" title="クリックで名前を変更">${escapeHtml(ws.name)}</span>
          <span class="wsf-close" id="wsf-close">×</span>
        </div>
        <div class="wsf-grid">
          ${ws.urls.map(u => `
            <div class="wsf-app" data-wsf-url="${escapeHtml(u)}" title="${escapeHtml(u)}">
              <div class="wsf-icon">${siteIconHtml(u, ws.icons?.[u], 'ws-app-img')}<span class="wsf-remove" data-wsf-remove="${escapeHtml(u)}" title="フォルダから外す">×</span></div>
              <div class="wsf-name">${escapeHtml(wsTitleOf(ws, u))}</div>
            </div>`).join('')}
        </div>
        <div class="wsf-open-all" id="wsf-open-all">すべて開く（${ws.urls.length} 個）</div>`;
}

wsFolder.addEventListener('click', (e) => {
    const ws = workspaces.find(w => w.id === openFolderId);
    if (!ws) return;
    if (e.target.closest('#wsf-close')) { closeWorkspaceFolder(); return; }
    if (e.target.closest('#wsf-title')) { renameWorkspace(ws); return; }
    if (e.target.closest('#wsf-open-all')) { closeWorkspaceFolder(); openWorkspaceUrls(ws.urls); return; }
    const remove = e.target.closest('[data-wsf-remove]');
    if (remove) {
        const url = remove.getAttribute('data-wsf-remove');
        ws.urls = ws.urls.filter(u => u !== url);
        delete ws.icons[url]; delete ws.titles[url];
        if (ws.urls.length === 0) workspaces = workspaces.filter(w => w !== ws);
        if (ws.urls.length <= 1) closeWorkspaceFolder(); // 1 つになったら普通のアプリに戻る
        saveWorkspaces(); renderWorkspaces();
        return;
    }
    const app = e.target.closest('[data-wsf-url]');
    if (app) { closeWorkspaceFolder(); openWorkspaceUrls([app.getAttribute('data-wsf-url')]); }
});
wsFolderOverlay.addEventListener('click', closeWorkspaceFolder);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openFolderId) closeWorkspaceFolder(); });
