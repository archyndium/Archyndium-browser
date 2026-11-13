// ==========================================
// ★ タブスリープ（バックグラウンドタブの自動休止）
// ==========================================
// 一定時間アクティブにならなかったタブの <webview> を DOM から外して破棄し、
// レンダラープロセスごとメモリを解放する。タブカード（タイトル・favicon・URL）は残すので、
// クリックすると switchTab() → wakeTab() で同じURLから読み込み直す。
//
// 休止しないタブ：表示中のタブ / 音が鳴っているタブ / 再生中・プレイヤーに固定中のメディアタブ /
//               Work・Focus に登録されたURLのタブ（通知バッジ検知を止めないため・設定で変更可）

const SLEEP_SETTINGS_KEY = 'archyndium_tab_sleep';
const SLEEP_CHECK_INTERVAL_MS = 30 * 1000;
const SLEEP_MINUTE_OPTIONS = [0, 5, 15, 30, 60]; // 0 = OFF

let sleepSettings = { minutes: 15, keepWorkspaceTabs: true };

function loadSleepSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(SLEEP_SETTINGS_KEY));
        if (stored) sleepSettings = { ...sleepSettings, ...stored };
    } catch(e) {}
}

function saveSleepSettings() {
    localStorage.setItem(SLEEP_SETTINGS_KEY, JSON.stringify(sleepSettings));
}

function isSleeping(tabId) {
    const card = getTabCard(tabId);
    return !!card && card.classList.contains('sleeping');
}

function isWorkspaceUrl(url) {
    if (!url || typeof workspaces === 'undefined') return false;
    return workspaces.some(ws => ws.urls.some(u => url.startsWith(u) || u.startsWith(url)));
}

function canSleep(tabId) {
    const wv = webviews[tabId];
    if (!wv || tabId === activeTabId) return false;
    if (typeof isSplitVisible === 'function' && isSplitVisible() && isInSplit(tabId)) return false; // 分割表示中の相方
    if (tabId === mediaTargetTabId && (isPlaying || mediaLocked)) return false; // プレイヤーに固定中のタブも休止しない
    try { if (wv.isCurrentlyAudible()) return false; } catch(e) {}
    const url = getTabCard(tabId)?.getAttribute('data-url');
    if (sleepSettings.keepWorkspaceTabs && isWorkspaceUrl(url)) return false;
    return true;
}

function sleepTab(tabId) {
    if (!canSleep(tabId)) return false;
    const card = getTabCard(tabId);
    const wv = webviews[tabId];
    // 実際に表示していたURL（ページ内遷移を含む）を保存してから破棄する
    try { const liveUrl = wv.getURL(); if (liveUrl && card) card.setAttribute('data-url', liveUrl); } catch(e) {}
    wv.remove();
    delete webviews[tabId];
    if (card) { card.classList.add('sleeping'); card.title = '休止中（クリックで復帰）'; }
    return true;
}

function wakeTab(tabId) {
    if (webviews[tabId]) return;
    const card = getTabCard(tabId);
    if (!card) return;
    card.classList.remove('sleeping');
    card.removeAttribute('title');
    createWebviewForTab(tabId, card.getAttribute('data-url') || 'https://google.com');
}

function sleepInactiveTabs(force = false) {
    const limitMs = sleepSettings.minutes * 60 * 1000;
    if (!force && limitMs <= 0) return 0;
    const now = Date.now();
    let count = 0;
    Object.keys(webviews).forEach(tabId => {
        // 一度もアクティブになっていない（裏で開いた）タブは作成時刻から数える
        if (!tabLastActive[tabId]) tabLastActive[tabId] = now;
        if (force || now - tabLastActive[tabId] >= limitMs) {
            if (sleepTab(tabId)) count++;
        }
    });
    return count;
}

function renderSleepOptions() {
    const box = document.getElementById('sleep-options');
    if (!box) return;
    const check = (on) => on ? '<span style="margin-left:auto; color: var(--theme-light);">✓</span>' : '';
    box.innerHTML = SLEEP_MINUTE_OPTIONS.map(min => `
        <div class="tab-card sleep-opt" data-sleep-min="${min}">
          <div class="favicon" style="background:#333; color:#FFF;">${min === 0 ? '–' : 'z'}</div>
          <span class="tab-title">${min === 0 ? 'OFF' : `${min}分 放置で休止`}</span>${check(sleepSettings.minutes === min)}
        </div>`).join('') + `
        <div class="tab-card sleep-opt" data-sleep-toggle="keepWorkspaceTabs">
          <div class="favicon" style="background:#333; color:#FFF;">W</div>
          <span class="tab-title">Work / Focus は除外</span>${check(sleepSettings.keepWorkspaceTabs)}
        </div>
        <div class="tab-card sleep-opt" data-sleep-action="now">
          <div class="favicon" style="background:#333; color:#FFF;">⏾</div>
          <span class="tab-title">今すぐ休止</span>
        </div>`;
}

function initTabSleep() {
    loadSleepSettings();
    renderSleepOptions();

    document.getElementById('sleep-options')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.sleep-opt');
        if (!opt) return;
        if (opt.hasAttribute('data-sleep-min')) sleepSettings.minutes = parseInt(opt.getAttribute('data-sleep-min'));
        else if (opt.hasAttribute('data-sleep-toggle')) sleepSettings.keepWorkspaceTabs = !sleepSettings.keepWorkspaceTabs;
        else if (opt.getAttribute('data-sleep-action') === 'now') sleepInactiveTabs(true);
        saveSleepSettings();
        renderSleepOptions();
    });

    setInterval(() => sleepInactiveTabs(false), SLEEP_CHECK_INTERVAL_MS);
}
