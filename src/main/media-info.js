// ==========================================
// ★ 再生中の曲の情報（YouTube の公式 oEmbed）
// ==========================================
// YouTube は表示されていないタブのページ表示を後回しにするので、裏のタブで次の曲に変わっても
// ページから読む曲名がしばらく古いままになる。動画 ID から公式の情報を取れば、表示に関係なく最新の曲名が分かる。
const { ipcMain, net } = require('electron');

const cache = new Map();

async function youtubeOembed(videoId) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId || '')) return null;
  if (cache.has(videoId)) return cache.get(videoId);
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`;
    const res = await net.fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const info = { title: data.title || '', author: (data.author_name || '').replace(/\s*-\s*Topic$/i, '') };
    cache.set(videoId, info);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return info;
  } catch (e) {
    return null;
  }
}

function init() {
  ipcMain.handle('youtube-oembed', (event, videoId) => youtubeOembed(videoId));
}

module.exports = { init };
