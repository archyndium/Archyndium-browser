// ==========================================
// ★ 右クリックメニュー
// ==========================================
// Electron の webview には右クリックメニューが無いので、Chrome 相当のものを作る。
//   リンク：新しいタブ / シークレットタブで開く・アドレスをコピー
//   画像  ：新しいタブで開く・保存・コピー
//   動画  ：ピクチャーインピクチャー・ループ再生
//   選択中：コピー・Google で検索
//   入力欄：切り取り・コピー・貼り付け・スペル候補
//   その他：戻る・進む・再読み込み・印刷・検証
// あわせて、タブの右クリックメニューなど renderer 側から使う汎用ポップアップメニュー（popup-menu）も提供する。
const { ipcMain, Menu, clipboard, session, BrowserWindow } = require('electron');
const windows = require('./windows');

function nav(contents) {
  const h = contents.navigationHistory; // Electron 32+。古い版では webContents のメソッドを使う
  return {
    canGoBack: () => (h ? h.canGoBack() : contents.canGoBack()),
    canGoForward: () => (h ? h.canGoForward() : contents.canGoForward()),
    goBack: () => (h ? h.goBack() : contents.goBack()),
    goForward: () => (h ? h.goForward() : contents.goForward()),
  };
}

function attach(contents) {
  contents.on('context-menu', (event, params) => {
    const win = windows.hostWindowOf(contents); // このタブが入っているウィンドウ
    if (!win || win.isDestroyed()) return;
    const isPrivate = contents.session !== session.defaultSession;
    const openTab = (url, opts = {}) => win.webContents.send('open-in-new-tab', { url, background: true, isPrivate, ...opts });
    const sep = { type: 'separator' };
    const items = [];

    if (params.linkURL && /^https?:/.test(params.linkURL)) {
      items.push(
        { label: 'リンクを新しいタブで開く', click: () => openTab(params.linkURL) },
        { label: 'リンクをシークレットタブで開く', click: () => openTab(params.linkURL, { isPrivate: true }) },
        { label: 'リンクのアドレスをコピー', click: () => clipboard.writeText(params.linkURL) },
        { label: 'リンクをブックマークに追加…', click: () => windows.sendTo(win, 'page-action', { action: 'bookmark-link', url: params.linkURL, title: (params.linkText || '').trim(), webContentsId: contents.id }) },
        sep,
      );
    }

    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: '画像を新しいタブで開く', click: () => openTab(params.srcURL) },
        { label: '名前を付けて画像を保存…', click: () => contents.downloadURL(params.srcURL) },
        { label: '画像をコピー', click: () => contents.copyImageAt(params.x, params.y) },
        { label: '画像のアドレスをコピー', click: () => clipboard.writeText(params.srcURL) },
        sep,
      );
    }

    if (params.mediaType === 'video') {
      // クリック位置の動画を対象にする（userGesture = true でないと PiP は開けない）
      const target = `(document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video'))`;
      items.push(
        { label: 'ピクチャーインピクチャー', click: () => contents.executeJavaScript(`(() => { const v = ${target}; if (!v) return; document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture(); })()`, true).catch(() => {}) },
        { label: 'ループ再生', type: 'checkbox', checked: !!params.mediaFlags?.isLooping, click: () => contents.executeJavaScript(`(() => { const v = ${target}; if (v) v.loop = !v.loop; })()`).catch(() => {}) },
        sep,
      );
    }

    if (params.isEditable) {
      // スペルミスの候補
      (params.dictionarySuggestions || []).slice(0, 5).forEach(word => items.push({ label: word, click: () => contents.replaceMisspelling(word) }));
      if (params.dictionarySuggestions?.length) items.push(sep);
      items.push(
        { label: '元に戻す', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'やり直し', role: 'redo', enabled: params.editFlags.canRedo },
        sep,
        { label: '切り取り', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'コピー', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '貼り付け', role: 'paste', enabled: params.editFlags.canPaste },
        { label: 'すべて選択', role: 'selectAll' },
        sep,
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      const text = params.selectionText.trim();
      const short = text.length > 20 ? text.slice(0, 20) + '…' : text;
      items.push(
        { label: 'コピー', role: 'copy' },
        { label: `「${short}」を検索`, click: () => windows.sendTo(win, 'search-text', { text }) },
        { label: '選択したテキストをメモに追加', click: () => windows.sendTo(win, 'add-to-note', { text, url: contents.getURL(), title: contents.getTitle() }) },
        { label: '選択したテキストを読み上げ', click: () => windows.sendTo(win, 'speak-text', { text }) },
        sep,
      );
    }

    if (!params.linkURL && params.mediaType === 'none' && !params.isEditable && !params.selectionText) {
      const n = nav(contents);
      items.push(
        { label: '戻る', enabled: n.canGoBack(), click: () => n.goBack() },
        { label: '進む', enabled: n.canGoForward(), click: () => n.goForward() },
        { label: '再読み込み', click: () => contents.reload() },
        sep,
        { label: '印刷…', click: () => contents.print() },
        { label: 'このページをブックマークに追加…', click: () => windows.sendTo(win, 'page-action', { action: 'bookmark-page', webContentsId: contents.id }) },
        { label: 'ページのアドレスをコピー', click: () => clipboard.writeText(contents.getURL()) },
        sep,
      );
    }
    // ▼ 追加：コピーできないページ向け（選択した文字が無い時も、ある時も出す）
    if (!params.isEditable) {
      items.push(
        { label: 'このページを翻訳', click: () => windows.sendTo(win, 'page-action', { action: 'translate-page', webContentsId: contents.id }) },
        { label: '動画の字幕を翻訳（オン / オフ）', click: () => windows.sendTo(win, 'page-action', { action: 'translate-subs', webContentsId: contents.id }) },
        { label: 'このサイトのコピー制限を解除', click: () => windows.sendTo(win, 'page-action', { action: 'unlock-copy', webContentsId: contents.id }) },
        { label: 'ページの文字を取り出す', click: () => windows.sendTo(win, 'page-action', { action: 'extract-text', webContentsId: contents.id }) },
        sep,
      );
    }

    items.push({ label: '検証', click: () => contents.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// renderer から使う汎用メニュー：items = [{ id, label, enabled?, checked?, type? }]、選ばれた id を返す
function init() {
  ipcMain.handle('popup-menu', (event, items) => new Promise((resolve) => {
    // クリック時に resolve。何も選ばずに閉じた時は少し待ってから null（click より先に閉じる通知が来る環境があるため）
    // ▼ 追加：submenu（入れ子のメニュー）にも対応。例：「フォルダに移動 ▸」
    const build = (list) => list.map(it => (it.type === 'separator' ? { type: 'separator' } : it.submenu ? {
      label: it.label, enabled: it.enabled !== false, submenu: build(it.submenu),
    } : {
      label: it.label, enabled: it.enabled !== false,
      type: it.checked !== undefined ? 'checkbox' : 'normal', checked: !!it.checked,
      click: () => resolve(it.id),
    }));
    const template = build(Array.isArray(items) ? items : []);
    Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender), callback: () => setTimeout(() => resolve(null), 150) });
  }));
}

module.exports = { attach, init };
