// ==========================================
// ★ THE AUDIO ENGINE & LYRICS SYNC
// ==========================================
let audioPlaylist = []; let currentTrackIdx = 0; let loopMode = 0; let isPlaying = false;
let currentTrackTitleStr = ""; 

const audioEl = new Audio(); let audioCtx, analyser, sourceNode, filters = [];
const playBtn = document.getElementById('btn-play');

document.getElementById('btn-load-music').addEventListener('click', () => document.getElementById('audio-input').click());
document.getElementById('audio-input').addEventListener('change', (e) => {
  audioPlaylist = Array.from(e.target.files); if(audioPlaylist.length === 0) return;
  currentTrackIdx = 0; playTrack();
});

function playTrack() {
  if(!audioPlaylist[currentTrackIdx]) return;
  const file = audioPlaylist[currentTrackIdx]; audioEl.src = URL.createObjectURL(file);
  nowPlayingTitle.textContent = file.name; document.getElementById('track-artist').textContent = 'Local Player';
  if(!audioCtx) initAudio();
  audioEl.play(); isPlaying = true; updatePlayBtn();
  renderPlayerSource();
}

function togglePlay() {
  if (isRemotePlayer()) { window.electronAPI.controlFromMini('play'); return; } // 別ウィンドウの曲を操作
  if (audioPlaylist.length > 0) {
    if(isPlaying) audioEl.pause(); else audioEl.play();
    isPlaying = !isPlaying; updatePlayBtn();
  } else {
    const target = mediaTargetTabId || activeTabId;
    if(target && webviews[target]) webviews[target].executeJavaScript(`var v=document.querySelector('video')||document.querySelector('audio'); if(v){ v.paused ? v.play() : v.pause(); }`).catch(()=>{});
  }
}

function updatePlayBtn() {
  playBtn.classList.toggle('paused', isPlaying);
  playBtn.innerHTML = isPlaying 
    ? `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
    : `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
}

document.getElementById('btn-play').addEventListener('click', togglePlay);

document.getElementById('btn-next').addEventListener('click', () => {
  if (isRemotePlayer()) { window.electronAPI.controlFromMini('next'); return; }
  if (audioPlaylist.length > 0) {
    if(currentTrackIdx < audioPlaylist.length - 1) { currentTrackIdx++; playTrack(); } else if(loopMode === 1) { currentTrackIdx = 0; playTrack(); }
  } else { 
    const target = mediaTargetTabId || activeTabId; 
    if(target && webviews[target]) webviews[target].executeJavaScript(`var n=document.querySelector('.ytp-next-button'); if(n) n.click();`).catch(()=>{});
  }
});

document.getElementById('btn-prev').addEventListener('click', () => {
  if (isRemotePlayer()) { window.electronAPI.controlFromMini('prev'); return; }
  if (audioPlaylist.length > 0 && currentTrackIdx > 0) { currentTrackIdx--; playTrack(); }
  else { 
    const target = mediaTargetTabId || activeTabId; 
    if(target && webviews[target]) webviews[target].executeJavaScript(`var v=document.querySelector('video'); if(v) { v.currentTime = 0; v.play(); }`).catch(()=>{});
  }
});

// ▼ 追加：タイトルのマーキー（スクロール）を計算する関数
function updateMarquee(elementId) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.classList.remove('scrolling');
    el.style.transform = 'none';
    setTimeout(() => {
        const parentWidth = el.parentElement.clientWidth;
        if (el.scrollWidth > parentWidth) {
            el.style.setProperty('--scroll-dist', `-${el.scrollWidth - parentWidth + 10}px`);
            el.classList.add('scrolling');
        }
    }, 100);
}

// ▼ 修正：ループ機能を削除したため、ended処理をシンプルに
audioEl.addEventListener('ended', () => {
  if(currentTrackIdx < audioPlaylist.length - 1) { currentTrackIdx++; playTrack(); } 
  else { isPlaying = false; updatePlayBtn(); }
});

// ▼ 追加：本体側の音量スライダーの処理
document.getElementById('main-volume-slider').addEventListener('input', (e) => {
    const vol = e.target.value;
    if (audioPlaylist.length > 0) audioEl.volume = vol;
    Object.values(webviews).forEach(wv => {
        wv.executeJavaScript(`var v=document.querySelector('video')||document.querySelector('audio'); if(v) v.volume = ${vol};`).catch(()=>{});
    });
    if (window.electronAPI) window.electronAPI.controlFromMini({ type: 'volume', value: vol });
});

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)(); sourceNode = audioCtx.createMediaElementSource(audioEl);
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
  const freqs = [60, 230, 910, 3600, 14000]; let prevNode = sourceNode;
  freqs.forEach(freq => {
    const filter = audioCtx.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = freq; filter.Q.value = 1; filter.gain.value = 0;
    filters.push(filter); prevNode.connect(filter); prevNode = filter;
  });
  prevNode.connect(analyser); analyser.connect(audioCtx.destination);
  document.querySelectorAll('.eq-band input').forEach(slider => { 
      slider.addEventListener('input', (e) => { 
          const idx = parseInt(e.target.dataset.index);
          const val = parseFloat(e.target.value);
          // ローカル音楽用
          if(filters[idx]) filters[idx].gain.value = val; 
          // ▼ 追加：YouTube（Webview）側にも設定値をリアルタイム送信
          Object.values(webviews).forEach(wv => {
              wv.executeJavaScript(`if(window.__eqFilters) window.__eqFilters[${idx}].gain.value = ${val};`).catch(()=>{});
          });
      }); 
  });
  // ▼ 修正：ここで sendWaveformLoop() を再度呼ぶと rAF ループが二重に走るため削除（起動時に app.js で開始済み）
}

// ▼ 変更：以前は requestAnimationFrame で回していたため、ウィンドウを最小化すると止まり、
//   ミニプレイヤーの表示・歌詞の更新・カラオケが止まっていた。タイマー（1 秒に 20 回）で回す
let syncLoopTimer = null;
function sendWaveformLoop() {
  if (syncLoopTimer) return;
  syncLoopTimer = setInterval(syncTick, 50);
  syncTick();
}

let lastMiniSyncAt = 0, accentCache = '', accentCacheAt = 0;
// テーマ色の読み取り（getComputedStyle は重いので 1 秒に 1 回だけ）
function cachedThemeAccent() {
  const t = performance.now();
  if (!accentCache || t - accentCacheAt > 1000) { accentCache = getComputedStyle(document.documentElement).getPropertyValue('--theme-light').trim(); accentCacheAt = t; }
  return accentCache;
}

function syncTick() {
  const newTitle = nowPlayingTitle.textContent;
  if (newTitle !== currentTrackTitleStr && newTitle !== '再生していません') {
    currentTrackTitleStr = newTitle;
    updateMarquee('track-name'); // ▼ 追加：曲が変わったらマーキーを再計算
    currentLyricsSyncManual = false;
    // ▼ 修正：本体の歌詞パネルが閉じていても、ミニプレイヤーが開いていれば新しい曲の歌詞を取りに行く
    //   （以前はパネルが開いている時だけだったので、ミニプレイヤーで次の曲にすると前の曲の歌詞のままだった）
    if (document.getElementById('lyrics-panel').classList.contains('show') || miniPlayerOpen) {
      autoFetchLyrics(newTitle);
    } else {
      clearLyrics(); // どちらも閉じている時は古い歌詞を残さない（次に開いた時に取得する）
    }
  }

  karaokeTick(); // ▼ 追加：カラオケ表示の現在行を更新

  // ▼ 軽量化：ミニプレイヤーへの送信は、ミニプレイヤーを開いている時だけ 0.05 秒ごと。
  //   閉じている時は（別ウィンドウとの再生元の調整に使うだけなので）0.5 秒ごとにする
  const nowMs = performance.now();
  if (!miniPlayerOpen && nowMs - lastMiniSyncAt < 500) return;
  lastMiniSyncAt = nowMs;

  // ▼ 時刻・シーク情報
  let progress = 0;
  let timeStr = "0:00";
  let durationStr = "0:00";

  if (audioPlaylist.length > 0) { // ローカル再生時
      if (audioEl.duration) {
          progress = audioEl.currentTime / audioEl.duration;
          timeStr = formatTime(audioEl.currentTime);
          durationStr = formatTime(audioEl.duration);
      }
  } else if (mediaTargetTabId || activeTabId) { // YouTube再生時
      if (currentMediaDuration > 0) {
          progress = currentMediaTime / currentMediaDuration;
          timeStr = formatTime(currentMediaTime);
          durationStr = formatTime(currentMediaDuration);
      }
  }

  if(window.electronAPI) {
    let wave = [];
    if(analyser && audioPlaylist.length > 0) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(dataArray); wave = Array.from(dataArray);
    } else if ((mediaTargetTabId || activeTabId) && isPlaying) {
      wave = Array.from({length: 32}, () => Math.floor(Math.random() * 200) + 20);
    }
    
    window.electronAPI.syncToMini({ 
        title: newTitle, 
        artist: document.getElementById('track-artist').textContent, 
        isPlaying: isPlaying, 
        loopState: loopMode, 
        waveform: wave, 
        lyricsText: currentLyricsText,
        // ▼ 追加：どのタブを操作しているか（ミニプレイヤーにも表示）
        source: { label: sourceLabel(), locked: mediaLocked },
        // ▼ 追加：ウィンドウをまたいだ再生元の判定用（main の window-controls.js）
        remote: isRemotePlayer(),          // 別ウィンドウの曲を映しているだけ
        hasMedia: hasLocalMedia(),
        localPlaying: audioPlaylist.length > 0 ? !audioEl.paused : !!(mediaTargetTabId && mediaTabs[mediaTargetTabId]?.playing),         // このウィンドウに音楽（対象タブ / ローカル再生）がある
        claim: Date.now() < mediaClaimUntil, // ユーザーがこのウィンドウのタブを選んで固定した直後
        rawTime: currentPlaybackTime(), rawDuration: audioPlaylist.length > 0 ? (audioEl.duration || 0) : currentMediaDuration,
        isManualLyrics: currentLyricsSyncManual,
        // ▼ 追加：本体のテーマ色（ミニプレイヤーの色をテーマに合わせる）
        accent: cachedThemeAccent(),
        // ▼ 追加：カラオケ表示（行データは変わった時だけ送る）
        karaoke: karaokeSyncPayload(),
        // ▼ 時間関連データをすべて送信
        progress: progress,
        currentTime: timeStr,
        duration: durationStr
    });
  }
}

window.electronAPI?.onControlToMain((cmd) => {
  if (cmd === 'play') togglePlay(); 
  else if (cmd === 'next') document.getElementById('btn-next').click(); 
  else if (cmd === 'prev') document.getElementById('btn-prev').click(); 
  else if (cmd && cmd.type === 'seek') {
      if (audioPlaylist.length > 0) {
          audioEl.currentTime = audioEl.duration * cmd.value;
      } else {
          const target = mediaTargetTabId || activeTabId;
          if (target) if (webviews[target]) { webviews[target].executeJavaScript(`var v=document.querySelector('video'); if(v && v.duration) { v.currentTime = v.duration * ${cmd.value}; }`).catch(()=>{}); }
      }
  }
  // ▼ 追加：音量変更の受信
  else if (cmd && cmd.type === 'volume') {
      if (audioPlaylist.length > 0) audioEl.volume = cmd.value;
      Object.values(webviews).forEach(wv => {
          wv.executeJavaScript(`var v=document.querySelector('video')||document.querySelector('audio'); if(v) v.volume = ${cmd.value};`).catch(()=>{});
      });
  }
  // ▼ 追加：ミニプレイヤーからの「手動検索命令」を受け取って本体で実行する
  else if (cmd && cmd.type === 'manual-search') {
      performLyricsSearch({ artist: cmd.artist, song: cmd.song, manual: true }, true);
  }
  else if (cmd && cmd.type === 'refresh-lyrics') {
      document.getElementById('btn-refresh-lyrics').click();
  }
  // ▼ 追加：ミニプレイヤーからのソース操作
  else if (cmd && cmd.type === 'toggle-media-lock') toggleMediaLock();
  else if (cmd && cmd.type === 'karaoke-nudge') {
    if (cmd.reset) { karaokeOffset = 0; saveKaraokeOffset(lastLyricsTrackKey, 0); renderLyricsBody(); }
    else nudgeKaraokeOffset(cmd.delta);
  }
  else if (cmd && cmd.type === 'cycle-media-source') cycleMediaSource();
});

// ▼ 修正：クリックの度に sendWaveformLoop() を呼ぶと 60fps の IPC ループが増殖していたため、開くだけに変更
document.getElementById('btn-popout').addEventListener('click', () => { window.electronAPI.openMiniPlayer(); });

// ▼ 追加：ミニプレイヤーの開閉を main から受け取る。開いた時に歌詞が無ければ取得する
let miniPlayerOpen = false;
window.electronAPI?.onMiniPlayerState(({ open }) => {
  miniPlayerOpen = open;
  if (open) {
    resendKaraokeLines();
    if (!currentLyricsText) autoFetchLyrics(nowPlayingTitle.textContent);
  }
});

document.getElementById('btn-eq').addEventListener('click', function(e) {
  e.stopPropagation(); this.classList.toggle('active'); document.getElementById('eq-panel').classList.toggle('show');
});
