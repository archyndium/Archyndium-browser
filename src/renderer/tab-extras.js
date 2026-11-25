// ==========================================
// ★ タブの便利機能（Chrome 相当）
// ==========================================
//   ・タブの右クリックメニュー（再読み込み・複製・ミュート・プレイヤーに固定・URLコピー・まとめて閉じる）
//   ・音が出ているタブにスピーカーアイコン。クリックでそのタブだけミュート

const SPEAKER_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path class="wave" d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"></path><g class="slash"><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></g></svg>';

function isTabMuted(tabId) {
    try { return !!webviews[tabId]?.isAudioMuted(); } catch(e) { return false; }
}

function setTabMuted(tabId, muted) {
    try { webviews[tabId]?.setAudioMuted(muted); } catch(e) {}
    updateTabAudioIcons();
}

// 1 秒ごとに各タブの「音が出ているか / ミュート中か」をアイコンに反映する
function updateTabAudioIcons() {
    getTabCards().forEach(card => {
        const tabId = card.getAttribute('data-tab-id');
        const wv = webviews[tabId];
        let audible = false, muted = false;
        try { audible = !!wv && wv.isCurrentlyAudible(); muted = !!wv && wv.isAudioMuted(); } catch(e) {}
        const show = audible || muted;
        let icon = card.querySelector('.tab-audio');
        if (show && !icon) {
            icon = document.createElement('span');
            icon.className = 'tab-audio';
            icon.innerHTML = SPEAKER_ICON;
            card.querySelector('.tab-title').after(icon);
        }
        if (icon) {
            icon.style.display = show ? '' : 'none';
            icon.classList.toggle('muted', muted);
            icon.title = muted ? 'ミュート解除' : 'このタブをミュート';
        }
    });
}

// スピーカーアイコンのクリックはタブ切替より先に処理する
document.getElementById('panel-tabs').addEventListener('click', (e) => {
    const icon = e.target.closest('.tab-audio');
    if (!icon) return;
    e.stopPropagation();
    const tabId = icon.closest('.tab-card').getAttribute('data-tab-id');
    setTabMuted(tabId, !isTabMuted(tabId));
});

// ▼ 追加：グループの見出しの右クリック（Work / Focus に登録・名前の変更・まとめて閉じる・グループの解除）
async function groupHeaderMenu(groupEl) {
    const tabIds = [...groupEl.querySelectorAll('.tab-card[data-tab-id]')].map(c => c.getAttribute('data-tab-id'));
    const sites = [...groupEl.querySelectorAll('.tab-card[data-url]')].filter(c => /^https?:/i.test(c.getAttribute('data-url') || '')).length;
    const choice = await window.electronAPI.popupMenu([
        { id: 'ws', label: `Work / Focus に登録（${sites} 個のサイト）`, enabled: sites > 0 },
        { type: 'separator' },
        { id: 'rename', label: '名前を変更' },
        { id: 'ungroup', label: 'グループを解除（タブは残す）' },
        { id: 'close', label: `グループのタブをすべて閉じる（${tabIds.length}）`, enabled: tabIds.length > 0 },
    ]);
    if (choice === 'ws') addGroupToWorkspace(groupEl);
    else if (choice === 'rename') groupEl.querySelector('.edit-group-btn')?.click();
    else if (choice === 'ungroup') {
        groupEl.querySelectorAll('.group-list > .tab-card').forEach(c => groupEl.before(c));
        groupEl.remove();
        scheduleSaveSession?.();
    } else if (choice === 'close') {
        closeTabsBulk(tabIds);
    }
}

document.getElementById('panel-tabs').addEventListener('contextmenu', async (e) => {
    const groupHeader = e.target.closest('#tabs-container .tab-group .group-header');
    if (groupHeader && window.electronAPI?.popupMenu) {
        e.preventDefault();
        groupHeaderMenu(groupHeader.closest('.tab-group'));
        return;
    }
    const card = e.target.closest('.tab-card[data-tab-id]');
    if (!card || !window.electronAPI?.popupMenu) return;
    e.preventDefault();
    const tabId = card.getAttribute('data-tab-id');
    const url = card.getAttribute('data-url') || '';
    const all = getTabCards();
    const below = all.slice(all.indexOf(card) + 1);
    const above = all.slice(0, all.indexOf(card));
    const muted = isTabMuted(tabId);
    const host = (() => { try { return new URL(url).hostname; } catch(e) { return ''; } })();
    const sameSite = host ? all.filter(c => { try { return new URL(c.getAttribute('data-url')).hostname === host; } catch(e) { return false; } }) : [];
    // 同じ URL のタブ（2 枚目以降）
    const seen = new Set();
    const duplicates = all.filter(c => { const u = c.getAttribute('data-url'); if (seen.has(u)) return true; seen.add(u); return false; });
    // 右クリックしたタブが選択中なら、選択したタブ全部が対象
    const selection = selectedTabIds.has(tabId) && selectedTabIds.size > 1 ? [...selectedTabIds] : null;
    const ids = (cards) => cards.map(c => c.getAttribute('data-tab-id'));

    const choice = await window.electronAPI.popupMenu([
        { id: 'reload', label: '再読み込み' },
        { id: 'duplicate', label: 'タブを複製' },
        { id: 'mute', label: muted ? 'サイトのミュートを解除' : 'このタブをミュート' },
        { id: 'player', label: 'プレイヤーで操作する（固定）', checked: mediaLocked && mediaTargetTabId === tabId },
        { id: 'pin', label: 'タブを固定', checked: isTabPinned(tabId) },
        { type: 'separator' },
        { id: 'split-h', label: '表示中のタブと左右に並べる', enabled: tabId !== activeTabId },
        { id: 'split-v', label: '表示中のタブと上下に並べる', enabled: tabId !== activeTabId },
        { id: 'unsplit', label: '分割を解除', enabled: isInSplit(tabId) },
        { id: 'new-window', label: '新しいウィンドウに移動' },
        { id: 'other-window', label: 'ほかのウィンドウに移動', enabled: (window.electronAPI?.windowCountNow?.() || 1) > 1 },
        { id: 'merge-windows', label: 'すべてのウィンドウをこのウィンドウにまとめる', enabled: (window.electronAPI?.windowCountNow?.() || 1) > 1 },
        { id: 'workspace', label: 'Work / Focus に登録', enabled: /^https?:/i.test(url) },
        { type: 'separator' },
        { id: 'bookmark', label: findBookmarkCard(url) ? 'ブックマークを編集…' : 'ブックマークに追加…', enabled: /^(https?|file):/i.test(url) },
        { id: 'copy', label: 'URL をコピー' },
        { id: 'unlock-copy', label: 'このサイトのコピー制限を解除' },
        { id: 'extract-text', label: 'ページの文字を取り出す' },
        { id: 'private', label: 'シークレットタブで開き直す', enabled: !isPrivateTab(tabId) && /^https?:/.test(url) },
        { type: 'separator' },
        ...(selection ? [
            { id: 'close-selected', label: `選択した ${selection.length} 個のタブを閉じる` },
            { id: 'group-selected', label: `選択した ${selection.length} 個のタブをグループにまとめる` },
            { type: 'separator' },
        ] : []),
        { id: 'close', label: 'タブを閉じる' },
        { id: 'select', label: 'タブを選択してまとめて閉じる…' },
        { id: 'close-others', label: '他のタブを閉じる', enabled: all.length > 1 },
        { id: 'close-above', label: '上のタブを閉じる', enabled: above.length > 0 },
        { id: 'close-below', label: '下のタブを閉じる', enabled: below.length > 0 },
        { id: 'close-site', label: host ? `${host.replace(/^www\./, '')} のタブをすべて閉じる（${sameSite.length}）` : '同じサイトのタブをすべて閉じる', enabled: sameSite.length > 1 },
        { id: 'close-dupes', label: `重複したタブを閉じる（${duplicates.length}）`, enabled: duplicates.length > 0 },
    ]);

    switch (choice) {
        case 'reload': webviews[tabId] ? webviews[tabId].reload() : activateTab(tabId); break;
        case 'duplicate': openNewTab(url, { isPrivate: isPrivateTab(tabId) }); break;
        case 'mute': setTabMuted(tabId, !muted); break;
        case 'pin': setTabPinned(tabId, !isTabPinned(tabId)); break;
        case 'split-h': startSplit(activeTabId, tabId, 'h'); break;
        case 'split-v': startSplit(activeTabId, tabId, 'v'); break;
        case 'unsplit': unsplit(); break;
        case 'new-window': moveTabToNewWindow(tabId); break;
        case 'other-window': moveTabToOtherWindow(tabId); break;
        case 'merge-windows': mergeAllWindows(); break;
        case 'workspace': addTabToWorkspace(card); showToast('Work / Focus に登録しました'); break;
        case 'player': (mediaLocked && mediaTargetTabId === tabId) ? toggleMediaLock() : setMediaTarget(tabId, { lock: true }); break;
        case 'copy': navigator.clipboard.writeText(url).catch(() => {}); break;
        case 'bookmark': openBookmarkPopupForTab(tabId); break;
        case 'unlock-copy': unlockCopy(tabId); break;
        case 'extract-text': extractPageText(tabId); break;
        case 'private': openNewTab(url, { isPrivate: true }); break;
        case 'close': closeTab(tabId); break;
        case 'close-others': if (activeTabId !== tabId) card.click(); closeTabsBulk(ids(all.filter(c => c !== card))); break;
        case 'close-above': closeTabsBulk(ids(above)); break;
        case 'close-below': closeTabsBulk(ids(below)); break;
        case 'close-site': closeTabsBulk(ids(sameSite)); break;
        case 'close-dupes': closeTabsBulk(ids(duplicates)); break;
        case 'close-selected': clearTabSelection(); closeTabsBulk(selection); break;
        case 'group-selected': groupSelectedTabs(); break;
        case 'select': setTabSelectMode(true); selectedTabIds.add(tabId); renderTabSelection(); break;
    }
});

// ▼ 軽量化：音の状態の確認（タブごとに main へ問い合わせる）は 2.5 秒ごと。再生・停止の瞬間は
//   webview のイベント（tabs.js の media-started-playing / media-paused）からすぐに更新する
setInterval(updateTabAudioIcons, 2500);
