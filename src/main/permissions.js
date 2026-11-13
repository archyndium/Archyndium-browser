// ==========================================
// ★ サイトの権限（カメラ・マイク・位置情報・通知など）
// ==========================================
// Electron の初期設定では、サイトが求めた権限はほぼ確認なしで許可されてしまう。
// ここで全リクエストを受け取り、
//   ・記憶済みの判断があればそれを使う
//   ・無ければ画面（renderer/permissions.js）に確認プロンプトを出して、ユーザーの答えを待つ
// 通常セッションの判断は userData/site-permissions.json に保存。シークレットはメモリだけ。
const { ipcMain } = require('electron');
const { createStore } = require('./store');
const windows = require('./windows');

// 確認なしで許可するもの（全画面・ポインタロック・クリップボードへの書き込み・DRM再生など）
const AUTO_ALLOW = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write', 'mediaKeySystem', 'speaker-selection', 'fileSystem']);
// ユーザーに確認するもの（media は camera / microphone に分けて扱う）
const PROMPTABLE = new Set(['camera', 'microphone', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'idle-detection', 'window-management', 'openExternal']);

const store = createStore('site-permissions', { decisions: {} }); // { origin: { permission: 'allow' | 'block' } }
const privateDecisions = {};
const pending = new Map(); // id -> { callback, contentsId }
let nextId = 1;
let isPrivateSession = () => false;

function originOf(url) {
  try { const u = new URL(url); return u.origin === 'null' ? '' : u.origin; } catch (e) { return ''; }
}

function decisionsFor(ses) {
  return isPrivateSession(ses) ? privateDecisions : store.get('decisions');
}

function getDecision(ses, origin, permission) {
  return decisionsFor(ses)[origin]?.[permission];
}

function setDecision(ses, origin, permissions, decision) {
  const all = decisionsFor(ses);
  all[origin] = all[origin] || {};
  permissions.forEach(p => { all[origin][p] = decision; });
  if (!isPrivateSession(ses)) store.set('decisions', all);
}

// Electron の permission 名 → 画面に出す権限名の配列
function expand(permission, details) {
  if (permission === 'media') {
    const types = details.mediaTypes && details.mediaTypes.length ? details.mediaTypes : ['video', 'audio'];
    return types.map(t => (t === 'video' ? 'camera' : 'microphone'));
  }
  return [permission];
}


function onRequest(ses) {
  return (contents, permission, callback, details) => {
    if (AUTO_ALLOW.has(permission)) return callback(true);
    const perms = expand(permission, details || {});
    if (!perms.every(p => PROMPTABLE.has(p))) return callback(false);

    const origin = originOf(details.requestingUrl || contents.getURL());
    if (!origin) return callback(false);
    const known = perms.map(p => getDecision(ses, origin, p));
    if (known.includes('block')) return callback(false);
    if (known.every(d => d === 'allow')) return callback(true);

    const id = nextId++;
    // タブが閉じられたり別ページへ移動したら、答えを待たずにブロック扱いにする
    const cancel = () => respond(id, false, false, true);
    const onNavigate = (e, url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) cancel(); };
    contents.once('destroyed', cancel);
    contents.on('did-start-navigation', onNavigate);
    const cleanup = () => {
      if (contents.isDestroyed()) return;
      contents.removeListener('destroyed', cancel);
      contents.removeListener('did-start-navigation', onNavigate);
    };
    pending.set(id, { callback, cleanup, ses, origin, perms });

    windows.sendToHost(contents, 'permission-request', {
      id, origin, host: new URL(origin).host, permissions: perms,
      webContentsId: contents.id, isPrivate: isPrivateSession(ses),
      externalURL: details.externalURL || '',
    });
  };
}

function respond(id, allow, remember, cancelled = false) {
  const req = pending.get(id);
  if (!req) return;
  pending.delete(id);
  req.cleanup();
  if (remember && !cancelled) setDecision(req.ses, req.origin, req.perms, allow ? 'allow' : 'block');
  try { req.callback(!!allow); } catch (e) {}
  if (cancelled) windows.sendToAll('permission-cancel', { id });
}

function onCheck(ses) {
  return (contents, permission, requestingOrigin, details) => {
    if (AUTO_ALLOW.has(permission)) return true;
    const perms = expand(permission, details || {});
    const origin = originOf(requestingOrigin) || requestingOrigin;
    return perms.every(p => getDecision(ses, origin, p) === 'allow');
  };
}

function addSession(ses) {
  ses.setPermissionRequestHandler(onRequest(ses));
  ses.setPermissionCheckHandler(onCheck(ses));
}

function init({ isPrivate } = {}) {
  if (isPrivate) isPrivateSession = isPrivate;

  ipcMain.on('permission-respond', (event, { id, allow, remember }) => respond(id, allow, remember));
  // 設定画面用：保存済みの判断の一覧と取り消し
  ipcMain.handle('permissions-list', () => {
    const out = [];
    for (const [origin, perms] of Object.entries(store.get('decisions'))) {
      for (const [permission, decision] of Object.entries(perms)) out.push({ origin, permission, decision });
    }
    return out;
  });
  ipcMain.handle('permissions-reset', (event, origin, permission) => {
    const all = store.get('decisions');
    if (all[origin]) {
      if (permission) delete all[origin][permission]; else delete all[origin];
      if (all[origin] && Object.keys(all[origin]).length === 0) delete all[origin];
      store.set('decisions', all);
    }
    return true;
  });
}

module.exports = { init, addSession };
