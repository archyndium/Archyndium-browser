// ==========================================
// ★ 新しいタブのページ（archyndium://newtab/）に表示する内容を渡す
// ==========================================
// ページ本体は src/newtab/。ここでは、新しいタブを表示している間だけ 1 秒ごとに
// テーマ・検索エンジン・Work / Focus・広告ブロックの数・再生中の曲と歌詞の一行を渡す。
// ページからは console.log('ARCHYNDIUM_NTP:toggle-play') で再生・一時停止だけを受け付ける。

const NEWTAB_URL = 'archyndium://newtab/';
const NEWTAB_KEY = 'archyndium_newtab';
const isNewTabUrl = (url) => /^archyndium:\/\/newtab\/?(\?.*)?$/i.test(url || '');
function newtabEnabled() { try { return localStorage.getItem(NEWTAB_KEY) !== 'off'; } catch (e) { return true; } }
function setNewtabEnabled(on) { try { localStorage.setItem(NEWTAB_KEY, on ? 'on' : 'off'); } catch (e) {} }
// URL 欄には新しいタブのアドレスを出さない（空欄にして、すぐに入力できるように）
const displayUrl = (url) => isNewTabUrl(url) ? '' : (url || '');

// 演出の設定（設定 → 演出）で、新しいタブの波も止められるようにする
FX.register({
    id: 'ntp-waves',
    name: '新しいタブの波',
    description: '新しいタブの下で、音楽に合わせて色の波が流れます。オフにすると止まった波になります',
    group: '新しいタブ',
    kind: 'css',
    defaultEnabled: true,
});

let ntpShieldTotal = null, ntpShieldAt = 0;
async function refreshNtpShield() {
    if (Date.now() - ntpShieldAt < 5000 || !window.electronAPI?.getShieldStats) return;
    ntpShieldAt = Date.now();
    try { const s = await window.electronAPI.getShieldStats(null); if (s && typeof s.total === 'number') ntpShieldTotal = s.total; } catch (e) {}
}

function newTabState(tabId) {
    const engine = currentEngine();
    const hasMedia = !!(mediaTargetTabId || (typeof audioPlaylist !== 'undefined' && audioPlaylist.length));
    const title = nowPlayingTitle?.textContent || '';
    return {
        light: FX.isLight(),
        motion: FX.isActive('ntp-waves'),
        private: isPrivateTab(tabId),
        engine: { id: engine.id, name: engine.name, template: engine.search('__Q__'), icon: defaultFaviconUrl(engine.home) },
        engines: SEARCH_ENGINES.map(e => ({ id: e.id, name: e.name, icon: defaultFaviconUrl(e.home) })),
        shield: ntpShieldTotal,
        music: !hasMedia || title === '再生していません' ? { state: 'none' } : {
            state: isPlaying ? 'play' : 'pause',
            title, artist: document.getElementById('track-artist')?.textContent || '', line: FX.music.line || '',
        },
        sites: (typeof workspaces !== 'undefined' ? workspaces : []).map(ws => ({
            name: ws.name, color: ws.color,
            items: ws.urls.map(u => ({ url: u, title: ws.titles?.[u] || siteHostOf(u) || u, host: siteHostOf(u) })),
        })),
    };
}

function pushNewTab(tabId) {
    const wv = webviews[tabId];
    const card = getTabCard(tabId);
    if (!wv || !card || !isNewTabUrl(card.getAttribute('data-url'))) return;
    let url = ''; try { url = wv.getURL(); } catch (e) { return; }
    if (!isNewTabUrl(url)) return;
    wv.executeJavaScript(`window.__archyndiumNewTab && window.__archyndiumNewTab(${JSON.stringify(newTabState(tabId))})`).catch(() => {});
}

// 表示中のタブ（と分割表示の相方）が新しいタブなら、1 秒ごとに内容を渡す
setInterval(() => {
    if (document.hidden) return;
    const ids = [activeTabId, typeof splitPartnerOf === 'function' ? splitPartnerOf(activeTabId) : null].filter(Boolean);
    if (!ids.some(id => isNewTabUrl(getTabCard(id)?.getAttribute('data-url')))) return;
    refreshNtpShield();
    ids.forEach(pushNewTab);
}, 1000);

// ページからの合図（新しいタブのページからだけ受け付ける）
function onNewTabMessage(tabId, action) {
    let url = ''; try { url = webviews[tabId]?.getURL(); } catch (e) {}
    if (!isNewTabUrl(url)) return;
    if (action === 'toggle-play') { document.getElementById('btn-play').click(); setTimeout(() => pushNewTab(tabId), 120); }
    // 検索エンジンの切り替え（シークレットタブならシークレット用を変える）
    if (action.startsWith('engine:') && typeof chooseEngine === 'function') { chooseEngine(action.slice(7)); pushNewTab(tabId); }
}
