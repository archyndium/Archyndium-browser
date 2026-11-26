// ▼ 追加：シークレットタブ用。メモリ上だけのセッション（main/private-session.js）を共有する
const PRIVATE_PARTITION = 'archyndium-private';
const privateTabIds = new Set();

function isPrivateTab(tabId) {
  return privateTabIds.has(tabId);
}

// sleeping = true の時は webview を作らず休止状態のタブにする（セッション復元用。クリックで読み込む）
async function createNewTabElement(url = getHomeUrl(), { isPrivate = false, sleeping = false, title = '', favicon = '' } = {}) {
  // ▼ 追加：シークレットタブを「新しいタブ」で開く時は、シークレット用の検索エンジンのトップにする
  if (isPrivate && typeof privateEngine === 'function' && (url === normalEngine().home || url === privateEngine().home)) url = privateEngine().home;
  tabCounter++; 
  const tabId = `tab-${tabCounter}`;
  const newTab = document.createElement('div');
  newTab.className = 'tab-card'; 
  newTab.setAttribute('data-tab-id', tabId); 
  newTab.setAttribute('data-url', url); 
  // ▼ 修正：以前はアイコン枠に白背景（background: #FFF）が付いていて、透過アイコンの周りが白く見えていた
  newTab.innerHTML = `<div class="favicon site-icon no-img" data-letter="${(siteHostOf(url)[0] || '•').toUpperCase()}"><img src="" style="display:none" data-err="hide"></div><span class="tab-title">New Tab</span>`;
  if (isPrivate) {
    privateTabIds.add(tabId);
    newTab.classList.add('private');
    newTab.insertAdjacentHTML('beforeend', `<span class="private-badge" title="シークレットタブ（履歴・Cookieを残しません）"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18"></path><path d="M5 11l2-6h10l2 6"></path><circle cx="7" cy="16" r="3"></circle><circle cx="17" cy="16" r="3"></circle><path d="M10 16h4"></path></svg></span>`);
  }
  
  setupDraggable(newTab, 'tab');
  if (title) newTab.querySelector('.tab-title').textContent = title;
  if (favicon) setCardFavicon(newTab, favicon);

  if (sleeping) {
    newTab.classList.add('sleeping');
    newTab.title = '休止中（クリックで読み込み）';
    return newTab;
  }
  await createWebviewForTab(tabId, url);
  
  return newTab;
}

// タブのアイコンを差し替える（読み込めなければ頭文字表示に戻る）
function setCardFavicon(card, src) {
    const box = card.querySelector('.favicon');
    const img = box?.querySelector('img');
    if (!img || !src) return;
    img.onload = () => box.classList.remove('no-img');
    img.style.display = 'block';
    img.src = src;
}

// ▼ モダンな webview 管理システム
const webviews = {};
const tabLastActive = {}; // tabId -> 最後にアクティブになった時刻（タブスリープ判定用）

function switchTab(tabId) {
    if (activeTabId === tabId) return;
    activeTabId = tabId;
    tabLastActive[tabId] = Date.now();
    if (typeof closeFind === 'function') closeFind(); // ページ内検索はタブごとなので切替時に閉じる

    // ▼ 追加：スリープ中のタブなら webview を作り直して復帰させる
    if (!webviews[tabId] && typeof wakeTab === 'function') wakeTab(tabId);

    // 全てのwebviewを隠し、選択されたものだけを表示
    Object.values(webviews).forEach(wv => wv.style.display = 'none');
    if (webviews[tabId]) {
        webviews[tabId].style.display = 'flex';
    }

    document.getElementById('omnibar-pill').classList.toggle('private-mode', isPrivateTab(tabId));
    if (typeof updateOmnibarPlaceholder === 'function') updateOmnibarPlaceholder(); // シークレットタブは検索エンジンが違うことがある

    // ▼ 修正：タブ切替時にURLバーとブックマークの★を切替先のタブに合わせる
    const card = getTabCard(tabId);
    if (card) {
        const url = card.getAttribute('data-url') || '';
        urlInput.value = displayUrl(url); // 新しいタブのページは空欄
        document.getElementById('btn-bookmark').classList.toggle('active-star', !!document.querySelector(`.bookmark-item[data-url="${CSS.escape(url)}"]`));
    }
    if (typeof refreshShieldSiteState === 'function') refreshShieldSiteState(); // 盾アイコンを切替先タブのモード・サイト例外に合わせる
    if (typeof applySplitLayout === 'function') applySplitLayout(); // 分割表示中のタブなら相方も並べて表示する
    if (typeof refreshZoomIndicator === 'function') refreshZoomIndicator();
    if (typeof updateTranslateButton === 'function') updateTranslateButton();
}

// ▼ タブ（webview）を新規生成する関数
function createWebviewForTab(tabId, url) {
    const wv = document.createElement('webview');
    wv.id = `webview-${tabId}`;
    // partition は最初の読み込み前に指定する必要がある
    if (isPrivateTab(tabId)) wv.setAttribute('partition', PRIVATE_PARTITION);
    // ▼ 追加：allowpopups が無いと、target="_blank" のリンクは main の判定（popup-guard.js）に届く前に
    //   捨てられてしまう。開くかどうかは popup-guard.js が「ユーザーの操作があったか」で決める
    wv.setAttribute('allowpopups', '');
    // ▼ 追加：PDF をタブの中で表示する（Chromium 内蔵の PDF ビューア。無いと PDF はダウンロードになる）
    wv.setAttribute('plugins', '');
    wv.src = url;
    // 角丸設定
    wv.style.cssText = "width: 100%; height: 100%; border: none; display: none; border-radius: 12px; background: #FFF; overflow: hidden;";
    
    wv.addEventListener('dom-ready', async () => {
        // ▼ 追加：新しいタブのページ（アプリ同梱）には、広告処理などのスクリプトを入れず、表示する内容だけ渡す
        if (isNewTabUrl(wv.getURL())) { pushNewTab(tabId); return; }
        // スクロールバー設定
        wv.insertCSS(`
            ::-webkit-scrollbar { width: 8px; } 
            ::-webkit-scrollbar-thumb { background: rgba(150,150,150,0.5); border-radius: 4px; }
        `);
        
        // ▼ 修正：裏側から安全に現在のモードを取得する（変数エラーの回避）
        // ▼ 追加：サイトごとのズーム・強制ダークモードを反映
        if (typeof applySiteZoom === 'function') applySiteZoom(tabId);
        if (typeof applyForceDark === 'function') applyForceDark(tabId);
        if (typeof applyCopyUnlockIfSaved === 'function') applyCopyUnlockIfSaved(tabId); // コピー制限を解除したサイト

        // ▼ 変更：タブごとのモード（上書きが無ければ全体の設定）
        const mode = effectiveShieldMode(tabId);
        syncTabShieldToMain(tabId);
        // ▼ 追加：Shield の例外サイトでは DOM 側の広告除去も止める
        let siteBypassed = false;
        try { siteBypassed = (await window.electronAPI.getShieldSite(wv.getURL())).bypassed; } catch(e) {}
        const runDomBlocker = (mode === 1 || mode === 2) && !siteBypassed;
        if (tabId === activeTabId) refreshShieldSiteState();
        
        const hybridScript = `
          const runBlocker = ${runDomBlocker};
          // ▼ 軽量化：以前はどのサイトでも 0.05 秒ごとに広告を探していた（重さの原因）。
          //   探す広告は動画サイトのものだけなので動画サイトでだけ動かし、ページが変わった時（MutationObserver）と
          //   0.25 秒ごとの確認にまとめる。ほかのサイトの広告は通信のブロック（main/adblock.js）で止まる
          const isNico = /(^|\\.)nicovideo\\.jp$/.test(location.hostname);
          const isVideoSite = isNico || /(^|\\.)youtube\\.com$/.test(location.hostname);
          const killAds = () => {
            if(!runBlocker) return;
            
            // 1. 一般的な広告枠の非表示
            document.querySelectorAll('ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-banner-promo-renderer, #masthead-ad, .ytd-in-feed-ad-layout-renderer, .ytd-video-masthead-ad-v3-renderer').forEach(el => el.style.display = 'none');
            
            // 2. スキップボタンの自動クリック
            const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            if (skipBtns.length > 0) {
              skipBtns.forEach(b => { b.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); b.dispatchEvent(new MouseEvent('mouseup', {bubbles:true})); b.click(); });
            }
            
            // 3. 動画広告の超高速スキップ（ネットワークブロックをすり抜けた場合）
            const isAd = document.querySelector('.ad-showing') || document.querySelector('.ad-interrupting');
            const video = document.querySelector('video');
            if (isAd && video && video.duration) {
              video.playbackRate = 16.0; video.muted = true;
              if (video.currentTime < video.duration - 0.5) video.currentTime = video.duration - 0.1;
            }
            
            // 4. ▼ 追加：ニコニコ動画の動画広告。「スキップ」が押せるようになったらすぐ押す。待ち時間の間は広告の動画を早送りする
            //   （ニコニコ動画のボタンの名前は公開されていないので、表示されている文字で見分ける）
            if (isNico) {
              const txt = (el) => (el.textContent || '').replace(/\\s+/g, '');
              // 動画の周り（プレイヤー）の中だけを見る。ページ全体は見ない（軽さのため）
              const v0 = document.querySelector('video');
              let player = v0 && v0.closest('[class*="player" i], [id*="player" i]');
              while (player && player.parentElement && player.parentElement.matches('[class*="player" i], [id*="player" i]')) player = player.parentElement;
              player = player || v0?.parentElement?.parentElement?.parentElement;
              if (!player) return;
              const counting = [...player.querySelectorAll('div, span, p')].some(el => el.childElementCount === 0 && /秒後にスキップ/.test(txt(el)) && el.offsetParent !== null);
              [...player.querySelectorAll('button, [role="button"], div, span')].forEach(el => {
                const t = txt(el);
                if ((t === 'スキップ' || t === 'スキップする' || t === '広告をスキップ' || t === 'Skip' || t === 'SkipAd') && el.offsetParent !== null) el.click();
              });
              if (counting) document.querySelectorAll('video').forEach(v => {
                // 本編は広告の間止まっているので、再生中の短い動画（= 広告）だけを早送りする
                if (!v.paused && v.duration && v.duration < 90) { v.muted = true; v.playbackRate = 16; }
              });
            }

            // 5. 「広告ブロッカー警告」を閉じて動画を再生する
            // ▼ 修正：警告の後ろの暗い幕は今は tp-yt-iron-overlay-backdrop という名前で、以前の名前（iron-overlay-backdrop）では
            //   消えずに残り、動画の再生中も画面全体に黒いスモークがかかっていた。警告を閉じた後、ほかに開いている
            //   ダイアログが無ければ幕も消す（共有などの普通のダイアログの幕は消さない）
            const popup1 = document.querySelector('ytd-enforcement-message-view-model');
            let isBlocked = false;
            if (popup1) { (popup1.closest('tp-yt-paper-dialog') || popup1).remove(); isBlocked = true; }
            document.querySelectorAll('tp-yt-paper-dialog').forEach(d => {
              if (/Ad blockers|広告ブロッカー/.test(d.textContent || '')) { d.remove(); isBlocked = true; }
            });
            const openDialog = [...document.querySelectorAll('tp-yt-paper-dialog, ytd-popup-container tp-yt-iron-dropdown')].some(d => d.offsetParent !== null && getComputedStyle(d).display !== 'none');
            if (isBlocked || !openDialog) {
              document.querySelectorAll('tp-yt-iron-overlay-backdrop, iron-overlay-backdrop').forEach(b => { if (isBlocked || b.classList.contains('opened')) b.remove(); });
            }
            
            if (document.body && document.body.style.overflow === 'hidden') {
                document.body.style.overflow = '';
            }
            
            if (isBlocked && video && video.paused) {
                video.play();
            }
          };
          
          if (isVideoSite && runBlocker && !window.__archyndium_ads) {
            window.__archyndium_ads = true;
            let queued = false;
            const schedule = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; killAds(); }, 60); };
            new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            setInterval(killAds, 250);
            killAds();
          }

          // ▼ 追加：マウスのサイドボタン（3 = 戻る / 4 = 進む）をブラウザの戻る・進むにする
          if (!window.__archyndium_mouse_nav) {
            window.__archyndium_mouse_nav = true;
            window.addEventListener('mouseup', (e) => {
              if (e.button === 3 || e.button === 4) { e.preventDefault(); console.log('ARCHYNDIUM_NAV:' + (e.button === 3 ? 'back' : 'forward')); }
            }, true);
            // 分割表示で、クリックした側のページを操作対象にするための合図
            window.addEventListener('mousedown', () => console.log('ARCHYNDIUM_PANE_FOCUS'), true);
          }

          // ▼ 追加：リンクにマウスを乗せた時のプレビュー（0.7 秒止まったら位置と行き先を知らせる）
          if (!window.__archyndium_hover) {
            window.__archyndium_hover = true;
            let hoverTimer = null, current = null;
            const out = () => { if (current) { current = null; clearTimeout(hoverTimer); console.log('ARCHYNDIUM_LINKOUT'); } };
            document.addEventListener('mouseover', (e) => {
              const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
              if (a === current) return;
              out();
              if (!a || !/^https?:/.test(a.href) || a.href.split('#')[0] === location.href.split('#')[0]) return;
              current = a;
              hoverTimer = setTimeout(() => {
                if (current !== a) return;
                const r = a.getBoundingClientRect();
                console.log('ARCHYNDIUM_LINKHOVER:' + JSON.stringify({ href: a.href, x: r.left, y: r.top, w: r.width, h: r.height }));
              }, 700);
            }, true);
            ['mousedown', 'wheel', 'keydown'].forEach(ev => window.addEventListener(ev, out, { capture: true, passive: true }));
            window.addEventListener('blur', out);
            document.addEventListener('mouseleave', out);
          }

          // 音楽プレイヤーとの同期（シークバーや曲名の取得）
          // ▼ 変更：音が出ている「本物の再生」だけを報告する。GitHub や SNS の無音自動再生（ループ動画）で
          //   プレイヤーの対象タブが勝手に切り替わっていた問題の対策。動画サイトは広告スキップ中のミュートがあるため常に対象。
          const isMediaSite = /(^|\\.)(youtube\\.com|soundcloud\\.com|nicovideo\\.jp|spotify\\.com|music\\.apple\\.com|bandcamp\\.com|twitch\\.tv|vimeo\\.com)$/.test(location.hostname);
          const isAudible = (v) => isMediaSite || (!v.muted && v.volume > 0 && !(v.loop && v.duration < 60));

          // 曲名・アーティストは mediaSession（YouTube Music / Spotify / SoundCloud 等が設定）を優先し、
          // YouTube ではチャンネル名をアーティスト候補にする
          const readMeta = (v) => {
            const m = navigator.mediaSession && navigator.mediaSession.metadata;
            let title = (m && m.title) || '', artist = (m && m.artist) || '';
            if (location.hostname === 'www.youtube.com' || location.hostname === 'm.youtube.com') {
              const h1 = document.querySelector('ytd-watch-metadata h1');
              const owner = document.querySelector('ytd-watch-metadata #owner #channel-name a, ytd-video-owner-renderer #channel-name a');
              if (h1 && h1.textContent.trim()) title = h1.textContent.trim();
              if (owner && owner.textContent.trim()) artist = owner.textContent.trim();
            }
            // YouTube の動画 ID（裏のタブでは見出しの更新が遅れるので、曲が変わったかは ID で判断する）
            const videoId = /(^|\\.)youtube\\.com$/.test(location.hostname) ? new URLSearchParams(location.search).get('v') || '' : '';
            return { title, artist, album: (m && m.album) || '', duration: v && isFinite(v.duration) ? v.duration : 0, videoId };
          };
          let lastMeta = '';
          const sendMeta = (v) => {
            const s = JSON.stringify(readMeta(v));
            if (s !== lastMeta) { lastMeta = s; console.log('ARCHYNDIUM_META:' + s); }
          };

          setInterval(() => {
            const media = document.querySelectorAll('video, audio');
            media.forEach(v => {
              if (v.__archyndium_synced) return;
              v.__archyndium_synced = true;
              v.__archyndium_muted = v.muted;
              const notifyPlay = () => { if (isAudible(v)) { console.log('ARCHYNDIUM_PLAYING'); sendMeta(v); } };
              v.addEventListener('play', notifyPlay);
              // 無音で再生中だった動画をユーザーがミュート解除した時も「再生開始」として扱う
              v.addEventListener('volumechange', () => {
                if (v.__archyndium_muted && !v.muted && !v.paused) notifyPlay();
                v.__archyndium_muted = v.muted;
              });
              v.addEventListener('pause', () => { if (isAudible(v)) console.log('ARCHYNDIUM_PAUSED'); });
              // ▼ 追加：サイト側（YouTube の音量バーなど）で音量を変えた時に知らせる（こちらから変えた直後は除く）
              v.addEventListener('volumechange', () => {
                if (Date.now() - (window.__archyndium_vol_set || 0) < 600) return;
                console.log('ARCHYNDIUM_VOLUME:' + (v.muted ? 0 : v.volume));
              });
              v.addEventListener('timeupdate', () => {
                 if (v.duration && isAudible(v)) console.log('ARCHYNDIUM_PROGRESS:' + v.currentTime + ':' + v.duration);
              });
              if (!v.paused) notifyPlay();
            });
            const playing = [...media].find(v => !v.paused && isAudible(v));
            if (playing) sendMeta(playing); // 次の曲に変わった時など、変化があった時だけ送られる
          }, 500);
        `;
        wv.executeJavaScript(hybridScript).catch(()=>{});
        if (typeof onTranslateDomReady === 'function') onTranslateDomReady(tabId); // ページの言語の判定・自動翻訳・字幕の翻訳
    });

    wv.addEventListener('found-in-page', (e) => onFoundInPage(tabId, e.result));
    // タブにマウスを乗せた時のカード用に、読み込みが終わったら表示中のタブの縮小画像を撮っておく
    wv.addEventListener('did-stop-loading', () => { if (tabId === activeTabId && typeof captureTabThumb === 'function') setTimeout(() => captureTabThumb(tabId), 900); });
    // スピーカーアイコンを、再生・停止した時にすぐ出し入れする
    ['media-started-playing', 'media-paused'].forEach(ev => wv.addEventListener(ev, () => { if (typeof updateTabAudioIcons === 'function') setTimeout(updateTabAudioIcons, 150); }));
    // 分割表示中、もう片方のページをクリックしたらそちらを操作対象にする
    wv.addEventListener('focus', () => { if (typeof onSplitPaneFocus === 'function') onSplitPaneFocus(tabId); });
    // 最初の読み込みより前に、このタブの Shield モードを main に伝える
    wv.addEventListener('did-attach', () => syncTabShieldToMain(tabId));

    wv.addEventListener('console-message', (e) => {
        const msg = e.message;
        if (!msg || !msg.startsWith('ARCHYNDIUM_')) return;
        // ▼ 変更：どのタブをプレイヤーの対象にするかは player-source.js が判断する（ロック機能）
        if (msg === 'ARCHYNDIUM_PLAYING') {
            onMediaPlaying(tabId);
        } else if (msg === 'ARCHYNDIUM_PAUSED') {
            onMediaPaused(tabId);
        } else if (msg.startsWith('ARCHYNDIUM_LINKHOVER:')) {
            try { if (typeof onLinkHover === 'function') onLinkHover(tabId, JSON.parse(msg.slice('ARCHYNDIUM_LINKHOVER:'.length))); } catch(err) {}
        } else if (msg.startsWith('ARCHYNDIUM_SUB:')) {
            try { if (typeof onSubtitleLine === 'function') onSubtitleLine(tabId, JSON.parse(msg.slice('ARCHYNDIUM_SUB:'.length)).key); } catch(err) {}
        } else if (msg.startsWith('ARCHYNDIUM_SUBALL:')) {
            try { if (typeof onSubtitleAll === 'function') onSubtitleAll(tabId, JSON.parse(msg.slice('ARCHYNDIUM_SUBALL:'.length)).keys); } catch(err) {}
        } else if (msg.startsWith('ARCHYNDIUM_NTP:')) {
            if (typeof onNewTabMessage === 'function') onNewTabMessage(tabId, msg.slice('ARCHYNDIUM_NTP:'.length));
        } else if (msg.startsWith('ARCHYNDIUM_VOLUME:')) {
            if (typeof onPageVolume === 'function') onPageVolume(tabId, parseFloat(msg.slice('ARCHYNDIUM_VOLUME:'.length)));
        } else if (msg === 'ARCHYNDIUM_LINKOUT') {
            if (typeof hideLinkPreview === 'function') hideLinkPreview();
        } else if (msg === 'ARCHYNDIUM_PANE_FOCUS') {
            if (typeof onSplitPaneFocus === 'function') onSplitPaneFocus(tabId);
        } else if (msg.startsWith('ARCHYNDIUM_NAV:')) {
            navigateHistory(msg.slice('ARCHYNDIUM_NAV:'.length));
        } else if (msg.startsWith('ARCHYNDIUM_META:')) {
            try { onMediaMeta(tabId, JSON.parse(msg.slice('ARCHYNDIUM_META:'.length))); } catch(err) {}
        } else if (msg.startsWith('ARCHYNDIUM_PROGRESS:') && mediaTargetTabId === tabId && !isRemotePlayer()) {
            const parts = msg.split(':');
            if (parts.length === 3) {
                currentMediaTime = parseFloat(parts[1]);
                currentMediaDuration = parseFloat(parts[2]);
                currentMediaTimeAt = performance.now(); // カラオケ表示の補間用
            }
        }
    });

    wv.addEventListener('did-navigate', (e) => {
        const currentUrl = e.url;
        if (typeof onTranslateNavigate === 'function') onTranslateNavigate(tabId); // 別のページに移ったら翻訳の状態を戻す
        const tabCard = document.querySelector(`.tab-card[data-tab-id="${tabId}"]`);
        if (tabCard) {
            tabCard.setAttribute('data-url', currentUrl);
            tabCard.querySelector('.favicon')?.setAttribute('data-letter', (siteHostOf(currentUrl)[0] || '•').toUpperCase());
        }
        if (tabId === activeTabId) {
            urlInput.value = displayUrl(currentUrl);
            const isBookmarked = document.querySelector(`.bookmark-item[data-url="${currentUrl}"]`);
            if (isBookmarked) document.getElementById('btn-bookmark').classList.add('active-star'); 
            else document.getElementById('btn-bookmark').classList.remove('active-star');
        }
        // ▼ 修正：エラーの元になる getTitle() をやめ、UIから安全に取得
        if (typeof addHistory === 'function' && !isPrivateTab(tabId) && !isNewTabUrl(currentUrl)) { // シークレットタブは履歴に残さない
            const safeTitle = tabCard ? tabCard.querySelector('.tab-title').textContent : currentUrl;
            addHistory(currentUrl, safeTitle);
        }
        if (typeof onTabUrlChanged === 'function') onTabUrlChanged(tabId, currentUrl);
    });

    wv.addEventListener('did-navigate-in-page', (e) => {
        const currentUrl = e.url;
        if (e.isMainFrame !== false && typeof onTranslateInPageNavigate === 'function') onTranslateInPageNavigate(tabId);
        const tabCard = document.querySelector(`.tab-card[data-tab-id="${tabId}"]`);
        if (tabCard) tabCard.setAttribute('data-url', currentUrl);
        if (tabId === activeTabId) urlInput.value = displayUrl(currentUrl);
        if (typeof onTabUrlChanged === 'function') onTabUrlChanged(tabId, currentUrl);
    });

    wv.addEventListener('page-title-updated', (e) => {
        const title = e.title;
        const tabCard = document.querySelector(`.tab-card[data-tab-id="${tabId}"]`);
        if (tabCard) tabCard.querySelector('.tab-title').textContent = title;
        if (mediaTargetTabId === tabId) refreshNowPlaying();
        if (!isPrivateTab(tabId)) { try { updateHistoryEntry(wv.getURL(), { title }); } catch(err) {} } // 履歴のタイトルを確定したものに更新
        
        // ▼ 追加：タイトルに (1) などの通知があればレッドドット（バッジ）を表示
        if (/^\(\d+\)/.test(title) && typeof workspaces !== 'undefined') {
            const url = wv.getURL();
            workspaces.forEach(ws => {
                if (ws.urls.some(u => url.startsWith(u) || u.startsWith(url))) {
                    const badge = document.getElementById(`badge-${ws.id}`);
                    if (badge) badge.classList.add('show');
                }
            });
        }
    });

    wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
            const tabCard = getTabCard(tabId);
            if (tabCard) setCardFavicon(tabCard, e.favicons[0]);
            if (!isPrivateTab(tabId)) { try { updateHistoryEntry(wv.getURL(), { favicon: e.favicons[0] }); } catch(err) {} }
        }
    });

    document.getElementById('webview-container').appendChild(wv);
    webviews[tabId] = wv;
    return wv;
}

// Handle IPC events from main process
// 戻る・進む・リロードボタンの処理をWebviewに直接命令する
document.getElementById('btn-back').addEventListener('click', () => { if(activeTabId && webviews[activeTabId] && webviews[activeTabId].canGoBack()) webviews[activeTabId].goBack(); });
document.getElementById('btn-forward').addEventListener('click', () => { if(activeTabId && webviews[activeTabId] && webviews[activeTabId].canGoForward()) webviews[activeTabId].goForward(); });
document.getElementById('btn-reload').addEventListener('click', () => { if(activeTabId && webviews[activeTabId]) webviews[activeTabId].reload(); });

// URLバーの Enter 処理（URL 判定・検索エンジン・候補表示）は search.js に移動

// ==========================================
// ★ タブのライフサイクル（新規・閉じる・復元・巡回）
// ==========================================
const closedTabStack = []; // Ctrl+Shift+T 用：直前に閉じたタブ
const CLOSED_TAB_LIMIT = 25;

function getTabCard(tabId) {
    return document.querySelector(`#panel-tabs .tab-card[data-tab-id="${tabId}"]`);
}

// グループ内も含め、サイドバーに表示されている順のタブ一覧
function getTabCards() {
    return [...document.querySelectorAll('#panel-tabs .tab-card[data-tab-id]')];
}

function activateTab(tabId) {
    const card = getTabCard(tabId);
    if (card) card.click(); // 既存のクリック処理（active表示 + switchTab）をそのまま使う
}

// background = true の時は現在のタブの直後に追加し、フォーカスは移さない（Ctrl+クリック用）
// isPrivate = true でシークレットタブ
async function openNewTab(url = getHomeUrl(), { background = false, isPrivate = false } = {}) {
    const container = document.getElementById('tabs-container');
    const newTab = await createNewTabElement(url, { isPrivate });
    const current = activeTabId ? getTabCard(activeTabId) : null;
    if (background && current) current.after(newTab);
    else container.insertBefore(newTab, container.querySelector('.tab-group') || null);
    if (!background) newTab.click();
    // ▼ 追加：新しいタブ（スタートページ・検索エンジンのトップ）を開いたら、Chrome と同じくアドレスバーを選んだ状態にする。
    //   ページの読み込みでフォーカスを取られることがあるので、読み込み後にもう一度選ぶ（その前に利用者が他を触っていたら何もしない）
    if (!background && url === getHomeUrl()) focusOmnibarForNewTab(newTab.getAttribute('data-tab-id'));
    return newTab;
}
function focusOmnibarForNewTab(tabId) {
    const pick = () => {
        if (activeTabId !== tabId) return;
        const a = document.activeElement;
        if (a && a !== document.body && a !== urlInput && a.tagName !== 'WEBVIEW') return;   // 利用者がほかの所を使っている
        urlInput.focus(); urlInput.select();
    };
    requestAnimationFrame(pick);
    const wv = webviews[tabId];
    if (wv) { const once = () => { wv.removeEventListener('did-finish-load', once); setTimeout(pick, 30); }; wv.addEventListener('did-finish-load', once); setTimeout(() => wv.removeEventListener('did-finish-load', once), 5000); }
}

function closeTab(tabId) {
    if (!tabId) return;
    const card = getTabCard(tabId);
    const wasActive = activeTabId === tabId;

    if (card) {
        const url = card.getAttribute('data-url');
        const title = card.querySelector('.tab-title')?.textContent || url;
        if (url && !url.startsWith('chrome-error') && !isPrivateTab(tabId)) { // シークレットタブは復元対象にしない
            closedTabStack.push({ url, title });
            if (closedTabStack.length > CLOSED_TAB_LIMIT) closedTabStack.shift();
        }
    }

    // 閉じるのがアクティブタブなら、隣（下→上の順）のタブへ移る
    let next = null;
    if (wasActive && card) {
        const all = getTabCards();
        const idx = all.indexOf(card);
        next = all[idx + 1] || all[idx - 1] || null;
    }

    if (webviews[tabId]) { webviews[tabId].remove(); delete webviews[tabId]; }
    delete tabLastActive[tabId];
    delete tabShieldModes[tabId];
    if (typeof onSplitTabClosed === 'function') onSplitTabClosed(tabId);
    if (card) card.remove();
    onMediaTabClosed(tabId);

    // 最後のシークレットタブを閉じたら、Cookie・キャッシュ等をすべて消去する
    if (privateTabIds.delete(tabId) && privateTabIds.size === 0) {
        window.electronAPI?.clearPrivateSession();
    }

    if (wasActive) {
        activeTabId = null;
        if (next) next.click();
        else openNewTab(); // 最後のタブを閉じたら空のタブを1枚用意する
    }
}

async function restoreClosedTab() {
    const last = closedTabStack.pop();
    if (last) await openNewTab(last.url);
}

function cycleTab(step) {
    const all = getTabCards();
    if (all.length === 0) return;
    const idx = all.findIndex(c => c.getAttribute('data-tab-id') === activeTabId);
    const next = all[(idx + step + all.length) % all.length];
    next.click();
}

// Ctrl+1〜8 は n番目、Ctrl+9 は最後のタブ（Chrome と同じ挙動）
function activateTabByIndex(n) {
    const all = getTabCards();
    const card = n === 9 ? all[all.length - 1] : all[n - 1];
    if (card) card.click();
}
