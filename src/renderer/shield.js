// ==========================================
// ★ ARCHYNDIUM SHIELD（広告ブロッカー 3モード制御）
// ==========================================
// mode 2 = AEGIS（全方位）/ 1 = STREAM（動画特化）/ 0 = BYPASS（停止）
// ※ main プロセス側のモード番号は従来と同じなので、保存済みの設定などはそのまま使えます
const btnShield = document.getElementById('btn-shield');
const shieldOverlay = document.getElementById('shield-overlay');
const shieldPopup = document.getElementById('shield-popup');

const SHIELD_MODES = [
    {
        mode: 2, name: 'AEGIS', tag: '全方位ブロック', status: '<em>AEGIS</em> で保護中',
        desc: '広告・トラッカーを通信レベルで遮断。一般サイト向けの最強モード',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path>',
    },
    {
        mode: 1, name: 'STREAM', tag: '動画特化', status: '<em>STREAM</em> で保護中',
        desc: '動画サイトの広告を自動でスキップし、広告ブロッカーへの警告も表示させない',
        icon: '<polygon points="6 4 20 12 6 20 6 4"></polygon>',
    },
    {
        mode: 0, name: 'BYPASS', tag: '保護オフ', status: '<em>BYPASS</em>：保護していません',
        desc: 'すべてのブロックを停止。表示が崩れるサイトの確認用',
        icon: '<circle cx="12" cy="12" r="9"></circle><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"></line>',
    },
];

function shieldModeInfo(mode) {
    return SHIELD_MODES.find(m => m.mode === mode) || SHIELD_MODES[0];
}

// ▼ 追加：タブごとのモード。tabShieldModes[tabId] があればそのタブだけ全体の設定を上書きする
let globalShieldMode = 2;
const tabShieldModes = {};

function effectiveShieldMode(tabId = activeTabId) {
    return tabId && tabShieldModes[tabId] !== undefined ? tabShieldModes[tabId] : globalShieldMode;
}

// main 側（通信のブロック判定）にタブのモードを伝える。webview を作り直した時（休止からの復帰など）も呼ぶ
function syncTabShieldToMain(tabId) {
    const wv = webviews[tabId];
    if (!wv || !window.electronAPI?.setTabShield) return;
    let wcId = null;
    try { wcId = wv.getWebContentsId(); } catch(e) { return; }
    window.electronAPI.setTabShield(wcId, tabShieldModes[tabId] !== undefined ? tabShieldModes[tabId] : null);
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
    btnShield.classList.remove('active-shield', 'shield-youtube');
    if (mode === 2) btnShield.classList.add('active-shield'); // 青白い光(AEGIS)
    else if (mode === 1) btnShield.classList.add('shield-youtube'); // 赤い光(STREAM)
    const scope = activeTabId && tabShieldModes[activeTabId] !== undefined ? '（このタブ）' : '';
    btnShield.title = `Shield: ${shieldModeInfo(mode).name}${scope}`;
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
    if (currentSiteBypassed) btnShield.title = 'Shield: このサイトは例外（無効）';
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
    document.getElementById('sp-status').innerHTML = currentSiteBypassed ? '<em>このサイト</em>は例外です'
        : scope === 'tab' ? `このタブは <em>${info.name}</em>` : info.status;
    document.getElementById('sp-site').classList.toggle('on', currentSiteBypassed);
    document.getElementById('sp-site-switch').classList.toggle('on', currentSiteBypassed);
    document.getElementById('sp-site-switch').setAttribute('aria-checked', currentSiteBypassed);
    document.getElementById('sp-site-note').textContent = currentSiteBypassed ? 'このサイトでは広告ブロックを止めています' : '表示が崩れる・動かない時に';
    document.getElementById('sp-site').style.display = /^https?:/.test(urlInput.value) ? '' : 'none';
    document.getElementById('sp-emblem-mark').setAttribute('d', mode === 0 || currentSiteBypassed ? 'M9 9l6 6M15 9l-6 6' : 'M9 12l2 2 4-4');

    let host = '';
    try { host = new URL(urlInput.value).hostname; } catch(e) {}
    document.getElementById('sp-host').textContent = host || '—';

    // 全タブ共通 / このタブだけ の切り替え
    document.querySelectorAll('#sp-scope [data-scope]').forEach(el => el.classList.toggle('selected', el.getAttribute('data-scope') === scope));
    document.getElementById('sp-scope-note').textContent = scope === 'tab'
        ? `他のタブは全体の設定（${shieldModeInfo(globalShieldMode).name}）のまま`
        : '下で選んだモードが全部のタブに効きます';

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
    shieldPopup.style.top = `${r.bottom + 12}px`;
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
    btnShield.style.transform = 'scale(1.2)';
    setTimeout(() => btnShield.style.transform = 'scale(1)', 200);

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
