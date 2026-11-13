// ==========================================
// ★ キーボードショートカット（実処理）
// ==========================================
// キーの判定はメインプロセス（src/main/shortcuts.js）で行い、ここにはアクション名だけが届く。
//
//   Ctrl+T 新規タブ / Ctrl+Shift+N シークレットタブ / Ctrl+W タブを閉じる / Ctrl+Shift+T 閉じたタブを復元
//   Ctrl+Tab・Ctrl+PageDown 次のタブ / Ctrl+Shift+Tab・Ctrl+PageUp 前のタブ / Ctrl+1〜8・9
//   Ctrl+R・F5 再読み込み / Ctrl+Shift+R・Shift+F5 キャッシュ無視で再読み込み
//   Alt+←/→ 戻る・進む / Ctrl+L・Alt+D URLバー / Ctrl+D ブックマーク
//   Ctrl+H 履歴 / Ctrl+J ダウンロード / Ctrl+Shift+O ブックマーク一覧
//   Ctrl+F ページ内検索（F3・Ctrl+G 次へ / Shift+F3・Ctrl+Shift+G 前へ）/ Ctrl+P 印刷
//   マウスのサイドボタン：戻る・進む
//   Ctrl+N 新しいウィンドウ / Ctrl+K・Ctrl+Shift+P コマンドパレット / Ctrl+Shift+A タブ検索 / Ctrl+\ 分割表示
//   F11 全画面 / F9 リーダーモード / Ctrl+U ソース表示 / Ctrl+Shift+S スクリーンショット / Ctrl+Shift+E メモ
//   Ctrl+= / Ctrl+- / Ctrl+0 ズーム / F12・Ctrl+Shift+I 開発者ツール
//   （macOS では Ctrl の代わりに Cmd）

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -5, ZOOM_MAX = 5;

function activeWebview() {
    return activeTabId ? webviews[activeTabId] : null;
}

function focusUrlBar() {
    urlInput.focus();
    urlInput.select();
}

// サイドバーのパネルを開く（既に開いている時は閉じずにそのまま）
function openPanel(panelId) {
    const icon = document.querySelector(`.tool-icon[data-panel="${panelId}"]`);
    if (!icon) return;
    if (icon.classList.contains('active')) commandCenter.classList.remove('collapsed');
    else icon.click();
}

function changeZoom(delta) {
    const wv = activeWebview();
    if (!wv) return;
    try {
        const level = delta === 0 ? 0 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, wv.getZoomLevel() + delta));
        wv.setZoomLevel(level);
        saveSiteZoom(wv.getURL(), level); // ▼ 追加：サイトごとに記憶して、次に開いた時も同じ倍率にする
    } catch(e) {}
    refreshZoomIndicator();
}

// 戻る/進む。マウスのサイドボタンは環境によって app-command と webview 内の両方から届くので、
// 短時間に 2 回来たら 1 回として扱う
let lastHistoryNav = { dir: '', at: 0 };
function navigateHistory(dir) {
    const now = Date.now();
    if (lastHistoryNav.dir === dir && now - lastHistoryNav.at < 350) return;
    lastHistoryNav = { dir, at: now };
    const wv = activeWebview();
    if (!wv) return;
    if (dir === 'back' && wv.canGoBack()) wv.goBack();
    if (dir === 'forward' && wv.canGoForward()) wv.goForward();
}

const SHORTCUT_ACTIONS = {
    'new-tab': async () => { await openNewTab(); focusUrlBar(); },
    'new-private-tab': async () => { await openNewTab(getHomeUrl(), { isPrivate: true }); focusUrlBar(); },
    'close-tab': () => closeTab(activeTabId),
    'restore-tab': () => restoreClosedTab(),
    'next-tab': () => cycleTab(1),
    'prev-tab': () => cycleTab(-1),
    'reload': () => activeWebview()?.reload(),
    'hard-reload': () => activeWebview()?.reloadIgnoringCache(),
    'back': () => navigateHistory('back'),
    'forward': () => navigateHistory('forward'),
    'find': () => openFind(),
    'find-next': () => findStep(true),
    'find-prev': () => findStep(false),
    'print': () => { try { activeWebview()?.print(); } catch(e) {} },
    'focus-url': () => focusUrlBar(),
    'bookmark': () => document.getElementById('btn-bookmark').click(),
    'panel-history': () => openPanel('panel-history'),
    'panel-downloads': () => openPanel('panel-downloads'),
    'panel-bookmarks': () => openPanel('panel-bookmarks'),
    'new-window': () => window.electronAPI?.openNewWindow({}),
    'command-palette': () => cmdPalette.classList.contains('show') ? closeCommandPalette() : openCommandPalette(),
    'tab-search': () => openCommandPalette('@'),
    'split': () => isSplitVisible() ? unsplit() : splitWithNewTab('h'),
    'fullscreen': () => toggleFullscreen(),
    'reader-mode': () => toggleReaderMode(),
    'view-source': () => viewSource(),
    'screenshot': () => takeScreenshot('copy'),
    'panel-notes': () => openPanel('panel-notes'),
    'zoom-in': () => changeZoom(ZOOM_STEP),
    'zoom-out': () => changeZoom(-ZOOM_STEP),
    'zoom-reset': () => changeZoom(0),
    'devtools': () => {
        const wv = activeWebview();
        if (!wv) return;
        wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools();
    },
};

window.electronAPI?.onShortcut((action) => {
    if (action.startsWith('tab-')) { activateTabByIndex(parseInt(action.slice(4))); return; }
    const run = SHORTCUT_ACTIONS[action];
    if (run) run();
});

// サイドバーなど webview の外でマウスのサイドボタンを押した時
document.addEventListener('mouseup', (e) => {
    if (e.button === 3 || e.button === 4) { e.preventDefault(); navigateHistory(e.button === 3 ? 'back' : 'forward'); }
});

// Ctrl+クリック / 中クリックされたリンクを裏で新しいタブとして開く
// シークレットタブ内のリンクはシークレットタブで開く
window.electronAPI?.onOpenInNewTab(({ url, background, isPrivate }) => openNewTab(url, { background, isPrivate }));
