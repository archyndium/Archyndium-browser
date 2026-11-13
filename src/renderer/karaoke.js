// ==========================================
// ★ 歌詞のカラオケ表示（同期歌詞の現在行ハイライト）
// ==========================================
// LRCLIB の同期歌詞（タイムスタンプ付き）が見つかった曲だけ、再生位置に合わせて今の行を光らせ、
// 自動で中央にスクロールする。歌詞パネルの「KARAOKE」ボタンか設定画面で ON/OFF（保存される）。
// MV はイントロの長さが音源と違うことがあるので、±0.5 秒ずつタイミングを調整できる。

const KARAOKE_KEY = 'archyndium_karaoke';
let karaokeEnabled = (() => { try { return localStorage.getItem(KARAOKE_KEY) !== 'off'; } catch(e) { return true; } })();
let karaokeLines = null;      // [{ t: 秒, text }]
let karaokeIndex = -1;
let karaokeOffset = 0;        // 秒（+ で歌詞を早める）
let karaokeVersion = 0;       // 行データが変わるたびに増やす（ミニプレイヤーへの送信判定用）
let karaokeSentVersion = -1;
let lyricsSourceHtml = '';    // 「Source: LRCLIB · 一致度 …」の行
let currentMediaTimeAt = 0;   // currentMediaTime を受け取った時刻（timeupdate の間を補間する）

const lyricsContentEl = document.getElementById('lyrics-content');

function karaokeActive() {
    return karaokeEnabled && !!karaokeLines;
}

function setKaraokeEnabled(on) {
    karaokeEnabled = on;
    try { localStorage.setItem(KARAOKE_KEY, on ? 'on' : 'off'); } catch(e) {}
    karaokeVersion++;
    renderLyricsBody();
    if (typeof renderLyricsSettings === 'function') renderLyricsSettings();
}

// ▼ 追加：タイミング調整は曲ごとに記憶する（パネルを閉じても、同じ曲をまた再生しても元に戻らない）
const KARAOKE_OFFSET_KEY = 'archyndium_karaoke_offsets';
function loadKaraokeOffsets() {
    try { return JSON.parse(localStorage.getItem(KARAOKE_OFFSET_KEY)) || {}; } catch(e) { return {}; }
}
function saveKaraokeOffset(trackKey, offset) {
    if (!trackKey) return;
    const all = loadKaraokeOffsets();
    if (offset) all[trackKey] = offset; else delete all[trackKey];
    const keys = Object.keys(all);
    if (keys.length > 500) delete all[keys[0]];
    localStorage.setItem(KARAOKE_OFFSET_KEY, JSON.stringify(all));
}

function setKaraokeLines(lines) {
    karaokeLines = lines && lines.length ? lines : null;
    karaokeIndex = -1;
    karaokeOffset = karaokeLines ? (loadKaraokeOffsets()[lastLyricsTrackKey] || 0) : 0;
    karaokeVersion++;
}

function clearLyrics() {
    lyricsRequestSeq++; // 取得中の検索結果は捨てる
    currentLyricsText = '';
    lyricsSourceHtml = '';
    setKaraokeLines(null);
    lyricsContentEl.innerHTML = '';
    lastLyricsAlternatives = [];
    updateAlternativesButton();
    closeLyricsAlternatives();
}

// 歌詞本文を描画する（カラオケ ON なら 1 行ずつの要素、OFF なら従来のテキスト）
function renderLyricsBody() {
    const ctl = document.getElementById('karaoke-controls');
    document.getElementById('btn-karaoke').classList.toggle('active', karaokeEnabled);
    document.getElementById('btn-karaoke').classList.toggle('unavailable', !karaokeLines);
    ctl.classList.toggle('show', karaokeActive());
    document.getElementById('karaoke-offset-value').textContent = `${karaokeOffset > 0 ? '+' : karaokeOffset < 0 ? '−' : '±'}${Math.abs(karaokeOffset).toFixed(1)}s`;

    if (karaokeActive()) {
        lyricsContentEl.classList.add('karaoke');
        lyricsContentEl.innerHTML = lyricsSourceHtml + karaokeLines.map((l, i) =>
            `<div class="k-line" data-i="${i}">${l.text ? escapeHtml(l.text) : '♪'}</div>`).join('');
        karaokeIndex = -1;
        karaokeTick(true);
    } else {
        lyricsContentEl.classList.remove('karaoke');
        lyricsContentEl.innerHTML = lyricsSourceHtml + currentLyricsText;
    }
}

function currentPlaybackTime() {
    if (audioPlaylist.length > 0) return audioEl.currentTime || 0;
    // timeupdate は 1 秒に 4 回程度しか来ないので、再生中は経過時間で補間する
    const elapsed = isPlaying && currentMediaTimeAt ? Math.min(1, (performance.now() - currentMediaTimeAt) / 1000) : 0;
    return currentMediaTime + elapsed;
}

// sendWaveformLoop から毎フレーム呼ばれる
function karaokeTick(force = false) {
    if (!karaokeActive()) return;
    const t = currentPlaybackTime() + karaokeOffset;
    let idx = -1;
    for (let i = 0; i < karaokeLines.length && karaokeLines[i].t <= t; i++) idx = i;
    if (idx === karaokeIndex && !force) return;
    karaokeIndex = idx;
    lyricsContentEl.querySelectorAll('.k-line').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
        el.classList.toggle('past', i < idx);
    });
    const active = lyricsContentEl.querySelector('.k-line.active');
    if (active && document.getElementById('lyrics-panel').classList.contains('show')) {
        // パネルの中だけをスクロールする（scrollIntoView だとページ全体が動くことがあるため）
        const top = active.offsetTop - lyricsContentEl.clientHeight / 2 + active.clientHeight / 2;
        lyricsContentEl.scrollTo({ top, behavior: force ? 'auto' : 'smooth' });
    }
}

// ミニプレイヤーへ送る分。行データは変わった時（とミニプレイヤーを開いた時）だけ送る
function karaokeSyncPayload() {
    const payload = { enabled: karaokeActive(), index: karaokeIndex, offset: karaokeOffset };
    if (karaokeSentVersion !== karaokeVersion) {
        payload.lines = karaokeActive() ? karaokeLines.map(l => l.text) : null;
        payload.version = karaokeVersion;
        karaokeSentVersion = karaokeVersion;
    }
    return payload;
}

function resendKaraokeLines() {
    karaokeSentVersion = -1;
}

function nudgeKaraokeOffset(delta) {
    karaokeOffset = Math.round((karaokeOffset + delta) * 10) / 10;
    saveKaraokeOffset(lastLyricsTrackKey, karaokeOffset);
    renderLyricsBody();
}

document.getElementById('btn-karaoke').addEventListener('click', (e) => { e.stopPropagation(); setKaraokeEnabled(!karaokeEnabled); });
document.getElementById('karaoke-earlier').addEventListener('click', () => nudgeKaraokeOffset(0.5));
document.getElementById('karaoke-later').addEventListener('click', () => nudgeKaraokeOffset(-0.5));
document.getElementById('karaoke-offset-value').addEventListener('click', () => { karaokeOffset = 0; saveKaraokeOffset(lastLyricsTrackKey, 0); renderLyricsBody(); });
