// ==========================================
// ★ ページに入れる翻訳用のスクリプト（renderer/page-translate.js が webview.executeJavaScript で入れる）
// ==========================================
// 本体の画面では関数を定義するだけで実行しない。pageTranslateInjectSource() が関数の中身を文字列にして、ページの中で動かす。
//   __arcTr.detect()          … ページの言語の手がかり（lang 属性と本文の一部）
//   __arcTr.collect(limit)    … 翻訳する文章のかたまりを集める（画面に見えている所から順に）
//   __arcTr.apply(results)    … 訳文を入れる
//   __arcTr.restore()         … 原文に戻す
//   __arcTr.takeNew()         … 後から増えた部分（無限スクロールなど）を集める
//   __arcSub.start(mode) / stop() / show(key, text) … 動画の字幕の翻訳
function __arcPageTranslateScript() {
  if (window.__arcTr) return;
  const SKIP = 'script,style,noscript,code,pre,textarea,input,select,option,svg,math,kbd,samp,var,[contenteditable=""],[contenteditable="true"],[translate="no"],.notranslate,.arc-sub';
  const INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DFN', 'EM', 'FONT', 'I', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'WBR', 'BR', 'LABEL', 'DEL', 'INS']);
  const groups = [];          // { nodes: Text[], originals: string[], block: Element, done: bool }
  const seen = new WeakSet(); // 集めた文字のノード
  let observer = null, fresh = [];

  const hasLetters = (t) => /[A-Za-zÀ-ɏЀ-ӿ぀-ヿ一-鿿가-힯]/.test(t);
  const blockOf = (node) => {
    let el = node.parentElement;
    while (el && el !== document.body && INLINE.has(el.tagName)) el = el.parentElement;
    return el || document.body;
  };
  function collectFrom(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (seen.has(n) || !n.data.trim() || !hasLetters(n.data)) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const byBlock = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      seen.add(n);
      const b = blockOf(n);
      if (!byBlock.has(b)) byBlock.set(b, []);
      byBlock.get(b).push(n);
    }
    byBlock.forEach((nodes, block) => {
      // リンク・ボタンをまたぐ文章は、リンクを壊さないよう文字のかたまりごとに訳す。そうでなければまとめて訳す（文脈が保てる）
      const mixed = nodes.some(n => n.parentElement.closest('a,button') && n.parentElement.closest('a,button') !== block.closest('a,button'));
      const parts = mixed ? nodes.map(n => [n]) : [nodes];
      parts.forEach(ns => {
        const text = ns.map(n => n.data).join('').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 5000) return;
        const id = groups.length;
        groups.push({ nodes: ns, originals: ns.map(n => n.data), block, done: false, text });
        out.push(id);
      });
    });
    return out;
  }
  const visibleFirst = (ids) => {
    const vh = innerHeight;
    return ids.map(id => {
      let top = 1e9;
      try { const r = groups[id].block.getBoundingClientRect(); top = r.bottom < 0 ? 5e8 + Math.abs(r.bottom) : r.top > vh ? 1e6 + r.top : r.top; } catch (e) {}
      return { id, top };
    }).sort((a, b) => a.top - b.top).map(x => x.id);
  };

  window.__arcTr = {
    detect() {
      const t = (document.body && document.body.innerText || '').slice(0, 3000);
      return { lang: (document.documentElement.lang || '').toLowerCase(), sample: t };
    },
    collect(limit = 4000) {
      const ids = visibleFirst(collectFrom(document.body)).slice(0, limit);
      if (!observer) {
        observer = new MutationObserver((muts) => {
          muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.closest?.('.arc-sub')) fresh.push(n); else if (n.nodeType === 3) fresh.push(n.parentElement); }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
      return ids.map(id => ({ id, text: groups[id].text }));
    },
    takeNew() {
      const roots = fresh.splice(0).filter(r => r && r.isConnected);
      const ids = [];
      roots.forEach(r => ids.push(...collectFrom(r)));
      return visibleFirst(ids).map(id => ({ id, text: groups[id].text }));
    },
    apply(results) {
      results.forEach(({ id, text }) => {
        const g = groups[id]; if (!g || g.done || typeof text !== 'string') return;
        // 最初の文字のノードに訳文を入れ、残りは空にする（前後の空白は保つ）
        const lead = /^\s/.test(g.originals[0]) ? ' ' : '', tail = /\s$/.test(g.originals[g.originals.length - 1]) ? ' ' : '';
        g.nodes.forEach((n, i) => { n.data = i === 0 ? lead + text + tail : ''; });
        g.done = true;
      });
      document.documentElement.setAttribute('data-arc-translated', '1');
    },
    restore() {
      groups.forEach(g => { if (g.done) { g.nodes.forEach((n, i) => { n.data = g.originals[i]; }); g.done = false; } });
      groups.length = 0;
      if (observer) { observer.disconnect(); observer = null; }
      fresh = [];
      document.documentElement.removeAttribute('data-arc-translated');
      return true;
    },
  };

  // ---------- 動画の字幕 ----------
  // 字幕は文字のまま取り出して翻訳する（画面を読み取らない）。取り出し方は 2 つ：
  //  ・HTML5 標準の字幕（video.textTracks）
  //  ・サイトが自分で表示している字幕（YouTube など。表示の変化を MutationObserver で見張る）
  const CAPTION_SELECTORS = ['.ytp-caption-window-container', '.player-timedtext', '.vjs-text-track-display', '.jw-captions', '.shaka-text-container', '[class*="caption-window"]', '[class*="subtitles"]', '[class*="captions-text"]'];
  const HIDE_CSS = `${CAPTION_SELECTORS.join(',')} { opacity: 0 !important; }`;
  let subMode = null, subObserver = null, subTimer = null, lastKey = '', overlay = null, hideStyle = null, trackHooks = [];
  const subKey = (t) => t.replace(/\s+/g, ' ').trim();

  function mainVideo() {
    const vids = [...document.querySelectorAll('video')].filter(v => v.offsetWidth > 120 && v.offsetHeight > 80);
    return vids.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0] || null;
  }
  function ensureOverlay() {
    const v = mainVideo(); if (!v) return null;
    const host = v.closest('.html5-video-player') || v.parentElement;
    if (!overlay || !overlay.isConnected || overlay.parentElement !== host) {
      overlay?.remove();
      overlay = document.createElement('div');
      overlay.className = 'arc-sub';
      overlay.setAttribute('translate', 'no');
      overlay.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:' + (subMode === 'only' ? '8%' : '20%') + ';max-width:86%;z-index:2147483000;pointer-events:none;text-align:center;font:600 clamp(15px,2.3vw,28px)/1.35 system-ui,"Yu Gothic UI","Meiryo",sans-serif;color:#fff;';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(overlay);
    }
    return overlay;
  }
  function showText(text) {
    const o = ensureOverlay(); if (!o) return;
    o.innerHTML = '';
    if (!text) return;
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'background:rgba(8,8,12,.72);padding:.12em .45em;border-radius:6px;box-decoration-break:clone;-webkit-box-decoration-break:clone;';
    o.appendChild(span);
  }
  function report(text) {
    const key = subKey(text || '');
    if (key === lastKey) return;
    lastKey = key;
    if (!key) { showText(''); return; }
    console.log('ARCHYNDIUM_SUB:' + JSON.stringify({ key }));
  }
  function readSiteCaptions() {
    for (const sel of CAPTION_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) return el.innerText;
    }
    return '';
  }
  function hookTracks() {
    trackHooks.forEach(off => off()); trackHooks = [];
    const v = mainVideo(); if (!v) return false;
    let used = false;
    [...v.textTracks].forEach(tr => {
      if (!['subtitles', 'captions'].includes(tr.kind) || tr.mode === 'disabled') return;
      used = true;
      if (subMode === 'only') tr.mode = 'hidden';
      const onCue = () => report([...(tr.activeCues || [])].map(c => c.text.replace(/<[^>]+>/g, '')).join('\n'));
      tr.addEventListener('cuechange', onCue);
      trackHooks.push(() => tr.removeEventListener('cuechange', onCue));
      // 字幕全体を先に送っておく（翻訳を先に済ませて、表示を遅らせない）
      if (tr.cues && tr.cues.length) console.log('ARCHYNDIUM_SUBALL:' + JSON.stringify({ keys: [...tr.cues].slice(0, 1500).map(c => subKey(c.text.replace(/<[^>]+>/g, ''))).filter(Boolean) }));
    });
    return used;
  }
  window.__arcSub = {
    start(mode) {
      this.stop();
      subMode = mode === 'only' ? 'only' : 'both';
      if (subMode === 'only') { hideStyle = document.createElement('style'); hideStyle.textContent = HIDE_CSS; document.documentElement.appendChild(hideStyle); }
      const usingTracks = hookTracks();
      // サイトが表示している字幕を見張る（YouTube など）
      subObserver = new MutationObserver(() => { if (!usingTracks) report(readSiteCaptions()); });
      subObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      // 動画が後から読み込まれる・字幕の言語を変えた時のために、ときどき付け直す
      subTimer = setInterval(() => { if (!trackHooks.length) hookTracks(); if (!trackHooks.length) report(readSiteCaptions()); }, 1500);
      return true;
    },
    stop() {
      subObserver?.disconnect(); subObserver = null;
      clearInterval(subTimer); subTimer = null;
      trackHooks.forEach(off => off()); trackHooks = [];
      hideStyle?.remove(); hideStyle = null;
      overlay?.remove(); overlay = null;
      lastKey = ''; subMode = null;
      const v = mainVideo(); if (v) [...v.textTracks].forEach(tr => { if (tr.mode === 'hidden' && ['subtitles', 'captions'].includes(tr.kind)) tr.mode = 'showing'; });
      return true;
    },
    show(key, text) { if (subMode && key === lastKey) showText(text); },
    hasVideo() { return !!mainVideo(); },
  };
}
const pageTranslateInjectSource = () => `(${__arcPageTranslateScript.toString()})()`;
