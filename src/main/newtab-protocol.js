// ==========================================
// ★ 新しいタブのページ（archyndium://newtab/）
// ==========================================
// アプリに同梱した src/newtab/ のファイルだけを返す。ページは普通の Web ページと同じく
// webview の中（Node.js なし・サンドボックスあり）で動き、アプリの機能には触れられない。
// 表示する内容（Work / Focus・広告ブロックの数・再生中の曲）は、本体の画面が
// webview.executeJavaScript で渡す（renderer/newtab-host.js）。
const { app, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SCHEME = 'archyndium';
const ROOT = path.join(__dirname, '..', 'newtab');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// app の準備ができる前に呼ぶ必要がある（main.js が読み込んだ時点で実行される）
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);

function handler(request) {
  let u;
  try { u = new URL(request.url); } catch (e) { return new Response('Not found', { status: 404 }); }
  if (u.hostname !== 'newtab') return new Response('Not found', { status: 404 });
  const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
  const file = path.normalize(path.join(ROOT, rel));
  // 同梱フォルダの外は返さない
  if (!file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)]) return new Response('Not found', { status: 404 });
  try {
    return new Response(fs.readFileSync(file), { headers: { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' } });
  } catch (e) {
    return new Response('Not found', { status: 404 });
  }
}

function init({ privatePartition } = {}) {
  app.whenReady().then(() => {
    protocol.handle(SCHEME, handler);
    // シークレットタブ（別のセッション）でも開けるようにする
    if (privatePartition) session.fromPartition(privatePartition, { cache: false }).protocol.handle(SCHEME, handler);
  });
}

module.exports = { init };
