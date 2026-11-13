// ==========================================
// ★ 歌詞検索用：タイトル解析 & 検索結果の照合（Electron 非依存の純粋関数）
// ==========================================
// 以前は「タイトルを最初の区切り文字で2つに割って 前=アーティスト / 後=曲名」と決め打ちし、
// LRCLIB の検索結果も 1 件目をそのまま採用していたため、
//   ・YOASOBI「アイドル」/ 夜に駆ける / YOASOBI のような日本式の表記
//   ・「曲名 / アーティスト」の順番
//   ・(Official Music Video)【MV】 などの装飾
// で外れたり、まったく別の曲の歌詞が表示されたりしていた。
// ここでは「候補（アーティスト × 曲名）を複数作る → 検索結果を類似度と再生時間で採点」する。

// タイトル中のどこにあっても取り除く装飾ワード
const NOISE_WORDS = [
  'official\\s*(music\\s*)?video', 'official\\s*(lyric\\s*)?video', 'official\\s*audio', 'official\\s*mv', 'official\\s*visualizer',
  'music\\s*video', 'lyric(s)?\\s*video', 'mv', 'pv', 'the\\s*first\\s*take', 'full\\s*ver(sion|\\.)?', 'tv\\s*size',
  '歌詞付き', '公式', 'ミュージックビデオ',
];
// 括弧の中身がこれだけなら括弧ごと消す語（"Live Forever" のような曲名を壊さないよう括弧内限定）
const BRACKET_ONLY_WORDS = NOISE_WORDS.concat([
  'audio', 'lyrics?', 'visualizer', 'hd', 'hq', '4k', 'live', 'remaster(ed)?', 'short\\s*ver(sion|\\.)?', 'topic', 'cover',
  'official', 'new', '歌詞', 'フル', '字幕', 'オリジナル', '歌ってみた', '\\d{4}',
]);
// \b は日本語に効かないので、英数字に挟まれていないことを境界とする
const NOISE_RE = new RegExp(`(?<![a-z0-9])(${NOISE_WORDS.join('|')})(?![a-z0-9])`, 'gi');
const NOISE_ONLY_RE = new RegExp(`^(\\s|[\\-_/・.,|]|${BRACKET_ONLY_WORDS.join('|')})+$`, 'i');

// アーティスト名（チャンネル名）から取り除く語
const ARTIST_NOISE_RE = /\s*(-\s*topic|vevo|official(\s*(youtube)?\s*channel)?|公式(チャンネル)?|オフィシャル(チャンネル)?|チャンネル|channel|ch\.?)\s*$/i;

const SEPARATORS = /\s+[-–—~〜|｜]\s+|\s*[／/]\s*|\s+[-–—]\s*|\s*[-–—]\s+/;

function cleanArtist(artist) {
  if (!artist) return '';
  let a = artist.normalize('NFKC').trim();
  for (let i = 0; i < 3; i++) a = a.replace(ARTIST_NOISE_RE, '').trim(); // "XXX Official Channel" 等を段階的に剥がす
  return a;
}

function stripFeat(s) {
  // "Daft Punk" の "ft" などを誤爆しないよう、英数字の直後は対象外
  return s.replace(/\s*[(\[]?\s*(?<![a-z0-9])(feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?\s*$/i, '').trim();
}

// 曲名側のノイズ除去。「」『』は曲名そのものなので消さない
function cleanSongTitle(title) {
  let t = title.normalize('NFKC');
  t = t.replace(/^\(\d+\)\s*/, '');             // "(3) " などの通知件数
  t = t.replace(/\s*-\s*YouTube( Music)?\s*$/i, '');
  t = t.replace(/\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i, ''); // ローカルファイル名
  t = t.replace(/[\(\[【〔［（](.*?)[\)\]】〕］）]/g, (m, inner) => (NOISE_ONLY_RE.test(inner) ? ' ' : ` ${m} `));
  t = t.replace(NOISE_RE, ' ');
  t = t.replace(/[\(\[【〔［（]\s*[\)\]】〕］）]/g, ' '); // 中身が空になった括弧
  t = stripFeat(t);
  return t.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—|/／:：]+|[\s\-–—|/／:：]+$/g, '').trim();
}

// 括弧ごと全部消した版（"Song (Remix)" の Remix 等も落とす）
function stripAllBrackets(s) {
  return s.replace(/[\(\[【〔［（].*?[\)\]】〕］）]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// 比較用の正規化：全角半角・大小文字・記号・空白の差を無視する
function normalize(s) {
  return (s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s　'"`’“”!！?？.,、。・:：;；~〜\-–—_/／|｜()\[\]{}「」『』【】<>《》]/g, '');
}

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

// 0〜1 の類似度（片方がもう片方を含めば高得点、それ以外はバイグラムの Dice 係数）
function similarity(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.75 + 0.2 * Math.min(x.length, y.length) / Math.max(x.length, y.length);
  if (x.length < 2 || y.length < 2) return 0;
  const bx = bigrams(x), by = bigrams(y);
  let overlap = 0;
  for (const [g, n] of bx) overlap += Math.min(n, by.get(g) || 0);
  return (2 * overlap) / (x.length - 1 + y.length - 1);
}

function removeArtistFrom(text, artist) {
  if (!artist) return text;
  const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'ig'), ' ').replace(/^[\s\-–—|/／:：]+|[\s\-–—|/／:：]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 検索候補を優先度順に作る
 * @param {{title: string, artist?: string, album?: string}} meta
 *   title  : ページ/動画のタイトル（mediaSession の title があればそれ）
 *   artist : mediaSession の artist や YouTube のチャンネル名
 * @returns {{artist: string, song: string}[]}
 */
function buildCandidates({ title, artist }) {
  const out = [];
  const add = (a, s) => {
    a = cleanArtist(stripFeat(a || ''));
    s = (s || '').trim();
    if (!s || normalize(s).length === 0) return;
    if (normalize(a) === normalize(s)) a = '';
    if (!out.some(c => normalize(c.artist) === normalize(a) && normalize(c.song) === normalize(s))) out.push({ artist: a, song: s });
  };

  const metaArtist = cleanArtist(artist);
  const raw = (title || '').normalize('NFKC');
  const cleaned = cleanSongTitle(raw);

  // 1) 「曲名」『曲名』表記（日本の公式MVで最も多い）
  const quoted = raw.match(/[「『]([^」』]+)[」』]/);
  if (quoted) {
    const before = cleanSongTitle(raw.slice(0, quoted.index));
    const song = cleanSongTitle(quoted[1]);
    if (before) add(before, song);
    add(metaArtist, song);
  }

  // 2) 区切り文字で 2 つに分かれる場合は、両方の並び順を候補にする
  const parts = cleaned.split(SEPARATORS).map(p => cleanSongTitle(p)).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = parts;
    // チャンネル名と一致する側をアーティストとして優先
    const bIsArtist = metaArtist && similarity(b, metaArtist) > similarity(a, metaArtist);
    if (bIsArtist) { add(b, a); add(a, b); } else { add(a, b); add(b, a); }
    // 「曲名 / P名 feat. 初音ミク」のような 3 分割にも対応
    if (parts.length >= 3) add(parts[parts.length - 1], parts[0]);
  }

  // 3) メタデータのアーティスト + タイトルからアーティスト名を除いたもの
  if (metaArtist) {
    const song = removeArtistFrom(quoted ? cleanSongTitle(quoted[1]) : cleaned, metaArtist);
    add(metaArtist, song || cleaned);
    add(metaArtist, stripAllBrackets(song || cleaned));
  }

  // 4) 最後の手段：整形済みタイトル全体で検索
  add('', stripAllBrackets(cleaned) || cleaned);
  return out.slice(0, 6);
}

// ---------- カタカナ → ローマ字（「アイドル」と「Idol」のような外来語表記の照合用） ----------
const KANA_ROMAJI = {
  ア:'a',イ:'i',ウ:'u',エ:'e',オ:'o',カ:'ka',キ:'ki',ク:'ku',ケ:'ke',コ:'ko',サ:'sa',シ:'shi',ス:'su',セ:'se',ソ:'so',
  タ:'ta',チ:'chi',ツ:'tsu',テ:'te',ト:'to',ナ:'na',ニ:'ni',ヌ:'nu',ネ:'ne',ノ:'no',ハ:'ha',ヒ:'hi',フ:'fu',ヘ:'he',ホ:'ho',
  マ:'ma',ミ:'mi',ム:'mu',メ:'me',モ:'mo',ヤ:'ya',ユ:'yu',ヨ:'yo',ラ:'ra',リ:'ri',ル:'ru',レ:'re',ロ:'ro',ワ:'wa',ヲ:'o',ン:'n',
  ガ:'ga',ギ:'gi',グ:'gu',ゲ:'ge',ゴ:'go',ザ:'za',ジ:'ji',ズ:'zu',ゼ:'ze',ゾ:'zo',ダ:'da',ヂ:'ji',ヅ:'zu',デ:'de',ド:'do',
  バ:'ba',ビ:'bi',ブ:'bu',ベ:'be',ボ:'bo',パ:'pa',ピ:'pi',プ:'pu',ペ:'pe',ポ:'po',ヴ:'vu',
  ァ:'a',ィ:'i',ゥ:'u',ェ:'e',ォ:'o',ャ:'ya',ュ:'yu',ョ:'yo',ー:'',
};

function kanaToRomaji(s) {
  // ひらがなはカタカナに寄せてから変換。漢字が混ざっていたら照合しない
  const kata = (s || '').normalize('NFKC').replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  if (/[一-鿿]/.test(kata)) return '';
  let out = '';
  for (let i = 0; i < kata.length; i++) {
    const ch = kata[i];
    if (ch === 'ッ') { const next = KANA_ROMAJI[kata[i + 1]]; if (next) out += next[0]; continue; }
    out += KANA_ROMAJI[ch] !== undefined ? KANA_ROMAJI[ch] : ch;
  }
  return out.toLowerCase();
}

// 子音の骨格（母音を除き r/l・v/b を同一視）。"aidoru" と "idol" はどちらも "dl" になる
// english = true の時は、日本語で発音しない語末・子音前の r を落とす（Flower → フラワー）
function consonantSkeleton(s, english = false) {
  let t = (s || '').toLowerCase().replace(/[^a-z]/g, '');
  if (english) t = t.replace(/r(?=[^aeiouy]|$)/g, '');
  return t.replace(/[aeiouy]/g, '').replace(/r/g, 'l').replace(/v/g, 'b').replace(/(.)\1+/g, '$1');
}

// カタカナ表記と英語表記の曲名が同じ単語かどうか（例：アイドル / Idol、ドライフラワー / Dry Flower）
function loanwordMatch(a, b) {
  const ra = kanaToRomaji(a), rb = kanaToRomaji(b);
  const latin = (s) => /[a-z]/i.test(s) && !/[぀-ヿ一-鿿]/.test(s);
  let kana, eng;
  if (ra && /[゠-ヿ぀-ゟ]/.test(a) && latin(b)) { kana = ra; eng = b; }
  else if (rb && /[゠-ヿ぀-ゟ]/.test(b) && latin(a)) { kana = rb; eng = a; }
  else return false;
  const sk = consonantSkeleton(kana), se = consonantSkeleton(eng, true);
  return sk.length >= 2 && sk === se;
}

function titleSimilarity(trackName, song) {
  const direct = Math.max(similarity(trackName, song), similarity(stripAllBrackets(trackName || ''), song));
  if (direct >= 0.8) return direct;
  return loanwordMatch(stripAllBrackets(trackName || ''), song) ? Math.max(direct, 0.8) : direct;
}

/**
 * LRCLIB の検索結果 1 件を採点する（0〜1）
 * 曲名 55% / アーティスト 30% / 再生時間 15%
 * ▼ 修正：アーティストが分かっているのに結果のアーティストが全く違う場合は不合格にする。
 *   以前は曲名さえ同じなら別アーティストでも合格ラインを超えてしまい、
 *   YOASOBI「アイドル」に BiS の「アイドル」の歌詞が出ていた。
 */
// knownArtists：メタデータ等から分かっているアーティスト名。候補自体にアーティストが無い時（タイトル全体で
// 検索した時）も、これと照合して別アーティストの同名曲を弾く
function scoreResult(result, candidate, duration, knownArtists = []) {
  const titleSim = titleSimilarity(result.trackName, candidate.song);
  const artists = candidate.artist ? [candidate.artist] : knownArtists.filter(Boolean);
  const artistSim = artists.length ? Math.max(...artists.map(a => artistSimilarity(result.artistName, a))) : 0.5;
  let durScore = 0.5;
  let diff = Infinity;
  if (duration > 0 && result.duration > 0) {
    diff = Math.abs(result.duration - duration);
    // MV はイントロ・アウトロで音源より長いことが多いので緩めに見る
    durScore = diff <= 3 ? 1 : diff <= 15 ? 0.7 : diff <= 45 ? 0.4 : 0;
  }
  let score = 0.55 * titleSim + 0.3 * artistSim + 0.15 * durScore;
  if (artists.length && artistSim < 0.5) score = Math.min(score, 0.4); // 別アーティストの同名曲
  // 曲名の表記が全く違っても（夜に駆ける / Yoru ni Kakeru など）、同じアーティストで長さがほぼ一致すれば同じ曲とみなす
  if (titleSim < 0.5 && artistSim >= 0.85 && diff <= 2) score = Math.max(score, 0.66);
  return score;
}

// "Ayase / YOASOBI" のような連名や "YOASOBI (ヨアソビ)" は、どれか 1 人と一致すれば良い
function artistSimilarity(resultArtist, candidateArtist) {
  const split = (s) => (s || '').split(/\s*(?:[\/／,、&＆×x]|feat\.?|ft\.|with)\s*/i).map(t => t.trim()).filter(Boolean);
  let best = similarity(resultArtist, candidateArtist);
  for (const a of split(resultArtist).concat(stripAllBrackets(resultArtist || ''))) {
    for (const b of split(candidateArtist)) best = Math.max(best, similarity(a, b));
  }
  return best;
}

// [00:12.34] のようなタイムタグを消して通常の歌詞にする
function stripTimestamps(synced) {
  return synced.split('\n').map(l => l.replace(/^\s*(\[\d+:\d+(?:[.:]\d+)?\])+\s*/, '')).join('\n').trim();
}

// LRC 形式（[01:23.45]歌詞）を [{ t: 秒, text }] にする。1 行に複数のタイムタグがあっても対応
function parseSynced(synced) {
  if (!synced) return null;
  const lines = [];
  for (const raw of synced.split('\n')) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines.length ? lines : null;
}

module.exports = { buildCandidates, scoreResult, similarity, artistSimilarity, normalize, cleanArtist, cleanSongTitle, stripTimestamps, parseSynced, kanaToRomaji, loanwordMatch };
