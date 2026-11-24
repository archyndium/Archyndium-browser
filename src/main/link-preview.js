// ==========================================
// ★ リンクのプレビュー（リンクにマウスを乗せた時に、行き先のタイトル・説明・画像を表示）
// ==========================================
// 行き先のページの HTML の先頭（最大 512KB）だけを読み、Open Graph（og:image など）と <title> を取り出す。
// ・Cookie を送らない専用のセッション（メモリ上だけ）で読む。ログイン状態は使わない・残さない
// ・自分の PC・社内ネットワークなど（localhost・プライベート IP）は読まない
// ・結果は 10 分だけ覚えておき、同じリンクで何度も通信しない
// ・シークレットタブ、設定でオフの時は、画面側（renderer/link-preview.js）がそもそも頼まない
const { ipcMain, session } = require('electron');

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();   // url -> { at, data }

const ses = () => session.fromPartition('archyndium-preview', { cache: false });

function isPublicHttpUrl(raw) {
  let u; try { u = new URL(raw); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === '::1' || /^f[cd]/.test(h) || /^fe80/.test(h)) return false;
  return true;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  }).replace(/\s+/g, ' ').trim();
}

function parse(html, base) {
  const head = html.slice(0, 300000);
  const metas = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = val;
  }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  let image = metas['og:image'] || metas['og:image:url'] || metas['twitter:image'] || metas['twitter:image:src'] || '';
  try { if (image) image = new URL(decode(image), base).href; } catch (e) { image = ''; }
  if (image && !/^https?:/i.test(image)) image = '';
  return {
    kind: 'page',
    title: decode(metas['og:title'] || metas['twitter:title'] || titleTag).slice(0, 200),
    description: decode(metas['og:description'] || metas['twitter:description'] || metas['description']).slice(0, 300),
    site: decode(metas['og:site_name']).slice(0, 80),
    image,
  };
}

async function readLimited(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const chunks = []; let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
  }
  try { reader.cancel(); } catch (e) {}
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}

async function preview(url) {
  if (typeof url !== 'string' || url.length > 2048 || !isPublicHttpUrl(url)) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  let data = null;
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(new URL(url).pathname)) {
    data = { kind: 'image', image: url, title: '', description: '' };
  } else {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await ses().fetch(url, { signal: ctrl.signal, redirect: 'follow', credentials: 'omit', headers: { Accept: 'text/html,application/xhtml+xml' } });
      const type = res.headers.get('content-type') || '';
      if (res.ok && /text\/html|application\/xhtml/i.test(type)) data = parse(await readLimited(res), res.url || url);
      else if (res.ok && /^image\//i.test(type)) data = { kind: 'image', image: url, title: '', description: '' };
    } catch (e) {
      data = null;
    } finally { clearTimeout(timer); }
  }
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return data;
}

function init() {
  ipcMain.handle('link-preview', (event, url) => preview(url));
}

module.exports = { init };
