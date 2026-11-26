// ==========================================
// ★ ダウンロード（パネル一覧 + URL 欄横のボタン & ポップオーバー）
// ==========================================
// ・ファイルの種類ごとの色付きアイコン、進捗バー、速度・残り時間
// ・一時停止 / 再開 / キャンセル / 再試行 / 開く / フォルダに表示 / 一覧から消す
// ・完了したものは localStorage に残し、再起動後も一覧に表示する（ファイルが消えていても一覧には残る）
// ・URL 欄の横のボタンは、ダウンロード中は進捗リング、新しく完了したものがあれば点で知らせる

const DOWNLOADS_KEY = 'archyndium_downloads';
const DOWNLOADS_LIMIT = 100;
const downloadsList = document.getElementById('downloads-list');
const downloadsSearch = document.getElementById('downloads-search');
const dlBubble = document.getElementById('dl-bubble');
const dlBubbleOverlay = document.getElementById('dl-bubble-overlay');
const btnDownloads = document.getElementById('btn-downloads');
let downloads = []; // 新しい順 { id, fileName, url, filePath, totalBytes, receivedBytes, state, startTime, endTime, speed, isPrivate }
let dlUnseen = false;

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimeRemaining(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '計算中...';
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}分${s.toString().padStart(2, '0')}秒`;
}

// 拡張子ごとの色（アイコンに拡張子を表示する）
const DL_TYPE_COLORS = [
    [/^(zip|rar|7z|tar|gz|bz2|xz)$/, '#E5A93B'],
    [/^(exe|msi|dmg|pkg|deb|rpm|appimage|apk)$/, '#6E8BFF'],
    [/^(pdf)$/, '#E5484D'],
    [/^(png|jpe?g|gif|webp|svg|bmp|ico|heic|avif)$/, '#25C2A0'],
    [/^(mp4|mkv|mov|avi|webm|m4v)$/, '#C25EFF'],
    [/^(mp3|wav|flac|m4a|ogg|aac|opus)$/, '#FF6BB5'],
    [/^(docx?|odt|rtf|txt|md)$/, '#3B82F6'],
    [/^(xlsx?|csv|ods)$/, '#22A35A'],
    [/^(pptx?|odp|key)$/, '#F97316'],
];

function fileTypeBadge(name) {
    const ext = ((name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const color = (DL_TYPE_COLORS.find(([re]) => re.test(ext)) || [null, '#8A8A8E'])[1];
    return `<div class="dl-type" style="--dl-color:${color}">${escapeHtml(ext.slice(0, 4).toUpperCase() || 'FILE')}</div>`;
}

function saveDownloads() {
    // ダウンロード中のものは保存しない（再起動するとアプリ側で続きを取れないため）
    const done = downloads.filter(d => d.state !== 'progressing' && d.state !== 'paused' && !d.isPrivate).slice(0, DOWNLOADS_LIMIT);
    // 注意：一覧から消した項目も反映させるため、このウィンドウの一覧をそのまま保存する（他ウィンドウには storage イベントで伝わる）
    try { localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(done)); } catch(e) {}
}

function loadDownloads() {
    // このウィンドウでダウンロード中のものは保存されていないので残す
    const active = downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(DOWNLOADS_KEY)) || []; } catch(e) {}
    downloads = [...active, ...stored.filter(s => !active.some(a => a.id === s.id))];
    renderDownloads();
}

function statusText(d) {
    const total = d.totalBytes > 0 ? formatBytes(d.totalBytes) : '不明';
    if (d.state === 'progressing') {
        const speed = d.speed ? `${formatBytes(d.speed)}/s` : '計算中...';
        const remaining = d.speed > 0 && d.totalBytes > 0 ? ` · 残り ${formatTimeRemaining((d.totalBytes - d.receivedBytes) / d.speed)}` : '';
        return `${formatBytes(d.receivedBytes)} / ${total} · ${speed}${remaining}`;
    }
    if (d.state === 'paused') return `一時停止中 · ${formatBytes(d.receivedBytes)} / ${total}`;
    if (d.state === 'completed' && d.missing) return d.trashed ? 'ファイルを削除しました（ごみ箱へ移動）' : 'ファイルが見つかりません（移動または削除されています）';
    if (d.state === 'completed') return formatBytes(d.totalBytes || d.receivedBytes);
    if (d.state === 'cancelled') return 'キャンセルしました';
    return 'ダウンロードに失敗しました';
}

const DL_ACTION_ICONS = {
    open:   '<path d="M14 3h7v7"></path><path d="M10 14L21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
    pause:  '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>',
    resume: '<polygon points="7 4 20 12 7 20 7 4"></polygon>',
    cancel: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    retry:  '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
    remove: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    trash:  '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
};
const DL_ACTION_LABELS = { open: '開く', folder: 'フォルダに表示', pause: '一時停止', resume: '再開', cancel: 'キャンセル', retry: 'もう一度ダウンロード', remove: '一覧から外す（ファイルはそのまま）', trash: 'ファイルを削除（ごみ箱へ）' };

function downloadActions(d) {
    if (d.state === 'progressing') return ['pause', 'cancel'];
    if (d.state === 'paused') return ['resume', 'cancel'];
    // ▼ 変更：完了したものの「削除」は、一覧から消すのではなく本当にファイルを削除する（ごみ箱へ移動）。
    //   削除後や PC 側で消された物は、一覧に斜線で残す（再ダウンロード・一覧から外すができる）
    if (d.state === 'completed' && !d.missing) return ['open', 'folder', 'trash'];
    return ['retry', 'remove'];
}

// ▼ 追加：いつダウンロードしたか（カードの 3 行目・一覧の日付見出し）
const DL_WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const pad2 = (n) => String(n).padStart(2, '0');
function dlTimeOf(d) {
    return d.endTime || d.startTime || 0;
}
function dlDayKey(t) {
    const x = new Date(t);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}
function dlDayLabel(t) {
    const x = new Date(t), now = new Date();
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const md = `${x.getMonth() + 1}月${x.getDate()}日（${DL_WEEK[x.getDay()]}）`;
    if (dlDayKey(t) === dlDayKey(now)) return `今日 · ${md}`;
    if (dlDayKey(t) === dlDayKey(yest)) return `昨日 · ${md}`;
    return x.getFullYear() === now.getFullYear() ? md : `${x.getFullYear()}年${md}`;
}
function dlWhenText(d) {
    const t = dlTimeOf(d);
    if (!t) return '';
    const x = new Date(t), now = new Date();
    const hm = `${x.getHours()}:${pad2(x.getMinutes())}`;
    const day = dlDayKey(t) === dlDayKey(now) ? '今日' : `${x.getFullYear() !== now.getFullYear() ? x.getFullYear() + '/' : ''}${x.getMonth() + 1}/${x.getDate()}`;
    const verb = d.state === 'progressing' || d.state === 'paused' ? '開始' : d.state === 'completed' ? 'ダウンロード' : '';
    return `${day} ${hm}${verb ? ' ' + verb : ''}`;
}
function dlFullDate(d) {
    const t = dlTimeOf(d);
    if (!t) return '';
    const x = new Date(t);
    return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}（${DL_WEEK[x.getDay()]}）${x.getHours()}:${pad2(x.getMinutes())}:${pad2(x.getSeconds())}`;
}

function downloadCardHtml(d, compact = false) {
    const pct = d.totalBytes > 0 ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : (d.state === 'completed' ? 100 : 0);
    const active = d.state === 'progressing' || d.state === 'paused';
    return `<div class="dl-card state-${d.state} ${d.missing ? 'missing' : ''} ${compact ? 'compact' : ''}" data-dl-id="${d.id}">
        ${fileTypeBadge(d.fileName)}
        <div class="dl-body">
          <div class="dl-name" title="${escapeHtml(d.fileName)}">${escapeHtml(d.fileName)}</div>
          <div class="dl-status">${d.isPrivate ? '<span class="dl-private">PRIVATE</span>' : ''}${d.dangerous && !d.missing ? '<span class="dl-danger" title="プログラムとして実行されるファイルです。開く前に確認します">実行ファイル</span>' : ''}${statusText(d)}</div>
          ${active ? `<div class="dl-bar"><div style="width:${pct}%"></div></div>` : ''}
          ${dlTimeOf(d) ? `<div class="dl-when" title="${dlFullDate(d)}">${dlWhenText(d)}</div>` : ''}
        </div>
        <div class="dl-actions">${downloadActions(d).map(a => `<div class="dl-act ${a}" data-dl-act="${a}" title="${DL_ACTION_LABELS[a]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DL_ACTION_ICONS[a]}</svg></div>`).join('')}</div>
      </div>`;
}

function renderDownloads() {
    const q = (downloadsSearch.value || '').trim().toLowerCase();
    const items = q ? downloads.filter(d => (d.fileName || '').toLowerCase().includes(q) || (d.url || '').toLowerCase().includes(q)) : downloads;
    downloadsList.innerHTML = items.length
        ? items.map((d, i) => {
            // 日付が変わる所に見出しを入れる（新しい順に並んでいる）
            const t = dlTimeOf(d), prev = items[i - 1];
            const head = t && (!prev || !dlTimeOf(prev) || dlDayKey(dlTimeOf(prev)) !== dlDayKey(t)) ? `<div class="dl-day">${dlDayLabel(t)}</div>` : '';
            return head + downloadCardHtml(d);
        }).join('')
        : `<div class="dl-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v11"></path><polyline points="7 10 12 15 17 10"></polyline><path d="M5 20h14"></path></svg>${q ? '一致するダウンロードはありません' : 'ダウンロードはまだありません'}</div>`;
    renderDownloadBubble();
    updateDownloadButton();
}

// 進捗が来るたびに全体を描き直さず、そのカードだけ更新する
function updateDownloadCard(d) {
    document.querySelectorAll(`[data-dl-id="${d.id}"]`).forEach(card => {
        const compact = card.classList.contains('compact');
        card.outerHTML = downloadCardHtml(d, compact);
    });
    updateDownloadButton();
}

function updateDownloadButton() {
    const active = downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
    const total = active.reduce((s, d) => s + (d.totalBytes || 0), 0);
    const got = active.reduce((s, d) => s + (d.receivedBytes || 0), 0);
    btnDownloads.classList.toggle('active', active.length > 0);
    const ring = document.getElementById('dl-ring-fg');
    const circ = 2 * Math.PI * 15;
    ring.style.strokeDasharray = `${circ}`;
    ring.style.strokeDashoffset = `${circ * (1 - (total > 0 ? got / total : 0.15))}`;
    btnDownloads.classList.toggle('indeterminate', active.length > 0 && total === 0);
    document.getElementById('dl-dot').classList.toggle('show', dlUnseen && active.length === 0);
    btnDownloads.title = active.length ? `ダウンロード中（${active.length} 件）` : 'ダウンロード';
}

// ---------- ポップオーバー ----------
function renderDownloadBubble() {
    const recent = downloads.slice(0, 5);
    dlBubble.innerHTML = `
        <div class="dlb-head">最近のダウンロード</div>
        ${recent.length ? recent.map(d => downloadCardHtml(d, true)).join('') : '<div class="dl-empty small">ダウンロードはまだありません</div>'}
        <div class="dlb-all" id="dlb-all">すべてのダウンロードを表示</div>`;
}

function openDownloadBubble() {
    checkDownloadFiles();
    renderDownloadBubble();
    const r = typeof toolbarAnchorRect === 'function' ? toolbarAnchorRect(btnDownloads) : btnDownloads.getBoundingClientRect();   // ▼ 変更：ボタンが「»」に入っている時はその下に出す
    dlBubble.style.top = `${r.bottom + 10}px`;
    dlBubble.style.right = `${Math.max(12, window.innerWidth - r.right - 8)}px`;
    dlBubble.classList.add('show');
    dlBubbleOverlay.classList.add('show');
    dlUnseen = false;
    updateDownloadButton();
}

function closeDownloadBubble() {
    dlBubble.classList.remove('show');
    dlBubbleOverlay.classList.remove('show');
}

btnDownloads.addEventListener('click', (e) => {
    e.stopPropagation();
    dlBubble.classList.contains('show') ? closeDownloadBubble() : openDownloadBubble();
});
dlBubbleOverlay.addEventListener('click', closeDownloadBubble);

// ---------- 操作 ----------
function handleDownloadAction(e) {
    const btn = e.target.closest('[data-dl-act]');
    if (e.target.closest('#dlb-all')) { closeDownloadBubble(); openPanel('panel-downloads'); return; }
    if (!btn) return;
    e.stopPropagation();
    const d = downloads.find(x => x.id === btn.closest('[data-dl-id]').getAttribute('data-dl-id'));
    if (!d) return;
    const act = btn.getAttribute('data-dl-act');
    if (act === 'open') window.electronAPI.openDownloadItem(d.filePath);
    else if (act === 'folder') window.electronAPI.showDownloadItem(d.filePath);
    else if (act === 'pause' || act === 'resume' || act === 'cancel') window.electronAPI.controlDownload(d.id, act);
    else if (act === 'retry') { downloads = downloads.filter(x => x !== d); window.electronAPI.retryDownload(d.url, d.isPrivate); renderDownloads(); saveDownloads(); }
    else if (act === 'remove') { downloads = downloads.filter(x => x !== d); renderDownloads(); saveDownloads(); }
    else if (act === 'trash') trashDownload(d);
}

async function trashDownload(d) {
    const { ok } = await showConfirm({
        title: 'ファイルを削除しますか？', confirmLabel: '削除する', danger: true,
        message: `<b>${escapeHtml(d.fileName)}</b> をごみ箱へ移動します。<br>一覧には削除済みとして残ります。`,
    });
    if (!ok) return;
    const res = await window.electronAPI.trashDownloadFile(d.filePath);
    if (!res.ok) { showToast(`削除できませんでした：${escapeHtml(res.error || '')}`); return; }
    d.missing = true; d.trashed = true;
    updateDownloadCard(d);
    saveDownloads();
}

// ▼ 追加：PC 側でファイルが消されていないか確かめて、消えていたら斜線表示にする
async function checkDownloadFiles() {
    const targets = downloads.filter(d => d.state === 'completed' && d.filePath);
    if (!targets.length || !window.electronAPI?.checkDownloadsExist) return;
    const exists = await window.electronAPI.checkDownloadsExist(targets.map(d => d.filePath));
    let changed = false;
    targets.forEach(d => {
        const missing = exists[d.filePath] === false;
        if (!!d.missing !== missing) { d.missing = missing; if (!missing) d.trashed = false; changed = true; }
    });
    if (changed) { renderDownloads(); saveDownloads(); }
}
// パネル・ポップオーバーを開いた時、ウィンドウに戻ってきた時、パネル表示中は 5 秒ごとに確認する
document.querySelector('.tool-icon[data-panel="panel-downloads"]').addEventListener('click', checkDownloadFiles);
window.addEventListener('focus', checkDownloadFiles);
setInterval(() => { if (document.getElementById('panel-downloads').classList.contains('active') && !document.hidden) checkDownloadFiles(); }, 5000);
downloadsList.addEventListener('click', handleDownloadAction);
dlBubble.addEventListener('click', handleDownloadAction);
// 完了したファイルはカードのダブルクリックでも開ける
downloadsList.addEventListener('dblclick', (e) => {
    const d = downloads.find(x => x.id === e.target.closest('[data-dl-id]')?.getAttribute('data-dl-id'));
    if (d && d.state === 'completed' && !d.missing) window.electronAPI.openDownloadItem(d.filePath);
});
downloadsSearch.addEventListener('input', renderDownloads);
document.getElementById('downloads-clear').addEventListener('click', () => {
    downloads = downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
    renderDownloads();
    saveDownloads();
});

// ---------- main からの通知 ----------
if (window.electronAPI && window.electronAPI.onDownloadStarted) {
    window.electronAPI.onDownloadStarted((data) => {
        downloads.unshift({
            id: data.id, fileName: data.fileName, url: data.url || '', totalBytes: data.totalBytes, receivedBytes: 0,
            state: 'progressing', startTime: data.startTime, isPrivate: !!data.isPrivate, dangerous: !!data.dangerous,
            _lastBytes: 0, _lastTime: data.startTime,
        });
        renderDownloads();
        // Chrome と同じく、始まったらポップオーバーで知らせる
        openDownloadBubble();
    });

    window.electronAPI.onDownloadProgress((data) => {
        const d = downloads.find(x => x.id === data.id);
        if (!d) return;
        if (data.totalBytes !== undefined) d.totalBytes = data.totalBytes;
        if (data.receivedBytes !== undefined) {
            const now = Date.now();
            const dt = (now - d._lastTime) / 1000;
            if (dt > 0.5) { d.speed = (data.receivedBytes - d._lastBytes) / dt; d._lastTime = now; d._lastBytes = data.receivedBytes; }
            d.receivedBytes = data.receivedBytes;
        }
        d.state = data.state === 'interrupted' ? 'progressing' : data.state; // 一時的な中断は自動で再開されることがある
        updateDownloadCard(d);
    });

    window.electronAPI.onDownloadCompleted((data) => {
        const d = downloads.find(x => x.id === data.id);
        if (!d) return;
        d.state = data.state === 'completed' ? 'completed' : data.state === 'cancelled' ? 'cancelled' : 'interrupted';
        d.filePath = data.filePath;
        if (data.totalBytes) d.totalBytes = data.totalBytes;
        if (data.receivedBytes) d.receivedBytes = data.receivedBytes;
        d.endTime = Date.now();
        delete d.speed;
        if (d.state === 'completed' && !dlBubble.classList.contains('show')) dlUnseen = true;
        updateDownloadCard(d);
        saveDownloads();
    });
}

loadDownloads();
checkDownloadFiles();
