// ==========================================
// ★ 上のタブバー（レイアウト「上タブ」）
// ==========================================
// タブの本体（並び・グループ・固定・セッション保存・右クリックメニューなど）は今まで通りサイドバーの
// #panel-tabs にあり、このファイルはそれを上のタブバーに「映して」表示・操作するだけ。
// そのため、サイドバー側の機能はレイアウトを切り替えてもすべてそのまま使える。
//
// 設定（localStorage 'archyndium_layout'）
//   tabs: 'top' | 'side'   … タブの位置
//   lyricLine: true/false  … アドレスバーの下に歌詞を 1 行表示
//   tint: 0〜40            … タブバーをテーマ色でほんのり色づける（%）

const LAYOUT_KEY = 'archyndium_layout';
const tabstripEl = document.getElementById('tabstrip');
const tsTabsEl = document.getElementById('ts-tabs');
const lyricLineEl = document.getElementById('lyric-line');
const npChipEl = document.getElementById('np-chip');

function layoutSettings() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (e) {}
    return { tabs: s.tabs || 'top', lyricLine: s.lyricLine ?? true, autoLyrics: s.autoLyrics ?? true, tint: s.tint ?? 14 };
}
// ▼ 追加：曲が始まった・次の曲になった時に、歌詞パネルを開かなくても歌詞を自動で取りに行くか（audio.js の syncTick から）
//   上タブで「歌詞を 1 行表示」がオンの時だけ。新しいタブのページの歌詞表示にも使われる
function autoLyricsEnabled() { const s = layoutSettings(); return s.tabs === 'top' && s.lyricLine && s.autoLyrics; }
function setLayoutSetting(key, value) {
    const s = layoutSettings(); s[key] = value;
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(s)); } catch (e) {}
    applyLayout();
}
const isTopLayout = () => document.body.classList.contains('layout-top');

function applyLayout() {
    const s = layoutSettings(), top = s.tabs === 'top';
    const changed = top !== isTopLayout();
    document.body.classList.toggle('layout-top', top);
    document.documentElement.style.setProperty('--strip-tint', s.tint + '%');
    // ウィンドウの ー □ × は、上タブの時はタブバーの右端へ
    const wc = document.querySelector('.window-controls');
    if (wc) (top ? tabstripEl : document.querySelector('.canvas-header')).appendChild(wc);
    if (top) { commandCenter.classList.remove('collapsed'); document.body.classList.remove('panel-open'); renderTabstrip(); }
    else document.body.classList.remove('panel-open');
    updateLyricLine();
    if (changed) { FX.refreshAll(); FX.emit('layout'); }
}

// ---------- タブバーの描画（サイドバーの状態を映す） ----------
let tsDragging = null, tsRenderQueued = false, tsKnown = new Set(), tsGeoKey = '';
const tsEsc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tsTabHtml(card, group) {
    const id = card.getAttribute('data-tab-id');
    const title = card.querySelector('.tab-title')?.textContent || 'New Tab';
    const icon = card.querySelector('.favicon')?.outerHTML || '';
    const cls = ['ts-tab'];
    if (id === activeTabId) cls.push('active');
    if (card.classList.contains('pinned')) cls.push('pinned');
    if (card.classList.contains('private')) cls.push('private');
    if (card.classList.contains('sleeping')) cls.push('sleeping');
    if (!tsKnown.has(id)) cls.push('ts-enter');
    const audio = card.querySelector('.tab-audio');
    const showAudio = audio && audio.style.display !== 'none';
    return `<div class="${cls.join(' ')}" data-id="${id}" ${group ? `data-group="1" style="--gc:${group.color}"` : ''} title="${tsEsc(title)}">
        ${icon}<span class="ts-title">${tsEsc(title)}</span>${showAudio ? `<span class="ts-audio${audio.classList.contains('muted') ? ' muted' : ''}" title="${tsEsc(audio.title)}">${audio.innerHTML}</span>` : ''}
        <span class="ts-x" title="閉じる (Ctrl+W)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span></div>`;
}

function renderTabstrip() {
    tsRenderQueued = false;
    if (!isTopLayout() || tsDragging) return;
    let html = '';
    const seen = new Set();
    document.querySelectorAll('#pinned-tabs > .tab-card[data-tab-id]').forEach(c => { html += tsTabHtml(c, null); seen.add(c.dataset.tabId); });
    document.querySelectorAll('#tabs-container > .tab-card[data-tab-id], #tabs-container > .tab-group').forEach(el => {
        if (el.classList.contains('tab-card')) { html += tsTabHtml(el, null); seen.add(el.dataset.tabId); return; }
        const ind = el.querySelector('.group-indicator');
        const color = ind?.style.backgroundColor || '#AAB7B7';
        const title = el.querySelector('.group-title')?.textContent || '';
        const list = el.querySelector('.group-list');
        const cards = [...(list?.querySelectorAll(':scope > .tab-card[data-tab-id]') || [])];
        const collapsed = list?.classList.contains('collapsed');
        const idx = [...document.querySelectorAll('#tabs-container > .tab-group')].indexOf(el);
        html += `<div class="ts-group${collapsed ? ' collapsed' : ''}" data-group-idx="${idx}" style="--gc:${color}" title="${tsEsc(title)}（クリックで開く / 閉じる・右クリックでメニュー）">${tsEsc(title) || '&nbsp;'}${collapsed && cards.length ? `<i>${cards.length}</i>` : ''}</div>`;
        if (!collapsed) cards.forEach(c => { html += tsTabHtml(c, { color }); seen.add(c.dataset.tabId); });
    });
    tsTabsEl.innerHTML = html;
    // シークレットタブを表示中は、タブ・ツールバー・ページの周りを同じ紫でつなげる
    document.body.classList.toggle('private-active', !!activeTabId && isPrivateTab(activeTabId));
    tsKnown = seen;
    if (tsIncoming) { tsIncoming.el = null; tsPlaceIncoming(); }
    const active = tsTabsEl.querySelector('.ts-tab.active');
    if (active && tsTabsEl.scrollWidth > tsTabsEl.clientWidth + 1) {   // 表示中のタブが見えるようにスクロール（はみ出している時だけ）
        // ▼ 修正：以前は offsetLeft（タブバーの左の余白を含む位置）で計算していたため、タブを押すたびに少し左へずれていた
        const box = tsTabsEl.getBoundingClientRect(), r = active.getBoundingClientRect();
        if (r.left < box.left) tsTabsEl.scrollLeft -= box.left - r.left + 8;
        else if (r.right > box.right) tsTabsEl.scrollLeft += r.right - box.right + 8;
    } else if (tsTabsEl.scrollLeft) tsTabsEl.scrollLeft = 0;
    requestAnimationFrame(() => FX.emit('tabs-changed'));
    // ▼ 修正：タブの数や幅が変わると、ウィンドウを掴める範囲がずれて残ることがあった（右上のボタンの左側など）
    const geoKey = [...tsTabsEl.children].map(el => el.offsetWidth).join(',') + '|' + tsTabsEl.offsetWidth;
    if (geoKey !== tsGeoKey && typeof refreshDragRegions === 'function') { tsGeoKey = geoKey; refreshDragRegions(); setTimeout(refreshDragRegions, 300); }
}
function queueTabstrip() { if (!tsRenderQueued) { tsRenderQueued = true; requestAnimationFrame(renderTabstrip); } }

new MutationObserver(queueTabstrip).observe(document.getElementById('panel-tabs'), {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-url', 'src', 'style'],
});
new ResizeObserver(() => FX.emit('tabs-changed')).observe(tsTabsEl);
tsTabsEl.addEventListener('scroll', () => FX.emit('tabs-changed'), { passive: true });
// 縦のホイールでも横にスクロール
tsTabsEl.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tsTabsEl.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

// ---------- 操作 ----------
function tsCloseTab(id) {
    FX.emit('tab-close', { id });
    const el = tsTabsEl.querySelector(`.ts-tab[data-id="${CSS.escape(id)}"]`);
    if (el && FX.isActive('tab-motion')) { el.classList.add('ts-leave'); setTimeout(() => closeTab(id), 170); }
    else closeTab(id);
}
const tsGroupEl = (chip) => document.querySelectorAll('#tabs-container > .tab-group')[+chip.dataset.groupIdx];

tsTabsEl.addEventListener('pointerdown', (e) => {
    const x = e.target.closest('.ts-x, .ts-audio');
    if (x) { e.stopPropagation(); return; }
    const tab = e.target.closest('.ts-tab');
    if (!tab || e.button !== 0) return;
    tsDragging = { el: tab, id: tab.dataset.id, x0: e.clientX, y0: e.clientY, moved: false, pointerId: e.pointerId };
    tab.setPointerCapture(e.pointerId);
});
tsTabsEl.addEventListener('pointermove', (e) => {
    const d = tsDragging; if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved) {
        if (Math.abs(dx) < 5 && Math.abs(e.clientY - d.y0) < 5) return;
        d.moved = true;
        FX.emit('tab-drag-start', { id: d.id });   // 先に知らせる（演出がつかむ前の位置で雪を落とせるように）
        d.el.classList.add('ts-dragging');
        d.lastX = e.clientX; d.lastT = performance.now();
    }
    // ▼ 変更：タブバーから大きく離れた（ウィンドウの外・下へ引き出した）ら「切り離し」の見た目にし、並べ替えはしない。
    //   離すと、別のウィンドウの上ならそのウィンドウへ、何も無い所なら新しいウィンドウになる
    const stripRect = tabstripEl.getBoundingClientRect();
    const detached = e.clientY < -12 || e.clientY > stripRect.bottom + 56 || e.clientX < -12 || e.clientX > innerWidth + 12;
    d.el.classList.toggle('ts-detach', detached);
    tsDragGhost(d, e, detached);
    // タブはタブバーの中だけで動かす（画面の外まで飛んで、表示が崩れて見えないように）
    const tr = tsTabsEl.getBoundingClientRect(), er = d.el.getBoundingClientRect();
    const baseLeft = er.left - (parseFloat((d.el.style.transform.match(/translateX\((-?[\d.]+)/) || [0, 0])[1]) || 0);
    const clampedDx = Math.max(tr.left - baseLeft, Math.min(tr.right - er.width - baseLeft, dx));
    d.el.style.transform = detached ? 'translateY(4px)' : `translateX(${clampedDx}px)`;   // 引き出し中は元の場所で薄く表示
    if (detached) { d.lastX = e.clientX; d.lastT = performance.now(); return; }
    const now = performance.now(), vx = (e.clientX - d.lastX) / Math.max(8, now - d.lastT) * 1000;
    d.lastX = e.clientX; d.lastT = now;
    FX.emit('tab-drag-move', { id: d.id, vx });
    // となりのタブの中央を越えたら、表示の上だけで入れ替える（離した時にサイドバーへ反映）
    const pinned = d.el.classList.contains('pinned');
    const sibs = [...tsTabsEl.querySelectorAll('.ts-tab:not(.ts-dragging)')].filter(s => s.classList.contains('pinned') === pinned);
    const r = d.el.getBoundingClientRect(), mid = r.left + r.width / 2;
    const before = sibs.find(s => { const b = s.getBoundingClientRect(); return mid < b.left + b.width / 2; });
    const oldLeft = d.el.getBoundingClientRect().left - dx;
    if (before && before.previousElementSibling !== d.el && before !== d.el.nextElementSibling) before.before(d.el);
    else if (!before && sibs.length && sibs[sibs.length - 1].nextElementSibling !== d.el) sibs[sibs.length - 1].after(d.el);
    else return;
    try { d.el.setPointerCapture(d.pointerId); } catch (err) {}   // 並べ替えで要素を動かすとキャプチャが外れるので付け直す
    const newLeft = d.el.getBoundingClientRect().left - dx;
    d.x0 += newLeft - oldLeft;
    d.el.style.transform = `translateX(${e.clientX - d.x0}px)`;
    FX.emit('tabs-changed');
});
// ▼ 追加：引き出している間は、元の場所を閉じて、タブとページの小さな画像をマウスにつける（main/tab-drag.js）。
//   別のウィンドウの上では、そのウィンドウのタブバーに入る場所が開く。タブバーに戻すとゴーストは消える
function tsDragGhost(d, e, detached) {
    const api = window.electronAPI;
    if (!api?.tabDragStart || typeof tabTearOffEnabled !== 'function' || !tabTearOffEnabled()) return;
    if (detached && !d.ghost) {
        d.ghost = true;
        const cs = getComputedStyle(document.body);
        let wcId = null; try { wcId = webviews[d.id]?.getWebContentsId?.() ?? null; } catch (err) {}
        api.tabDragStart({
            title: d.el.querySelector('.ts-title')?.textContent || '', webContentsId: wcId,
            bg: cs.getPropertyValue('--bg-canvas').trim(), fg: cs.getPropertyValue('--text-primary').trim(), accent: cs.getPropertyValue('--theme-light').trim(),
        });
    }
    d.el.classList.toggle('ts-out', detached && !!d.ghost);
    if (d.ghost) api.tabDragMove({ x: e.screenX, y: e.screenY, inside: !detached });
}
function tsEndDrag(e) {
    const d = tsDragging; if (!d) return;
    tsDragging = null;
    const detached = d.el.classList.contains('ts-detach');
    d.el.classList.remove('ts-dragging', 'ts-detach', 'ts-out'); d.el.style.transform = '';
    const endGhost = () => { if (d.ghost) window.electronAPI?.tabDragEnd?.(); };
    if (!d.moved) { activateTab(d.id); return; }
    if (!(detached && e && typeof tabTearOffEnabled === 'function' && tabTearOffEnabled())) endGhost();
    // ▼ 変更：タブバーから引き出して離したら、別のウィンドウの上ならそこへ移し（ウィンドウに戻す）、
    //   何も無い所ならその位置に新しいウィンドウを作る（設定でオンの時）
    if (detached && e && typeof tabTearOffEnabled === 'function' && tabTearOffEnabled()) {
        const card = getTabCard(d.id);
        const outsideWindow = e.clientY < -10 || e.clientY > innerHeight + 10 || e.clientX < -10 || e.clientX > innerWidth + 10;
        // 離した後でゴーストを消す（先に消すと、入る場所の表示が先に閉じてしまう）
        if (card && (outsideWindow || getTabCards().length > 1)) { Promise.resolve(tearOffTab(card, e.screenX, e.screenY)).finally(endGhost); queueTabstrip(); return; }
        endGhost(); queueTabstrip(); return;
    }
    // 上で並べ替えた順をサイドバーのタブへ反映する（後ろのタブの前に入れると、そのタブのグループに入る）
    const card = getTabCard(d.id);
    const next = d.el.nextElementSibling?.closest('.ts-tab');
    const prev = d.el.previousElementSibling;
    if (card) {
        if (next) getTabCard(next.dataset.id)?.before(card);
        else if (prev?.classList.contains('ts-tab')) getTabCard(prev.dataset.id)?.after(card);
        else if (prev?.classList.contains('ts-group')) tsGroupEl(prev)?.querySelector('.group-list')?.prepend(card);
        if (typeof scheduleSaveSession === 'function') scheduleSaveSession();
    }
    queueTabstrip();
}
tsTabsEl.addEventListener('pointerup', tsEndDrag);
tsTabsEl.addEventListener('pointercancel', () => tsEndDrag(null));
// ▼ 追加：マウスのキャプチャが外れた（ウィンドウの切り替えなど）時も、ドラッグ中の見た目を必ず元に戻す
tsTabsEl.addEventListener('lostpointercapture', () => {
    setTimeout(() => { const d = tsDragging; if (d && !d.el.hasPointerCapture?.(d.pointerId)) tsEndDrag(null); }, 30);
});
window.addEventListener('blur', () => { if (tsDragging) tsEndDrag(null); });
tsTabsEl.addEventListener('click', (e) => {
    const x = e.target.closest('.ts-x');
    if (x) { tsCloseTab(x.closest('.ts-tab').dataset.id); return; }
    const au = e.target.closest('.ts-audio');
    if (au) { const id = au.closest('.ts-tab').dataset.id; setTabMuted(id, !isTabMuted(id)); return; }
    const chip = e.target.closest('.ts-group');
    if (chip) tsGroupEl(chip)?.querySelector('.group-header')?.click();
});
tsTabsEl.addEventListener('auxclick', (e) => { const t = e.target.closest('.ts-tab'); if (t && e.button === 1) { e.preventDefault(); tsCloseTab(t.dataset.id); } });
tsTabsEl.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // 中クリックの自動スクロールを出さない
// 右クリックはサイドバーのタブ・グループと同じメニュー
tsTabsEl.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.ts-tab'), chip = e.target.closest('.ts-group');
    const target = t ? getTabCard(t.dataset.id) : chip ? tsGroupEl(chip)?.querySelector('.group-header') : null;
    if (!target) return;
    e.preventDefault();
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
});
document.getElementById('ts-new').addEventListener('click', () => openNewTab());

// ---------- 別のウィンドウからタブを持ってきた時（入る場所を開く） ----------
let tsIncoming = null;   // { el, clientX, title }
function tsPlaceIncoming() {
    if (!tsIncoming || !isTopLayout()) return;
    const { clientX } = tsIncoming;
    let el = tsIncoming.el;
    if (!el || !el.isConnected) {
        el = tsIncoming.el = document.createElement('div');
        el.className = 'ts-tab ts-incoming';
        el.innerHTML = `<span class="ts-title">${tsEsc(tsIncoming.title || '')}</span>`;
    }
    const sibs = [...tsTabsEl.querySelectorAll('.ts-tab:not(.ts-incoming):not(.pinned)')];
    const before = sibs.find(s => { const b = s.getBoundingClientRect(); return clientX < b.left + b.width / 2; });
    if (before) { if (el.nextElementSibling !== before) before.before(el); }
    else if (tsTabsEl.lastElementChild !== el) tsTabsEl.appendChild(el);
}
function tsClearIncoming() {
    tsIncoming?.el?.remove(); tsIncoming = null;
    document.body.classList.remove('tab-drop-target');
}
window.electronAPI?.onTabDragHover?.(({ leave, clientX, title } = {}) => {
    if (leave) { tsClearIncoming(); return; }
    document.body.classList.add('tab-drop-target');
    tsIncoming = { ...(tsIncoming || {}), clientX, title };
    tsPlaceIncoming();
});
window.electronAPI?.onTabDropIn?.(async ({ url, isPrivate } = {}) => {
    // 開いていた場所の次にあるもの（タブ・グループ）を覚えてから開く
    let next = tsIncoming?.el?.isConnected ? tsIncoming.el.nextElementSibling : null;
    const nextTab = next?.classList.contains('ts-tab') ? getTabCard(next.dataset.id) : null;
    const nextGroup = next?.classList.contains('ts-group') ? tsGroupEl(next) : null;
    const placed = !!tsIncoming?.el?.isConnected;
    tsClearIncoming();
    const card = await openNewTab(url, { isPrivate: !!isPrivate });
    if (card && placed) {
        if (nextTab) nextTab.before(card);
        else if (nextGroup) nextGroup.before(card);
        else document.getElementById('tabs-container').appendChild(card);
        if (typeof scheduleSaveSession === 'function') scheduleSaveSession();
    }
});

// ---------- パネル（Work / Focus・ブックマーク・履歴など）の開閉 ----------
document.getElementById('btn-panel').addEventListener('click', () => {
    const open = !document.body.classList.contains('panel-open');
    document.body.classList.toggle('panel-open', open);
    commandCenter.classList.remove('collapsed');
});
// ▼ 追加：ツールバーのブックマーク・設定ボタン。パネルを開いてそのページを表示する（表示中ならパネルを閉じる）
function openSidePanel(panelId) {
    const icon = document.querySelector(`.tool-icon[data-panel="${panelId}"]`);
    const showing = document.body.classList.contains('panel-open') && icon.classList.contains('active') && !commandCenter.classList.contains('collapsed');
    if (isTopLayout() && showing) { document.body.classList.remove('panel-open'); return; }
    document.body.classList.add('panel-open');
    commandCenter.classList.remove('collapsed');
    icon.classList.remove('active');   // panels.js に「別のパネルへの切り替え」として扱わせる（中身も描き直される）
    icon.click();
}
const openSettingsPanel = () => openSidePanel('panel-settings');
document.querySelectorAll('.panel-pill[data-open-panel]').forEach(btn => btn.addEventListener('click', () => openSidePanel(btn.dataset.openPanel)));
const panelPillObserver = new MutationObserver(() => {
    const open = document.body.classList.contains('panel-open');
    document.querySelectorAll('.panel-pill[data-open-panel]').forEach(btn => {
        btn.classList.toggle('on', open && document.querySelector(`.tool-icon[data-panel="${btn.dataset.openPanel}"]`)?.classList.contains('active'));
    });
});
panelPillObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
panelPillObserver.observe(document.querySelector('.nexus'), { attributes: true, attributeFilter: ['class'], subtree: true });

// 左のアイコンで「表示中のパネル」をもう一度押したら、パネルごと閉じる
toolIcons.forEach(icon => icon.addEventListener('click', () => {
    if (isTopLayout() && commandCenter.classList.contains('collapsed')) { commandCenter.classList.remove('collapsed'); document.body.classList.remove('panel-open'); }
}));

// ---------- 再生中の曲（アドレスバーの右の小さな表示） ----------
function updateNpChip() {
    if (!npChipEl) return;
    const hasMedia = !!(mediaTargetTabId || (typeof audioPlaylist !== 'undefined' && audioPlaylist.length));
    npChipEl.classList.toggle('idle', !hasMedia);
    npChipEl.classList.toggle('playing', !!isPlaying);
    const title = hasMedia ? (nowPlayingTitle?.textContent || '') : '再生中の曲はありません';
    const t = npChipEl.querySelector('.np-title span');
    if (t.textContent !== title) { t.textContent = title; npChipEl.querySelector('.np-title').title = title; }
    const playBtn = npChipEl.querySelector('.np-play');
    if (playBtn.dataset.state === String(!!isPlaying)) return;   // 変わった時だけ描き直す
    playBtn.dataset.state = String(!!isPlaying);
    playBtn.innerHTML = isPlaying
        ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>'
        : '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
}
setInterval(updateNpChip, 400);
npChipEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === npChipEl && mediaTargetTabId) activateTab(mediaTargetTabId); if (e.key === 'Escape') npChipEl.blur(); });
npChipEl?.addEventListener('click', (e) => {
    if (e.target.closest('.np-play')) { document.getElementById('btn-play').click(); setTimeout(updateNpChip, 60); return; }
    if (e.target.closest('.np-lyrics')) { document.getElementById('btn-lyrics').click(); return; }
    if (e.target.closest('.np-popout')) { document.getElementById('btn-popout').click(); return; }
    // 音のボタン・曲名を押したら、操作しているタブを表示
    if (mediaTargetTabId) { activateTab(mediaTargetTabId); npChipEl.blur(); }
});

// ---------- 歌詞の 1 行（アドレスバーの下） ----------
let lyricLineText = '';
function updateLyricLine() {
    const show = isTopLayout() && layoutSettings().lyricLine && !!lyricLineText;
    lyricLineEl.classList.toggle('show', show);
}
FX.on('lyric-line', ({ text }) => {
    const span = lyricLineEl.querySelector('.ll-text');
    lyricLineText = text;
    if (text) {
        span.classList.add('swap');
        setTimeout(() => { span.textContent = text; span.classList.remove('swap'); }, 180);
    }
    updateLyricLine();
});
lyricLineEl.addEventListener('click', () => document.getElementById('btn-lyrics').click());

// ---------- 設定画面（レイアウト） ----------
function renderLayoutSettings() {
    const box = document.getElementById('layout-options');
    if (!box) return;
    const s = layoutSettings();
    box.innerHTML =
        settingRow({ icon: '▭', label: 'タブを上に並べる', sub: 'Work / Focus などは左上のボタンで開閉', checked: s.tabs === 'top', attrs: 'data-layout-tabs="top"' }) +
        settingRow({ icon: '▯', label: 'タブをサイドバーに並べる', sub: '以前の形', checked: s.tabs === 'side', attrs: 'data-layout-tabs="side"' }) +
        (s.tabs === 'top' ? settingRow({ icon: '♪', label: 'アドレスバーの下に歌詞を 1 行表示', sub: 'クリックで歌詞の全文', checked: s.lyricLine, attrs: 'data-layout-lyric="1"' }) +
        (s.lyricLine ? settingRow({ icon: '↻', label: '曲が変わったら歌詞を自動で表示', sub: '歌詞ボタンを押さなくても取得します（曲名で歌詞サイトを検索します）', checked: s.autoLyrics, attrs: 'data-layout-autolyrics="1"' }) : '') +
        `<label class="fx-param fx-param-inline"><span class="fx-param-label">タブバーの色づけ（テーマ色）</span><output>${s.tint}%</output>
            <input type="range" min="0" max="40" step="1" value="${s.tint}" data-layout-tint="1"></label>` : '');
}
document.getElementById('panel-settings').addEventListener('click', (e) => {
    const tabs = e.target.closest('[data-layout-tabs]');
    if (tabs) { setLayoutSetting('tabs', tabs.dataset.layoutTabs); renderLayoutSettings(); if (typeof renderFxSettings === 'function') renderFxSettings(); return; }
    if (e.target.closest('[data-layout-lyric]')) { setLayoutSetting('lyricLine', !layoutSettings().lyricLine); renderLayoutSettings(); }
    if (e.target.closest('[data-layout-autolyrics]')) {
        setLayoutSetting('autoLyrics', !layoutSettings().autoLyrics); renderLayoutSettings();
        // オンにした時、再生中の曲の歌詞がまだ無ければすぐに取りに行く
        if (autoLyricsEnabled() && !currentLyricsText && typeof autoFetchLyrics === 'function') autoFetchLyrics(nowPlayingTitle.textContent);
    }
});
document.getElementById('panel-settings').addEventListener('input', (e) => {
    const r = e.target.closest('[data-layout-tint]'); if (!r) return;
    setLayoutSetting('tint', Number(r.value));
    r.closest('.fx-param').querySelector('output').textContent = r.value + '%';
});
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', renderLayoutSettings);
window.addEventListener('storage', (e) => { if (e.key === LAYOUT_KEY) { applyLayout(); renderLayoutSettings(); } });

applyLayout();
