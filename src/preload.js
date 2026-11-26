const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  windowControl: (command) => ipcRenderer.send('window-control', command),
  windowDrag: (phase, x, y) => ipcRenderer.send('window-drag', { phase, x, y }),
  openMiniPlayer: () => ipcRenderer.send('open-mini-player'),
  closeMiniPlayer: () => ipcRenderer.send('close-mini-player'),
  
  syncToMini: (data) => ipcRenderer.send('sync-to-mini', data),
  onSyncFromMain: (callback) => ipcRenderer.on('sync-from-main', (e, data) => callback(data)),
  
  controlFromMini: (command) => ipcRenderer.send('control-from-mini', command),
  onControlToMain: (callback) => ipcRenderer.on('control-to-main', (e, cmd) => callback(cmd)),

  fetchLyrics: (payload) => ipcRenderer.invoke('fetch-lyrics', payload),
  youtubeOembed: (videoId) => ipcRenderer.invoke('youtube-oembed', videoId),
  fetchLyricsById: (id) => ipcRenderer.invoke('fetch-lyrics-by-id', id),
  exportLrc: (content, name) => ipcRenderer.invoke('lyrics-export-lrc', content, name),
  searchSuggest: (engine, query) => ipcRenderer.invoke('search-suggest', engine, query),

  // WebContentsView APIs
  createTab: (payload) => ipcRenderer.invoke('create-tab', payload),
  switchTab: (payload) => ipcRenderer.send('switch-tab', payload),
  updateTabBounds: (bounds) => ipcRenderer.send('update-tab-bounds', bounds),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  navigateTab: (payload) => ipcRenderer.send('navigate-tab', payload),
  
  tabGoBack: () => ipcRenderer.send('tab-go-back'),
  tabGoForward: () => ipcRenderer.send('tab-go-forward'),
  tabReload: () => ipcRenderer.send('tab-reload'),
  
  getTabUrl: (tabId) => ipcRenderer.invoke('get-tab-url', tabId),
  getTabTitle: (tabId) => ipcRenderer.invoke('get-tab-title', tabId),

  onTabNavigated: (callback) => ipcRenderer.on('tab-navigated', (e, data) => callback(data)),
  onTabTitleUpdated: (callback) => ipcRenderer.on('tab-title-updated', (e, data) => callback(data)),
  onTabFaviconUpdated: (callback) => ipcRenderer.on('tab-favicon-updated', (e, data) => callback(data)),
  onActiveTabUpdated: (callback) => ipcRenderer.on('active-tab-updated', (e, data) => callback(data)),
  onTabMediaEvent: (callback) => ipcRenderer.on('tab-media-event', (e, data) => callback(data)),

  // ▼▼ ここから追加 ▼▼
  onDownloadStarted: (callback) => ipcRenderer.on('download-started', (e, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (e, data) => callback(data)),
  onDownloadCompleted: (callback) => ipcRenderer.on('download-completed', (e, data) => callback(data)),
  openDownloadItem: (filePath) => ipcRenderer.send('open-download-item', filePath),
  showDownloadItem: (filePath) => ipcRenderer.send('show-download-item', filePath),
  controlDownload: (id, action) => ipcRenderer.send('download-control', { id, action }),
  checkDownloadsExist: (paths) => ipcRenderer.invoke('downloads-check-exists', paths),
  trashDownloadFile: (filePath) => ipcRenderer.invoke('download-trash-file', filePath),
  retryDownload: (url, isPrivate) => ipcRenderer.send('download-retry', { url, isPrivate }),
  getDownloadSettings: () => ipcRenderer.invoke('download-settings-get'),
  setDownloadSetting: (key, value) => ipcRenderer.invoke('download-settings-set', key, value),
  // ▲▲ ここまで追加 ▲▲
  setAdblockMode: (mode) => ipcRenderer.invoke('set-adblock-mode', mode),
  getAdblockMode: () => ipcRenderer.invoke('get-adblock-mode'),
  setTabShield: (webContentsId, mode) => ipcRenderer.invoke('set-tab-shield', webContentsId, mode),
  getShieldStats: (webContentsId) => ipcRenderer.invoke('get-shield-stats', webContentsId),
  getShieldSite: (url) => ipcRenderer.invoke('shield-site-get', url),
  setShieldSite: (url, bypassed) => ipcRenderer.invoke('shield-site-set', url, bypassed),
  listShieldSites: () => ipcRenderer.invoke('shield-sites-list'),

  popupMenu: (items) => ipcRenderer.invoke('popup-menu', items),
  openNewWindow: (opts) => ipcRenderer.send('open-new-window', opts),
  // ▼ 追加：ウィンドウをまとめる・タブをほかのウィンドウへ移す
  mergeWindows: () => ipcRenderer.send('merge-windows'),
  moveTabsToWindow: (targetId, tabs) => ipcRenderer.send('move-tabs-to-window', { targetId, tabs }),
  moveTabToOtherWindow: (tab) => ipcRenderer.invoke('move-tab-to-other-window', tab),
  onMergeIntoWindow: (callback) => ipcRenderer.on('merge-into-window', (e, data) => callback(data)),
  windowCountNow: () => ipcRenderer.sendSync('window-count-sync'),
  confirmCloseAll: (count) => ipcRenderer.invoke('confirm-close-all', count),
  tearOffTab: (payload) => ipcRenderer.invoke('tab-tear-off', payload),
  // ▼ 追加：タブを引き出した瞬間に別のウィンドウにする（main/tab-drag.js）
  tabDetach: (info) => ipcRenderer.invoke('tab-detach', info),
  tabDragMove: (pos) => ipcRenderer.send('tab-drag-move', pos),
  tabDragFinish: (pos) => ipcRenderer.invoke('tab-drag-finish', pos),
  onTabDragHover: (callback) => ipcRenderer.on('tab-drag-hover', (e, data) => callback(data)),
  onTabDropIn: (callback) => ipcRenderer.on('tab-drop-in', (e, data) => callback(data)),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (e, on) => callback(on)),
  windowCount: () => ipcRenderer.sendSync('window-count'),
  capturePage: (webContentsId, mode) => ipcRenderer.invoke('capture-page', webContentsId, mode),
  showFile: (filePath) => ipcRenderer.send('show-file', filePath),
  onSearchText: (callback) => ipcRenderer.on('search-text', (e, data) => callback(data)),
  // ▼ 追加：ページの右クリックメニューからの操作（コピー制限の解除・文字の取り出し）
  onPageAction: (callback) => ipcRenderer.on('page-action', (e, data) => callback(data)),
  onSpeakText: (callback) => ipcRenderer.on('speak-text', (e, data) => callback(data)),
  onAddToNote: (callback) => ipcRenderer.on('add-to-note', (e, data) => callback(data)),
  onPlayerRemote: (callback) => ipcRenderer.on('player-remote', (e, data) => callback(data)),
  onMiniPlayerState: (callback) => ipcRenderer.on('mini-player-state', (e, data) => callback(data)),

  // ▼ 追加：他のブラウザとの互換（ブックマークの取り込み・既定のブラウザ・PDF・DRM）
  bookmarkSources: () => ipcRenderer.invoke('bookmark-sources'),
  readBookmarkSource: (id) => ipcRenderer.invoke('bookmark-read-source', id),
  importBookmarkHtml: () => ipcRenderer.invoke('bookmark-import-html'),
  exportBookmarkHtml: (folders) => ipcRenderer.invoke('bookmark-export-html', folders),
  setDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  // ▼ 追加：アプリ全体の設定（不透明なウィンドウなど）
  getAppSettings: () => ipcRenderer.invoke('app-settings-get'),
  setAppSetting: (key, value) => ipcRenderer.invoke('app-settings-set', key, value),
  // ▼ 追加：サイトのデータ（Cookie など）の削除。host を省くとすべて
  clearSiteData: (host) => ipcRenderer.invoke('site-data-clear', host),
  // ▼ 追加：ミニプレイヤーの大きさの変更（右下の角をドラッグ）
  miniResize: (size) => ipcRenderer.send('mini-resize', size),
  // ▼ 追加：端末内の翻訳（main/translator.js）
  translateStatus: () => ipcRenderer.invoke('translate-status'),
  translateDownload: (pair) => ipcRenderer.invoke('translate-download', pair),
  translateDeleteModel: (pair) => ipcRenderer.invoke('translate-delete-model', pair),
  translateTexts: (req) => ipcRenderer.invoke('translate-texts', req),
  onTranslateDownloadProgress: (cb) => ipcRenderer.on('translate-download-progress', (e, d) => cb(d)),
  // ▼ 追加：リンクのプレビュー（ページのタイトル・画像を main で取得）
  linkPreview: (url) => ipcRenderer.invoke('link-preview', url),
  isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser'),
  printToPdf: (webContentsId, title) => ipcRenderer.invoke('print-to-pdf', webContentsId, title),
  drmStatus: () => ipcRenderer.invoke('drm-status'),
  takeStartupUrls: () => ipcRenderer.invoke('take-startup-urls'),
  getUpdateState: () => ipcRenderer.invoke('update-get-state'),
  checkForUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.send('update-install'),
  onUpdateState: (callback) => ipcRenderer.on('update-state', (e, s) => callback(s)),

  // ▼ 追加：拡張機能
  listExtensions: () => ipcRenderer.invoke('extensions-list'),
  installExtensionFolder: () => ipcRenderer.invoke('extensions-install-folder'),
  installExtensionCrx: () => ipcRenderer.invoke('extensions-install-crx'),
  installExtensionStore: (input) => ipcRenderer.invoke('extensions-install-store', input),
  setExtensionEnabled: (key, enabled) => ipcRenderer.invoke('extensions-set-enabled', key, enabled),
  removeExtension: (key) => ipcRenderer.invoke('extensions-remove', key),
  openExtensionPopup: (key, anchor) => ipcRenderer.invoke('extensions-open-popup', key, anchor),
  onExtensionsChanged: (callback) => ipcRenderer.on('extensions-changed', () => callback()),

  // ▼ 追加：サイトの権限
  onPermissionRequest: (callback) => ipcRenderer.on('permission-request', (e, data) => callback(data)),
  onPermissionCancel: (callback) => ipcRenderer.on('permission-cancel', (e, data) => callback(data)),
  respondPermission: (payload) => ipcRenderer.send('permission-respond', payload),
  listPermissions: () => ipcRenderer.invoke('permissions-list'),
  resetPermission: (origin, permission) => ipcRenderer.invoke('permissions-reset', origin, permission),
  clearPrivateSession: () => ipcRenderer.invoke('clear-private-session'),
  // Media controls for specific view
  mediaTogglePlay: (tabId) => ipcRenderer.send('media-toggle-play', tabId),
  mediaNext: (tabId) => ipcRenderer.send('media-next', tabId),
  mediaPrev: (tabId) => ipcRenderer.send('media-prev', tabId),
  mediaSeek: (payload) => ipcRenderer.send('media-seek', payload),

  // ▼ 追加：キーボードショートカット / Ctrl+クリックで新規タブ
  onShortcut: (callback) => ipcRenderer.on('shortcut', (e, action) => callback(action)),
  onOpenInNewTab: (callback) => ipcRenderer.on('open-in-new-tab', (e, data) => callback(data))
});