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
    return { tabs: s.tabs || 'top', lyricLine: s.lyricLine ?? true, tint: s.tint ?? 14 };
}
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
let tsDragging = null, tsRenderQueued = false, tsKnown = new Set();
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
    tsKnown = seen;
    const active = tsTabsEl.querySelector('.ts-tab.active');
    if (active) {   // 表示中のタブが見えるようにスクロール
        const a = active.offsetLeft, b = a + active.offsetWidth;
        if (a < tsTabsEl.scrollLeft) tsTabsEl.scrollLeft = a - 8;
        else if (b > tsTabsEl.scrollLeft + tsTabsEl.clientWidth) tsTabsEl.scrollLeft = b - tsTabsEl.clientWidth + 8;
    }
    requestAnimationFrame(() => FX.emit('tabs-changed'));
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
        d.moved = true; d.el.classList.add('ts-dragging');
        FX.emit('tab-drag-start', { id: d.id });
    }
    d.el.style.transform = `translateX(${dx}px)`;
    // となりのタブの中央を越えたら、表示の上だけで入れ替える（離した時にサイドバーへ反映）
    const pinned = d.el.classList.contains('pinned');
    const sibs = [...tsTabsEl.querySelectorAll('.ts-tab:not(.ts-dragging)')].filter(s => s.classList.contains('pinned') === pinned);
    const r = d.el.getBoundingClientRect(), mid = r.left + r.width / 2;
    const before = sibs.find(s => { const b = s.getBoundingClientRect(); return mid < b.left + b.width / 2; });
    const oldLeft = d.el.getBoundingClientRect().left - dx;
    if (before && before.previousElementSibling !== d.el && before !== d.el.nextElementSibling) before.before(d.el);
    else if (!before && sibs.length && sibs[sibs.length - 1].nextElementSibling !== d.el) sibs[sibs.length - 1].after(d.el);
    else return;
    const newLeft = d.el.getBoundingClientRect().left - dx;
    d.x0 += newLeft - oldLeft;
    d.el.style.transform = `translateX(${e.clientX - d.x0}px)`;
    FX.emit('tabs-changed');
});
function tsEndDrag(e) {
    const d = tsDragging; if (!d) return;
    tsDragging = null;
    d.el.classList.remove('ts-dragging'); d.el.style.transform = '';
    if (!d.moved) { activateTab(d.id); return; }
    // ウィンドウの外で離したら別ウィンドウへ（設定でオンの時）
    const outside = e && (e.clientY < -10 || e.clientY > innerHeight + 10 || e.clientX < -10 || e.clientX > innerWidth + 10);
    if (outside && typeof tabTearOffEnabled === 'function' && tabTearOffEnabled() && typeof moveTabToNewWindow === 'function') { moveTabToNewWindow(d.id); return; }
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

// ---------- パネル（Work / Focus・ブックマーク・履歴など）の開閉 ----------
document.getElementById('btn-panel').addEventListener('click', () => {
    const open = !document.body.classList.contains('panel-open');
    document.body.classList.toggle('panel-open', open);
    commandCenter.classList.remove('collapsed');
});
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
    const title = nowPlayingTitle?.textContent || '';
    const t = npChipEl.querySelector('.np-title span');
    if (t.textContent !== title) { t.textContent = title; npChipEl.querySelector('.np-title').title = title; }
    npChipEl.querySelector('.np-play').innerHTML = isPlaying
        ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>'
        : '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
}
setInterval(updateNpChip, 400);
npChipEl?.addEventListener('click', (e) => {
    if (e.target.closest('.np-play')) { document.getElementById('btn-play').click(); setTimeout(updateNpChip, 60); return; }
    if (e.target.closest('.np-lyrics')) { document.getElementById('btn-lyrics').click(); return; }
    if (e.target.closest('.np-popout')) { document.getElementById('btn-popout').click(); return; }
    // 曲名を押したら、操作しているタブを表示
    if (mediaTargetTabId) activateTab(mediaTargetTabId);
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
        `<label class="fx-param fx-param-inline"><span class="fx-param-label">タブバーの色づけ（テーマ色）</span><output>${s.tint}%</output>
            <input type="range" min="0" max="40" step="1" value="${s.tint}" data-layout-tint="1"></label>` : '');
}
document.getElementById('panel-settings').addEventListener('click', (e) => {
    const tabs = e.target.closest('[data-layout-tabs]');
    if (tabs) { setLayoutSetting('tabs', tabs.dataset.layoutTabs); renderLayoutSettings(); if (typeof renderFxSettings === 'function') renderFxSettings(); return; }
    if (e.target.closest('[data-layout-lyric]')) { setLayoutSetting('lyricLine', !layoutSettings().lyricLine); renderLayoutSettings(); }
});
document.getElementById('panel-settings').addEventListener('input', (e) => {
    const r = e.target.closest('[data-layout-tint]'); if (!r) return;
    setLayoutSetting('tint', Number(r.value));
    r.closest('.fx-param').querySelector('output').textContent = r.value + '%';
});
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', renderLayoutSettings);
window.addEventListener('storage', (e) => { if (e.key === LAYOUT_KEY) { applyLayout(); renderLayoutSettings(); } });

applyLayout();
