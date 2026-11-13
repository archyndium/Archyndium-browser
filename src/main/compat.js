// ==========================================
// ★ 他のブラウザとの互換・不足機能の補い
// ==========================================
//   ・ブックマークの取り込み … Chrome / Edge / Brave / Opera / Opera GX / Vivaldi のブックマークを直接読み込む。
//                               Firefox などは「HTML 形式でエクスポートしたファイル」から読み込む
//   ・ブックマークの書き出し … 他のブラウザで読み込める HTML 形式で保存
//   ・既定のブラウザ        … 他のアプリでリンクを開いた時に ARCHYNDIUM で開く（Windows はレジストリに登録して設定画面を開く）
//   ・PDF として保存        … 表示中のページを PDF ファイルに
//   ・保護された動画（DRM） … Netflix などに必要な Widevine が使えるか（castLabs 版 Electron の時だけ使える）
const { app, ipcMain, dialog, shell, BrowserWindow, webContents } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// ---------- ブックマークの取り込み ----------
function chromiumProfileRoots() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  if (process.platform === 'win32') {
    return [
      ['Google Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
      ['Microsoft Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
      ['Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      ['Vivaldi', path.join(local, 'Vivaldi', 'User Data')],
      ['Opera', path.join(roaming, 'Opera Software', 'Opera Stable')],
      ['Opera GX', path.join(roaming, 'Opera Software', 'Opera GX Stable')],
    ];
  }
  if (process.platform === 'darwin') {
    const sup = path.join(home, 'Library', 'Application Support');
    return [
      ['Google Chrome', path.join(sup, 'Google', 'Chrome')],
      ['Microsoft Edge', path.join(sup, 'Microsoft Edge')],
      ['Brave', path.join(sup, 'BraveSoftware', 'Brave-Browser')],
      ['Vivaldi', path.join(sup, 'Vivaldi')],
      ['Opera', path.join(sup, 'com.operasoftware.Opera')],
      ['Opera GX', path.join(sup, 'com.operasoftware.OperaGX')],
    ];
  }
  const cfg = path.join(home, '.config');
  return [
    ['Google Chrome', path.join(cfg, 'google-chrome')],
    ['Chromium', path.join(cfg, 'chromium')],
    ['Microsoft Edge', path.join(cfg, 'microsoft-edge')],
    ['Brave', path.join(cfg, 'BraveSoftware', 'Brave-Browser')],
    ['Vivaldi', path.join(cfg, 'vivaldi')],
    ['Opera', path.join(cfg, 'opera')],
  ];
}

// ブックマークファイル（JSON）を「フォルダ名 → URL の一覧」に平らにする
function flattenChromium(json) {
  const folders = [];
  const walk = (node, trail) => {
    if (!node) return;
    if (node.type === 'url') {
      if (!/^https?:/i.test(node.url || '')) return;
      const name = trail.join(' / ') || 'ブックマーク';
      let f = folders.find(x => x.name === name);
      if (!f) folders.push(f = { name, items: [] });
      f.items.push({ url: node.url, title: node.name || node.url });
      return;
    }
    (node.children || []).forEach(c => walk(c, node.name ? [...trail, node.name] : trail));
  };
  const roots = json.roots || {};
  // 「ブックマーク バー」「その他のブックマーク」などの最上位の名前はそのまま使う
  Object.values(roots).forEach(r => { if (r && typeof r === 'object' && r.children) walk(r, []); });
  return folders;
}

function findBookmarkSources() {
  const sources = [];
  for (const [browser, root] of chromiumProfileRoots()) {
    if (!fs.existsSync(root)) continue;
    // Opera はフォルダ直下、他は Default / Profile N の中
    const candidates = [root];
    try { fs.readdirSync(root).forEach(d => { if (d === 'Default' || /^Profile \d+$/.test(d)) candidates.push(path.join(root, d)); }); } catch (e) {}
    for (const dir of candidates) {
      const file = path.join(dir, 'Bookmarks');
      if (!fs.existsSync(file)) continue;
      try {
        const folders = flattenChromium(JSON.parse(fs.readFileSync(file, 'utf8')));
        const count = folders.reduce((n, f) => n + f.items.length, 0);
        if (!count) continue;
        const profile = dir === root ? '' : path.basename(dir);
        sources.push({ id: file, label: profile && profile !== 'Default' ? `${browser}（${profile}）` : browser, browser, count });
      } catch (e) {}
    }
  }
  return sources;
}

// Netscape 形式（各ブラウザの「ブックマークをエクスポート」で作られる HTML）を読む
function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
}
function parseBookmarkHtml(html) {
  const folders = [];
  const trail = [];
  const re = /<DT><H3[^>]*>([\s\S]*?)<\/H3>|<DT><A\s+([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) trail.push(decodeEntities(m[1].trim()));
    else if (m[2] !== undefined) {
      const href = /HREF="([^"]*)"/i.exec(m[2]);
      if (!href || !/^https?:/i.test(href[1])) continue;
      const name = trail.join(' / ') || 'ブックマーク';
      let f = folders.find(x => x.name === name);
      if (!f) folders.push(f = { name, items: [] });
      f.items.push({ url: decodeEntities(href[1]), title: decodeEntities(m[3].replace(/<[^>]+>/g, '').trim()) || href[1] });
    } else trail.pop();
  }
  return folders;
}

function toBookmarkHtml(folders) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const now = Math.floor(Date.now() / 1000);
  const body = folders.map(f => `    <DT><H3 ADD_DATE="${now}">${esc(f.name)}</H3>\n    <DL><p>\n${(f.items || []).map(i => `        <DT><A HREF="${esc(i.url)}" ADD_DATE="${now}">${esc(i.title)}</A>`).join('\n')}\n    </DL><p>`).join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}\n</DL><p>\n`;
}

// ---------- 既定のブラウザ ----------
const REG_NAME = 'ARCHYNDIUM';
const PROG_ID = 'ArchyndiumHTML';

function launchCommand() {
  // 開発中（electron . で起動）はアプリのフォルダも引数に付ける
  const exe = `"${process.execPath}"`;
  return process.defaultApp && process.argv[1] ? `${exe} "${path.resolve(process.argv[1])}" "%1"` : `${exe} "%1"`;
}

function reg(args) {
  return new Promise((resolve) => execFile('reg', args, { windowsHide: true }, (err) => resolve(!err)));
}

async function registerWindowsBrowser() {
  const cmd = launchCommand();
  const base = `HKCU\\Software\\Clients\\StartMenuInternet\\${REG_NAME}`;
  const icon = `"${process.execPath}",0`;
  const steps = [
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}`, '/ve', '/d', 'ARCHYNDIUM HTML Document', '/f'],
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', icon, '/f'],
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', cmd, '/f'],
    ['add', base, '/ve', '/d', 'ARCHYNDIUM Browser', '/f'],
    ['add', `${base}\\DefaultIcon`, '/ve', '/d', icon, '/f'],
    ['add', `${base}\\shell\\open\\command`, '/ve', '/d', cmd.replace(' "%1"', ''), '/f'],
    ['add', `${base}\\Capabilities`, '/v', 'ApplicationName', '/d', 'ARCHYNDIUM Browser', '/f'],
    ['add', `${base}\\Capabilities`, '/v', 'ApplicationDescription', '/d', 'ARCHYNDIUM Browser', '/f'],
    ['add', `${base}\\Capabilities`, '/v', 'ApplicationIcon', '/d', icon, '/f'],
    ['add', `${base}\\Capabilities\\URLAssociations`, '/v', 'http', '/d', PROG_ID, '/f'],
    ['add', `${base}\\Capabilities\\URLAssociations`, '/v', 'https', '/d', PROG_ID, '/f'],
    ['add', `${base}\\Capabilities\\FileAssociations`, '/v', '.html', '/d', PROG_ID, '/f'],
    ['add', `${base}\\Capabilities\\FileAssociations`, '/v', '.htm', '/d', PROG_ID, '/f'],
    ['add', 'HKCU\\Software\\RegisteredApplications', '/v', REG_NAME, '/d', `Software\\Clients\\StartMenuInternet\\${REG_NAME}\\Capabilities`, '/f'],
  ];
  for (const s of steps) if (!(await reg(s))) return false;
  return true;
}

async function setDefaultBrowser() {
  if (process.platform === 'win32') {
    // Windows 10 / 11 はアプリから勝手に既定を変えられないので、登録してから「既定のアプリ」の画面を開く
    if (!(await registerWindowsBrowser())) return { ok: false, error: 'レジストリに登録できませんでした' };
    await shell.openExternal(`ms-settings:defaultapps?registeredAppUser=${REG_NAME}`).catch(() => shell.openExternal('ms-settings:defaultapps'));
    return { ok: true, needsUser: true };
  }
  const a = app.setAsDefaultProtocolClient('http');
  const b = app.setAsDefaultProtocolClient('https');
  return { ok: a && b, needsUser: false };
}

// 起動時・2 回目の起動時の引数から、開くべき URL を取り出す
function urlsFromArgv(argv) {
  return (argv || []).slice(1).filter(a => /^https?:\/\//i.test(a));
}

// ---------- 初期化 ----------
function init() {
  ipcMain.handle('bookmark-sources', () => findBookmarkSources());
  ipcMain.handle('bookmark-read-source', (event, file) => {
    // 一覧で見つけたファイルだけを読む（任意のファイルは読まない）
    if (!findBookmarkSources().some(s => s.id === file)) return null;
    try { return flattenChromium(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return null; }
  });
  ipcMain.handle('bookmark-import-html', async (event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'ブックマークの HTML ファイルを選択', properties: ['openFile'], filters: [{ name: 'ブックマーク (HTML)', extensions: ['html', 'htm'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try { return parseBookmarkHtml(fs.readFileSync(r.filePaths[0], 'utf8')); } catch (e) { return null; }
  });
  ipcMain.handle('bookmark-export-html', async (event, folders) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'ブックマークを書き出す', defaultPath: path.join(app.getPath('documents'), 'archyndium-bookmarks.html'),
      filters: [{ name: 'ブックマーク (HTML)', extensions: ['html'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, toBookmarkHtml(folders || []), 'utf8');
    return r.filePath;
  });

  ipcMain.handle('set-default-browser', () => setDefaultBrowser());
  ipcMain.handle('is-default-browser', () => {
    try { return app.isDefaultProtocolClient('https'); } catch (e) { return false; }
  });

  ipcMain.handle('print-to-pdf', async (event, webContentsId, title) => {
    const wc = webContents.fromId(webContentsId);
    if (!wc || wc.getType() !== 'webview') return null;
    const safe = String(title || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'page';
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'PDF として保存', defaultPath: path.join(app.getPath('downloads'), `${safe}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(r.filePath, data);
    return r.filePath;
  });

  // castLabs 版 Electron（Widevine 入り）なら components が使える
  ipcMain.handle('drm-status', () => {
    let components = null;
    try { components = require('electron').components; } catch (e) {}
    return { widevine: !!(components && typeof components.whenReady === 'function') };
  });
}

module.exports = { init, urlsFromArgv };
