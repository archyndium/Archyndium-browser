// ==========================================
// ★ ページの読み込み中の表示
// ==========================================
// 通信が遅い時、ページの場所が真っ白のままで「止まった？」と思わせないようにする。
//  ・ページの上に細い読み込みバー（読み込みが終わるまで）
//  ・まだ何も表示されていない間は、白い画面の代わりに「〇〇 を読み込んでいます」。5 秒以上かかると「接続に時間がかかっています」
//  ・読み込み中はリロードボタンが「×（中止）」に変わる。押した瞬間にボタンが回るので、押したことが分かる
//  ・タブのアイコンも読み込み中は点滅する
const tabLoad = {};   // tabId -> { loading, painted, startedAt }
const pageLoaderEl = document.getElementById('page-loader');
const pageProgressEl = document.getElementById('page-progress');
const reloadBtnEl = document.getElementById('btn-reload');
const RELOAD_ICON = reloadBtnEl.innerHTML;
const STOP_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>';
let loaderTimer = null, slowTimer = null;

function loadState(tabId) { return tabLoad[tabId] || (tabLoad[tabId] = { loading: false, painted: false, startedAt: 0 }); }
function isTabLoading(tabId = activeTabId) { return !!tabLoad[tabId]?.loading; }

function attachLoadingState(tabId, wv) {
    const st = loadState(tabId);
    st.painted = false; st.loading = true; st.startedAt = Date.now();
    const set = (patch) => { Object.assign(st, patch); getTabCard(tabId)?.classList.toggle('loading', st.loading); if (tabId === activeTabId) refreshPageLoading(); };
    wv.addEventListener('did-start-loading', () => set({ loading: true, startedAt: Date.now() }));
    wv.addEventListener('did-stop-loading', () => set({ loading: false, painted: true }));
    // 新しいページに切り替わった（前のページが消えた）瞬間から、中身が出るまでの間
    wv.addEventListener('did-navigate', () => set({ painted: false }));
    wv.addEventListener('dom-ready', () => set({ painted: true }));
    wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame !== false) set({ painted: true }); });
}

function placeOver(el, wv) {
    const c = document.getElementById('webview-container').getBoundingClientRect(), r = wv.getBoundingClientRect();
    if (!r.width) return false;
    Object.assign(el.style, { left: `${r.left - c.left}px`, top: `${r.top - c.top}px`, width: `${r.width}px`, height: el === pageProgressEl ? '' : `${r.height}px` });
    return true;
}

function refreshPageLoading() {
    const id = activeTabId, st = id && tabLoad[id], wv = id && webviews[id];
    const loading = !!(st && st.loading && wv);
    // リロードボタン ⇔ 中止ボタン
    const want = loading ? 'stop' : 'reload';
    if (reloadBtnEl.dataset.mode !== want) {
        reloadBtnEl.dataset.mode = want;
        reloadBtnEl.innerHTML = loading ? STOP_ICON : RELOAD_ICON;
        reloadBtnEl.title = loading ? '読み込みを中止' : '再読み込み';
    }
    // 読み込みバー
    pageProgressEl.classList.toggle('show', loading && placeOver(pageProgressEl, wv));
    // まだ何も表示されていない間の案内（すぐ終わる時はちらつかないよう、少し待ってから出す）
    const blank = loading && !st.painted;
    clearTimeout(loaderTimer); clearTimeout(slowTimer);
    if (!blank) { pageLoaderEl.classList.remove('show', 'slow'); return; }
    let host = '';
    try { host = new URL(getTabCard(id)?.getAttribute('data-url') || wv.getAttribute('src') || '').hostname.replace(/^www\./, ''); } catch (e) {}
    pageLoaderEl.querySelector('.pl-host').textContent = host ? `${host} を読み込んでいます` : '読み込んでいます';
    const elapsed = Date.now() - st.startedAt;
    loaderTimer = setTimeout(() => { if (placeOver(pageLoaderEl, wv)) pageLoaderEl.classList.add('show'); }, Math.max(0, 180 - elapsed));
    if (elapsed >= 5000) pageLoaderEl.classList.add('slow');
    else { pageLoaderEl.classList.remove('slow'); slowTimer = setTimeout(() => pageLoaderEl.classList.add('slow'), 5000 - elapsed); }
}
window.addEventListener('resize', () => { if (pageLoaderEl.classList.contains('show') || pageProgressEl.classList.contains('show')) refreshPageLoading(); });
pageLoaderEl.querySelector('.pl-retry').addEventListener('click', () => { const wv = webviews[activeTabId]; if (wv) { wv.stop(); wv.reload(); } });

// リロードボタン：読み込み中は中止、それ以外は再読み込み。押した瞬間に回して、押したことが分かるようにする
function pressReload() {
    const wv = activeTabId && webviews[activeTabId];
    if (!wv) return;
    if (isTabLoading()) { wv.stop(); return; }
    reloadBtnEl.classList.remove('spin'); void reloadBtnEl.offsetWidth; reloadBtnEl.classList.add('spin');
    wv.reload();
}
