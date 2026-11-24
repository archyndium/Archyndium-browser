// ==========================================
// ★ プレイヤーのソース（操作対象タブ）管理 & ロック
// ==========================================
// 自動モード：音が出る再生を始めたタブを追従する（従来の動作）
// ロック中  ：選んだタブに固定。他のタブで動画が流れても、別タブを操作していても切り替わらない
// サイドバーのプレイヤー上部のセレクタ、またはミニプレイヤーの鍵ボタンから操作する。

let mediaLocked = false;
let mediaClaimUntil = 0; // この時刻まで「このウィンドウを再生元にして」と main に伝える（タブを選んで固定した時）
const mediaTabs = {}; // tabId -> { playing, meta: {title, artist, album, duration}, lastPlayed }

const psRoot = document.getElementById('player-source');
const psLabel = document.getElementById('ps-label');
const psDot = document.getElementById('ps-dot');
const psLock = document.getElementById('ps-lock');
const psMenu = document.getElementById('ps-menu');

function tabTitleOf(tabId) {
    return getTabCard(tabId)?.querySelector('.tab-title')?.textContent || 'Tab';
}

function tabHostOf(tabId) {
    try { return new URL(getTabCard(tabId)?.getAttribute('data-url') || '').hostname.replace(/^www\./, ''); } catch(e) { return ''; }
}

function tabFaviconOf(tabId) {
    const img = getTabCard(tabId)?.querySelector('.favicon img');
    // src 属性が空の img は .src がページ自身の URL を返すので、属性で判定する
    return img && img.getAttribute('src') && img.style.display !== 'none' ? img.src : '';
}

// 再生中の曲情報（タイトル・アーティスト）をプレイヤー表示に反映する
function refreshNowPlaying() {
    if (audioPlaylist.length > 0 || isRemotePlayer()) return;
    if (!mediaTargetTabId) { resetNowPlaying(); return; }
    const meta = mediaTabs[mediaTargetTabId]?.meta || {};
    if (meta.pendingTitle) return; // 新しい曲名を取得中（前の曲名のまま歌詞を探さない）
    nowPlayingTitle.textContent = meta.title || tabTitleOf(mediaTargetTabId).replace(/^\(\d+\)\s*/, '').replace(/ - YouTube( Music)?$/, '');
    document.getElementById('track-artist').textContent = meta.artist || tabHostOf(mediaTargetTabId) || 'Web Media';
}

// ▼ 追加：操作するタブが無くなった時（音楽を流していたタブを閉じた等）は、曲名・歌詞を消して
//   「再生していません」に戻す。ミニプレイヤーにも syncTick 経由で同じ内容が届く
function resetNowPlaying() {
    if (nowPlayingTitle.textContent === '再生していません' && !currentLyricsText && !karaokeLines) return;
    nowPlayingTitle.textContent = '再生していません';
    document.getElementById('track-artist').textContent = 'タブの音声を自動で検出';
    currentTrackTitleStr = '';        // 同じ曲をもう一度流した時に、歌詞を取り直すため
    currentMediaTime = 0; currentMediaDuration = 0;
    isPlaying = false; updatePlayBtn();
    clearLyrics();
    renderLyricsBody();
    const t = document.getElementById('lyrics-title'), a = document.getElementById('lyrics-artist');
    if (t) t.textContent = '再生していません';
    if (a) a.textContent = '';
    if (typeof updateMarquee === 'function') updateMarquee('track-name');
}

function setMediaTarget(tabId, { lock } = {}) {
    if (mediaTargetTabId !== tabId) { currentMediaTime = 0; currentMediaDuration = 0; }
    mediaTargetTabId = tabId;
    if (lock !== undefined) mediaLocked = lock && !!tabId;
    if (lock && tabId) claimPlayer();
    if (audioPlaylist.length === 0) {
        isPlaying = !!(tabId && mediaTabs[tabId]?.playing);
        updatePlayBtn();
    }
    refreshNowPlaying();
    renderPlayerSource();
}

function onMediaPlaying(tabId) {
    const t = mediaTabs[tabId] || (mediaTabs[tabId] = {});
    t.playing = true;
    t.lastPlayed = Date.now();
    // ロック中は他のタブの再生で対象を奪われない
    if (mediaLocked && mediaTargetTabId && mediaTargetTabId !== tabId && getTabCard(mediaTargetTabId)) {
        renderPlayerSource();
        return;
    }
    setMediaTarget(tabId);
}

function onMediaPaused(tabId) {
    if (mediaTabs[tabId]) mediaTabs[tabId].playing = false;
    if (tabId === mediaTargetTabId && audioPlaylist.length === 0) { isPlaying = false; updatePlayBtn(); }
    renderPlayerSource();
}

// ▼ 追加：YouTube は表示されていないタブだとページの見出し（曲名）の更新を後回しにするため、
//   次の曲に変わってもしばらく前の曲名のままになる。動画 ID が変わったら、公式の動画情報（oEmbed）から
//   曲名・チャンネル名を取り直す（タブを表示しなくても歌詞が新しい曲に切り替わる）
const oembedCache = {}; // videoId -> { title, author } | 'loading'

function onMediaMeta(tabId, raw) {
    const t = mediaTabs[tabId] || (mediaTabs[tabId] = {});
    const prev = t.meta;
    const domTitle = raw.domTitle !== undefined ? raw.domTitle : raw.title; // ページから読んだままの曲名
    const meta = { ...raw, domTitle, pendingTitle: false };
    if (meta.videoId) {
        const info = oembedCache[meta.videoId];
        if (info && info !== 'loading') {
            meta.title = info.title;
            meta.artist = info.author || raw.artist;
        } else {
            // 動画は変わったのに見出しが前の曲のまま → 古い曲名で歌詞を探さないよう、取り直すまで待つ
            if (prev && prev.videoId && prev.videoId !== meta.videoId && prev.domTitle === domTitle) meta.pendingTitle = true;
            if (!info) fetchOembed(tabId, meta.videoId);
        }
    }
    t.meta = meta;
    if (tabId === mediaTargetTabId) refreshNowPlaying();
}

async function fetchOembed(tabId, videoId) {
    oembedCache[videoId] = 'loading';
    const info = await window.electronAPI?.youtubeOembed?.(videoId).catch(() => null);
    if (!info) { delete oembedCache[videoId]; return; }
    oembedCache[videoId] = info;
    // まだ同じ動画なら反映する
    const t = mediaTabs[tabId];
    if (t?.meta?.videoId === videoId) onMediaMeta(tabId, { ...t.meta });
}

function onMediaTabClosed(tabId) {
    delete mediaTabs[tabId];
    if (mediaTargetTabId !== tabId) { renderPlayerSource(); return; }
    // 閉じたのが対象タブなら、他に再生中のタブがあればそちらへ（なければ未選択に戻す）
    const next = Object.keys(mediaTabs).find(id => mediaTabs[id].playing && getTabCard(id));
    setMediaTarget(next || null, { lock: false });
}

function toggleMediaLock() {
    // 別ウィンドウの曲を表示中 → そのウィンドウの固定を切り替える
    if (isRemotePlayer()) { window.electronAPI.controlFromMini({ type: 'toggle-media-lock' }); return; }
    if (!mediaTargetTabId) {
        // 対象がまだ無い時は、表示中のタブを対象にしてロックする
        if (activeTabId) setMediaTarget(activeTabId, { lock: true });
        return;
    }
    mediaLocked = !mediaLocked;
    if (mediaLocked) claimPlayer();
    renderPlayerSource();
}

// ミニプレイヤーのソース表示クリック用：再生を検知したタブを順番に切り替える
function cycleMediaSource() {
    const ids = Object.keys(mediaTabs).filter(id => getTabCard(id));
    if (ids.length === 0) return;
    const idx = ids.indexOf(mediaTargetTabId);
    setMediaTarget(ids[(idx + 1) % ids.length], { lock: true });
}

function sourceLabel() {
    if (isRemotePlayer()) return `別ウィンドウ：${(remotePlayer.source?.label || '').replace(/^自動：/, '')}`;
    if (audioPlaylist.length > 0) return 'ローカル音楽';
    if (!mediaTargetTabId) return '自動：再生したタブを追従';
    const host = tabHostOf(mediaTargetTabId);
    return `${mediaLocked ? '' : '自動：'}${host || tabTitleOf(mediaTargetTabId)}`;
}

function renderPlayerSource() {
    psLabel.textContent = sourceLabel();
    const remote = isRemotePlayer();
    const locked = remote ? !!remotePlayer.source?.locked : mediaLocked;
    psDot.classList.toggle('playing', remote ? !!remotePlayer.isPlaying : !!(mediaTargetTabId && mediaTabs[mediaTargetTabId]?.playing));
    psRoot.classList.toggle('remote', remote);
    psLock.classList.toggle('locked', locked);
    psRoot.classList.toggle('locked', locked);
    document.getElementById('ps-lock-shackle').setAttribute('d', locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2');
    psLock.title = remote ? (locked ? '別ウィンドウのタブの固定を解除' : '別ウィンドウで再生中のタブに固定') : mediaLocked ? 'ロック解除（再生したタブを自動で追従）' : 'このタブに固定（他のタブで動画が流れても切り替わらない）';
    if (psRoot.classList.contains('open')) renderSourceMenu();
}

function renderSourceMenu() {
    const all = getTabCards().map(c => c.getAttribute('data-tab-id'));
    const media = all.filter(id => mediaTabs[id]).sort((a, b) => (mediaTabs[b].lastPlayed || 0) - (mediaTabs[a].lastPlayed || 0));
    const others = all.filter(id => !mediaTabs[id]);
    const item = (id) => {
        const icon = tabFaviconOf(id);
        const m = mediaTabs[id];
        const metaTitle = m?.meta?.title;
        const sub = metaTitle && metaTitle !== tabTitleOf(id) ? `<div class="ps-item-sub">${escapeHtml(metaTitle)}</div>` : '';
        return `<div class="ps-item ${id === mediaTargetTabId ? 'selected' : ''}" data-ps-tab="${id}">
            ${icon ? `<img src="${escapeHtml(icon)}">` : '<span class="ps-noicon"></span>'}
            <div class="ps-item-title">${escapeHtml(tabTitleOf(id))}${sub}</div>
            ${m?.playing ? '<span class="ps-eq">♪ 再生中</span>' : ''}
          </div>`;
    };
    psMenu.innerHTML = `
        ${isRemotePlayer() ? `<div class="ps-item selected"><span class="ps-noicon"></span><div class="ps-item-title">${escapeHtml(sourceLabel())}<div class="ps-item-sub">${escapeHtml(remotePlayer.title || '')}</div></div>${remotePlayer.isPlaying ? '<span class="ps-eq">♪ 再生中</span>' : ''}</div><div class="ps-section">このウィンドウのタブ（選ぶとこちらに切り替えて固定）</div>` : ''}
        <div class="ps-item ${!mediaLocked && !isRemotePlayer() ? 'selected' : ''}" data-ps-auto="1"><span class="ps-noicon"></span><div class="ps-item-title">自動（再生したタブを追従）</div></div>
        ${media.length ? `<div class="ps-section">メディアを検知したタブ</div>${media.map(item).join('')}` : ''}
        ${others.length ? `<div class="ps-section">その他のタブ（選ぶと固定）</div>${others.map(item).join('')}` : ''}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

document.getElementById('ps-main').addEventListener('click', (e) => {
    e.stopPropagation();
    psRoot.classList.toggle('open');
    if (psRoot.classList.contains('open')) renderSourceMenu();
});

psLock.addEventListener('click', (e) => { e.stopPropagation(); toggleMediaLock(); });

psMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const auto = e.target.closest('[data-ps-auto]');
    const tab = e.target.closest('[data-ps-tab]');
    if (auto) { mediaLocked = false; renderPlayerSource(); }
    else if (tab) setMediaTarget(tab.getAttribute('data-ps-tab'), { lock: true }); // 手動で選んだら固定
    psRoot.classList.remove('open');
});

document.addEventListener('click', (e) => { if (!e.target.closest('#player-source')) psRoot.classList.remove('open'); });

// ==========================================
// ▼ 追加：別ウィンドウで再生中の曲を、このウィンドウのプレイヤーにも表示する
// ==========================================
// main（window-controls.js）が「再生元のウィンドウ」を 1 つ決め、それ以外のウィンドウに状態を送ってくる。
// 受け取っている間は、このウィンドウのプレイヤー・歌詞・カラオケはその曲を表示し、ボタン操作は再生元へ送る。
// 送られてこなくなったら（再生元が閉じた・音楽が無くなった・こちらが再生元になった）元の表示に戻す。
let remotePlayer = null;
let remotePlayerTimer = null;

function isRemotePlayer() {
    return !!remotePlayer;
}

function hasLocalMedia() {
    return audioPlaylist.length > 0 || !!(mediaTargetTabId && (mediaTabs[mediaTargetTabId] || mediaLocked));
}

function claimPlayer() {
    mediaClaimUntil = Date.now() + 1500;
}

function applyRemotePlayer(data) {
    clearTimeout(remotePlayerTimer);
    if (!data) { endRemotePlayer(); return; }
    const wasRemote = !!remotePlayer;
    remotePlayer = data;
    nowPlayingTitle.textContent = data.title || '';
    document.getElementById('track-artist').textContent = data.artist || '';
    if (isPlaying !== !!data.isPlaying) { isPlaying = !!data.isPlaying; updatePlayBtn(); }
    currentMediaTime = data.rawTime || 0;
    currentMediaDuration = data.rawDuration || 0;
    currentMediaTimeAt = performance.now();
    if (!wasRemote || psLabel.textContent !== sourceLabel()) renderPlayerSource();
    // 再生元から 1.5 秒届かなければ、元の表示に戻す
    remotePlayerTimer = setTimeout(endRemotePlayer, 1500);
}

function endRemotePlayer() {
    if (!remotePlayer) return;
    remotePlayer = null;
    if (audioPlaylist.length === 0) {
        isPlaying = !!(mediaTargetTabId && mediaTabs[mediaTargetTabId]?.playing);
        updatePlayBtn();
        if (mediaTargetTabId) refreshNowPlaying();
        else { nowPlayingTitle.textContent = '再生していません'; document.getElementById('track-artist').textContent = 'タブの音声を自動で検出'; currentMediaTime = 0; currentMediaDuration = 0; }
    }
    renderPlayerSource();
}

window.electronAPI?.onPlayerRemote?.(applyRemotePlayer);

renderPlayerSource();
