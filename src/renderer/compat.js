// ==========================================
// ★ 他のブラウザとの互換・不足機能の補い（画面側）
// ==========================================
//   ・設定 > Browser … 既定のブラウザにする / ブックマークの取り込み・書き出し
//   ・設定 > できないこと … このブラウザでできないことと、その理由・代わりの方法の一覧
//   ・PDF として保存（コマンドパレット）
//   ・Netflix など保護された動画（DRM）のサイトを開いた時の案内
//   ・他のアプリから渡された URL を起動時に開く

let drmAvailable = false;
window.electronAPI?.drmStatus?.().then(s => { drmAvailable = !!s?.widevine; }).catch(() => {});

// ---------- ブックマークの取り込み・書き出し ----------
function readStoredBookmarks() {
    try { return JSON.parse(localStorage.getItem('archyndium_bookmarks')) || []; } catch (e) { return []; }
}

// 取り込んだフォルダを「Chrome · ブックマーク バー」のような名前で追加する（同じ URL は重複させない）
function importBookmarkFolders(folders, sourceLabel) {
    const data = readStoredBookmarks();
    const existing = new Set(data.flatMap(f => (f.items || []).map(i => i.url)));
    let added = 0;
    (folders || []).forEach(f => {
        const items = (f.items || []).filter(i => i.url && !existing.has(i.url));
        if (!items.length) return;
        items.forEach(i => existing.add(i.url));
        const name = `${sourceLabel} · ${f.name}`;
        let target = data.find(x => x.name === name);
        if (!target) data.push(target = { name, items: [] });
        target.items.push(...items.map(i => ({ url: i.url, title: i.title || i.url, favicon: '' })));
        added += items.length;
    });
    localStorage.setItem('archyndium_bookmarks', JSON.stringify(data));
    loadBookmarks();
    if (typeof refreshBookmarkStar === 'function') refreshBookmarkStar();
    return added;
}

async function openBookmarkImport() {
    const sources = await window.electronAPI.bookmarkSources();
    const items = sources.map(s => ({ id: 'src:' + s.id, label: `${s.label}（${s.count} 件）` }));
    if (items.length) items.push({ type: 'separator' });
    items.push({ id: 'html', label: 'HTML ファイルから（Firefox・Safari などで書き出したもの）…' });
    const choice = await window.electronAPI.popupMenu(items);
    if (!choice) return;
    let folders = null, label = '';
    if (choice === 'html') {
        folders = await window.electronAPI.importBookmarkHtml();
        label = '取り込み';
    } else {
        const src = sources.find(s => 'src:' + s.id === choice);
        folders = await window.electronAPI.readBookmarkSource(src.id);
        label = src.browser;
    }
    if (!folders) return;
    const n = importBookmarkFolders(folders, label);
    showToast(n ? `${n} 件のブックマークを取り込みました` : '新しく取り込むブックマークはありませんでした（すべて登録済み）');
    if (n) openPanel('panel-bookmarks');
}

async function exportBookmarks() {
    const file = await window.electronAPI.exportBookmarkHtml(readStoredBookmarks());
    if (file) showToast('ブックマークを書き出しました', { actionLabel: 'フォルダを開く', action: () => window.electronAPI.showFile(file) });
}

// ---------- 既定のブラウザ ----------
async function makeDefaultBrowser() {
    const r = await window.electronAPI.setDefaultBrowser();
    if (!r?.ok) { showToast(`設定できませんでした：${escapeHtml(r?.error || '')}`); return; }
    if (r.needsUser) showToast('Windows の「既定のアプリ」が開きます。ARCHYNDIUM Browser を選んでください', { timeout: 8000 });
    else showToast('既定のブラウザに設定しました');
}

// ---------- PDF として保存 ----------
async function savePageAsPdf() {
    const wv = webviews[activeTabId];
    if (!wv) return;
    const title = getTabCard(activeTabId)?.querySelector('.tab-title')?.textContent || 'page';
    const file = await window.electronAPI.printToPdf(wv.getWebContentsId(), title).catch(() => null);
    if (file) showToast('PDF として保存しました', { actionLabel: 'フォルダを開く', action: () => window.electronAPI.showFile(file) });
}

// ---------- 保護された動画・音楽（DRM）のサイト ----------
const DRM_SITES = /(^|\.)(netflix\.com|primevideo\.com|disneyplus\.com|hulu\.jp|hulu\.com|unext\.jp|tv\.dmm\.com|tv\.apple\.com|music\.apple\.com|open\.spotify\.com|dazn\.com|max\.com|crunchyroll\.com|music\.amazon\.co\.jp|music\.amazon\.com|lemino\.docomo\.ne\.jp|fod\.fujitv\.co\.jp|telasa\.jp|wowow\.co\.jp)$/;
const drmNotified = new Set();
function notifyDrmSite(tabId, url) {
    if (drmAvailable || tabId !== activeTabId) return;
    let host = '';
    try { host = new URL(url).hostname; } catch (e) { return; }
    // Amazon は Prime Video のページだけ
    const isPrimeVideo = /(^|\.)amazon\.(co\.jp|com)$/.test(host) && /\/(gp\/video|Amazon-Video|-\/[a-z]+\/gp\/video)/i.test(url);
    if (!DRM_SITES.test(host) && !isPrimeVideo) return;
    const key = isPrimeVideo ? 'primevideo' : host;
    if (drmNotified.has(key)) return;
    drmNotified.add(key);
    showToast('このサービスの動画・音楽は著作権保護（DRM）のため、今の ARCHYNDIUM では再生できない場合があります', {
        actionLabel: '詳しく', timeout: 9000,
        action: () => { openPanel('panel-settings'); renderLimitations(); setTimeout(() => document.getElementById('limitations-list')?.scrollIntoView({ behavior: 'smooth' }), 100); },
    });
}
tabUrlChangeHooks.push(notifyDrmSite);

// ---------- 設定：Browser（既定のブラウザ・ブックマーク） ----------
async function renderBrowserSettings() {
    const box = document.getElementById('browser-options');
    if (!box) return;
    const isDefault = await window.electronAPI?.isDefaultBrowser?.().catch(() => false);
    const upd = await window.electronAPI?.getUpdateState?.().catch(() => null) || {};
    // Microsoft Store 版では「既定のブラウザにする」は使えないので出さない
    const appInfo = await window.electronAPI?.appInfo?.().catch(() => null) || {};
    box.innerHTML =
        settingRow({ icon: '↻', label: `アップデートを確認（現在 v${escapeHtml(upd.current || '')}）`, sub: updateStatusText(upd), attrs: 'data-compat="update"' }) +
        (appInfo.store ? '' : settingRow({ icon: '◎', label: '既定のブラウザにする', sub: isDefault ? '現在、既定のブラウザです' : '他のアプリでリンクを開いた時に ARCHYNDIUM で開きます', attrs: 'data-compat="default"', checked: !!isDefault })) +
        settingRow({ icon: '⇣', label: 'ブックマークを取り込む', sub: 'Chrome・Edge・Brave・Opera・Vivaldi から直接 / HTML ファイルから', attrs: 'data-compat="import"' }) +
        settingRow({ icon: '⇡', label: 'ブックマークを書き出す', sub: '他のブラウザで読み込める HTML 形式', attrs: 'data-compat="export"' });
}

// ---------- 設定：このブラウザでできないこと ----------
const LIMITATIONS = [
    { title: 'Netflix・Prime Video・Disney+・Spotify（Web 版）などの再生', status: () => drmAvailable ? 'ok' : 'no',
      why: '映画・音楽の配信サービスは、コピーを防ぐ「Widevine」という Google の部品が必要です。通常の Electron には入っていません。',
      fix: () => drmAvailable ? 'Widevine 入りの Electron で動いているので再生できます。' : 'Widevine 入りの「castLabs 版 Electron」（無料）に切り替えると再生できるようになります。アプリ側は対応済みなので、package.json の electron を差し替えるだけです。' },
    { title: 'Google アカウントでの同期（ブックマーク・パスワードなど）', status: () => 'part',
      why: 'Chrome の同期機能は Google が他のブラウザに開放していません。',
      fix: () => '設定 > Browser から、Chrome・Edge・Brave・Opera のブックマークを取り込めます。書き出しもできます。' },
    { title: 'パスワードの保存・自動入力', status: () => 'no',
      why: 'Electron にはパスワード管理の機能が入っていません。',
      fix: () => 'OS やサービスのパスワード管理（Windows Hello・Google パスワード マネージャーなど）を併用してください。安全に作るには慎重な設計が必要なため、今後の候補です。' },
    { title: 'サイトを閉じている間のプッシュ通知', status: () => 'part',
      why: 'Chrome のプッシュ通知は Google の通知サーバーを使うため、他のブラウザからは使えません。',
      fix: () => 'サイトを開いている間の通知は表示できます。' },
    { title: 'Chromecast（テレビへのキャスト）', status: () => 'no',
      why: 'キャスト機能は Chrome 専用の部品です。', fix: () => '代わりの方法はありません。キャストは Chrome をお使いください。' },
    { title: '危険なサイトの警告（セーフブラウジング）', status: () => 'part',
      why: 'Google のセーフブラウジングは Chrome 専用の仕組みです。',
      fix: () => 'Shield（AEGIS）のフィルターに、マルウェア・詐欺サイトのリストを含めています。' },
    { title: 'Chrome ウェブストアの拡張機能', status: () => 'part',
      why: 'Electron が対応している拡張機能の機能は Chrome の一部だけです。',
      fix: () => 'ページに機能を足す・見た目を変える種類は使えます（設定 > Extensions）。' },
    { title: 'Web アプリのインストール（PWA）', status: () => 'part',
      why: 'Chrome の「アプリとしてインストール」は Chrome 専用です。', fix: () => 'Work / Focus にサイトを登録すると、アプリのように開けます。' },
    { title: 'Google のログインが拒否されることがある', status: () => 'part',
      why: 'Google は Chrome 以外の一部のブラウザからのログインを制限しています。',
      fix: () => 'ブラウザの名乗り方（User-Agent）を調整済みです。それでも拒否された場合は、そのサイトだけ他のブラウザでログインしてください。' },
    { title: '他のアプリからリンクを開く（既定のブラウザ）', status: () => 'ok', why: '', fix: () => '対応しました（設定 > Browser）。' },
    { title: 'PDF の表示・PDF として保存', status: () => 'ok', why: '', fix: () => '対応しました（PDF はタブで表示。保存はコマンドパレットの「PDF として保存」）。' },
];

function renderLimitations() {
    const box = document.getElementById('limitations-list');
    if (!box) return;
    const BADGE = { ok: ['できる', 'lim-ok'], part: ['一部できる', 'lim-part'], no: ['できない', 'lim-no'] };
    box.innerHTML = LIMITATIONS.map(l => {
        const [text, cls] = BADGE[l.status()];
        return `<div class="lim-item">
            <div class="lim-head"><span class="lim-badge ${cls}">${text}</span><b>${escapeHtml(l.title)}</b></div>
            ${l.why ? `<div class="lim-why">${escapeHtml(l.why)}</div>` : ''}
            <div class="lim-fix">→ ${escapeHtml(l.fix())}</div>
          </div>`;
    }).join('');
}

document.getElementById('browser-options').addEventListener('click', (e) => {
    e.stopPropagation();
    const act = e.target.closest('[data-compat]')?.getAttribute('data-compat');
    if (act === 'default') makeDefaultBrowser().then(renderBrowserSettings);
    else if (act === 'update') checkUpdateNow();
    else if (act === 'import') openBookmarkImport();
    else if (act === 'export') exportBookmarks();
});
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', () => {
    renderBrowserSettings();
    renderLimitations();
    renderAboutVersion();
});

// ---------- バージョン情報 ----------
async function renderAboutVersion() {
    const s = await window.electronAPI?.getUpdateState?.().catch(() => null);
    if (s?.current) document.getElementById('about-version').textContent = `バージョン ${s.current}`;
}

function openAbout() {
    openPanel('panel-settings');
    renderAboutVersion();
    setTimeout(() => document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ---------- 起動時に他のアプリから渡された URL を開く ----------
setTimeout(async () => {
    const urls = await window.electronAPI?.takeStartupUrls?.().catch(() => []) || [];
    for (const url of urls) await openNewTab(url);
}, 1500);

// ---------- アップデート（main/updater.js） ----------
function updateStatusText(s) {
    switch (s?.status) {
        case 'unsupported': return s.reason === 'store' ? 'Microsoft Store が自動で更新します' : '開発版のため自動更新はオフです';
        case 'checking': return '確認しています…';
        case 'none': return '最新の版です';
        case 'downloading': return `新しい版 v${escapeHtml(s.version)} をダウンロードしています…`;
        case 'ready': return `v${escapeHtml(s.version)} の準備ができました。クリックで再起動して更新`;
        case 'error': return '確認できませんでした（ネットワークを確認してください）';
        default: return '起動時と 6 時間ごとに自動で確認します';
    }
}

async function checkUpdateNow() {
    const s = await window.electronAPI.getUpdateState();
    if (s.status === 'ready') { window.electronAPI.installUpdate(); return; }
    const r = await window.electronAPI.checkForUpdate();
    if (r.status === 'unsupported' || r.status === 'none' || r.status === 'error') showToast(updateStatusText(r));
    renderBrowserSettings();
}

let updateToastShown = false;
window.electronAPI?.onUpdateState?.((s) => {
    if (s.status === 'ready' && !updateToastShown) {
        updateToastShown = true;
        showToast(`新しい版 v${escapeHtml(s.version)} の準備ができました`, {
            actionLabel: '再起動して更新', timeout: 15000, action: () => window.electronAPI.installUpdate(),
        });
    }
    if (document.getElementById('panel-settings').classList.contains('active')) renderBrowserSettings();
});
