// ==========================================
// ★ アドレスバー：検索エンジン & 入力候補
// ==========================================
// 入力が URL らしければそのページを開き、それ以外は設定で選んだ検索エンジンで検索する。
// （以前は「google」のようにドットの無い単語も https://google として開こうとして失敗していた）
// 入力中は「検索」「検索候補」「履歴・ブックマークの一致」を候補として表示する。↑↓ で選択、Enter で決定、Esc で閉じる。

const SEARCH_ENGINE_KEY = 'archyndium_search_engine';
const SEARCH_SUGGEST_KEY = 'archyndium_search_suggest';

const SEARCH_ENGINES = [
    { id: 'google',     name: 'Google',         home: 'https://www.google.com/',      search: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { id: 'bing',       name: 'Bing',           home: 'https://www.bing.com/',        search: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { id: 'duckduckgo', name: 'DuckDuckGo',     home: 'https://duckduckgo.com/',      search: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
    { id: 'yahoo',      name: 'Yahoo! JAPAN',   home: 'https://www.yahoo.co.jp/',     search: q => `https://search.yahoo.co.jp/search?p=${encodeURIComponent(q)}` },
    { id: 'brave',      name: 'Brave Search',   home: 'https://search.brave.com/',    search: q => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
    { id: 'ecosia',     name: 'Ecosia',         home: 'https://www.ecosia.org/',      search: q => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}` },
    { id: 'startpage',  name: 'Startpage',      home: 'https://www.startpage.com/',   search: q => `https://www.startpage.com/do/search?q=${encodeURIComponent(q)}` },
];

// ふだんの検索エンジン
function normalEngine() {
    let id = 'google';
    try { id = localStorage.getItem(SEARCH_ENGINE_KEY) || 'google'; } catch(e) {}
    return SEARCH_ENGINES.find(e => e.id === id) || SEARCH_ENGINES[0];
}

// ▼ 追加：シークレットタブで使う検索エンジン（初期値 DuckDuckGo。'same' はふだんと同じ）
//   検索した言葉を記録・追跡しないとしている検索エンジンを使うと、シークレットタブでの検索がより残りにくくなる
const PRIVATE_ENGINE_KEY = 'archyndium_private_search_engine';
function privateEngineSetting() {
    try { return localStorage.getItem(PRIVATE_ENGINE_KEY) || 'duckduckgo'; } catch(e) { return 'duckduckgo'; }
}
function privateEngine() {
    const id = privateEngineSetting();
    return id === 'same' ? normalEngine() : (SEARCH_ENGINES.find(e => e.id === id) || normalEngine());
}
function setPrivateEngine(id) {
    try { localStorage.setItem(PRIVATE_ENGINE_KEY, id); } catch(e) {}
    updateOmnibarPlaceholder();
}

// 表示中のタブに合わせた検索エンジン（シークレットタブならシークレット用）
function currentEngine() {
    return typeof activeTabId !== 'undefined' && activeTabId && typeof isPrivateTab === 'function' && isPrivateTab(activeTabId) ? privateEngine() : normalEngine();
}

function setSearchEngine(id) {
    localStorage.setItem(SEARCH_ENGINE_KEY, id);
    updateOmnibarPlaceholder();
}

function searchSuggestEnabled() {
    try { return localStorage.getItem(SEARCH_SUGGEST_KEY) !== 'off'; } catch(e) { return true; }
}

function setSearchSuggestEnabled(on) {
    localStorage.setItem(SEARCH_SUGGEST_KEY, on ? 'on' : 'off');
}

// 新しいタブで開くページ（選んだ検索エンジンのトップ）
function getHomeUrl() {
    return currentEngine().home;
}

function updateOmnibarPlaceholder() {
    urlInput.placeholder = `${currentEngine().name} で検索、または URL を入力`;
}

// 入力 → 開く URL。URL らしくなければ検索 URL を返す
function resolveOmniboxInput(text) {
    const t = text.trim();
    if (!t) return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|data|file|view-source|mailto):/i.test(t)) return t;
    if (/\s/.test(t)) return currentEngine().search(t);
    // localhost・IP アドレス（ポート・パス付きも）
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
    // example.com / example.co.jp/path / sub.example.dev:8080 など（TLD は英字 2 文字以上）
    if (/^([a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
    return currentEngine().search(t);
}

function navigateActiveTab(url) {
    if (!url) return;
    if (activeTabId && webviews[activeTabId]) webviews[activeTabId].src = url;
    else openNewTab(url);
}

// ---------- 候補ドロップダウン ----------
const omniSuggest = document.getElementById('omni-suggest');
let omniItems = [];      // { kind: 'search' | 'suggest' | 'history' | 'bookmark', text, url, sub }
let omniSelected = 0;
let omniSeq = 0;
let omniTyped = '';      // ユーザーが実際に打った文字（↑↓ で選択中は入力欄の表示が変わるため）

function localMatches(q) {
    const needle = q.toLowerCase();
    const out = [];
    const seen = new Set();
    const push = (kind, url, title) => {
        if (!url || seen.has(url)) return;
        if (!(url.toLowerCase().includes(needle) || (title || '').toLowerCase().includes(needle))) return;
        seen.add(url);
        out.push({ kind, url, text: title || url, sub: url.replace(/^https?:\/\/(www\.)?/, '') });
    };
    document.querySelectorAll('#bookmarks-list .bookmark-item').forEach(el => push('bookmark', el.getAttribute('data-url'), el.querySelector('.tab-title')?.textContent));
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('archyndium_history')) || []; } catch(e) {}
    hist.forEach(h => push('history', h.url, h.title));
    return out.slice(0, 5);
}

const OMNI_ICONS = {
    search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    suggest: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    history: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
    url: '<circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>',
};

function renderOmniSuggest() {
    if (!omniItems.length || document.activeElement !== urlInput) { omniSuggest.classList.remove('show'); return; }
    omniSuggest.innerHTML = omniItems.map((it, i) => `
        <div class="os-item ${i === omniSelected ? 'selected' : ''}" data-os="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${OMNI_ICONS[it.kind] || OMNI_ICONS.url}</svg>
          <span class="os-text">${escapeHtml(it.text)}</span>
          ${it.sub ? `<span class="os-sub">${escapeHtml(it.sub)}</span>` : ''}
        </div>`).join('');
    omniSuggest.classList.add('show');
}

async function updateOmniSuggest() {
    const q = urlInput.value.trim();
    omniTyped = urlInput.value;
    const seq = ++omniSeq;
    if (!q) { omniItems = []; renderOmniSuggest(); return; }

    const engine = currentEngine();
    const resolved = resolveOmniboxInput(q);
    const isSearch = resolved === engine.search(q);
    const first = isSearch
        ? { kind: 'search', text: q, sub: `${engine.name} で検索`, url: resolved }
        : { kind: 'url', text: q, sub: '開く', url: resolved };
    omniItems = [first, ...localMatches(q)];
    omniSelected = 0;
    renderOmniSuggest();

    if (!searchSuggestEnabled() || !window.electronAPI?.searchSuggest) return;
    if (activeTabId && isPrivateTab(activeTabId)) return; // シークレットタブでは、入力中の文字を検索候補のために送らない
    const remote = await window.electronAPI.searchSuggest(engine.id, q);
    if (seq !== omniSeq) return; // 入力が進んでいたら捨てる
    const suggestions = remote.filter(s => s.toLowerCase() !== q.toLowerCase()).slice(0, 5)
        .map(s => ({ kind: 'suggest', text: s, url: engine.search(s) }));
    omniItems = [first, ...suggestions, ...omniItems.slice(1)];
    renderOmniSuggest();
}

function closeOmniSuggest() {
    omniSeq++;
    omniItems = [];
    omniSuggest.classList.remove('show');
}

function commitOmnibox(item) {
    const url = item ? item.url : resolveOmniboxInput(urlInput.value);
    closeOmniSuggest();
    if (!url) return;
    navigateActiveTab(url);
    urlInput.blur();
}

urlInput.addEventListener('input', updateOmniSuggest);
urlInput.addEventListener('focus', () => { urlInput.select(); });
urlInput.addEventListener('blur', () => setTimeout(closeOmniSuggest, 150)); // 候補クリックを先に処理させる

urlInput.addEventListener('keydown', (e) => {
    const open = omniSuggest.classList.contains('show') && omniItems.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!open) return;
        e.preventDefault();
        omniSelected = (omniSelected + (e.key === 'ArrowDown' ? 1 : -1) + omniItems.length) % omniItems.length;
        const it = omniItems[omniSelected];
        urlInput.value = omniSelected === 0 ? omniTyped : (it.kind === 'suggest' ? it.text : it.url);
        renderOmniSuggest();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        // Ctrl+Enter：www.〇〇.com を補完（ブラウザ共通の操作）
        if (e.ctrlKey && /^[a-z0-9-]+$/i.test(urlInput.value.trim())) { commitOmnibox({ url: `https://www.${urlInput.value.trim()}.com/` }); return; }
        commitOmnibox(open && omniSelected > 0 ? omniItems[omniSelected] : null);
    } else if (e.key === 'Escape') {
        if (open) { e.preventDefault(); closeOmniSuggest(); urlInput.value = omniTyped; }
        else { const card = activeTabId && getTabCard(activeTabId); if (card) urlInput.value = card.getAttribute('data-url') || ''; urlInput.blur(); }
    }
});

omniSuggest.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-os]');
    if (!el) return;
    e.preventDefault(); // blur より先に処理する
    commitOmnibox(omniItems[Number(el.getAttribute('data-os'))]);
});

updateOmnibarPlaceholder();
