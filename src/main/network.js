// ==========================================
// ★ ネットワーク層：常時HTTPS（HTTPS Upgrade）+ アドブロック
// ==========================================
// Electron は 1 セッションにつき webRequest.onBeforeRequest を 1 つしか持てない。
// 以前は HTTPS Upgrade とアドブロッカーが別々に登録していたため、ブロッカー起動後
// （や Disabled 切替時の onBeforeRequest(null)）に HTTPS Upgrade が無効化されていた。
// ここで 1 つのハンドラにまとめ、HTTPS Upgrade → アドブロック の順に判定する。
const adblock = require('./adblock');

function isLocalHost(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch (e) {
    return false;
  }
}

function onBeforeRequest(details, callback) {
  // 開発用ローカル環境（localhost等）を除き、メインフレームの http:// を https:// に強制アップグレード
  if (details.resourceType === 'mainFrame' && details.url.startsWith('http://') && !isLocalHost(details.url)) {
    callback({ cancel: false, redirectURL: details.url.replace(/^http:/, 'https:') });
    return;
  }
  if (adblock.handleRequest(details, callback)) return;
  callback({ cancel: false });
}

function install(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, onBeforeRequest);
}

function init() {
  adblock.init({ onApplied: install });
}

// 通常セッション・シークレットセッションの両方をここに登録する
function addSession(ses) {
  install(ses);
  adblock.addSession(ses);
}

module.exports = { init, addSession };
