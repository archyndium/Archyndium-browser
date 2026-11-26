// ==========================================
// ★ ページ翻訳・動画の字幕翻訳（端末内の翻訳：main/translator.js）
// ==========================================
// ・アドレスバーの「あA」ボタン：外国語のページで表示。押すと翻訳の小窓（翻訳 / 原文に戻す / 字幕も翻訳）
// ・翻訳の方法：「端末内（無料・送信なし）」が標準。「Google 翻訳」も選べる（その時はページが Google に送られる）
// ・ページの文章はページの中のスクリプト（page-translate-inject.js）が集めて、訳文を入れ直す。
//   見えている所から順に訳し、後から増えた部分（無限スクロールなど）も続けて訳す
// ・今は英語 ⇔ 日本語。モデルは初めて使う時に 1 回だけダウンロードする
const TR_KEY = 'archyndium_translate';
const TR_LANG_NAME = { ja: '日本語', en: '英語' };
function trSettings() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(TR_KEY)) || {}; } catch (e) {}
    return { engine: s.engine || 'local', auto: !!s.auto, subMode: s.subMode || 'both', target: s.target || 'ja' };
}
function setTrSetting(key, value) { const s = trSettings(); s[key] = value; try { localStorage.setItem(TR_KEY, JSON.stringify(s)); } catch (e) {} }

const trTabs = {};   // tabId -> { lang, translated, busy, done, total, subs, gen, poll }
const trState = (tabId) => (trTabs[tabId] ||= { lang: null, translated: false, busy: false, done: 0, total: 0, subs: false, gen: 0, poll: null });
let trModelStatus = {};
const refreshModelStatus = async () => { try { trModelStatus = await window.electronAPI.translateStatus(); } catch (e) {} return trModelStatus; };
refreshModelStatus();

// ---------- 言語の判定（ページの lang 属性と、本文の文字の種類から） ----------
function detectLang(sample, htmlLang) {
    const t = (sample || '').replace(/\s+/g, '');
    if (!t) return null;
    const kana = (t.match(/[\u3040-\u30FF]/g) || []).length;
    const cjk = (t.match(/[\u4E00-\u9FFF]/g) || []).length;
    const hangul = (t.match(/[\uAC00-\uD7AF]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    // ▼ 修正：以前は日本語が少しでもあると「日本語のページ」にしていたため、メニューだけ日本語で本文が英語の
    //   ページ（日本語表示の Reddit など）で翻訳のボタンが出なかった。文字の量を比べて決める。
    //   日本語は 1 文字 = 1 語に近く、英語は 1 語 = 約 5 文字なので、英字は 1/4 にして比べる
    const ja = kana > 0 ? kana + cjk : 0;
    const words = latin / 4;
    if (ja > words && ja > 20) return 'ja';
    if (hangul > words && hangul > 20) return 'ko';
    if (cjk > words && cjk > 20) return 'zh';
    if (latin > 80) return htmlLang && !htmlLang.startsWith('en') && !htmlLang.startsWith('ja') ? htmlLang.slice(0, 2) : 'en';
    return null;
}
const pairFor = (from, to) => (from && to && from !== to && trModelStatus[`${from}-${to}`]) ? `${from}-${to}` : null;

// ---------- ページへスクリプトを入れる ----------
async function injectTr(tabId) {
    const wv = webviews[tabId]; if (!wv) return false;
    try { await wv.executeJavaScript(pageTranslateInjectSource()); return true; } catch (e) { return false; }
}
const runInPage = (tabId, js) => webviews[tabId]?.executeJavaScript(js).catch(() => null);

async function detectTabLang(tabId) {
    const wv = webviews[tabId]; if (!wv) return;
    let url = ''; try { url = wv.getURL(); } catch (e) {}
    if (!/^https?:/i.test(url)) { trState(tabId).lang = null; updateTranslateButton(); return; }
    if (!(await injectTr(tabId))) return;
    const info = await runInPage(tabId, '__arcTr.detect()');
    trState(tabId).lang = info ? detectLang(info.sample, info.lang || '') : null;
    if (tabId === activeTabId) updateTranslateButton();
}

// ---------- ページ翻訳 ----------
function batchesOf(items) {
    const out = []; let cur = [], len = 0;
    items.forEach(it => {
        if (cur.length && (cur.length >= 24 || len + it.text.length > 3500)) { out.push(cur); cur = []; len = 0; }
        cur.push(it); len += it.text.length;
    });
    if (cur.length) out.push(cur);
    return out;
}
async function translateItems(tabId, gen, from, to, items) {
    const st = trState(tabId);
    // すでに訳す先の言語で書かれている部分（英語のページの中の日本語のメニューなど）は訳さない
    const already = to === 'ja' ? /[\u3040-\u30FF]/ : from === 'ja' ? /^[^\u3040-\u30FF\u4E00-\u9FFF]*$/ : null;
    if (already) { const keep = items.filter(it => !already.test(it.text)); st.done += items.length - keep.length; items = keep; }
    for (const batch of batchesOf(items)) {
        if (st.gen !== gen || !st.translated) return;
        const res = await window.electronAPI.translateTexts({ from, to, texts: batch.map(b => b.text) });
        if (res.error) throw new Error(res.error);
        if (st.gen !== gen || !st.translated) return;
        await runInPage(tabId, `__arcTr.apply(${JSON.stringify(batch.map((b, i) => ({ id: b.id, text: res.result[i] })))})`);
        st.done += batch.length;
        if (tabId === activeTabId) renderTrPopover();
    }
}
async function ensureModel(pair) {
    await refreshModelStatus();
    if (trModelStatus[pair]?.installed) return true;
    renderTrPopover();
    const r = await window.electronAPI.translateDownload(pair);
    await refreshModelStatus();
    if (r !== true) { showToast(`翻訳モデルのダウンロードに失敗しました${r && r.error ? '：' + r.error : ''}`); return false; }
    return true;
}
async function translateTab(tabId = activeTabId, { quiet = false } = {}) {
    const st = trState(tabId), s = trSettings();
    if (!st.lang) await detectTabLang(tabId);
    const from = st.lang, to = s.target;
    if (s.engine === 'google') { translatePage(to); closeTrPopover(); return; }
    const pair = pairFor(from, to);
    if (!pair) { if (!quiet) showToast(from === to ? 'このページはすでに' + (TR_LANG_NAME[to] || to) + 'です' : 'この言語の端末内翻訳にはまだ対応していません（Google 翻訳を選ぶと翻訳できます）'); return; }
    if (st.busy) return;
    st.busy = true; st.translated = true; st.done = 0; st.total = 0; const gen = ++st.gen;
    updateTranslateButton(); renderTrPopover();
    try {
        if (!(await ensureModel(pair))) { st.translated = false; return; }
        await injectTr(tabId);
        const items = await runInPage(tabId, '__arcTr.collect()') || [];
        st.total = items.length; renderTrPopover();
        const [f, t] = pair.split('-');
        await translateItems(tabId, gen, f, t, items);
        // 後から増えた部分も訳す（無限スクロールなど）
        clearInterval(st.poll);
        st.poll = setInterval(async () => {
            if (!webviews[tabId] || st.gen !== gen || !st.translated) { clearInterval(st.poll); return; }
            if (st.busyNew) return;
            st.busyNew = true;
            try { const more = await runInPage(tabId, '__arcTr.takeNew()') || []; if (more.length) { st.total += more.length; await translateItems(tabId, gen, f, t, more); } } catch (e) {}
            st.busyNew = false;
        }, 1800);
    } catch (e) {
        st.translated = false;
        showToast('翻訳できませんでした：' + (e.message || e));
    } finally {
        st.busy = false;
        updateTranslateButton(); renderTrPopover();
    }
}
async function restoreTab(tabId = activeTabId) {
    const st = trState(tabId);
    st.translated = false; st.gen++; clearInterval(st.poll);
    await runInPage(tabId, 'window.__arcTr && __arcTr.restore()');
    updateTranslateButton(); renderTrPopover();
}

// ---------- 字幕の翻訳 ----------
const subCache = new Map();   // 'en-ja|text' -> 訳
async function translateSubtitleLines(lines) {
    const s = trSettings();
    const groups = {};
    lines.forEach(l => {
        const from = /[぀-ヿ]/.test(l) ? 'ja' : 'en';
        const pair = pairFor(from, s.target);
        if (!pair) return;
        if (!subCache.has(pair + '|' + l)) (groups[pair] ||= []).push(l);
    });
    for (const [pair, ls] of Object.entries(groups)) {
        if (!trModelStatus[pair]?.installed) continue;
        const [f, t] = pair.split('-');
        for (let i = 0; i < ls.length; i += 40) {
            const chunk = ls.slice(i, i + 40);
            const res = await window.electronAPI.translateTexts({ from: f, to: t, texts: chunk });
            if (res.result) chunk.forEach((l, k) => subCache.set(pair + '|' + l, res.result[k]));
        }
    }
    if (subCache.size > 5000) subCache.delete(subCache.keys().next().value);
}
function subtitleTranslationOf(line) {
    const s = trSettings();
    const from = /[぀-ヿ]/.test(line) ? 'ja' : 'en';
    if (from === s.target) return line;   // もう訳す必要がない（「訳だけ」の時は原文をそのまま出す）
    const pair = pairFor(from, s.target);
    return pair ? subCache.get(pair + '|' + line) : null;
}
async function onSubtitleLine(tabId, key) {
    if (!trState(tabId).subs) return;
    let out = subtitleTranslationOf(key);
    if (out == null) { await translateSubtitleLines([key]); out = subtitleTranslationOf(key); }
    if (out != null) runInPage(tabId, `window.__arcSub && __arcSub.show(${JSON.stringify(key)}, ${JSON.stringify(out)})`);
}
function onSubtitleAll(tabId, keys) { if (trState(tabId).subs && Array.isArray(keys)) translateSubtitleLines(keys.slice(0, 1500)); }
async function setSubtitles(tabId, on) {
    const st = trState(tabId), s = trSettings();
    if (on) {
        const pair = pairFor('en', s.target) || pairFor('ja', s.target);
        if (pair && !(await ensureModel(pair))) return;
        await injectTr(tabId);
        await runInPage(tabId, `__arcSub.start(${JSON.stringify(s.subMode)})`);
    } else {
        await runInPage(tabId, 'window.__arcSub && __arcSub.stop()');
    }
    st.subs = on;
    updateTranslateButton(); renderTrPopover();
}

// ---------- タブの出来事（tabs.js から呼ぶ） ----------
function onTranslateNavigate(tabId) {
    const st = trState(tabId);
    st.translated = false; st.gen++; clearInterval(st.poll); st.lang = null; st.done = st.total = 0;
    if (tabId === activeTabId) { updateTranslateButton(); closeTrPopover(); }
}
// ページの中だけの移動（Reddit・YouTube などの SPA）でも、少し待ってから判定し直す
function onTranslateInPageNavigate(tabId) {
    const st = trState(tabId);
    if (st.translated) return;   // 翻訳中なら、増えた部分は自動で訳される
    clearTimeout(st.redetect);
    st.redetect = setTimeout(() => detectTabLang(tabId), 1500);
}
async function onTranslateDomReady(tabId) {
    const st = trState(tabId);
    await detectTabLang(tabId);
    // 本文が後から読み込まれるページのために、もう一度判定する
    clearTimeout(st.redetect);
    st.redetect = setTimeout(() => detectTabLang(tabId), 2500);
    if (st.subs) setSubtitles(tabId, true);   // 字幕の翻訳はページを移っても続ける
    const s = trSettings();
    // 「外国語のページを自動で翻訳」：端末内の翻訳で、モデルが入っている時だけ（勝手にダウンロードしない）
    const pair = pairFor(st.lang, s.target);
    if (s.auto && s.engine === 'local' && pair && trModelStatus[pair]?.installed && !isNewTabUrl(webviews[tabId]?.getURL?.() || '')) translateTab(tabId, { quiet: true });
}

// ---------- アドレスバーのボタンと小窓 ----------
const btnTranslate = document.getElementById('btn-translate');
const trPop = document.createElement('div');
trPop.className = 'translate-popover';
trPop.setAttribute('role', 'dialog');
document.body.appendChild(trPop);

function updateTranslateButton() {
    const st = activeTabId ? trState(activeTabId) : null, s = trSettings();
    const foreign = !!(st && st.lang && st.lang !== s.target);
    btnTranslate.style.display = st && (foreign || st.translated || st.subs) ? '' : 'none';
    btnTranslate.classList.toggle('on', !!(st && (st.translated || st.subs)));
    btnTranslate.classList.toggle('busy', !!(st && st.busy));
    btnTranslate.title = st?.translated ? '翻訳中のページ（押すと原文に戻すなど）' : 'このページを翻訳';
}
function closeTrPopover() { trPop.classList.remove('show'); }
let trProgress = null;   // ダウンロードの進み具合
window.electronAPI?.onTranslateDownloadProgress?.((d) => { trProgress = d.done || d.error ? null : d; if (d.done || d.error) refreshModelStatus().then(renderTrPopover); else renderTrPopover(); if (typeof renderTranslateSettings === 'function') renderTranslateSettings(); });

function renderTrPopover() {
    if (!trPop.classList.contains('show') || !activeTabId) return;
    const st = trState(activeTabId), s = trSettings();
    const from = st.lang, to = s.target;
    const pair = pairFor(from, to);
    const fromName = TR_LANG_NAME[from] || (from ? from.toUpperCase() : '不明');
    const model = pair && trModelStatus[pair];
    const mb = (n) => (n / 1048576).toFixed(0) + 'MB';
    const dl = trProgress && trProgress.pair === pair ? trProgress : null;
    let body = '';
    if (s.engine === 'local' && !pair && from && from !== to) body += `<div class="trp-note">${escapeHtml(fromName)}の端末内翻訳にはまだ対応していません。「Google 翻訳」を選ぶと翻訳できます。</div>`;
    else if (s.engine === 'local' && model && !model.installed) body += dl
        ? `<div class="trp-note">翻訳モデルをダウンロード中… ${mb(dl.received)} / ${mb(dl.total)}</div><div class="trp-bar"><i style="width:${Math.round(dl.received / dl.total * 100)}%"></i></div>`
        : `<div class="trp-note">初めての時だけ、翻訳モデル（約 ${mb(model.downloadSize)}）をダウンロードします。翻訳はこの PC の中だけで行います。</div>`;
    if (st.translated && st.total) body += `<div class="trp-note">${st.done < st.total ? `翻訳中… ${st.done} / ${st.total}` : `${st.total} か所を翻訳しました`}</div>`;
    trPop.innerHTML = `
      <div class="trp-head"><b>${st.translated ? 'ページを翻訳しました' : 'このページを翻訳'}</b><span>${escapeHtml(fromName)} → ${escapeHtml(TR_LANG_NAME[to] || to)}</span></div>
      <div class="trp-seg" role="group" aria-label="翻訳の方法">
        <span data-engine="local" class="${s.engine === 'local' ? 'on' : ''}">端末内<small>無料・送信なし</small></span>
        <span data-engine="google" class="${s.engine === 'google' ? 'on' : ''}">Google 翻訳<small>ページを送ります</small></span>
      </div>
      ${body}
      <label class="trp-row"><span>動画の字幕も翻訳する</span><span class="sp-switch ${st.subs ? 'on' : ''}" data-tr="subs"></span></label>
      ${st.subs ? `<div class="trp-seg small" role="group" aria-label="字幕の出し方"><span data-submode="both" class="${s.subMode === 'both' ? 'on' : ''}">原文と訳を並べる</span><span data-submode="only" class="${s.subMode === 'only' ? 'on' : ''}">訳だけ</span></div>` : ''}
      <label class="trp-row"><span>${escapeHtml(fromName)}のページを自動で翻訳</span><span class="sp-switch ${s.auto ? 'on' : ''}" data-tr="auto"></span></label>
      <div class="trp-actions">
        ${st.translated ? '<div class="bm-btn" data-tr="restore">原文に戻す</div>' : ''}
        <div class="bm-btn done" data-tr="translate" ${st.busy ? 'aria-disabled="true"' : ''}>${st.busy ? '翻訳中…' : st.translated ? '訳し直す' : '翻訳'}</div>
      </div>`;
}
function openTrPopover() {
    const r = btnTranslate.getBoundingClientRect();
    trPop.classList.add('show');
    refreshModelStatus().then(renderTrPopover);
    renderTrPopover();
    const w = trPop.offsetWidth || 320;
    trPop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.right - w + 8))}px`;
    trPop.style.top = `${r.bottom + 10}px`;
}
btnTranslate.addEventListener('click', (e) => { e.stopPropagation(); trPop.classList.contains('show') ? closeTrPopover() : openTrPopover(); });
trPop.addEventListener('click', async (e) => {
    e.stopPropagation();
    const eng = e.target.closest('[data-engine]');
    if (eng) { setTrSetting('engine', eng.dataset.engine); renderTrPopover(); return; }
    const sm = e.target.closest('[data-submode]');
    if (sm) { setTrSetting('subMode', sm.dataset.submode); if (trState(activeTabId).subs) await setSubtitles(activeTabId, true); renderTrPopover(); return; }
    const act = e.target.closest('[data-tr]')?.dataset.tr;
    if (act === 'translate') { if (trState(activeTabId).translated) await restoreTab(activeTabId); translateTab(activeTabId); }
    if (act === 'restore') restoreTab(activeTabId);
    if (act === 'subs') setSubtitles(activeTabId, !trState(activeTabId).subs);
    if (act === 'auto') { setTrSetting('auto', !trSettings().auto); renderTrPopover(); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.translate-popover, #btn-translate')) closeTrPopover(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrPopover(); });
tabUrlChangeHooks.push(() => setTimeout(updateTranslateButton, 0));

// ---------- 設定画面 ----------
async function renderTranslateSettings() {
    const box = document.getElementById('translate-options'); if (!box) return;
    const s = trSettings(), st = await refreshModelStatus();
    const mb = (n) => (n / 1048576).toFixed(0) + 'MB';
    box.innerHTML =
        settingRow({ icon: '⌂', label: '端末内で翻訳（おすすめ）', sub: '無料・回数制限なし・ページの文章を外部に送りません', checked: s.engine === 'local', attrs: 'data-tr-engine="local"' }) +
        settingRow({ icon: 'G', label: 'Google 翻訳', sub: 'ページの URL・内容が Google に送られます', checked: s.engine === 'google', attrs: 'data-tr-engine="google"' }) +
        settingRow({ icon: '↻', label: '外国語のページを自動で翻訳', sub: '端末内の翻訳で、モデルを入れてある言語だけ', checked: s.auto, attrs: 'data-tr-auto="1"' }) +
        settingRow({ icon: '▤', label: '字幕：原文と訳を並べる', checked: s.subMode === 'both', attrs: 'data-tr-submode="both"' }) +
        settingRow({ icon: '▤', label: '字幕：訳だけを出す', checked: s.subMode === 'only', attrs: 'data-tr-submode="only"' }) +
        `<div class="setting-subhead">翻訳モデル（Mozilla・MPL-2.0）</div>` +
        Object.entries(st).map(([pair, m]) => settingRow({
            icon: 'あ', label: escapeHtml(m.label),
            sub: m.installed ? `ダウンロード済み（${mb(m.diskSize)}）` : m.downloading || trProgress?.pair === pair ? 'ダウンロード中…' : `未ダウンロード（約 ${mb(m.downloadSize)}）`,
            action: m.installed ? `<span class="setting-remove" data-tr-del="${pair}" title="削除">×</span>` : `<span class="setting-link" data-tr-dl="${pair}">ダウンロード</span>`,
        })).join('');
}
document.getElementById('panel-settings').addEventListener('click', async (e) => {
    const t = e.target;
    const eng = t.closest('[data-tr-engine]'); if (eng) { setTrSetting('engine', eng.dataset.trEngine); renderTranslateSettings(); return; }
    if (t.closest('[data-tr-auto]')) { setTrSetting('auto', !trSettings().auto); renderTranslateSettings(); return; }
    const sm = t.closest('[data-tr-submode]'); if (sm) { setTrSetting('subMode', sm.dataset.trSubmode); renderTranslateSettings(); return; }
    const dl = t.closest('[data-tr-dl]'); if (dl) { window.electronAPI.translateDownload(dl.dataset.trDl).then(() => renderTranslateSettings()); renderTranslateSettings(); return; }
    const del = t.closest('[data-tr-del]'); if (del) { await window.electronAPI.translateDeleteModel(del.dataset.trDel); renderTranslateSettings(); }
});
document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', renderTranslateSettings);

// ▼ 追加：ページの右クリックメニュー（main/context-menu.js）から
window.electronAPI?.onPageAction?.(({ action, webContentsId }) => {
    if (action !== 'translate-page' && action !== 'translate-subs') return;
    const tabId = Object.keys(webviews).find(id => { try { return webviews[id].getWebContentsId() === webContentsId; } catch (e) { return false; } }) || activeTabId;
    if (action === 'translate-page') { const st = trState(tabId); st.translated ? restoreTab(tabId) : translateTab(tabId); }
    else setSubtitles(tabId, !trState(tabId).subs);
});
