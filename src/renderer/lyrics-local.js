// ==========================================
// ★ マイ歌詞（自分の .lrc ファイル・歌詞エディタ）
// ==========================================
// LRCLIB で見つからない曲や、タイミングを自分好みにしたい曲のために、利用者が自分で歌詞を用意できる。
//   ・.lrc / .txt ファイルを読み込む（UTF-8 / Shift_JIS のどちらでも）
//   ・歌詞エディタ：歌詞を貼り付け → 曲を再生しながら、各行の歌い出しで Space を押してタイミングを記録
//   ・曲ごとに保存され、次にその曲を再生すると LRCLIB より優先して表示される
//   ・.lrc ファイルとして書き出し
// 保存先はこの PC の中だけ（localStorage）。どこにも送信しない。

const MY_LYRICS_KEY = 'archyndium_my_lyrics';

function loadMyLyricsAll() {
    try { return JSON.parse(localStorage.getItem(MY_LYRICS_KEY)) || {}; } catch (e) { return {}; }
}
function getMyLyrics(trackKey) {
    return trackKey ? loadMyLyricsAll()[trackKey] || null : null;
}
function saveMyLyrics(trackKey, entry) {
    const all = loadMyLyricsAll();
    all[trackKey] = { ...entry, updated: Date.now() };
    localStorage.setItem(MY_LYRICS_KEY, JSON.stringify(all));
}
function deleteMyLyrics(trackKey) {
    const all = loadMyLyricsAll();
    delete all[trackKey];
    localStorage.setItem(MY_LYRICS_KEY, JSON.stringify(all));
}

// ---------- LRC の読み書き ----------
// [mm:ss.xx] 歌詞 の形式。1 行に複数のタイムタグがあっても対応。[ti:] [ar:] などの情報行も読む
function parseLrc(text) {
    const lines = [], plain = [], tags = {};
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
        const info = raw.match(/^\s*\[(ti|ar|al|by|offset):(.*)\]\s*$/i);
        if (info) { tags[info[1].toLowerCase()] = info[2].trim(); continue; }
        const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
        const body = raw.replace(/\[[^\]]*\]/g, '').trim();
        if (stamps.length) stamps.forEach(m => lines.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')), text: body }));
        plain.push(body);
    }
    // [offset:+500] はミリ秒（+ で歌詞を早める）
    const offset = (parseFloat(tags.offset) || 0) / 1000;
    if (offset) lines.forEach(l => { l.t = Math.max(0, l.t - offset); });
    lines.sort((a, b) => a.t - b.t);
    return { synced: lines.length ? lines : null, plain: plain.join('\n').replace(/^\n+|\n+$/g, ''), tags };
}

function formatLrcTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function buildLrc({ title, artist, lines }) {
    const head = [];
    if (title) head.push(`[ti:${title}]`);
    if (artist) head.push(`[ar:${artist}]`);
    head.push('[by:ARCHYNDIUM Browser]');
    const body = lines.map(l => (l.t !== null && l.t !== undefined ? `[${formatLrcTime(l.t)}]` : '') + l.text);
    return head.concat(body).join('\n') + '\n';
}

// ファイルの文字コードを判定して読む（UTF-8 で読めなければ Shift_JIS）
async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('shift_jis').decode(buf); }
}

// ---------- 表示 ----------
function currentTrackKeyForMine() {
    return trackKeyOf(currentTrackQuery(nowPlayingTitle.textContent));
}

// マイ歌詞があれば表示して true を返す（lyrics.js の autoFetchLyrics から最初に呼ばれる）
function showMyLyricsIfAny(trackKey) {
    const entry = getMyLyrics(trackKey);
    if (!entry) return false;
    lyricsRequestSeq++; // 検索中の結果で上書きされないように
    lastLyricsTrackKey = trackKey;
    const { synced, plain } = parseLrc(entry.lrc);
    showLyricsResult({ song: entry.title, artist: entry.artist, lyrics: plain, synced, source: 'マイ歌詞', mine: true });
    lastLyricsAlternatives = [];
    updateAlternativesButton();
    return true;
}

// ---------- マイ歌詞のメニュー ----------
const lrcFileInput = document.createElement('input');
lrcFileInput.type = 'file';
lrcFileInput.accept = '.lrc,.txt,text/plain';
lrcFileInput.style.display = 'none';
document.body.appendChild(lrcFileInput);

lrcFileInput.addEventListener('change', async () => {
    const file = lrcFileInput.files[0];
    lrcFileInput.value = '';
    if (!file) return;
    const text = await readTextFile(file);
    const parsed = parseLrc(text);
    if (!parsed.plain.trim()) { showToast('歌詞が入っていないファイルです'); return; }
    // 歌詞エディタを開いている時は、エディタに読み込む（保存はエディタから）
    if (lyEditor.classList.contains('show')) {
        document.getElementById('lye-textarea').value = text.replace(/\r/g, '').replace(/^\s*\[(ti|ar|al|by|offset):.*\]\s*$\n?/gim, '').trim();
        if (parsed.tags.ti) document.getElementById('lye-title').value = parsed.tags.ti;
        if (parsed.tags.ar) document.getElementById('lye-artist').value = parsed.tags.ar;
        lyeSetStep('text');
        return;
    }
    const key = currentTrackKeyForMine();
    const q = currentTrackQuery(nowPlayingTitle.textContent);
    saveMyLyrics(key, { title: parsed.tags.ti || q.title, artist: parsed.tags.ar || q.artist, lrc: text });
    showMyLyricsIfAny(key);
    showToast(parsed.synced ? 'タイミング付きの歌詞を読み込みました（この曲用に保存）' : '歌詞を読み込みました。タイミングは歌詞エディタで付けられます');
});

async function openMyLyricsMenu() {
    const key = currentTrackKeyForMine();
    const has = !!getMyLyrics(key);
    const playing = nowPlayingTitle.textContent && nowPlayingTitle.textContent !== '再生していません';
    const choice = await window.electronAPI.popupMenu([
        { id: 'editor', label: has ? 'この曲のマイ歌詞を編集…' : '歌詞を作る（歌詞エディタ）…', enabled: !!playing },
        { id: 'file', label: '.lrc / .txt ファイルを読み込む…', enabled: !!playing },
        { type: 'separator' },
        { id: 'export', label: '.lrc ファイルとして書き出す…', enabled: has || !!karaokeLines || !!currentLyricsText },
        { id: 'delete', label: 'この曲のマイ歌詞を削除（LRCLIB の歌詞に戻す）', enabled: has },
    ]);
    if (choice === 'editor') openLyricsEditor();
    else if (choice === 'file') lrcFileInput.click();
    else if (choice === 'export') exportCurrentLyrics();
    else if (choice === 'delete') {
        deleteMyLyrics(key);
        currentLyricsSyncManual = false;
        showToast('マイ歌詞を削除しました');
        autoFetchLyrics(nowPlayingTitle.textContent);
    }
}

async function exportCurrentLyrics() {
    const key = currentTrackKeyForMine();
    const entry = getMyLyrics(key);
    const q = currentTrackQuery(nowPlayingTitle.textContent);
    let lrc;
    if (entry) lrc = entry.lrc;
    else {
        const title = document.getElementById('lyrics-title').textContent, artist = document.getElementById('lyrics-artist').textContent;
        const lines = karaokeLines ? karaokeLines.map(l => ({ t: l.t, text: l.text }))
            : lyricsContentEl.innerText.split('\n').filter(l => !/^Source:/.test(l)).map(text => ({ t: null, text }));
        lrc = buildLrc({ title, artist, lines });
    }
    const name = [q.artist, q.title].filter(Boolean).join(' - ') || 'lyrics';
    const file = await window.electronAPI.exportLrc(lrc, name);
    if (file) showToast('歌詞を書き出しました', { actionLabel: 'フォルダを開く', action: () => window.electronAPI.showFile(file) });
}

// ---------- 歌詞エディタ ----------
// 1. 歌詞を貼り付ける（.lrc のタイムタグ付きでも OK）
// 2. 「タイミングを付ける」で、曲を再生しながら各行の歌い出しで Space（または「記録」ボタン）
// 3. 保存すると、この曲のマイ歌詞になり、カラオケ表示に使われる
const lyEditor = document.createElement('div');
lyEditor.className = 'ly-editor-overlay';
lyEditor.innerHTML = `
  <div class="ly-editor" role="dialog" aria-label="歌詞エディタ">
    <div class="lye-head">
      <b>歌詞エディタ</b>
      <span class="lye-steps"><span data-step="text">1. 歌詞</span><span data-step="timing">2. タイミング</span></span>
      <span class="lye-x" data-lye="close" title="閉じる">×</span>
    </div>
    <div class="lye-meta">
      <input type="text" id="lye-title" placeholder="曲名">
      <input type="text" id="lye-artist" placeholder="アーティスト">
    </div>
    <div class="lye-step lye-text">
      <div class="lye-hint">歌詞を 1 行ずつ入力・貼り付けしてください。.lrc 形式（[00:12.34]歌詞）のままでも使えます。</div>
      <textarea id="lye-textarea" spellcheck="false" placeholder="ここに歌詞を貼り付け"></textarea>
      <div class="lye-actions">
        <button class="lye-btn" data-lye="file">ファイルを読み込む</button>
        <span class="lye-grow"></span>
        <button class="lye-btn" data-lye="save-text" title="タイミングなし（普通の歌詞表示）で保存">このまま保存</button>
        <button class="lye-btn primary" data-lye="to-timing">タイミングを付ける →</button>
      </div>
    </div>
    <div class="lye-step lye-timing">
      <div class="lye-hint">曲を再生して、<b>各行の歌い出しで Space</b>（または「記録」）を押してください。Backspace で 1 行戻ります。行をクリックするとそこから記録し直せます。</div>
      <div class="lye-player">
        <button class="lye-btn icon" data-lye="back5" title="5 秒戻る">−5s</button>
        <button class="lye-btn icon" data-lye="play" title="再生 / 一時停止">▶ / ❚❚</button>
        <button class="lye-btn icon" data-lye="fwd5" title="5 秒進む">+5s</button>
        <span class="lye-now" id="lye-now">0:00.00</span>
        <span class="lye-grow"></span>
        <button class="lye-btn record" data-lye="stamp" title="今の行の歌い出しを記録 (Space)">● 記録 <kbd>Space</kbd></button>
      </div>
      <div class="lye-lines" id="lye-lines"></div>
      <div class="lye-actions">
        <button class="lye-btn" data-lye="to-text">← 歌詞を直す</button>
        <button class="lye-btn" data-lye="clear-times">タイミングを全部消す</button>
        <span class="lye-grow"></span>
        <button class="lye-btn" data-lye="export">.lrc を書き出す</button>
        <button class="lye-btn primary" data-lye="save">保存して表示</button>
      </div>
    </div>
  </div>`;
document.body.appendChild(lyEditor);

const lye = { lines: [], cursor: 0, timer: null, key: '' };
const $lye = (id) => document.getElementById(id);

function lyeSetStep(step) {
    lyEditor.dataset.step = step;
    lyEditor.querySelectorAll('[data-step]').forEach(s => s.classList.toggle('on', s.dataset.step === step));
    clearInterval(lye.timer);
    if (step === 'timing') {
        lye.timer = setInterval(() => { $lye('lye-now').textContent = formatLrcTime(currentPlaybackTime()).replace(/^0/, ''); lyeHighlightPlaying(); }, 100);
        renderLyeLines();
    }
}

function openLyricsEditor() {
    const key = currentTrackKeyForMine();
    const q = currentTrackQuery(nowPlayingTitle.textContent);
    const entry = getMyLyrics(key);
    lye.key = key;
    $lye('lye-title').value = entry?.title || document.getElementById('lyrics-title').textContent.replace(/^—$/, '') || q.title || '';
    $lye('lye-artist').value = entry?.artist || q.artist || '';
    // 今表示している歌詞（マイ歌詞 or LRCLIB）を最初の下書きにする
    let text = entry?.lrc || '';
    if (!text && karaokeLines) text = karaokeLines.map(l => `[${formatLrcTime(l.t)}]${l.text}`).join('\n');
    if (!text && currentLyricsText && !lyricsSearching) text = lyricsContentEl.innerText.split('\n').filter(l => !/^Source:|^Lyrics not found|^Artist:|^Song:|^Edit から/.test(l)).join('\n').trim();
    $lye('lye-textarea').value = text.replace(/^\[(ti|ar|al|by|offset):.*\]\n?/gim, '');
    lyEditor.classList.add('show');
    lyeSetStep('text');
    setTimeout(() => $lye('lye-textarea').focus(), 50);
}

function closeLyricsEditor() {
    clearInterval(lye.timer);
    lyEditor.classList.remove('show');
}

function lyeTextToLines() {
    return $lye('lye-textarea').value.replace(/\r/g, '').split('\n')
        .map(raw => {
            const m = raw.match(/^\s*\[(\d+):(\d+(?:[.:]\d+)?)\]/);
            return { t: m ? parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')) : null, text: raw.replace(/\[[^\]]*\]/g, '').trim() };
        })
        .filter((l, i, all) => l.text || (i > 0 && all[i - 1].text)); // 連続する空行はまとめる（間奏の区切りは 1 行残す）
}

function renderLyeLines() {
    const box = $lye('lye-lines');
    box.innerHTML = lye.lines.map((l, i) => `<div class="lye-line ${i === lye.cursor ? 'cursor' : ''} ${l.t !== null ? 'done' : ''}" data-i="${i}">
        <span class="lye-t">${l.t !== null ? formatLrcTime(l.t) : '--:--.--'}</span>
        <span class="lye-nudge" data-nudge="-0.1" title="0.1 秒早く">‹</span><span class="lye-nudge" data-nudge="0.1" title="0.1 秒遅く">›</span>
        <span class="lye-txt">${l.text ? escapeHtml(l.text) : '<i>（間奏）</i>'}</span></div>`).join('');
    box.querySelector('.cursor')?.scrollIntoView({ block: 'center' });
}

function lyeHighlightPlaying() {
    const t = currentPlaybackTime();
    let idx = -1;
    lye.lines.forEach((l, i) => { if (l.t !== null && l.t <= t) idx = i; });
    $lye('lye-lines').querySelectorAll('.lye-line').forEach((el, i) => el.classList.toggle('playing', i === idx));
}

function lyeStamp() {
    if (!lye.lines.length) return;
    if (!isPlaying) { showToast('曲を再生しながら記録してください'); return; }
    if (lye.cursor >= lye.lines.length) return;
    lye.lines[lye.cursor].t = Math.round(currentPlaybackTime() * 100) / 100;
    lye.cursor = Math.min(lye.cursor + 1, lye.lines.length);
    renderLyeLines();
}

function lyeUndo() {
    if (lye.cursor === 0) return;
    lye.cursor--;
    lye.lines[lye.cursor].t = null;
    renderLyeLines();
}

// 再生位置を前後に動かす（ローカル音楽・再生中のタブの両方）
function seekBy(sec) {
    if (audioPlaylist.length > 0) { audioEl.currentTime = Math.max(0, audioEl.currentTime + sec); return; }
    if (isRemotePlayer()) {
        if (currentMediaDuration > 0) window.electronAPI.controlFromMini({ type: 'seek', value: Math.max(0, currentPlaybackTime() + sec) / currentMediaDuration });
        return;
    }
    const target = mediaTargetTabId || activeTabId;
    webviews[target]?.executeJavaScript(`(() => { const v = document.querySelector('video') || document.querySelector('audio'); if (v) v.currentTime = Math.max(0, v.currentTime + (${Number(sec)})); })()`).catch(() => {});
}

function lyeCollect() {
    const lines = lye.lines.map(l => ({ t: l.t, text: l.text }));
    // タイミングが一部だけの時は、付いている行だけを同期歌詞にする（付いていない行は普通の歌詞として残る）
    return buildLrc({ title: $lye('lye-title').value.trim(), artist: $lye('lye-artist').value.trim(), lines });
}

function lyeSave(lrc) {
    saveMyLyrics(lye.key, { title: $lye('lye-title').value.trim(), artist: $lye('lye-artist').value.trim(), lrc });
    closeLyricsEditor();
    currentLyricsSyncManual = false;
    showMyLyricsIfAny(lye.key);
    if (!document.getElementById('lyrics-panel').classList.contains('show')) document.getElementById('btn-lyrics').click();
    showToast('マイ歌詞を保存しました（次からこの曲で自動的に表示されます）');
}

lyEditor.addEventListener('click', async (e) => {
    if (e.target === lyEditor) { closeLyricsEditor(); return; }
    const nudge = e.target.closest('[data-nudge]');
    if (nudge) {
        const i = Number(nudge.closest('.lye-line').dataset.i);
        if (lye.lines[i].t !== null) { lye.lines[i].t = Math.max(0, Math.round((lye.lines[i].t + Number(nudge.dataset.nudge)) * 100) / 100); renderLyeLines(); }
        return;
    }
    const line = e.target.closest('.lye-line');
    if (line) { lye.cursor = Number(line.dataset.i); renderLyeLines(); return; }
    const act = e.target.closest('[data-lye]')?.dataset.lye;
    if (!act) return;
    if (act === 'close') closeLyricsEditor();
    else if (act === 'file') lrcFileInput.click();
    else if (act === 'save-text') {
        const lines = lyeTextToLines();
        if (!lines.some(l => l.text)) { showToast('歌詞を入力してください'); return; }
        lyeSave(buildLrc({ title: $lye('lye-title').value.trim(), artist: $lye('lye-artist').value.trim(), lines: lines.map(l => ({ t: l.t, text: l.text })) }));
    }
    else if (act === 'to-timing') {
        lye.lines = lyeTextToLines();
        if (!lye.lines.some(l => l.text)) { showToast('歌詞を入力してください'); return; }
        const firstEmpty = lye.lines.findIndex(l => l.t === null);
        lye.cursor = firstEmpty < 0 ? 0 : firstEmpty;
        lyeSetStep('timing');
    }
    else if (act === 'to-text') {
        $lye('lye-textarea').value = lye.lines.map(l => (l.t !== null ? `[${formatLrcTime(l.t)}]` : '') + l.text).join('\n');
        lyeSetStep('text');
    }
    else if (act === 'clear-times') { lye.lines.forEach(l => { l.t = null; }); lye.cursor = 0; renderLyeLines(); }
    else if (act === 'stamp') lyeStamp();
    else if (act === 'play') togglePlay();
    else if (act === 'back5') seekBy(-5);
    else if (act === 'fwd5') seekBy(5);
    else if (act === 'export') {
        const q = currentTrackQuery(nowPlayingTitle.textContent);
        const file = await window.electronAPI.exportLrc(lyeCollect(), [$lye('lye-artist').value.trim() || q.artist, $lye('lye-title').value.trim() || q.title].filter(Boolean).join(' - '));
        if (file) showToast('歌詞を書き出しました', { actionLabel: 'フォルダを開く', action: () => window.electronAPI.showFile(file) });
    }
    else if (act === 'save') lyeSave(lyeCollect());
});

document.addEventListener('keydown', (e) => {
    if (!lyEditor.classList.contains('show')) return;
    if (e.key === 'Escape') { closeLyricsEditor(); return; }
    if (lyEditor.dataset.step !== 'timing' || e.target.closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); lyeStamp(); }
    else if (e.key === 'Backspace') { e.preventDefault(); lyeUndo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); lye.cursor = Math.max(0, lye.cursor - 1); renderLyeLines(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); lye.cursor = Math.min(lye.lines.length - 1, lye.cursor + 1); renderLyeLines(); }
}, true);

document.getElementById('btn-my-lyrics').addEventListener('click', (e) => { e.stopPropagation(); openMyLyricsMenu(); });
