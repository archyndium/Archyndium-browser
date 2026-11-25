// ==========================================
// ★ 設定画面（起動時の動作・歌詞・Shield の例外サイト・サイトの権限）
// ==========================================
// テーマは theme.js、タブスリープは tab-sleep.js がそれぞれの欄を描画する。

const CHECK_MARK = '<span class="setting-check">✓</span>';

function settingRow({ icon, label, sub = '', checked = false, attrs = '', action = '' }) {
    return `<div class="tab-card setting-row" ${attrs}>
        <div class="favicon setting-icon">${icon}</div>
        <div class="setting-text"><span class="tab-title">${label}</span>${sub ? `<span class="setting-sub">${sub}</span>` : ''}</div>
        ${action || (checked ? CHECK_MARK : '')}
      </div>`;
}

function renderSearchSettings() {
    const box = document.getElementById('search-options');
    if (!box) return;
    const current = normalEngine().id;
    box.innerHTML = SEARCH_ENGINES.map(e => settingRow({
        icon: escapeHtml(e.name[0]), label: e.name, checked: e.id === current, attrs: `data-engine="${e.id}"`,
    })).join('') + settingRow({
        icon: '…', label: '入力中に検索候補を表示', sub: '入力した文字が検索エンジンに送られます（シークレットタブでは送りません）', checked: searchSuggestEnabled(), attrs: 'data-suggest-toggle="1"',
    }) + `<div class="setting-subhead">シークレットタブの検索エンジン</div>` + [['same', 'ふだんと同じ'], ['duckduckgo', 'DuckDuckGo'], ['startpage', 'Startpage'], ['brave', 'Brave Search']].map(([id, name]) => settingRow({
        icon: id === 'same' ? '=' : escapeHtml(name[0]), label: name,
        sub: id === 'duckduckgo' ? '検索した言葉を記録しない方針の検索エンジン（おすすめ）' : id === 'startpage' ? 'Google の結果を、記録せずに表示' : id === 'brave' ? '独自の検索。記録しない方針' : '',
        checked: privateEngineSetting() === id, attrs: `data-private-engine="${id}"`,
    })).join('');
}

async function renderMiscSettings() {
    const box = document.getElementById('misc-options');
    if (!box) return;
    const siteIcons = bookmarkIconMode() === 'site';
    const dl = await window.electronAPI?.getDownloadSettings?.().catch(() => null) || {};
    box.innerHTML =
        settingRow({ icon: '↓', label: '保存前に保存先を確認する', sub: 'オフ：「ダウンロード」フォルダへ自動保存', checked: !!dl.askWhereToSave, attrs: 'data-dl-ask-toggle="1"' }) +
        settingRow({ icon: '↗', label: 'ブックマークを新しいタブで開く', sub: 'オフ：表示中のタブで開く（Ctrl+クリックで逆）', checked: bookmarkOpenMode() === 'new', attrs: 'data-bm-open-toggle="1"' }) +
        settingRow({ icon: '⧉', label: 'タブをウィンドウの外へドラッグで別ウィンドウにする', checked: tabTearOffEnabled(), attrs: 'data-tearoff-toggle="1"' }) +
        settingRow({ icon: '★', label: 'ブックマークにサイトのアイコンを表示', sub: 'オフにすると星マーク', checked: siteIcons, attrs: 'data-bm-icon-toggle="1"' }) +
        settingRow({ icon: '🗑', label: 'ゴミ箱に捨てる時に確認する', checked: trashConfirmEnabled(), attrs: 'data-trash-confirm-toggle="1"' }) +
        settingRow({ icon: '▦', label: 'Work / Focus に初期フォルダを追加', sub: 'Google・Microsoft・Social のうち、無いものだけを足します', attrs: 'data-ws-defaults="1"' }) +
        settingRow({ icon: '▤', label: 'タブにマウスを乗せると内容を表示', sub: 'タイトルとページの縮小画像（上タブの時）', checked: tabHoverEnabled(), attrs: 'data-tab-hover-toggle="1"' }) +
        settingRow({ icon: '↗', label: 'リンクにマウスを乗せるとプレビュー', sub: '行き先のページを読み込みます（Cookie は送りません。シークレットタブでは使いません）', checked: linkPreviewEnabled(), attrs: 'data-link-preview-toggle="1"' });
}

// ▼ 追加：軽量化（不透明なウィンドウ）。次に開くウィンドウ（再起動後）から反映
async function renderPerfSettings() {
    const box = document.getElementById('perf-options');
    if (!box || !window.electronAPI?.getAppSettings) return;
    const s = await window.electronAPI.getAppSettings().catch(() => ({}));
    box.innerHTML = settingRow({ icon: '⚡', label: 'ウィンドウの描画を軽くする', sub: '角の丸みと影は Windows 標準に。再起動後に反映', checked: s.opaqueWindow !== false, attrs: 'data-opaque-toggle="1"' });
}

// ▼ 追加：サイトのデータ（Cookie など）の削除
function renderSiteDataSettings() {
    const box = document.getElementById('sitedata-options');
    if (!box) return;
    let host = ''; try { host = new URL(urlInput.value).hostname; } catch (e) {}
    box.innerHTML = (host ? settingRow({ icon: '⌫', label: `${escapeHtml(host.replace(/^www\./, ''))} のデータを削除`, sub: 'Cookie・保存データ。このサイトからログアウトします', attrs: 'data-sitedata="site"' }) : '')
        + settingRow({ icon: '⌫', label: 'すべてのサイトのデータを削除', sub: 'Cookie・保存データ・キャッシュ。すべてのサイトからログアウトします', attrs: 'data-sitedata="all"' });
}
async function clearSiteDataFlow(scope) {
    let host = ''; try { host = new URL(urlInput.value).hostname; } catch (e) {}
    const all = scope === 'all' || !host;
    const { ok } = await showConfirm({
        title: all ? 'すべてのサイトのデータを削除' : `${host.replace(/^www\./, '')} のデータを削除`,
        message: all ? 'すべてのサイトの Cookie・保存データ・キャッシュを削除します。ログインし直す必要があります。履歴とブックマークは消えません。'
                     : 'このサイトの Cookie と保存データを削除します。このサイトにはログインし直す必要があります。検索エンジンの「最近の検索」もこの方法で消せます。',
        confirmLabel: '削除', danger: true,
    });
    if (!ok) return;
    const res = await window.electronAPI.clearSiteData(all ? null : host);
    showToast(all ? 'すべてのサイトのデータを削除しました' : `${res.domain || host} のデータを削除しました（Cookie ${res.cleared} 件）`);
    if (activeTabId && webviews[activeTabId]) webviews[activeTabId].reload();
}

function renderStartupSettings() {
    const box = document.getElementById('startup-options');
    if (!box) return;
    const on = isSessionRestoreEnabled();
    box.innerHTML =
        settingRow({ icon: '↺', label: '前回のタブを復元する', sub: 'タブとグループを戻す', checked: on, attrs: 'data-startup="on"' }) +
        settingRow({ icon: '+', label: '新しいタブで始める', checked: !on, attrs: 'data-startup="off"' }) +
        settingRow({ icon: '◎', label: '新しいタブに ARCHYNDIUM のスタートページを使う', sub: 'オフ：検索エンジンのトップページを開く', checked: newtabEnabled(), attrs: 'data-newtab-toggle="1"' });
}

function renderLyricsSettings() {
    const box = document.getElementById('lyrics-options');
    if (!box) return;
    box.innerHTML = settingRow({
        icon: '♪', label: 'カラオケ表示', sub: '再生位置に合わせて歌詞をハイライト（同期歌詞がある曲のみ）',
        checked: karaokeEnabled, attrs: 'data-karaoke-toggle="1"',
    });
}

async function renderShieldSiteSettings() {
    const box = document.getElementById('shield-site-list');
    if (!box || !window.electronAPI?.listShieldSites) return;
    const hosts = await window.electronAPI.listShieldSites();
    box.innerHTML = hosts.length
        ? hosts.map(h => settingRow({ icon: '⛨', label: escapeHtml(h), sub: 'このサイトでは広告ブロックを止めています', action: `<span class="setting-remove" data-unbypass="${escapeHtml(h)}" title="例外から外す">×</span>` })).join('')
        : '<div class="setting-empty">例外サイトはありません。盾アイコンのパネルから追加できます。</div>';
}

async function renderPermissionSettings() {
    const box = document.getElementById('permission-list');
    if (!box || !window.electronAPI?.listPermissions) return;
    const list = await window.electronAPI.listPermissions();
    if (!list.length) { box.innerHTML = '<div class="setting-empty">記憶している権限はありません。</div>'; return; }
    box.innerHTML = list.map(({ origin, permission, decision }) => {
        const host = origin.replace(/^https?:\/\//, '');
        const allow = decision === 'allow';
        return settingRow({
            icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${permissionLabel(permission).icon}</svg>`,
            label: escapeHtml(host),
            sub: `${permissionLabel(permission).name}：<b class="${allow ? 'perm-allow' : 'perm-block'}">${allow ? '許可' : 'ブロック'}</b>`,
            action: `<span class="setting-remove" data-perm-origin="${escapeHtml(origin)}" data-perm="${escapeHtml(permission)}" title="リセット（次回また確認する）">×</span>`,
        });
    }).join('');
}

document.getElementById('panel-settings').addEventListener('click', async (e) => {
    const t = e.target;
    const startup = t.closest('[data-startup]');
    if (startup) { setSessionRestoreEnabled(startup.getAttribute('data-startup') === 'on'); renderStartupSettings(); return; }
    if (t.closest('[data-newtab-toggle]')) { setNewtabEnabled(!newtabEnabled()); renderStartupSettings(); return; }
    if (t.closest('[data-karaoke-toggle]')) { setKaraokeEnabled(!karaokeEnabled); return; }
    const engine = t.closest('[data-engine]');
    if (engine) { setSearchEngine(engine.getAttribute('data-engine')); renderSearchSettings(); return; }
    const pe = t.closest('[data-private-engine]');
    if (pe) { setPrivateEngine(pe.getAttribute('data-private-engine')); renderSearchSettings(); return; }
    if (t.closest('[data-suggest-toggle]')) { setSearchSuggestEnabled(!searchSuggestEnabled()); renderSearchSettings(); return; }
    if (t.closest('[data-bm-icon-toggle]')) { setBookmarkIconMode(bookmarkIconMode() === 'site' ? 'star' : 'site'); renderMiscSettings(); return; }
    if (t.closest('[data-dl-ask-toggle]')) {
        const cur = await window.electronAPI.getDownloadSettings();
        await window.electronAPI.setDownloadSetting('askWhereToSave', !cur.askWhereToSave);
        renderMiscSettings(); return;
    }
    if (t.closest('[data-bm-open-toggle]')) { setBookmarkOpenMode(bookmarkOpenMode() === 'new' ? 'current' : 'new'); renderMiscSettings(); return; }
    if (t.closest('[data-tearoff-toggle]')) { setTabTearOffEnabled(!tabTearOffEnabled()); renderMiscSettings(); return; }
    if (t.closest('[data-ws-defaults]')) { addDefaultWorkspaceFolders(); return; }
    const sd = t.closest('[data-sitedata]');
    if (sd) { clearSiteDataFlow(sd.getAttribute('data-sitedata')); return; }
    if (t.closest('[data-tab-hover-toggle]')) { setTabHoverEnabled(!tabHoverEnabled()); renderMiscSettings(); return; }
    if (t.closest('[data-link-preview-toggle]')) { setLinkPreviewEnabled(!linkPreviewEnabled()); renderMiscSettings(); return; }
    if (t.closest('[data-opaque-toggle]')) {
        const cur = await window.electronAPI.getAppSettings();
        await window.electronAPI.setAppSetting('opaqueWindow', cur.opaqueWindow === false);
        await renderPerfSettings();
        if (typeof showToast === 'function') showToast('アプリを再起動すると反映されます');
        return;
    }
    if (t.closest('[data-trash-confirm-toggle]')) { setTrashConfirmEnabled(!trashConfirmEnabled()); renderMiscSettings(); return; }
    const unbypass = t.closest('[data-unbypass]');
    if (unbypass) {
        await window.electronAPI.setShieldSite(`https://${unbypass.getAttribute('data-unbypass')}/`, false);
        renderShieldSiteSettings();
        refreshShieldSiteState();
        return;
    }
    const perm = t.closest('[data-perm-origin]');
    if (perm) {
        await window.electronAPI.resetPermission(perm.getAttribute('data-perm-origin'), perm.getAttribute('data-perm'));
        renderPermissionSettings();
    }
});

// 設定パネルを開いた時に最新の状態を描画する
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', () => {
    renderSearchSettings();
    renderStartupSettings();
    renderMiscSettings();
    renderPerfSettings();
    renderLyricsSettings();
    renderShieldSiteSettings();
    renderSiteDataSettings();
    renderPermissionSettings();
});
