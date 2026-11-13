// ==========================================
// ★ セッション復元（前回開いていたタブ・グループを起動時に戻す）
// ==========================================
// タブ一覧が変わるたび（少し待ってまとめて）localStorage に保存し、次回起動時に同じ並びで復元する。
// 復元したタブは「休止状態」で作り、最後に見ていたタブだけを読み込む（起動が重くならないように）。
// シークレットタブは保存しない。設定画面の「起動時に前回のタブを復元」で ON/OFF。
// ▼ 変更：複数ウィンドウ対応。ウィンドウごとに保存キーを持ち、起動時は保存されている全ウィンドウを開き直す。
//   ウィンドウを閉じた時、他のウィンドウが残っていればそのウィンドウの保存は消す（Chrome と同じ）。

const SESSIONS_KEY = 'archyndium_sessions';     // { [windowKey]: { savedAt, items } }
const OLD_SESSION_KEY = 'archyndium_session';   // 1 ウィンドウ時代の保存（読み込み時に移行する）
const RESTORE_SETTING_KEY = 'archyndium_restore_session';
const windowQuery = new URLSearchParams(location.search);
let windowSessionKey = windowQuery.get('session') || `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function loadAllSessions() {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || {}; } catch(e) {}
    try {
        const old = JSON.parse(localStorage.getItem(OLD_SESSION_KEY));
        if (old && old.items && !Object.keys(all).length) all['w-legacy'] = { savedAt: old.savedAt || 0, items: old.items };
    } catch(e) {}
    return all;
}

function writeAllSessions(all) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(all)); localStorage.removeItem(OLD_SESSION_KEY); } catch(e) {}
}

function isSessionRestoreEnabled() {
    try { return localStorage.getItem(RESTORE_SETTING_KEY) !== 'off'; } catch(e) { return true; }
}

function setSessionRestoreEnabled(on) {
    localStorage.setItem(RESTORE_SETTING_KEY, on ? 'on' : 'off');
}

function serializeTab(card) {
    const tabId = card.getAttribute('data-tab-id');
    if (isPrivateTab(tabId)) return null;
    const img = card.querySelector('.favicon img');
    return {
        url: card.getAttribute('data-url') || getHomeUrl(),
        pinned: card.classList.contains('pinned') || undefined,
        title: card.querySelector('.tab-title')?.textContent || '',
        favicon: (img && img.getAttribute('src') && img.style.display !== 'none') ? img.getAttribute('src') : '',
        active: tabId === activeTabId,
        shield: tabShieldModes[tabId], // このタブだけの Shield モード（無ければ undefined）
    };
}

function saveSession() {
    const items = [];
    document.querySelectorAll('#tabs-container > .tab-card[data-tab-id], #tabs-container > .tab-group').forEach(el => {
        if (el.classList.contains('tab-group')) {
            const indicator = el.querySelector('.group-indicator');
            items.push({
                type: 'group',
                title: el.querySelector('.group-title')?.textContent || 'Group',
                colorIdx: parseInt(indicator?.getAttribute('data-color-idx') || '0'),
                collapsed: el.querySelector('.group-list')?.classList.contains('collapsed') || false,
                tabs: [...el.querySelectorAll('.tab-card[data-tab-id]')].map(serializeTab).filter(Boolean),
            });
        } else {
            const tab = serializeTab(el);
            if (tab) items.push({ type: 'tab', ...tab });
        }
    });
    document.querySelectorAll('#pinned-tabs > .tab-card[data-tab-id]').forEach(el => {
        const tab = serializeTab(el);
        if (tab) items.unshift({ type: 'tab', ...tab, pinned: true });
    });
    // 他のウィンドウの保存を消さないよう、読み直してから自分の分だけ書き換える
    const all = loadAllSessions();
    all[windowSessionKey] = { savedAt: Date.now(), items, split: typeof serializeSplit === 'function' ? serializeSplit() : null };
    writeAllSessions(all);
}

function forgetThisWindowSession() {
    const all = loadAllSessions();
    delete all[windowSessionKey];
    writeAllSessions(all);
}

let saveSessionTimer = null;
function scheduleSaveSession() {
    clearTimeout(saveSessionTimer);
    saveSessionTimer = setTimeout(saveSession, 800);
}

// 戻り値 { usedSession: 保存データを使ったか, hasTab: 表示するタブを用意できたか }
// hasTab が false なら呼び出し側で新しいタブを作る。usedSession が false なら初期グループも作る
async function restoreSession() {
    const isFirstWindow = windowQuery.get('first') === '1';
    const requested = windowQuery.get('session');
    // 新しく開いたウィンドウ（Ctrl+N など）は何も復元しない
    if (!isFirstWindow && !requested) return { usedSession: true, hasTab: false };
    const all = loadAllSessions();
    let data = null;
    if (requested) {
        data = all[requested];
    } else {
        if (!isSessionRestoreEnabled()) { writeAllSessions({}); return { usedSession: false, hasTab: false }; }
        // 起動時：一番最近のウィンドウをこのウィンドウに、残りは別ウィンドウで開き直す
        const keys = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
        if (keys.length) {
            const [mine, ...others] = keys;
            data = all[mine];
            delete all[mine];
            all[windowSessionKey] = data;
            writeAllSessions(all);
            others.forEach(k => window.electronAPI?.openNewWindow({ sessionKey: k }));
        }
    }
    const items = data?.items || [];
    const tabCount = items.reduce((n, it) => n + (it.type === 'group' ? it.tabs.length : 1), 0);
    if (tabCount === 0 && !items.some(it => it.type === 'group')) return { usedSession: false, hasTab: false };

    const container = document.getElementById('tabs-container');
    let activeCard = null, firstCard = null;
    const makeTab = async (t) => {
        const card = await createNewTabElement(t.url, { sleeping: true, title: t.title, favicon: t.favicon });
        if (t.pinned) setTimeout(() => setTabPinned(card.getAttribute('data-tab-id'), true), 0);
        if (t.shield !== undefined && t.shield !== null) { tabShieldModes[card.getAttribute('data-tab-id')] = t.shield; setTimeout(() => updateTabShieldBadge(card.getAttribute('data-tab-id')), 0); }
        if (t.active) activeCard = card;
        if (!firstCard) firstCard = card;
        return card;
    };
    for (const it of items) {
        if (it.type === 'group') {
            const group = createGroupElement(it.title, it.colorIdx, { collapsed: it.collapsed });
            container.appendChild(group);
            for (const t of it.tabs) group.querySelector('.group-list').appendChild(await makeTab(t));
        } else {
            container.appendChild(await makeTab(it));
        }
    }
    const target = activeCard || firstCard;
    if (!target) return { usedSession: true, hasTab: false }; // グループだけでタブが無い場合
    // 折りたたまれたグループの中のタブでも表示できるように開く
    const list = target.closest('.group-list');
    if (list?.classList.contains('collapsed')) { list.classList.remove('collapsed'); list.previousElementSibling?.querySelector('.chevron')?.classList.remove('collapsed'); }
    setTimeout(() => {
        target.click();
        if (data.split && typeof restoreSplit === 'function') restoreSplit(data.split);
    }, 150);
    return { usedSession: true, hasTab: true };
}

function initSessionAutosave() {
    new MutationObserver(scheduleSaveSession).observe(document.getElementById('tabs-container'), {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-url', 'class', 'data-color-idx'],
    });
    window.addEventListener('beforeunload', () => {
        // このウィンドウだけを閉じる時（他のウィンドウが残る時）は、このウィンドウの保存は消す
        let remaining = 1;
        try { remaining = window.electronAPI?.windowCount() || 1; } catch(e) {}
        if (remaining > 1) forgetThisWindowSession(); else saveSession();
    });
}
