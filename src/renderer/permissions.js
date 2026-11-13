// ==========================================
// ★ サイトの権限：確認プロンプト
// ==========================================
// main/permissions.js から届いたリクエストを URL バーの下に表示し、許可/ブロックを返す。
// 複数届いた場合は順番に表示する。設定画面での一覧・取り消しは settings.js。

const PERMISSION_LABELS = {
    camera:              { name: 'カメラ',              icon: '<path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2"></rect>' },
    microphone:          { name: 'マイク',              icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line>' },
    geolocation:         { name: '位置情報',            icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>' },
    notifications:       { name: '通知の表示',          icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>' },
    midi:                { name: 'MIDI デバイス',       icon: '<rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="7" y1="6" x2="7" y2="13"></line><line x1="12" y1="6" x2="12" y2="13"></line><line x1="17" y1="6" x2="17" y2="13"></line>' },
    midiSysex:           { name: 'MIDI デバイスの完全な制御', icon: '<rect x="2" y="6" width="20" height="12" rx="2"></rect>' },
    'clipboard-read':    { name: 'クリップボードの読み取り', icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1"></rect>' },
    'idle-detection':    { name: '操作していない時間の検出', icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' },
    'window-management': { name: 'ウィンドウの配置',    icon: '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line>' },
    openExternal:        { name: '外部アプリで開く',    icon: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>' },
};

function permissionLabel(p) {
    return PERMISSION_LABELS[p] || { name: p, icon: '<circle cx="12" cy="12" r="9"></circle>' };
}

const permPrompt = document.getElementById('perm-prompt');
const permQueue = [];

function tabIdForWebContents(wcId) {
    for (const [tabId, wv] of Object.entries(webviews)) {
        try { if (wv.getWebContentsId() === wcId) return tabId; } catch(e) {}
    }
    return null;
}

function positionPermPrompt() {
    const r = document.getElementById('omnibar-pill').getBoundingClientRect();
    permPrompt.style.left = `${Math.max(12, r.left)}px`;
    permPrompt.style.top = `${r.bottom + 10}px`;
}

function renderPermPrompt() {
    const req = permQueue[0];
    if (!req) { permPrompt.classList.remove('show'); return; }
    const tabId = tabIdForWebContents(req.webContentsId);
    const otherTab = tabId && tabId !== activeTabId;
    const rows = req.permissions.map(p => {
        const l = permissionLabel(p);
        return `<div class="pp-perm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${l.icon}</svg>${l.name}</div>`;
    }).join('');
    const ext = req.externalURL ? `<div class="pp-ext">${escapeHtml(req.externalURL.slice(0, 120))}</div>` : '';
    permPrompt.innerHTML = `
        <div class="pp-head"><b>${escapeHtml(req.host)}</b> が次の許可を求めています${permQueue.length > 1 ? `<span class="pp-more">他 ${permQueue.length - 1} 件</span>` : ''}</div>
        ${otherTab ? `<div class="pp-tab">別のタブ：${escapeHtml(tabTitleOf(tabId))}</div>` : ''}
        <div class="pp-perms">${rows}</div>${ext}
        <label class="pp-remember"><input type="checkbox" id="pp-remember" ${req.isPrivate ? '' : 'checked'}> ${req.isPrivate ? 'このシークレットセッション中は記憶する' : 'このサイトでの選択を記憶する'}</label>
        <div class="pp-actions">
          <div class="pp-btn block" data-pp="block">ブロック</div>
          <div class="pp-btn allow" data-pp="allow">許可する</div>
        </div>`;
    positionPermPrompt();
    permPrompt.classList.add('show');
}

permPrompt.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pp]');
    const req = permQueue[0];
    if (!btn || !req) return;
    window.electronAPI.respondPermission({ id: req.id, allow: btn.getAttribute('data-pp') === 'allow', remember: document.getElementById('pp-remember').checked });
    permQueue.shift();
    renderPermPrompt();
    if (typeof renderPermissionSettings === 'function') renderPermissionSettings();
});

window.electronAPI?.onPermissionRequest((req) => { permQueue.push(req); renderPermPrompt(); });
window.electronAPI?.onPermissionCancel(({ id }) => {
    const i = permQueue.findIndex(r => r.id === id);
    if (i >= 0) { permQueue.splice(i, 1); renderPermPrompt(); }
});
window.addEventListener('resize', () => { if (permQueue.length) positionPermPrompt(); });
