// ==========================================
// ★ ARCHYNDIUM SHIELD（広告ブロック：標準 / 簡易 / オフ）
// ==========================================
// mode 2 = 標準（通信 + 表示のブロック）/ 1 = 簡易（ページ内の広告を隠す・動画広告のスキップだけ）/ 0 = オフ
// ※ main プロセス側のモード番号は従来と同じなので、保存済みの設定などはそのまま使えます
// ▼ 追加：「動画・音楽サイトでは自動で簡易にする」（初期値オン）。全体が標準の時だけ、そのタブを簡易にする
const btnShield = document.getElementById('btn-shield');
const shieldOverlay = document.getElementById('shield-overlay');
const shieldPopup = document.getElementById('shield-popup');

const SHIELD_MODES = [
    {
        mode: 2, name: '標準', tag: '広告・トラッカーをブロック', status: '広告ブロック：標準',
        desc: 'ほとんどのサイト向け。通信と表示の両方で広告・トラッカーを止めます',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path>',
    },
    {
        mode: 1, name: '簡易', tag: '軽めのブロック', status: '広告ブロック：簡易',
        desc: 'ページ内の広告を隠し、動画の広告は自動でスキップ。表示が崩れにくいモード',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="8.5" y1="12" x2="15.5" y2="12"></line>',
    },
    {
        mode: 0, name: 'オフ', tag: 'ブロックしない', status: '広告ブロック：オフ',
        desc: 'すべてのブロックを止めます。表示の確認用',
        icon: '<circle cx="12" cy="12" r="9"></circle><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"></line>',
    },
];

// 動画・音楽サイト（自動で「簡易」にするサイト）
const SHIELD_MEDIA_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|soundcloud\.com|nicovideo\.jp|spotify\.com|music\.apple\.com|bandcamp\.com|twitch\.tv|vimeo\.com|dailymotion\.com|music\.amazon\.co\.jp|music\.amazon\.com|tver\.jp|abema\.tv)$/i;
const SHIELD_AUTO_KEY = 'archyndium_shield_auto';
let shieldAutoLite = (() => { try { return localStorage.getItem(SHIELD_AUTO_KEY) !== 'off'; } catch (e) { return true; } })();
function setShieldAutoLite(on) {
    shieldAutoLite = on;
    try { localStorage.setItem(SHIELD_AUTO_KEY, on ? 'on' : 'off'); } catch (e) {}
    Object.keys(webviews).forEach(syncTabShieldToMain);
}
function isMediaSiteTab(tabId) {
    try { return SHIELD_MEDIA_HOSTS.test(new URL(getTabCard(tabId)?.getAttribute('data-url') || '').hostname); } catch (e) { return false; }
}
// このタブに「自動で簡易」が効いているか（タブだけの設定がある時は効かない）
function shieldAutoApplies(tabId = activeTabId) {
    return !!tabId && shieldAutoLite && tabShieldModes[tabId] === undefined && globalShieldMode === 2 && isMediaSiteTab(tabId);
}

function shieldModeInfo(mode) {
    return SHIELD_MODES.find(m => m.mode === mode) || SHIELD_MODES[0];
}

// ▼ 追加：タブごとのモード。tabShieldModes[tabId] があればそのタブだけ全体の設定を上書きする
let globalShieldMode = 2;
const tabShieldModes = {};

function effectiveShieldMode(tabId = activeTabId) {
    if (tabId && tabShieldModes[tabId] !== undefined) return tabShieldModes[tabId];
    return shieldAutoApplies(tabId) ? 1 : globalShieldMode;
}

// main 側（通信のブロック判定）にタブのモードを伝える。webview を作り直した時（休止からの復帰など）も呼ぶ
function syncTabShieldToMain(tabId) {
    const wv = webviews[tabId];
    if (!wv || !window.electronAPI?.setTabShield) return;
    let wcId = null;
    try { wcId = wv.getWebContentsId(); } catch(e) { return; }
    const override = tabShieldModes[tabId] !== undefined ? tabShieldModes[tabId] : shieldAutoApplies(tabId) ? 1 : null;
    window.electronAPI.setTabShield(wcId, override);
}

function setTabShieldMode(tabId, mode) {
    if (mode === null || mode === undefined) delete tabShieldModes[tabId]; else tabShieldModes[tabId] = mode;
    syncTabShieldToMain(tabId);
    updateTabShieldBadge(tabId);
    if (typeof scheduleSaveSession === 'function') scheduleSaveSession();
}

// タブ一覧に「このタブだけ別のモード」の小さな盾を出す
function updateTabShieldBadge(tabId) {
    const card = getTabCard(tabId);
    if (!card) return;
    let badge = card.querySelector('.tab-shield-badge');
    const mode = tabShieldModes[tabId];
    if (mode === undefined) { badge?.remove(); return; }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-shield-badge';
        badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
        card.querySelector('.tab-title').after(badge);
    }
    badge.setAttribute('data-mode', mode);
    badge.title = `このタブだけ ${shieldModeInfo(mode).name}`;
}

function updateShieldIcon(mode = effectiveShieldMode()) {
    btnShield.classList.remove('active-shield', 'shield-lite', 'shield-off');
    btnShield.classList.add(mode === 2 ? 'active-shield' : mode === 1 ? 'shield-lite' : 'shield-off');
    const scope = activeTabId && tabShieldModes[activeTabId] !== undefined ? '（このタブだけ）' : shieldAutoApplies() ? '（動画・音楽サイトのため自動）' : '';
    btnShield.title = `広告ブロック：${shieldModeInfo(mode).name}${scope}`;
    const mark = mode === 2 ? 'M9 12l2 2 4-4' : mode === 1 ? 'M8.5 12h7' : 'M9.5 9.5l5 5M14.5 9.5l-5 5';
    btnShield.querySelector('svg').innerHTML = `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="${mark}"></path>`;
}

if (window.electronAPI && window.electronAPI.getAdblockMode) {
    window.electronAPI.getAdblockMode().then(mode => { globalShieldMode = mode; updateShieldIcon(); });
}

// 表示中のタブのサイトが例外かどうか（盾アイコンとパネルに反映）
let currentSiteBypassed = false;

async function refreshShieldSiteState() {
    currentSiteBypassed = false;
    try { if (/^https?:/.test(urlInput.value)) currentSiteBypassed = (await window.electronAPI.getShieldSite(urlInput.value)).bypassed; } catch(e) {}
    btnShield.classList.toggle('shield-site-off', currentSiteBypassed);
    if (currentSiteBypassed) btnShield.title = '広告ブロック：このサイトでは無効';
    else updateShieldIcon();
    return currentSiteBypassed;
}

function shieldScope() {
    return activeTabId && tabShieldModes[activeTabId] !== undefined ? 'tab' : 'global';
}

function renderShieldPanel() {
    const mode = effectiveShieldMode();
    const scope = shieldScope();
    const info = shieldModeInfo(mode);
    // サイト例外中はパネル全体を BYPASS の色にする
    shieldPopup.setAttribute('data-mode', currentSiteBypassed ? 0 : mode);
    shieldPopup.classList.toggle('site-off', currentSiteBypassed);
    document.getElementById('sp-status').textContent = currentSiteBypassed ? '広告ブロック：このサイトでは無効'
        : scope === 'tab' ? `このタブだけ：${info.name}` : shieldAutoApplies() ? '広告ブロック：簡易（自動）' : info.status;
    document.getElementById('sp-auto-switch').classList.toggle('on', shieldAutoLite);
    document.getElementById('sp-auto-switch').setAttribute('aria-checked', shieldAutoLite);
    document.getElementById('sp-site').classList.toggle('on', currentSiteBypassed);
    document.getElementById('sp-site-switch').classList.toggle('on', currentSiteBypassed);
    document.getElementById('sp-site-switch').setAttribute('aria-checked', currentSiteBypassed);
    document.getElementById('sp-site-note').textContent = currentSiteBypassed ? 'このサイトでは広告ブロックを止めています' : '表示が崩れる・動かない時に';
    document.getElementById('sp-site').style.display = /^https?:/.test(urlInput.value) ? '' : 'none';
    document.getElementById('sp-emblem-mark').setAttribute('d', mode === 0 || currentSiteBypassed ? 'M9.5 9.5l5 5M14.5 9.5l-5 5' : mode === 1 ? 'M8.5 12h7' : 'M9 12l2 2 4-4');

    let host = '';
    try { host = new URL(urlInput.value).hostname; } catch(e) {}
    document.getElementById('sp-host').textContent = host || '—';

    // 全タブ共通 / このタブだけ の切り替え
    document.querySelectorAll('#sp-scope [data-scope]').forEach(el => el.classList.toggle('selected', el.getAttribute('data-scope') === scope));
    document.getElementById('sp-scope-note').textContent = scope === 'tab'
        ? `他のタブは全体の設定（${shieldModeInfo(globalShieldMode).name}）のまま`
        : shieldAutoApplies() ? '全体は「標準」。このサイトは動画・音楽サイトなので自動で「簡易」にしています' : '選んだモードがすべてのタブに効きます';

    document.getElementById('shield-mode-list').innerHTML = SHIELD_MODES.map(m => `
        <div class="sp-mode ${m.mode === mode ? 'selected' : ''}" data-mode="${m.mode}">
          <div class="sp-mode-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg></div>
          <div class="sp-mode-text">
            <span class="sp-mode-name">${m.name}<small>${m.tag}</small></span>
            <span class="sp-mode-desc">${m.desc}</span>
          </div>
          <div class="sp-radio"></div>
        </div>`).join('');
}

async function refreshShieldStats() {
    let wcId = null;
    try { wcId = webviews[activeTabId]?.getWebContentsId(); } catch(e) {}
    const stats = await window.electronAPI.getShieldStats(wcId).catch(() => null);
    document.getElementById('sp-page').textContent = stats ? stats.page.toLocaleString() : '0';
    document.getElementById('sp-total').textContent = stats ? stats.total.toLocaleString() : '0';
}

function positionShieldPanel() {
    const r = btnShield.getBoundingClientRect();
    const width = shieldPopup.offsetWidth || 340;
    const left = Math.min(Math.max(12, r.left - 14), window.innerWidth - width - 12);
    shieldPopup.style.left = `${left}px`;
    shieldPopup.style.top = `${r.bottom + 10}px`;
}

function closeShieldPanel() {
    shieldOverlay.classList.remove('show');
    shieldPopup.classList.remove('show');
}

function reloadActiveTab() {
    if (activeTabId && webviews[activeTabId]) webviews[activeTabId].reload();
}

btnShield.addEventListener('click', async (e) => {
    e.stopPropagation();

    globalShieldMode = await window.electronAPI.getAdblockMode();
    await refreshShieldSiteState();
    renderShieldPanel();
    positionShieldPanel();
    shieldOverlay.classList.add('show');
    shieldPopup.classList.add('show');
    refreshShieldStats();
});

document.getElementById('shield-mode-list').addEventListener('click', async (e) => {
    const item = e.target.closest('.sp-mode');
    if (!item) return;
    const mode = parseInt(item.getAttribute('data-mode'));
    try {
        if (shieldScope() === 'tab') {
            setTabShieldMode(activeTabId, mode);
        } else {
            globalShieldMode = await window.electronAPI.setAdblockMode(mode);
            Object.keys(webviews).forEach(syncTabShieldToMain); // 「自動で簡易」は全体が標準の時だけ効くので、全タブを伝え直す
        }
        await refreshShieldSiteState();
        renderShieldPanel();
    } catch(e) {}

    // 選択したことが見えるよう少しだけ待ってから閉じる（エラー時も必ず閉じる）
    setTimeout(closeShieldPanel, 220);
    reloadActiveTab();
});

// 全タブ共通 ⇔ このタブだけ
document.getElementById('sp-scope').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-scope]');
    if (!el || !activeTabId) return;
    const scope = el.getAttribute('data-scope');
    if (scope === shieldScope()) return;
    if (scope === 'tab') {
        setTabShieldMode(activeTabId, globalShieldMode); // まずは今と同じモードで「このタブ専用」にする
    } else {
        const changed = effectiveShieldMode() !== globalShieldMode;
        setTabShieldMode(activeTabId, null);
        if (changed) reloadActiveTab();
    }
    await refreshShieldSiteState();
    renderShieldPanel();
});

// サイト例外スイッチ：切り替えたらタブを再読み込みして反映（パネルは開いたまま）
document.getElementById('sp-site-switch').addEventListener('click', async () => {
    await window.electronAPI.setShieldSite(urlInput.value, !currentSiteBypassed);
    await refreshShieldSiteState();
    renderShieldPanel();
    reloadActiveTab();
    if (typeof renderShieldSiteSettings === 'function') renderShieldSiteSettings();
});

shieldOverlay.addEventListener('click', closeShieldPanel);
window.addEventListener('resize', () => { if (shieldPopup.classList.contains('show')) positionShieldPanel(); });

// ▼ 追加：「動画・音楽サイトでは自動で簡易」のスイッチ
document.getElementById('sp-auto-switch').addEventListener('click', async () => {
    const before = effectiveShieldMode();
    setShieldAutoLite(!shieldAutoLite);
    await refreshShieldSiteState();
    renderShieldPanel();
    if (effectiveShieldMode() !== before) reloadActiveTab();
});
// ページを移動して動画・音楽サイトに入った / 出た時に、そのタブのモードを main に伝え直す
const shieldAutoState = {};
tabUrlChangeHooks.push((tabId) => {
    const now = shieldAutoApplies(tabId);
    if (shieldAutoState[tabId] === now) return;
    shieldAutoState[tabId] = now;
    syncTabShieldToMain(tabId);
    if (tabId === activeTabId) updateShieldIcon();
});
