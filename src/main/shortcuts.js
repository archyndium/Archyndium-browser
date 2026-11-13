// ==========================================
// ★ キーボードショートカット
// ==========================================
// <webview> にフォーカスがある間、キー入力はホスト側（index.html）の keydown に届かない。
// そこでメインプロセスの before-input-event で「メインウィンドウ」と「全 webview」の入力を
// 横取りし、アクション名だけをレンダラーへ送る（実処理は renderer/shortcuts.js）。
// ウィンドウにフォーカスがある時だけ効くので、globalShortcut のように他アプリの操作は奪わない。

const windows = require('./windows');

const isMac = process.platform === 'darwin';

// キーを押しっぱなしにした時に連続実行させないアクション
const NO_REPEAT = new Set(['new-tab', 'new-private-tab', 'new-window', 'command-palette', 'tab-search', 'screenshot', 'split', 'reader-mode', 'fullscreen', 'view-source', 'panel-notes', 'find', 'print', 'close-tab', 'restore-tab', 'bookmark', 'devtools', 'panel-history', 'panel-downloads', 'panel-bookmarks']);

function resolveShortcut(input) {
  if (input.type !== 'keyDown') return null;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const mod = isMac ? input.meta : input.control; // Win/Linux: Ctrl, macOS: Cmd

  // 修飾キーなし
  if (key === 'F5') return (input.control || input.shift) ? 'hard-reload' : 'reload';
  if (key === 'F12') return 'devtools';
  if (key === 'BrowserBack') return 'back';
  if (key === 'BrowserForward') return 'forward';
  if (key === 'F3') return input.shift ? 'find-prev' : 'find-next';
  if (key === 'F11' && !mod) return 'fullscreen';
  if (key === 'F9' && !mod) return 'reader-mode';

  // Alt+←/→（macOS は Option+← が単語移動なので Cmd+[ / Cmd+] を使う）
  if (!isMac && input.alt && !input.control && !input.shift) {
    if (key === 'ArrowLeft') return 'back';
    if (key === 'ArrowRight') return 'forward';
    if (key === 'd') return 'focus-url';
    return null;
  }

  // Ctrl+Tab / Ctrl+Shift+Tab は macOS でも Ctrl
  if (input.control && key === 'Tab') return input.shift ? 'prev-tab' : 'next-tab';

  if (!mod || input.alt) return null;

  if (input.shift) {
    switch (key) {
      case 't': return 'restore-tab';
      case 'n': return 'new-private-tab';
      case 'r': return 'hard-reload';
      case 'i': return 'devtools';
      case 'o': return 'panel-bookmarks';
      case '+': return 'zoom-in'; // JIS配列など Shift が必要な配列向け
      case 'g': return 'find-prev';
      case 'p': return 'command-palette';
      case 'a': return 'tab-search';
      case 's': return 'screenshot';
      case 'e': return 'panel-notes';
      default: return null;
    }
  }

  switch (key) {
    case 't': return 'new-tab';
    case 'w': return 'close-tab';
    case 'r': return 'reload';
    case 'l': return 'focus-url';
    case 'd': return 'bookmark';
    case 'f': return 'find';
    case 'g': return 'find-next';
    case 'p': return 'print';
    case 'n': return 'new-window';
    case 'k': return 'command-palette';
    case 'u': return 'view-source';
    case '\\': return 'split';
    case 'h': return isMac ? null : 'panel-history'; // Cmd+H は macOS の「隠す」
    case 'y': return isMac ? 'panel-history' : null;
    case 'j': return 'panel-downloads';
    case 'PageDown': return 'next-tab';
    case 'PageUp': return 'prev-tab';
    case '[': return isMac ? 'back' : null;
    case ']': return isMac ? 'forward' : null;
    case '=': case '+': case ';': return 'zoom-in';
    case '-': return 'zoom-out';
    case '0': return 'zoom-reset';
  }
  if (/^[1-9]$/.test(key)) return `tab-${key}`;
  return null;
}

// マウスのサイドボタン（戻る/進む）。Windows・Linux ではウィンドウに app-command として届く。
// （macOS などで届かない環境向けに、webview 内でもボタンを検知している：renderer/tabs.js）
function attachWindow(win) {
  win.on('app-command', (event, command) => {
    if (command === 'browser-backward') win.webContents.send('shortcut', 'back');
    if (command === 'browser-forward') win.webContents.send('shortcut', 'forward');
  });
}

function attach(contents) {
  contents.on('before-input-event', (event, input) => {
    const action = resolveShortcut(input);
    if (!action) return;
    event.preventDefault();
    if (input.isAutoRepeat && NO_REPEAT.has(action)) return;
    windows.sendToHost(contents, 'shortcut', action); // このページ（タブ）のウィンドウで実行する
  });
}

module.exports = { attach, attachWindow, resolveShortcut };
