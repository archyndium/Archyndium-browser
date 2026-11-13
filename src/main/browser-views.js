// ==========================================
// ★ BrowserView タブ管理（レガシー）
// ==========================================
// 現在の index.html は <webview> タグでタブを管理しており、ここの IPC（create-tab 等）は
// どこからも呼ばれていません。preload.js の API を壊さないよう残していますが、
// BrowserView 方式に戻す予定がなければ、このファイルと preload の該当 API は削除して構いません。
const { BrowserView, ipcMain } = require('electron');
const path = require('path');

let views = {}; // Store BrowserViews by tabId
let activeTabId = null;

function init(getMainWindow) {
  // --- BrowserView Management (Fully compatible with all recent Electron versions) ---
  ipcMain.handle('create-tab', (event, { tabId, url, bounds }) => {
      const view = new BrowserView({
          webPreferences: {
              preload: path.join(__dirname, '..', 'preload.js'),
              contextIsolation: true,
              nodeIntegration: false
          }
      });
      
      // ▼ 追加：ネイティブビュー自体の背景を透明にする（これで角丸が反映されます）
      view.setBackgroundColor('#00000000');
      
      // ▼ セキュリティ強化 2: 悪質なポップアップの完全ブロック
      view.webContents.setWindowOpenHandler((details) => {
          // target="_blank" や window.open による勝手な別ウィンドウ展開を物理的に阻止する
          console.log('Blocked popup attempt to:', details.url);
          return { action: 'deny' };
      });
      
      view.webContents.loadURL(url);
      views[tabId] = view;

      view.webContents.on('did-navigate', (e, navigationUrl) => {
          getMainWindow().webContents.send('tab-navigated', { tabId, url: navigationUrl });
      });
      view.webContents.on('did-navigate-in-page', (e, navigationUrl) => {
          getMainWindow().webContents.send('tab-navigated', { tabId, url: navigationUrl });
      });
      view.webContents.on('page-title-updated', (e, title) => {
          getMainWindow().webContents.send('tab-title-updated', { tabId, title });
      });
      view.webContents.on('page-favicon-updated', (e, favicons) => {
          if(favicons && favicons.length > 0) {
               getMainWindow().webContents.send('tab-favicon-updated', { tabId, favicon: favicons[0] });
          }
      });

      view.webContents.on('console-message', (e, level, message) => {
          if (message === 'ARCHYNDIUM_PLAYING' || message === 'ARCHYNDIUM_PAUSED' || message.startsWith('ARCHYNDIUM_PROGRESS:')) {
               getMainWindow().webContents.send('tab-media-event', { tabId, message });
          }
      });

      view.webContents.on('dom-ready', () => {
          const adBlockScript = `
            const killAds = () => {
              document.querySelectorAll('ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-banner-promo-renderer, #masthead-ad, .ytd-in-feed-ad-layout-renderer, .ytd-video-masthead-ad-v3-renderer').forEach(el => el.style.display = 'none');
              const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
              const isAd = document.querySelector('.ad-showing') || document.querySelector('.ad-interrupting');
              const video = document.querySelector('video');
              if (skipBtns.length > 0) {
                skipBtns.forEach(b => { b.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); b.dispatchEvent(new MouseEvent('mouseup', {bubbles:true})); b.click(); });
              } else if (isAd && video && video.duration) {
                video.playbackRate = 16.0; video.muted = true;
                if (video.currentTime < video.duration - 0.5) video.currentTime = video.duration - 0.1;
              }
            };
            setInterval(killAds, 50);
            setInterval(() => {
              const v = document.querySelector('video');
              if(v && !v.__archyndium_synced) {
                v.__archyndium_synced = true;
                v.addEventListener('play', () => console.log('ARCHYNDIUM_PLAYING'));
                v.addEventListener('pause', () => console.log('ARCHYNDIUM_PAUSED'));
                // ▼ 現在時間と全体の長さ（duration）を両方送るように変更
                v.addEventListener('timeupdate', () => {
                   if(v.duration) {
                       console.log('ARCHYNDIUM_PROGRESS:' + v.currentTime + ':' + v.duration);
                   }
                });
              }
            }, 500);
          `;
          view.webContents.executeJavaScript(adBlockScript).catch(() => {});
          
          // ▼ 変更：四隅（12px）だけに逆角丸のマスクを配置し、クリックを全く邪魔しないようにする
          const roundedCSS = `
              :root { --bg-color: #121212; }
              body::before, body::after, html::before, html::after {
                  content: ''; position: fixed; width: 12px; height: 12px; z-index: 2147483647; pointer-events: none !important;
              }
              body::before { top: 0; left: 0; background: radial-gradient(circle at 100% 100%, transparent 12px, var(--bg-color) 12px); }
              body::after { top: 0; right: 0; background: radial-gradient(circle at 0% 100%, transparent 12px, var(--bg-color) 12px); }
              html::before { bottom: 0; left: 0; background: radial-gradient(circle at 100% 0%, transparent 12px, var(--bg-color) 12px); }
              html::after { bottom: 0; right: 0; background: radial-gradient(circle at 0% 0%, transparent 12px, var(--bg-color) 12px); }
              
              html, body { overflow-x: hidden !important; }
              ::-webkit-scrollbar { width: 8px; }
              ::-webkit-scrollbar-thumb { background: rgba(150, 150, 150, 0.5); border-radius: 4px; }
          `;
          view.webContents.insertCSS(roundedCSS).catch(() => {});
      });
  });

  ipcMain.on('switch-tab', (event, { tabId, bounds }) => {
      if (activeTabId && views[activeTabId]) {
          getMainWindow().removeBrowserView(views[activeTabId]); // WebContentsViewからBrowserViewのAPIに変更
      }
      const view = views[tabId];
      if (view) {
          getMainWindow().addBrowserView(view); // アタッチ処理
          view.setBounds(bounds);
          activeTabId = tabId;
          getMainWindow().webContents.send('active-tab-updated', { tabId, url: view.webContents.getURL() });
      }
  });

  ipcMain.on('update-tab-bounds', (event, bounds) => {
      if (activeTabId && views[activeTabId]) {
          // boundsから座標とサイズだけを抽出して適用
          views[activeTabId].setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
          
          // ▼ 追加：フロントエンドからテーマ色が送られてきたら、表示中の全タブの角の色を書き換える
          if (bounds.themeColor) {
              const colorCSS = `:root { --bg-color: ${bounds.themeColor} !important; }`;
              for (const id in views) {
                  views[id].webContents.insertCSS(colorCSS).catch(()=>{});
              }
          }
      }
  });

  ipcMain.on('close-tab', (event, tabId) => {
      if (views[tabId]) {
          if (activeTabId === tabId) {
              getMainWindow().removeBrowserView(views[tabId]);
              activeTabId = null;
          }
          try { views[tabId].webContents.destroy(); } catch(e) {}
          delete views[tabId];
      }
  });

  ipcMain.on('navigate-tab', (event, { tabId, url }) => {
      if (views[tabId]) {
          views[tabId].webContents.loadURL(url);
      }
  });

  ipcMain.on('tab-go-back', () => { if(activeTabId && views[activeTabId] && views[activeTabId].webContents.canGoBack()) views[activeTabId].webContents.goBack(); });
  ipcMain.on('tab-go-forward', () => { if(activeTabId && views[activeTabId] && views[activeTabId].webContents.canGoForward()) views[activeTabId].webContents.goForward(); });
  ipcMain.on('tab-reload', () => { if(activeTabId && views[activeTabId]) views[activeTabId].webContents.reload(); });

  ipcMain.handle('get-tab-url', (event, tabId) => { return views[tabId] ? views[tabId].webContents.getURL() : null; });
  ipcMain.handle('get-tab-title', (event, tabId) => { return views[tabId] ? views[tabId].webContents.getTitle() : null; });

  // ▼ 削除：中身が空だった Smart sleep の setInterval（タブスリープは renderer/tab-sleep.js で実装）

  // Media Control IPCs for BrowserView
  ipcMain.on('media-toggle-play', (event, tabId) => {
      if(views[tabId]) views[tabId].webContents.executeJavaScript(`var v=document.querySelector('video')||document.querySelector('audio'); if(v){ v.paused ? v.play() : v.pause(); }`).catch(()=>{});
  });
  ipcMain.on('media-next', (event, tabId) => {
      if(views[tabId]) views[tabId].webContents.executeJavaScript(`var n=document.querySelector('.ytp-next-button'); if(n) n.click();`).catch(()=>{});
  });
  ipcMain.on('media-prev', (event, tabId) => {
      if(views[tabId]) views[tabId].webContents.executeJavaScript(`var v=document.querySelector('video'); if(v) { v.currentTime = 0; v.play(); }`).catch(()=>{});
  });
  ipcMain.on('media-seek', (event, {tabId, progress}) => {
      if(views[tabId]) views[tabId].webContents.executeJavaScript(`var v=document.querySelector('video'); if(v && v.duration) { v.currentTime = v.duration * ${progress}; }`).catch(()=>{});
  });
}

module.exports = { init };
