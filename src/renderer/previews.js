// ==========================================
// ★ プレビュー（タブのホバーカード・リンクのプレビュー）
// ==========================================
// ・上のタブにマウスを乗せる → タブのタイトル・サイト・縮小画像のカード
//   縮小画像は、そのタブを表示していた時に撮っておいたもの（読み込み完了時・数秒ごと・別のタブへ移る直前）
// ・ページのリンクにマウスを乗せて 0.7 秒 → 行き先のタイトル・説明・画像（main/link-preview.js が取得）
//   シークレットタブでは使わない。どちらも設定（Downloads / Bookmarks / Trash の欄）でオフにできる

const TAB_HOVER_KEY = 'archyndium_tab_hover';
const LINK_PREVIEW_KEY = 'archyndium_link_preview';
const tabHoverEnabled = () => { try { return localStorage.getItem(TAB_HOVER_KEY) !== 'off'; } catch (e) { return true; } };
const linkPreviewEnabled = () => { try { return localStorage.getItem(LINK_PREVIEW_KEY) !== 'off'; } catch (e) { return true; } };
function setTabHoverEnabled(on) { try { localStorage.setItem(TAB_HOVER_KEY, on ? 'on' : 'off'); } catch (e) {} }
function setLinkPreviewEnabled(on) { try { localStorage.setItem(LINK_PREVIEW_KEY, on ? 'on' : 'off'); } catch (e) {} if (!on) hideLinkPreview(); }

const pvEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- タブの縮小画像 ----------
const tabThumbs = {};   // tabId -> dataURL
async function captureTabThumb(tabId) {
    const wv = webviews[tabId];
    if (!wv || document.hidden || isPrivateTab(tabId)) return;
    try {
        const img = await wv.capturePage();
        if (!img || img.isEmpty()) return;
        tabThumbs[tabId] = img.resize({ width: 320, quality: 'good' }).toDataURL();
    } catch (e) {}
}
// 表示中のタブを 10 秒ごとに撮り直す（ウィンドウが隠れている間は撮らない）
setInterval(() => { if (activeTabId && tabHoverEnabled() && isTopLayout?.()) captureTabThumb(activeTabId); }, 10000);
// 別のタブへ移る直前（タブを押した瞬間）に、今のタブを撮っておく
tsTabsEl.addEventListener('pointerdown', () => { if (activeTabId && tabHoverEnabled()) captureTabThumb(activeTabId); }, true);

// ---------- タブのホバーカード ----------
const tabCard = document.createElement('div');
tabCard.className = 'hover-card tab-hover-card';
document.body.appendChild(tabCard);
let tabHoverTimer = null, tabHoverId = null;
function hideTabHover() { clearTimeout(tabHoverTimer); tabHoverId = null; tabCard.classList.remove('show'); }
function showTabHover(el) {
    const id = el.dataset.id, card = getTabCard(id);
    if (!card) return;
    const url = card.getAttribute('data-url') || '';
    const title = card.querySelector('.tab-title')?.textContent || url;
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    const thumb = id === activeTabId ? null : tabThumbs[id];
    const sleeping = card.classList.contains('sleeping');
    tabCard.innerHTML = `<div class="hc-text"><b>${pvEsc(title)}</b><span>${pvEsc(host || url)}${sleeping ? '　・休止中' : ''}${isPrivateTab(id) ? '　・シークレット' : ''}</span></div>`
        + (thumb ? `<img class="hc-thumb" src="${thumb}" alt="">` : '');
    const r = el.getBoundingClientRect();
    tabCard.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 300))}px`;
    tabCard.style.top = `${r.bottom + 6}px`;
    tabCard.classList.add('show');
}
tsTabsEl.addEventListener('pointerover', (e) => {
    const el = e.target.closest('.ts-tab');
    if (!el || el.dataset.id === tabHoverId || !tabHoverEnabled() || tsDragging) return;
    tabHoverId = el.dataset.id;
    clearTimeout(tabHoverTimer);
    // すでにカードが出ている時（隣のタブへ移った時）はすぐ切り替える
    tabHoverTimer = setTimeout(() => showTabHover(el), tabCard.classList.contains('show') ? 0 : 450);
});
tsTabsEl.addEventListener('pointerleave', hideTabHover);
tsTabsEl.addEventListener('pointerdown', hideTabHover);
FX.on('tab-drag-start', hideTabHover);

// ---------- リンクのプレビュー ----------
const linkCard = document.createElement('div');
linkCard.className = 'hover-card link-hover-card';
document.body.appendChild(linkCard);
let linkSeq = 0;
function hideLinkPreview() { linkSeq++; linkCard.classList.remove('show'); }
async function onLinkHover(tabId, data) {
    if (!linkPreviewEnabled() || isPrivateTab(tabId) || !window.electronAPI?.linkPreview) return;
    const wv = webviews[tabId];
    if (!wv || wv.style.display === 'none') return;
    const seq = ++linkSeq;
    const res = await window.electronAPI.linkPreview(data.href).catch(() => null);
    if (seq !== linkSeq || !res || (!res.title && !res.image)) return;
    let host = ''; try { host = new URL(data.href).hostname.replace(/^www\./, ''); } catch (e) {}
    linkCard.innerHTML = (res.image ? `<img class="hc-image" src="${pvEsc(res.image)}" alt="" data-err="hide">` : '')
        + (res.title || res.description ? `<div class="hc-text">${res.title ? `<b>${pvEsc(res.title)}</b>` : ''}${res.description ? `<p>${pvEsc(res.description)}</p>` : ''}<span>${pvEsc(res.site || host)}</span></div>` : '');
    linkCard.classList.toggle('image-only', !res.title && !res.description);
    // リンクの位置（ページ内の座標 × ズーム + webview の位置）の下、入らなければ上に出す
    let zoom = 1; try { zoom = wv.getZoomFactor(); } catch (e) {}
    const wr = wv.getBoundingClientRect();
    const lx = wr.left + data.x * zoom, ly = wr.top + data.y * zoom, lh = data.h * zoom;
    linkCard.style.left = `${Math.max(8, Math.min(lx, innerWidth - 336))}px`;
    linkCard.classList.add('show');
    const h = linkCard.offsetHeight;
    const below = ly + lh + 8;
    linkCard.style.top = `${below + h < innerHeight - 8 ? below : Math.max(8, ly - h - 8)}px`;
}
window.addEventListener('blur', () => { hideLinkPreview(); hideTabHover(); });
// タブを切り替えた・ページを動かした時は消す
tabUrlChangeHooks.push(() => hideLinkPreview());
document.getElementById('webview-container').addEventListener('pointerleave', hideLinkPreview);
