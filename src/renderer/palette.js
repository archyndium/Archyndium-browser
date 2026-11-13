// ==========================================
// ★ コマンドパレット（Ctrl+K / Ctrl+Shift+P、タブ検索は Ctrl+Shift+A）
// ==========================================
// VS Code や Obsidian のように、キーボードだけでブラウザの機能を実行する。
// 何も付けずに打つと「コマンド・開いているタブ・ブックマーク・履歴・メモ」をまとめて曖昧検索。
//   >  コマンドだけ / @ 開いているタブだけ / # ブックマーク・履歴だけ
// 入力が URL なら「開く」、それ以外は「検索」の候補が先頭に出る。よく使うコマンドは上に来る。

const cmdOverlay = document.getElementById('cmd-overlay');
const cmdPalette = document.getElementById('cmd-palette');
const cmdInput = document.getElementById('cmd-input');
const cmdList = document.getElementById('cmd-list');
const cmdMode = document.getElementById('cmd-mode');
const CMD_USAGE_KEY = 'archyndium_cmd_usage';
let cmdItems = [];
let cmdSelected = 0;

const isMacPlatform = navigator.platform.toLowerCase().includes('mac');
const K = (s) => isMacPlatform ? s.replace(/Ctrl/g, '⌘') : s;

// テーマ名の日本語の読み（「さくら」「みどり」などでも探せるように）
const THEME_READINGS = {
    default: 'デフォルト 黒 くろ', navy: 'ネイビー 紺 こん', green: 'グリーン 緑 みどり 森', purple: 'パープル 紫 むらさき',
    oled: 'オーレッド 真っ黒 まっくろ', graphite: 'グラファイト 灰色 グレー', nord: 'ノルド 北欧', indigo: 'インディゴ 藍 あい 夜',
    ocean: 'オーシャン 海 うみ 青緑', crimson: 'クリムゾン 赤 あか', sakura: 'さくら 桜 ピンク', amber: 'アンバー 夕焼け オレンジ',
};

// ---------- コマンド一覧 ----------
// { id, title, keywords（英語・読みなど）, group, key（ショートカット表示）, run, when（使える時だけ表示） }
function buildCommands() {
    const hasTab = () => !!activeTabId;
    const cmds = [
        // タブ・ウィンドウ
        { id: 'new-tab', group: 'タブ', title: '新しいタブ', keywords: 'new tab', key: 'Ctrl+T', run: () => SHORTCUT_ACTIONS['new-tab']() },
        { id: 'new-private', group: 'タブ', title: '新しいシークレットタブ', keywords: 'private incognito secret', key: 'Ctrl+Shift+N', run: () => SHORTCUT_ACTIONS['new-private-tab']() },
        { id: 'new-window', group: 'ウィンドウ', title: '新しいウィンドウ', keywords: 'new window', key: 'Ctrl+N', run: () => window.electronAPI.openNewWindow({}) },
        { id: 'new-private-window', group: 'ウィンドウ', title: '新しいウィンドウ（シークレット）', keywords: 'private window incognito', run: () => window.electronAPI.openNewWindow({ isPrivate: true }) },
        { id: 'move-window', group: 'ウィンドウ', title: 'このタブを新しいウィンドウに移動', keywords: 'move tab window detach', when: hasTab, run: () => moveTabToNewWindow(activeTabId) },
        { id: 'close-tab', group: 'タブ', title: 'タブを閉じる', keywords: 'close tab', key: 'Ctrl+W', when: hasTab, run: () => closeTab(activeTabId) },
        { id: 'restore-tab', group: 'タブ', title: '閉じたタブを開き直す', keywords: 'restore reopen closed', key: 'Ctrl+Shift+T', when: () => closedTabStack.length > 0, run: () => restoreClosedTab() },
        { id: 'dup-tab', group: 'タブ', title: 'タブを複製', keywords: 'duplicate', when: hasTab, run: () => openNewTab(activePageUrl(), { isPrivate: isPrivateTab(activeTabId) }) },
        { id: 'pin-tab', group: 'タブ', title: () => isTabPinned(activeTabId) ? 'タブの固定を解除' : 'タブを固定', keywords: 'pin unpin', when: hasTab, run: () => setTabPinned(activeTabId, !isTabPinned(activeTabId)) },
        { id: 'mute-tab', group: 'タブ', title: () => isTabMuted(activeTabId) ? 'タブのミュートを解除' : 'タブをミュート', keywords: 'mute sound', when: hasTab, run: () => setTabMuted(activeTabId, !isTabMuted(activeTabId)) },
        { id: 'next-tab', group: 'タブ', title: '次のタブ', keywords: 'next tab', key: 'Ctrl+Tab', run: () => cycleTab(1) },
        { id: 'prev-tab', group: 'タブ', title: '前のタブ', keywords: 'previous tab', key: 'Ctrl+Shift+Tab', run: () => cycleTab(-1) },
        { id: 'new-group', group: 'タブ', title: '新しいグループ', keywords: 'group', run: () => document.getElementById('btn-new-group').click() },
        { id: 'select-tabs', group: 'タブ', title: 'タブを選択してまとめて閉じる', keywords: 'select tabs close multiple bulk', run: () => { openPanel('panel-tabs'); setTabSelectMode(true); } },
        { id: 'close-dupes', group: 'タブ', title: '重複したタブを閉じる', keywords: 'duplicate tabs close', run: () => { const seen = new Set(); closeTabsBulk(getTabCards().filter(c => { const u = c.getAttribute('data-url'); if (seen.has(u)) return true; seen.add(u); return false; }).map(c => c.getAttribute('data-tab-id'))); } },
        // 分割
        { id: 'split-h', group: '分割', title: '左右に分割（新しいタブ）', keywords: 'split view side by side', key: 'Ctrl+\\', when: () => hasTab() && !isSplitVisible(), run: () => splitWithNewTab('h') },
        { id: 'split-v', group: '分割', title: '上下に分割（新しいタブ）', keywords: 'split vertical', when: () => hasTab() && !isSplitVisible(), run: () => splitWithNewTab('v') },
        { id: 'split-swap', group: '分割', title: '分割の左右を入れ替え', keywords: 'swap split', when: isSplitVisible, run: swapSplit },
        { id: 'split-dir', group: '分割', title: '分割の向きを切り替え', keywords: 'rotate split', when: isSplitVisible, run: toggleSplitDir },
        { id: 'unsplit', group: '分割', title: '分割を解除', keywords: 'unsplit close split', when: isSplitVisible, run: unsplit },
        // ページ
        { id: 'reload', group: 'ページ', title: '再読み込み', keywords: 'reload refresh', key: 'Ctrl+R', when: hasTab, run: () => SHORTCUT_ACTIONS['reload']() },
        { id: 'hard-reload', group: 'ページ', title: 'キャッシュを無視して再読み込み', keywords: 'hard reload', key: 'Ctrl+Shift+R', when: hasTab, run: () => SHORTCUT_ACTIONS['hard-reload']() },
        { id: 'back', group: 'ページ', title: '戻る', keywords: 'back', key: 'Alt+←', when: hasTab, run: () => navigateHistory('back') },
        { id: 'forward', group: 'ページ', title: '進む', keywords: 'forward', key: 'Alt+→', when: hasTab, run: () => navigateHistory('forward') },
        { id: 'find', group: 'ページ', title: 'ページ内を検索', keywords: 'find search in page', key: 'Ctrl+F', when: hasTab, run: openFind },
        { id: 'save-pdf', group: 'ページ', title: 'PDF として保存', keywords: 'pdf save print export', when: hasTab, run: savePageAsPdf },
        { id: 'import-bm', group: 'ブックマーク', title: '他のブラウザからブックマークを取り込む', keywords: 'import bookmarks chrome edge brave opera firefox', run: openBookmarkImport },
        { id: 'export-bm', group: 'ブックマーク', title: 'ブックマークを書き出す（HTML）', keywords: 'export bookmarks html', run: exportBookmarks },
        { id: 'default-browser', group: '設定', title: '既定のブラウザにする', keywords: 'default browser', run: makeDefaultBrowser },
        { id: 'about', group: '設定', title: 'バージョン情報', keywords: 'about version license バージョン', run: openAbout },
        { id: 'translate', group: 'ページ', title: 'このページを日本語に翻訳', keywords: 'translate japanese honyaku', when: hasTab, run: () => translatePage('ja') },
        { id: 'translate-en', group: 'ページ', title: 'このページを英語に翻訳', keywords: 'translate english', when: hasTab, run: () => translatePage('en') },
        { id: 'reader', group: 'ページ', title: 'リーダーモード', keywords: 'reader mode article', key: 'F9', when: hasTab, run: toggleReaderMode },
        { id: 'force-dark', group: 'ページ', title: 'このサイトを強制ダークモード（切り替え）', keywords: 'dark mode invert', when: hasTab, run: toggleForceDark },
        { id: 'shot-copy', group: 'ページ', title: 'スクリーンショットをコピー', keywords: 'screenshot capture copy', key: 'Ctrl+Shift+S', when: hasTab, run: () => takeScreenshot('copy') },
        { id: 'shot-save', group: 'ページ', title: 'スクリーンショットを保存', keywords: 'screenshot capture save', when: hasTab, run: () => takeScreenshot('save') },
        { id: 'copy-url', group: 'ページ', title: 'URL をコピー', keywords: 'copy link url', when: hasTab, run: copyPageUrl },
        { id: 'bookmark', group: 'ページ', title: 'ブックマークに追加', keywords: 'bookmark star favorite', key: 'Ctrl+D', when: hasTab, run: () => document.getElementById('btn-bookmark').click() },
        { id: 'print', group: 'ページ', title: '印刷', keywords: 'print', key: 'Ctrl+P', when: hasTab, run: () => SHORTCUT_ACTIONS['print']() },
        { id: 'zoom-in', group: 'ページ', title: '拡大', keywords: 'zoom in', key: 'Ctrl+=', when: hasTab, run: () => changeZoom(ZOOM_STEP) },
        { id: 'zoom-out', group: 'ページ', title: '縮小', keywords: 'zoom out', key: 'Ctrl+-', when: hasTab, run: () => changeZoom(-ZOOM_STEP) },
        { id: 'zoom-reset', group: 'ページ', title: '拡大率を 100% に戻す', keywords: 'zoom reset', key: 'Ctrl+0', when: hasTab, run: () => changeZoom(0) },
        { id: 'view-source', group: 'ページ', title: 'ページのソースを表示', keywords: 'view source html', key: 'Ctrl+U', when: hasTab, run: viewSource },
        { id: 'devtools', group: 'ページ', title: '開発者ツール', keywords: 'devtools inspect', key: 'F12', when: hasTab, run: () => SHORTCUT_ACTIONS['devtools']() },
        { id: 'fullscreen', group: 'ウィンドウ', title: '全画面表示（切り替え）', keywords: 'fullscreen', key: 'F11', run: toggleFullscreen },
        { id: 'sidebar', group: 'ウィンドウ', title: 'サイドバーの表示（切り替え）', keywords: 'sidebar toggle hide', run: () => commandCenter.classList.toggle('collapsed') },
        // パネル・メモ
        { id: 'panel-tabs', group: 'パネル', title: 'タブ一覧を開く', keywords: 'tabs workspace', run: () => openPanel('panel-tabs') },
        { id: 'panel-bookmarks', group: 'パネル', title: 'ブックマークを開く', keywords: 'bookmarks', key: 'Ctrl+Shift+O', run: () => openPanel('panel-bookmarks') },
        { id: 'panel-history', group: 'パネル', title: '履歴を開く', keywords: 'history', key: 'Ctrl+H', run: () => openPanel('panel-history') },
        { id: 'panel-downloads', group: 'パネル', title: 'ダウンロードを開く', keywords: 'downloads', key: 'Ctrl+J', run: () => openPanel('panel-downloads') },
        { id: 'panel-notes', group: 'パネル', title: 'メモを開く', keywords: 'notes memo', key: 'Ctrl+Shift+E', run: () => openPanel('panel-notes') },
        { id: 'panel-settings', group: 'パネル', title: '設定を開く', keywords: 'settings preferences', run: () => { openPanel('panel-settings'); document.querySelector('.tool-icon[data-panel="panel-settings"]').dispatchEvent(new Event('click')); } },
        { id: 'new-note', group: 'メモ', title: '新しいメモ', keywords: 'new note memo', run: () => newNote() },
        { id: 'page-to-note', group: 'メモ', title: 'このページをメモに追加', keywords: 'save page note', when: hasTab, run: () => appendToNote(currentPageRef()) },
        { id: 'clear-history', group: '履歴', title: '閲覧履歴を消去…', keywords: 'clear history delete', run: () => { openPanel('panel-history'); document.getElementById('history-clear').click(); } },
        // 音楽
        { id: 'play', group: '音楽', title: '再生 / 一時停止', keywords: 'play pause music', run: togglePlay },
        { id: 'next-track', group: '音楽', title: '次の曲', keywords: 'next track', run: () => document.getElementById('btn-next').click() },
        { id: 'lyrics', group: '音楽', title: '歌詞を表示（切り替え）', keywords: 'lyrics kashi', run: () => document.getElementById('btn-lyrics').click() },
        { id: 'karaoke', group: '音楽', title: () => karaokeEnabled ? 'カラオケ表示をオフ' : 'カラオケ表示をオン', keywords: 'karaoke synced lyrics', run: () => setKaraokeEnabled(!karaokeEnabled) },
        { id: 'mini-player', group: '音楽', title: 'ミニプレイヤーを開く', keywords: 'mini player popout', run: () => window.electronAPI.openMiniPlayer() },
        { id: 'lock-player', group: '音楽', title: () => mediaLocked ? 'プレイヤーの固定を解除' : 'プレイヤーをこのタブに固定', keywords: 'lock player source', run: toggleMediaLock },
        // Shield
        ...SHIELD_MODES.map(m => ({ id: 'shield-' + m.mode, group: 'Shield', title: `Shield を ${m.name}（${m.tag}）にする`, keywords: `shield adblock ${m.name}`, run: async () => { globalShieldMode = await window.electronAPI.setAdblockMode(m.mode); updateShieldIcon(); reloadActiveTab(); showToast(`Shield：${m.name}`); } })),
        { id: 'shield-site', group: 'Shield', title: () => currentSiteBypassed ? 'このサイトの Shield を有効に戻す' : 'このサイトだけ Shield を無効にする', keywords: 'shield exception bypass site', when: hasTab, run: () => document.getElementById('sp-site-switch').click() },
        // テーマ・検索エンジン
        ...THEMES.map(t => ({ id: 'theme-' + t.id, group: 'テーマ', title: `テーマ：${t.name}`, keywords: `theme color ${t.id} ${THEME_READINGS[t.id] || ''}`, run: () => applyTheme(t.id) })),
        ...SEARCH_ENGINES.map(e => ({ id: 'engine-' + e.id, group: '検索エンジン', title: `検索エンジン：${e.name}`, keywords: `search engine ${e.id}`, run: () => { setSearchEngine(e.id); showToast(`検索エンジンを ${e.name} にしました`); } })),
    ];
    return cmds.filter(c => !c.when || c.when()).map(c => ({ ...c, title: typeof c.title === 'function' ? c.title() : c.title }));
}

// ---------- 曖昧検索 ----------
// 連続一致・単語の先頭・前の方ほど高得点。一致した文字の位置も返して強調表示する
function fuzzyMatch(text, query) {
    if (!query) return { score: 1, marks: [] };
    const t = text.toLowerCase(), q = query.toLowerCase();
    const idx = t.indexOf(q);
    if (idx >= 0) return { score: 100 - idx + (idx === 0 || /[\s/：:（(・]/.test(t[idx - 1]) ? 30 : 0) + q.length * 2, marks: [...Array(q.length).keys()].map(i => idx + i) };
    // スペース区切りの言葉がそれぞれどこかに含まれていれば、順不同でも一致（例：「テーマ さくら」）
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every(w => t.includes(w))) {
        const marks = words.flatMap(w => { const i = t.indexOf(w); return [...Array(w.length).keys()].map(k => i + k); });
        return { score: 75 + q.length, marks };
    }
    // 順番通りに含まれていれば（飛び飛びでも）一致
    const marks = [];
    let ti = 0, gaps = 0;
    for (const ch of q.replace(/\s+/g, '')) {
        const found = t.indexOf(ch, ti);
        if (found < 0) return null;
        if (marks.length && found !== marks[marks.length - 1] + 1) gaps++;
        marks.push(found);
        ti = found + 1;
    }
    return { score: 40 - gaps * 4 - marks[0] * 0.5, marks };
}

function highlight(text, marks) {
    const set = new Set(marks);
    return [...text].map((ch, i) => set.has(i) ? `<mark>${escapeHtml(ch)}</mark>` : escapeHtml(ch)).join('');
}

function loadCmdUsage() { try { return JSON.parse(localStorage.getItem(CMD_USAGE_KEY)) || {}; } catch(e) { return {}; } }
function bumpCmdUsage(id) {
    const u = loadCmdUsage();
    u[id] = (u[id] || 0) + 1;
    localStorage.setItem(CMD_USAGE_KEY, JSON.stringify(u));
}

const CMD_KIND_ICONS = {
    command: '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',
    go: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="14 3 14 9 20 9"></polyline>',
};

function collectCmdItems(raw) {
    let mode = 'all', q = raw.trim();
    if (q.startsWith('>')) { mode = 'cmd'; q = q.slice(1).trim(); }
    else if (q.startsWith('@')) { mode = 'tab'; q = q.slice(1).trim(); }
    else if (q.startsWith('#')) { mode = 'web'; q = q.slice(1).trim(); }
    cmdMode.textContent = { all: '', cmd: 'コマンド', tab: 'タブ', web: 'ブックマーク・履歴' }[mode];
    const out = [];
    const usage = loadCmdUsage();
    const push = (item, text, extra = '') => {
        const m = fuzzyMatch(text + (extra ? ' ' + extra : ''), q);
        if (!m) return;
        out.push({ ...item, score: m.score + item.boost, marks: m.marks.filter(i => i < text.length), label: text });
    };

    if (mode === 'all' || mode === 'cmd') {
        buildCommands().forEach(c => push({ kind: 'command', icon: 'command', group: c.group, key: c.key, run: c.run, id: c.id, boost: (mode === 'cmd' ? 20 : 8) + Math.min(15, (usage[c.id] || 0) * 3) }, c.title, c.keywords));
    }
    if (mode === 'all' || mode === 'tab') {
        getTabCards().forEach(card => {
            const tabId = card.getAttribute('data-tab-id');
            const url = card.getAttribute('data-url') || '';
            push({ kind: 'tab', group: tabId === activeTabId ? '表示中のタブ' : 'タブ', url, iconHtml: siteIconHtml(url, card.querySelector('.favicon img')?.getAttribute('src') || ''),
                   run: () => activateTab(tabId), boost: mode === 'tab' ? 20 : 12 }, card.querySelector('.tab-title')?.textContent || url, url);
        });
    }
    if (mode === 'all' || mode === 'web') {
        if (q || mode === 'web') {
            document.querySelectorAll('#bookmarks-list .bookmark-item').forEach(el => {
                const url = el.getAttribute('data-url');
                push({ kind: 'bookmark', group: 'ブックマーク', url, iconHtml: siteIconHtml(url, el.getAttribute('data-favicon') || ''), run: () => navigateActiveTab(url), boost: 6 }, el.querySelector('.tab-title')?.textContent || url, url);
            });
            historyData.slice(0, 300).forEach(h => push({ kind: 'history', group: '履歴', url: h.url, iconHtml: siteIconHtml(h.url, h.favicon), run: () => navigateActiveTab(h.url), boost: 0 }, h.title || h.url, h.url));
        }
    }
    if (mode === 'all' && q) {
        notes.forEach(n => push({ kind: 'note', icon: 'note', group: 'メモ', run: () => { openNotesPanel(); openNoteEditor(n.id); }, boost: 2 }, noteTitle(n), n.text.slice(0, 200)));
    }

    // 同じ URL が重複しないようにして、点数順に並べる
    const seen = new Set();
    const ranked = out.sort((a, b) => b.score - a.score).filter(it => !it.url || it.kind === 'tab' || (!seen.has(it.url) && seen.add(it.url))).slice(0, 40);
    // 入力があれば「開く / 検索」を加える。コマンドやタブがはっきり一致している時（部分一致）はその次、
    // そうでなければ先頭に置く（Enter で、打った言葉どおりのコマンドが実行されるように）
    if (q && mode === 'all') {
        const url = resolveOmniboxInput(q);
        const isSearch = url === currentEngine().search(q);
        const strongMatch = ranked.length && ranked[0].score - (ranked[0].boost || 0) >= 60;
        ranked.splice(strongMatch ? 1 : 0, 0, { kind: isSearch ? 'search' : 'go', icon: isSearch ? 'search' : 'go', label: q, marks: [], group: isSearch ? `${currentEngine().name} で検索` : '開く', run: () => navigateActiveTab(url) });
    }
    return ranked;
}

function renderCmdList() {
    cmdList.innerHTML = cmdItems.length ? cmdItems.map((it, i) => `
        <div class="cmd-item ${i === cmdSelected ? 'selected' : ''}" data-cmd="${i}">
          ${it.iconHtml || `<div class="cmd-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CMD_KIND_ICONS[it.icon] || CMD_KIND_ICONS.command}</svg></div>`}
          <div class="cmd-text"><span class="cmd-label">${highlight(it.label, it.marks)}</span>${it.url ? `<span class="cmd-url">${escapeHtml(it.url.replace(/^https?:\/\/(www\.)?/, ''))}</span>` : ''}</div>
          <span class="cmd-group">${escapeHtml(it.group || '')}</span>
          ${it.key ? `<kbd class="cmd-key">${escapeHtml(K(it.key))}</kbd>` : ''}
        </div>`).join('') : '<div class="cmd-empty">見つかりませんでした</div>';
    cmdList.querySelector('.cmd-item.selected')?.scrollIntoView({ block: 'nearest' });
}

function refreshCmdPalette() {
    cmdItems = collectCmdItems(cmdInput.value);
    cmdSelected = 0;
    renderCmdList();
}

function openCommandPalette(prefix = '') {
    cmdInput.value = prefix;
    cmdOverlay.classList.add('show');
    cmdPalette.classList.add('show');
    refreshCmdPalette();
    setTimeout(() => { cmdInput.focus(); cmdInput.setSelectionRange(prefix.length, prefix.length); }, 20);
}

function closeCommandPalette() {
    cmdOverlay.classList.remove('show');
    cmdPalette.classList.remove('show');
}

function runCmdItem(it) {
    if (!it) return;
    closeCommandPalette();
    if (it.id) bumpCmdUsage(it.id);
    try { it.run(); } catch(e) { console.error(e); }
}

cmdInput.addEventListener('input', refreshCmdPalette);
cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'Tab' && !e.ctrlKey)) {
        e.preventDefault();
        if (!cmdItems.length) return;
        const dir = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
        cmdSelected = (cmdSelected + dir + cmdItems.length) % cmdItems.length;
        renderCmdList();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        runCmdItem(cmdItems[cmdSelected]);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
    }
});
cmdList.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-cmd]');
    if (!el) return;
    const i = Number(el.getAttribute('data-cmd'));
    if (i !== cmdSelected) { cmdSelected = i; cmdList.querySelectorAll('.cmd-item').forEach((x, j) => x.classList.toggle('selected', j === i)); }
});
cmdList.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cmd]');
    if (el) runCmdItem(cmdItems[Number(el.getAttribute('data-cmd'))]);
});
cmdOverlay.addEventListener('click', closeCommandPalette);
