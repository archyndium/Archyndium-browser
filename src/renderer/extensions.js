// ==========================================
// ★ 拡張機能（ツールバーのボタン・設定画面・ウェブストアからの追加）
// ==========================================
// 読み込みやインストールの本体は main/extensions.js。ここは画面の表示だけ。
//   ・URL 欄の横のパズルボタン … 入れた拡張機能の一覧。押すとその拡張機能の小窓（ポップアップ）を開く
//   ・設定 > Extensions … ウェブストアの URL / .crx / フォルダから追加、オン・オフ、削除
//   ・Chrome ウェブストアの拡張機能のページを開くと「ARCHYNDIUM に追加」を出す

const btnExtensions = document.getElementById('btn-extensions');
const extMenu = document.createElement('div');
extMenu.className = 'ext-menu';
document.body.appendChild(extMenu);
let extList = [];

const EXT_PUZZLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12h-1.5a1.5 1.5 0 0 1 0-3H20V5a1 1 0 0 0-1-1h-4v1.5a1.5 1.5 0 0 1-3 0V4H8a1 1 0 0 0-1 1v4H5.5a1.5 1.5 0 0 0 0 3H7v4H5.5a1.5 1.5 0 0 0 0 3H7v1a1 1 0 0 0 1 1h4v-1.5a1.5 1.5 0 0 1 3 0V21h4a1 1 0 0 0 1-1z"></path></svg>';

async function refreshExtensions() {
    extList = await window.electronAPI?.listExtensions?.().catch(() => []) || [];
    btnExtensions.classList.toggle('has-ext', extList.some(e => e.enabled));
    if (extMenu.classList.contains('show')) renderExtMenu();
    if (document.getElementById('panel-settings').classList.contains('active')) renderExtensionSettings();
}

function extIconHtml(e, size = 18) {
    return e.icon ? `<img src="${escapeHtml(e.icon)}" width="${size}" height="${size}" alt="">` : `<span class="ext-noicon">${EXT_PUZZLE}</span>`;
}

// ---------- ツールバーの一覧 ----------
function renderExtMenu() {
    const active = extList.filter(e => e.enabled);
    extMenu.innerHTML = `
        <div class="ext-menu-head">拡張機能</div>
        ${active.length ? active.map(e => `
          <div class="ext-item ${e.loaded ? '' : 'broken'}" data-ext-key="${escapeHtml(e.key)}" title="${escapeHtml(e.description || '')}">
            ${extIconHtml(e)}
            <div class="ext-item-text"><span>${escapeHtml(e.name)}</span><small>${e.loaded ? (e.hasPopup ? 'クリックで開く' : '自動で動作します') : escapeHtml(e.error)}</small></div>
            ${e.options && e.loaded ? `<span class="ext-item-opt" data-ext-options="${escapeHtml(e.key)}" title="オプション"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>` : ''}
          </div>`).join('') : '<div class="ext-empty">拡張機能はまだありません。<br>Chrome ウェブストアで拡張機能のページを開くと追加できます。</div>'}
        <div class="ext-menu-foot" data-ext-manage="1">拡張機能を管理</div>`;
}

function openExtMenu() {
    renderExtMenu();
    const r = typeof toolbarAnchorRect === 'function' ? toolbarAnchorRect(btnExtensions) : btnExtensions.getBoundingClientRect();   // ▼ 変更：ボタンが「»」に入っている時はその下に出す
    extMenu.style.top = `${r.bottom + 10}px`;
    extMenu.style.right = `${Math.max(12, window.innerWidth - r.right - 8)}px`;
    extMenu.classList.add('show');
}

function closeExtMenu() {
    extMenu.classList.remove('show');
}

function openExtensionOptions(e) {
    if (e?.id && e.options) openNewTab(`chrome-extension://${e.id}/${e.options.replace(/^\//, '')}`);
}

btnExtensions.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (extMenu.classList.contains('show')) { closeExtMenu(); return; }
    await refreshExtensions();
    openExtMenu();
});

extMenu.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (ev.target.closest('[data-ext-manage]')) {
        closeExtMenu();
        openPanel('panel-settings'); // 開いた時に設定の各欄が描画される（既に開いていればそのまま）
        renderExtensionSettings();
        setTimeout(() => document.getElementById('extension-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        return;
    }
    const opt = ev.target.closest('[data-ext-options]');
    if (opt) { closeExtMenu(); openExtensionOptions(extList.find(e => e.key === opt.getAttribute('data-ext-options'))); return; }
    const item = ev.target.closest('[data-ext-key]');
    if (!item) return;
    const e = extList.find(x => x.key === item.getAttribute('data-ext-key'));
    if (!e || !e.loaded) return;
    closeExtMenu();
    if (e.hasPopup) {
        const r = typeof toolbarAnchorRect === 'function' ? toolbarAnchorRect(btnExtensions) : btnExtensions.getBoundingClientRect();   // ▼ 変更：ボタンが「»」に入っている時はその下に出す
        window.electronAPI.openExtensionPopup(e.key, { right: r.right, bottom: r.bottom });
    } else if (e.options) openExtensionOptions(e);
    else showToast(`${escapeHtml(e.name)} は開いたページで自動的に動作します`);
});

document.addEventListener('click', (ev) => { if (!ev.target.closest('.ext-menu, #btn-extensions, #overflow-menu')) closeExtMenu(); });

// ---------- 設定画面 ----------
function renderExtensionSettings() {
    const box = document.getElementById('extension-options');
    if (!box) return;
    const SOURCE = { store: 'ウェブストア', crx: '.crx ファイル', folder: 'フォルダ' };
    box.innerHTML = `
        <div class="ext-install">
          <div class="ext-install-row">
            <input type="text" id="ext-store-input" placeholder="ウェブストアの URL または拡張機能 ID" spellcheck="false">
            <button class="ext-btn primary" id="ext-store-add">追加</button>
          </div>
          <div class="ext-install-row">
            <button class="ext-btn" id="ext-add-crx" title=".crx / .zip ファイルから追加">ファイルから</button>
            <button class="ext-btn" id="ext-add-folder" title="展開済みの拡張機能フォルダ（manifest.json があるフォルダ）から追加">フォルダから</button>
          </div>
          <div class="ext-note">Chrome の拡張機能のうち、Electron が対応している機能だけが動きます。ページに機能を足す・見た目を変える種類は動きやすく、タブ管理・パスワード管理などブラウザ全体を操作する種類は動かないことがあります。拡張機能は閲覧したページの内容を読めるので、信頼できる物だけを入れてください。シークレットタブでは動きません。</div>
        </div>
        ${extList.map(e => settingRow({
            icon: extIconHtml(e, 16),
            label: `${escapeHtml(e.name)} <span class="ext-ver">${escapeHtml(e.version)}</span>`,
            sub: e.error ? `<span class="perm-block">${escapeHtml(e.error)}</span>` : `${SOURCE[e.source] || ''}${e.manifestVersion ? ` · MV${e.manifestVersion}` : ''}${e.description ? ' · ' + escapeHtml(e.description) : ''}`,
            attrs: `data-ext-row="${escapeHtml(e.key)}"`,
            action: `<span class="ext-row-actions">
                ${e.options && e.loaded ? `<span class="ext-act" data-ext-opt="${escapeHtml(e.key)}" title="オプション">⚙</span>` : ''}
                <span class="ext-switch ${e.enabled ? 'on' : ''}" data-ext-toggle="${escapeHtml(e.key)}" title="${e.enabled ? 'オフにする' : 'オンにする'}"></span>
                <span class="setting-remove" data-ext-remove="${escapeHtml(e.key)}" title="削除">×</span>
              </span>`,
        })).join('') || ''}`;
}

async function runInstall(promise, label) {
    showToast(`${label}…`);
    const r = await promise;
    if (r?.canceled) return;
    if (r?.error) { showToast(`追加できませんでした：${escapeHtml(r.error)}`, { timeout: 6000 }); return; }
    showToast(`「${escapeHtml(r.ext.name)}」を追加しました`);
    await refreshExtensions();
    renderExtensionSettings();
}

document.getElementById('extension-options').addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const t = ev.target;
    if (t.closest('#ext-store-add')) {
        const v = document.getElementById('ext-store-input').value.trim();
        if (v) runInstall(window.electronAPI.installExtensionStore(v), 'ウェブストアから取得しています');
        return;
    }
    if (t.closest('#ext-add-crx')) { runInstall(window.electronAPI.installExtensionCrx(), '拡張機能を展開しています'); return; }
    if (t.closest('#ext-add-folder')) { runInstall(window.electronAPI.installExtensionFolder(), '拡張機能を読み込んでいます'); return; }
    const toggle = t.closest('[data-ext-toggle]');
    if (toggle) {
        const key = toggle.getAttribute('data-ext-toggle');
        const e = extList.find(x => x.key === key);
        extList = await window.electronAPI.setExtensionEnabled(key, !e?.enabled);
        renderExtensionSettings();
        // Electron の制限：すでに動いているページの中からは、拡張機能をすぐには取り除けないことがある
        if (e?.enabled) showToast('オフにしました。開いているページから完全に外すにはブラウザを再起動してください', { timeout: 6000 });
        btnExtensions.classList.toggle('has-ext', extList.some(x => x.enabled));
        return;
    }
    const opt = t.closest('[data-ext-opt]');
    if (opt) { openExtensionOptions(extList.find(x => x.key === opt.getAttribute('data-ext-opt'))); return; }
    const rm = t.closest('[data-ext-remove]');
    if (rm) {
        const key = rm.getAttribute('data-ext-remove');
        const e = extList.find(x => x.key === key);
        const { ok } = await showConfirm({ title: '拡張機能を削除しますか？', message: `<b>${escapeHtml(e?.name || '')}</b> を削除します。`, confirmLabel: '削除する', danger: true });
        if (!ok) return;
        extList = await window.electronAPI.removeExtension(key);
        renderExtensionSettings();
        showToast('削除しました。開いているページから完全に外すにはブラウザを再起動してください', { timeout: 6000 });
        btnExtensions.classList.toggle('has-ext', extList.some(x => x.enabled));
    }
});
document.getElementById('extension-options').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'ext-store-input') document.getElementById('ext-store-add').click();
});
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', async () => {
    await refreshExtensions();
    renderExtensionSettings();
});

// ---------- ウェブストアのページを開いたら「追加」を出す ----------
const offeredStoreIds = new Set();
function offerStoreInstall(tabId, url) {
    if (tabId !== activeTabId || isPrivateTab(tabId)) return;
    const m = /^https:\/\/(chromewebstore\.google\.com\/detail\/|chrome\.google\.com\/webstore\/detail\/)(?:[^/]+\/)?([a-p]{32})/.exec(url || '');
    if (!m || offeredStoreIds.has(m[2])) return;
    offeredStoreIds.add(m[2]);
    if (extList.some(e => e.storeId === m[2])) { showToast('この拡張機能は追加済みです'); return; }
    showToast('この拡張機能を ARCHYNDIUM に追加できます', {
        actionLabel: 'ARCHYNDIUM に追加', timeout: 12000,
        action: () => runInstall(window.electronAPI.installExtensionStore(m[2]), 'ウェブストアから取得しています'),
    });
}

tabUrlChangeHooks.push(offerStoreInstall);
window.electronAPI?.onExtensionsChanged?.(refreshExtensions);
refreshExtensions();
