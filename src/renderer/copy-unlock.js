// ==========================================
// ★ コピーできないページ（コピー禁止・右クリック禁止・文字の選択禁止）への対応
// ==========================================
// 1. コピー制限を解除 … ページが「コピー・切り取り・右クリック・文字の選択・ドラッグ」を止める処理を無効にし、
//    文字を選べるようにする。解除したサイトは覚えておき、次から自動で解除する（右クリックメニュー・コマンドから）
// 2. ページの文字を取り出す … それでも選べない時のために、ページの本文をパネルにまとめて表示してコピーできるようにする
//    （歌詞パネルと同じように、ページから文字だけを読み取る）
// ※ 画像や canvas に描かれた文字は読み取れません

const COPY_UNLOCK_KEY = 'archyndium_copy_unlock_hosts';
const copyUnlockHosts = () => { try { return JSON.parse(localStorage.getItem(COPY_UNLOCK_KEY)) || []; } catch (e) { return []; } };
const hostOfTab = (tabId) => { try { return new URL(getTabCard(tabId)?.getAttribute('data-url') || '').hostname; } catch (e) { return ''; } };

const COPY_UNLOCK_CSS = `*, *::before, *::after { -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default !important; }`;
const COPY_UNLOCK_JS = `(() => {
  if (window.__archyndium_copy_unlock) return true;
  window.__archyndium_copy_unlock = true;
  const TYPES = new Set(['copy', 'cut', 'selectstart', 'contextmenu', 'dragstart', 'beforecopy']);
  const isCopyKey = (e) => e.type === 'keydown' && (e.ctrlKey || e.metaKey) && /^[acx]$/i.test(e.key || '');
  // ページがこれらの操作を止めようとしても（preventDefault）効かないようにする
  const orig = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () { if (TYPES.has(this.type) || isCopyKey(this)) return; return orig.call(this); };
  const desc = Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue');
  if (desc && desc.set) Object.defineProperty(Event.prototype, 'returnValue', { configurable: true, get: desc.get, set(v) { if (v === false && (TYPES.has(this.type) || isCopyKey(this))) return; desc.set.call(this, v); } });
  // on〜 で書かれた禁止の処理を外す
  const clear = (el) => { if (!el) return; ['oncopy', 'oncut', 'onselectstart', 'oncontextmenu', 'ondragstart', 'onbeforecopy'].forEach(k => { try { el[k] = null; el.removeAttribute && el.removeAttribute(k); } catch (e) {} }); };
  [window, document, document.documentElement, document.body].forEach(clear);
  document.querySelectorAll('[oncopy],[oncut],[onselectstart],[oncontextmenu],[ondragstart],[onmousedown]').forEach(clear);
  // コピーした文字に「出典」などを勝手に足す処理より先に、選んだ文字そのものをコピーする
  document.addEventListener('copy', (e) => { const t = String(getSelection()); if (t && e.clipboardData) { e.clipboardData.setData('text/plain', t); orig.call(e); } }, true);
  return true;
})()`;

async function unlockCopy(tabId, { remember = true, quiet = false } = {}) {
    const wv = webviews[tabId];
    if (!wv) return;
    try {
        await wv.insertCSS(COPY_UNLOCK_CSS);
        await wv.executeJavaScript(COPY_UNLOCK_JS);
    } catch (e) { if (!quiet) showToast('このページでは解除できませんでした'); return; }
    const host = hostOfTab(tabId);
    if (remember && host && !isPrivateTab(tabId)) {
        const list = copyUnlockHosts();
        if (!list.includes(host)) { list.push(host); try { localStorage.setItem(COPY_UNLOCK_KEY, JSON.stringify(list.slice(-300))); } catch (e) {} }
    }
    if (!quiet) showToast(`${host || 'このページ'} のコピー制限を解除しました`, { action: () => extractPageText(tabId), actionLabel: '文字を取り出す' });
}
function applyCopyUnlockIfSaved(tabId) {
    const host = hostOfTab(tabId);
    if (host && copyUnlockHosts().includes(host)) unlockCopy(tabId, { remember: false, quiet: true });
}
function forgetCopyUnlock(host) {
    try { localStorage.setItem(COPY_UNLOCK_KEY, JSON.stringify(copyUnlockHosts().filter(h => h !== host))); } catch (e) {}
}

// ---------- ページの文字を取り出す ----------
const textPanel = document.createElement('div');
textPanel.className = 'text-extract';
textPanel.innerHTML = `<div class="te-head"><b>ページの文字</b><span class="te-src"></span>
    <span class="te-btn" data-te="copy">すべてコピー</span><span class="te-btn" data-te="close" title="閉じる (Esc)">✕</span></div>
  <textarea class="te-body" spellcheck="false" readonly></textarea>
  <div class="te-foot">選んだ部分だけをコピーすることもできます。画像の中の文字は取り出せません。</div>`;
document.body.appendChild(textPanel);
async function extractPageText(tabId = activeTabId) {
    const wv = webviews[tabId];
    if (!wv) return;
    let text = '';
    try {
        text = await wv.executeJavaScript(`(() => {
          const sel = String(getSelection());
          const main = document.querySelector('article, main, [role=main]');
          const t = (main && main.innerText.trim().length > 400 ? main : document.body).innerText;
          return (sel && sel.length > 20 ? sel : t).replace(/\\n{3,}/g, '\\n\\n').slice(0, 300000);
        })()`);
    } catch (e) {}
    if (!text || !text.trim()) { showToast('取り出せる文字がありませんでした'); return; }
    textPanel.querySelector('.te-src').textContent = getTabCard(tabId)?.querySelector('.tab-title')?.textContent || '';
    textPanel.querySelector('.te-body').value = text.trim();
    textPanel.classList.add('show');
    textPanel.querySelector('.te-body').scrollTop = 0;
}
textPanel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-te]'); if (!b) return;
    if (b.dataset.te === 'close') textPanel.classList.remove('show');
    if (b.dataset.te === 'copy') { navigator.clipboard.writeText(textPanel.querySelector('.te-body').value).then(() => showToast('コピーしました')).catch(() => {}); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && textPanel.classList.contains('show')) textPanel.classList.remove('show'); });

// ページの右クリックメニュー（main/context-menu.js）から
window.electronAPI?.onPageAction?.(({ action, webContentsId }) => {
    const tabId = Object.keys(webviews).find(id => { try { return webviews[id].getWebContentsId() === webContentsId; } catch (e) { return false; } }) || activeTabId;
    if (action === 'unlock-copy') unlockCopy(tabId);
    if (action === 'extract-text') extractPageText(tabId);
});
