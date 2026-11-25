// ==========================================
// ★ アドレスバーの検索候補（各検索エンジンの候補 API）
// ==========================================
// renderer からは「エンジン名と入力中の文字」だけを受け取り、URL はここで組み立てる
// （任意の URL を取得させないため）。どれも OpenSearch 形式 ["入力", ["候補1", "候補2", ...]] を返す。
const { ipcMain, session } = require('electron');
// ▼ 修正：以前は Google などのログイン状態（Cookie）付きで問い合わせていたため、入力した文字が
//   検索エンジン側の「最近の検索」に記録されていた。Cookie を持たない専用のセッション（メモリ上だけ）から送る
const suggestSession = () => session.fromPartition('archyndium-suggest', { cache: false });

const SUGGEST_URLS = {
  google:     (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(q)}`,
  yahoo:      (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(q)}`, // Yahoo! JAPAN の検索結果は Google 由来
  bing:       (q) => `https://api.bing.com/osjson.aspx?market=ja-JP&query=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`,
  brave:      (q) => `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}`,
  ecosia:     (q) => `https://ac.ecosia.org/autocomplete?type=list&q=${encodeURIComponent(q)}`,
};

async function suggest(engine, query) {
  const build = SUGGEST_URLS[engine];
  if (!build || !query || query.length > 200) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await suggestSession().fetch(build(query), { signal: controller.signal, credentials: 'omit' });
    clearTimeout(timer);
    const data = JSON.parse(await res.text());
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter(s => typeof s === 'string').slice(0, 6) : [];
  } catch (e) {
    return [];
  }
}

function init() {
  ipcMain.handle('search-suggest', (event, engine, query) => suggest(engine, query));
}

module.exports = { init };
