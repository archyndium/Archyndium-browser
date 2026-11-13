// ==========================================
// ★ 履歴（保存・表示・検索・まとめて削除）
// ==========================================
// 1 件 = { url, title, time, favicon }。新しい順に最大 500 件を localStorage に保存する。
// ▼ 追加：期間を指定して消去（1時間 / 24時間 / 7日間 / すべて）、チェックして選んだ項目の削除、
//         1 件ずつの削除（× ボタン・右クリック）、キーワード検索、日付ごとの見出し
const HISTORY_KEY = 'archyndium_history';
const HISTORY_LIMIT = 500;
const historyList = document.getElementById('history-list');
const historySearch = document.getElementById('history-search');
let historyData = [];
let historySelectMode = false;
const historySelected = new Set();

function loadHistory() {
    try {
        historyData = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        if (!Array.isArray(historyData)) historyData = [];
    } catch(e) {
        historyData = [];
        localStorage.removeItem(HISTORY_KEY);
    }
    historyData = historyData.filter(h => h && h.url);
    renderHistory();
}

function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historyData)); } catch(e) {}
}

function readStoredHistory() {
    try { const d = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(d) ? d.filter(h => h && h.url) : []; } catch(e) { return []; }
}

function addHistory(url, title) {
    if (!url || url.startsWith('chrome-error') || url.startsWith('about:')) return;
    historyData = readStoredHistory(); // 別ウィンドウで増えた分を消さないよう、保存済みの最新から書き足す
    const prev = historyData.find(h => h.url === url);
    historyData = historyData.filter(h => h.url !== url);
    historyData.unshift({ url, title: title || url, time: Date.now(), favicon: prev?.favicon || '' });
    if (historyData.length > HISTORY_LIMIT) historyData.length = HISTORY_LIMIT;
    saveHistory();
    renderHistory();
}

// 記録した時点ではまだ前のページのタイトルのことが多いので、タイトル・アイコンが決まったら更新する
function updateHistoryEntry(url, patch) {
    historyData = readStoredHistory();
    const h = historyData.find(e => e.url === url);
    if (!h) return;
    Object.assign(h, patch);
    saveHistory();
    renderHistory();
}

function dayLabel(time) {
    if (!time) return '以前';
    const d = new Date(time), today = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((start(today) - start(d)) / 86400000);
    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}

function timeLabel(time) {
    if (!time) return '';
    const d = new Date(time);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let renderHistoryTimer = null;
function renderHistory() {
    // 連続で呼ばれても描画は 1 回にまとめる
    clearTimeout(renderHistoryTimer);
    renderHistoryTimer = setTimeout(renderHistoryNow, 30);
}

function renderHistoryNow() {
    const q = (historySearch.value || '').trim().toLowerCase();
    const items = q ? historyData.filter(h => h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q)) : historyData;
    let html = '';
    let lastDay = null;
    for (const h of items) {
        const day = dayLabel(h.time);
        if (day !== lastDay) { html += `<div class="list-section-title">${day}</div>`; lastDay = day; }
        html += `<div class="tab-card history-item ${historySelected.has(h.url) ? 'selected' : ''}" data-url="${escapeHtml(h.url)}">
            ${historySelectMode ? `<span class="hist-check"></span>` : ''}
            ${siteIconHtml(h.url, h.favicon)}
            <div class="hist-text"><span class="tab-title">${escapeHtml(h.title || h.url)}</span><span class="hist-url">${escapeHtml(h.url.replace(/^https?:\/\/(www\.)?/, ''))}</span></div>
            <span class="hist-time">${timeLabel(h.time)}</span>
            <span class="hist-remove" title="この履歴を削除">×</span>
          </div>`;
    }
    if (!items.length) html = `<div class="setting-empty" style="padding:16px 4px;">${q ? '一致する履歴はありません。' : '履歴はありません。'}</div>`;
    historyList.innerHTML = html;
    historyList.classList.toggle('select-mode', historySelectMode);
    updateHistoryBar();
}

function updateHistoryBar() {
    const bar = document.getElementById('history-select-bar');
    bar.classList.toggle('show', historySelectMode);
    document.getElementById('history-select-count').textContent = `${historySelected.size} 件選択`;
    document.getElementById('history-delete-selected').classList.toggle('disabled', historySelected.size === 0);
    document.getElementById('history-select-toggle').classList.toggle('active', historySelectMode);
}

function deleteHistory(urls) {
    const set = new Set(urls);
    historyData = historyData.filter(h => !set.has(h.url));
    urls.forEach(u => historySelected.delete(u));
    saveHistory();
    renderHistory();
}

async function clearHistoryRange(ms, label) {
    const { ok } = await showConfirm({
        title: '履歴を消去',
        message: `<b>${label}</b>の閲覧履歴を消去します。この操作は元に戻せません。`,
        confirmLabel: '消去する', danger: true,
    });
    if (!ok) return;
    const since = ms === Infinity ? 0 : Date.now() - ms;
    // 時刻が記録されていない古い履歴は「すべて」の時だけ消す
    historyData = ms === Infinity ? [] : historyData.filter(h => !(h.time && h.time >= since));
    historySelected.clear();
    saveHistory();
    renderHistory();
}

function setHistorySelectMode(on) {
    historySelectMode = on;
    historySelected.clear();
    renderHistoryNow();
}

// クリック：選択モード中はチェックの切り替え、× は削除（どちらもページ移動より先に処理する）
historyList.addEventListener('click', (e) => {
    const card = e.target.closest('.history-item');
    if (!card) return;
    const url = card.getAttribute('data-url');
    if (e.target.closest('.hist-remove')) { e.stopPropagation(); deleteHistory([url]); return; }
    if (historySelectMode) {
        e.stopPropagation();
        historySelected.has(url) ? historySelected.delete(url) : historySelected.add(url);
        card.classList.toggle('selected', historySelected.has(url));
        updateHistoryBar();
    }
}, true);

historyList.addEventListener('contextmenu', async (e) => {
    const card = e.target.closest('.history-item');
    if (!card || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const url = card.getAttribute('data-url');
    const host = siteHostOf(url);
    const choice = await window.electronAPI.popupMenu([
        { id: 'new-tab', label: '新しいタブで開く' },
        { id: 'private', label: 'シークレットタブで開く' },
        { id: 'copy', label: 'URL をコピー' },
        { type: 'separator' },
        { id: 'delete', label: 'この履歴を削除' },
        { id: 'delete-site', label: `${host} の履歴をすべて削除`, enabled: !!host },
    ]);
    if (choice === 'new-tab') openNewTab(url);
    else if (choice === 'private') openNewTab(url, { isPrivate: true });
    else if (choice === 'copy') navigator.clipboard.writeText(url).catch(() => {});
    else if (choice === 'delete') deleteHistory([url]);
    else if (choice === 'delete-site') deleteHistory(historyData.filter(h => siteHostOf(h.url) === host).map(h => h.url));
});

historySearch.addEventListener('input', renderHistory);
document.getElementById('history-select-toggle').addEventListener('click', () => setHistorySelectMode(!historySelectMode));
document.getElementById('history-select-cancel').addEventListener('click', () => setHistorySelectMode(false));
document.getElementById('history-select-all').addEventListener('click', () => {
    const visible = [...historyList.querySelectorAll('.history-item')].map(c => c.getAttribute('data-url'));
    const allOn = visible.every(u => historySelected.has(u));
    visible.forEach(u => allOn ? historySelected.delete(u) : historySelected.add(u));
    renderHistoryNow();
});
document.getElementById('history-delete-selected').addEventListener('click', async () => {
    if (!historySelected.size) return;
    const { ok } = await showConfirm({ title: '選択した履歴を削除', message: `<b>${historySelected.size} 件</b>の履歴を削除します。`, confirmLabel: '削除する', danger: true });
    if (ok) { deleteHistory([...historySelected]); setHistorySelectMode(false); }
});
document.getElementById('history-clear').addEventListener('click', async () => {
    const choice = await window.electronAPI.popupMenu([
        { id: 'hour', label: '過去 1 時間' },
        { id: 'day', label: '過去 24 時間' },
        { id: 'week', label: '過去 7 日間' },
        { type: 'separator' },
        { id: 'all', label: 'すべての履歴' },
    ]);
    const ranges = { hour: [3600e3, '過去 1 時間'], day: [86400e3, '過去 24 時間'], week: [7 * 86400e3, '過去 7 日間'], all: [Infinity, 'すべての期間'] };
    if (ranges[choice]) clearHistoryRange(...ranges[choice]);
});

loadHistory();
