// ==========================================
// ★ 演出（アニメーション）の共通の仕組み
// ==========================================
// 演出は 1 つずつ FX.register() で登録する。登録した内容から設定画面（設定 → 演出）が自動で作られるので、
// 新しい演出を足す時は「fx/ に 1 ファイル作って register する」だけでよい。
//
//   FX.register({
//     id: 'season',                 // 保存に使う名前（変えない）
//     name: '季節の演出', description: '…',
//     group: 'タブバー',             // 設定画面の見出し
//     kind: 'canvas' | 'css',       // css の時は有効な間 <body> に fx-<id> クラスが付く（CSS だけで作る演出用）
//     defaultEnabled: true,
//     available: () => true,        // 今のレイアウトで使えるか（使えない時は止まる）
//     settings: [ { key, type: 'range' | 'select' | 'toggle' | 'action', label, ... } ],
//     start(settings), stop(), update(settings), onAction(key),
//   });
//
// 共通で面倒を見ること：
//   ・設定の保存（localStorage）と、別のウィンドウでの変更の反映
//   ・全体のオン/オフと、OS の「視差効果を減らす」設定に従って止める
//   ・描画ループは 1 つだけ（FX.addTicker）。ウィンドウが隠れている・最小化中は止まる
//   ・音楽・歌詞・タブ・ウィンドウの出来事を知らせる（FX.on）
//       'music'           { playing }           再生 / 一時停止
//       'lyric-line'      { index, text }       カラオケ歌詞の行が変わった
//       'tempo'           { factor }            歌詞の行の間隔から推定した曲の速さ（1 = ふつう）
//       'tab-drag-start'  { id }                上のタブバーでタブをつかんだ
//       'tab-drag-move'   { id, vx }            つかんだタブを動かしている（vx = 横の速さ px/秒）
//       'tab-close'       { id }                上のタブバーでタブを閉じる直前
//       'tabs-changed'    {}                    タブの並び・幅が変わった
//       'window-shake'    { strength, dir }     ウィンドウを左右に揺らした
//       'theme'           { light }             テーマが変わった
//       'layout'          {}                    レイアウト（上タブ / サイドバー）が変わった

const FX = (() => {
    const KEY = 'archyndium_fx';
    const defs = new Map();
    const listeners = new Map();
    const tickers = new Set();
    const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
    let store = load();
    let ready = false;

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

    // ---------- 設定 ----------
    const globals = () => ({ master: store.master ?? true, followOS: store.followOS ?? true });
    function setGlobal(key, value) { store[key] = value; save(); refreshAll(); }
    const osReduced = () => reduceMQ.matches;
    const allowed = () => globals().master && !(globals().followOS && osReduced());

    function settingsOf(id) {
        const d = defs.get(id); if (!d) return {};
        const saved = store.effects?.[id] || {};
        const out = { enabled: saved.enabled ?? d.defaultEnabled ?? true };
        (d.settings || []).forEach(s => { if (s.type !== 'action') out[s.key] = saved[s.key] ?? s.default; });
        return out;
    }
    function set(id, key, value) {
        store.effects ||= {}; store.effects[id] ||= {};
        store.effects[id][key] = value; save(); refresh(id);
    }
    function reset(id) { if (store.effects) delete store.effects[id]; save(); refresh(id); }

    // ---------- 登録・開始・停止 ----------
    function register(def) {
        def.settings ||= []; def.running = false;
        defs.set(def.id, def);
        if (ready) refresh(def.id);
    }
    const isActive = (id) => { const d = defs.get(id); return !!d && allowed() && settingsOf(id).enabled && (d.available ? d.available() : true); };
    function refresh(id) {
        const d = defs.get(id); if (!d) return;
        const on = isActive(id), s = settingsOf(id);
        try {
            if (on && !d.running) { d.running = true; if (d.kind === 'css') document.body.classList.add('fx-' + id); d.start?.(s); }
            else if (!on && d.running) { d.running = false; if (d.kind === 'css') document.body.classList.remove('fx-' + id); d.stop?.(); }
            else if (on) d.update?.(s);
        } catch (e) { console.error('[fx]', id, e); }
    }
    function refreshAll() { defs.forEach((_, id) => refresh(id)); }
    function action(id, key) { const d = defs.get(id); if (d?.running) d.onAction?.(key); }

    // ---------- 出来事 ----------
    function on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); }
    function emit(ev, data = {}) { listeners.get(ev)?.forEach(fn => { try { fn(data); } catch (e) { console.error('[fx]', ev, e); } }); }

    // ---------- 描画ループ（1 つだけ。隠れている間は requestAnimationFrame 自体が止まる） ----------
    let rafId = 0, last = 0;
    function loop(now) {
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
        tickers.forEach(fn => { try { fn(dt, now); } catch (e) { console.error('[fx] tick', e); } });
        rafId = tickers.size ? requestAnimationFrame(loop) : 0;
    }
    function addTicker(fn) { tickers.add(fn); if (!rafId) { last = 0; rafId = requestAnimationFrame(loop); } }
    function removeTicker(fn) { tickers.delete(fn); }
    document.addEventListener('visibilitychange', () => { last = 0; });

    // ---------- 音楽・歌詞の見張り（audio.js / karaoke.js の状態を読むだけ） ----------
    let wasPlaying = null, lastLine = -2, lineTimes = [];
    const music = { playing: false, line: '', tempo: 1 };
    setInterval(() => {
        const playing = typeof isPlaying !== 'undefined' && !!isPlaying;
        if (playing !== wasPlaying) { wasPlaying = playing; music.playing = playing; emit('music', { playing }); }
        const active = typeof karaokeActive === 'function' && karaokeActive();
        const idx = active ? karaokeIndex : -1;
        if (idx !== lastLine) {
            lastLine = idx;
            music.line = idx >= 0 ? (karaokeLines[idx]?.text || '') : '';
            emit('lyric-line', { index: idx, text: music.line });
            if (idx >= 0 && playing) {
                const t = performance.now(); lineTimes.push(t); lineTimes = lineTimes.slice(-6);
                if (lineTimes.length >= 3) {
                    const gaps = lineTimes.slice(1).map((v, i) => (v - lineTimes[i]) / 1000).filter(g => g > 0.8 && g < 15);
                    if (gaps.length) {
                        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                        music.tempo = Math.max(0.7, Math.min(1.5, 3.6 / avg));   // 行の間隔 3.6 秒前後をふつうの速さとする
                        emit('tempo', { factor: music.tempo });
                    }
                }
            }
        }
    }, 150);

    // ---------- ウィンドウを揺らした ----------
    let wx = window.screenX, wDir = 0, flips = [];
    setInterval(() => {
        if (!listeners.get('window-shake')?.size) { wx = window.screenX; return; }
        const dx = window.screenX - wx; wx = window.screenX;
        const dir = Math.sign(dx);
        if (Math.abs(dx) > 6 && dir !== wDir) {
            wDir = dir; const t = performance.now();
            flips = flips.filter(f => t - f < 900); flips.push(t);
            if (flips.length >= 3) { emit('window-shake', { strength: Math.min(1, Math.abs(dx) / 40), dir }); flips = []; }
        }
    }, 50);

    // ---------- テーマ ----------
    function isLight() {
        const el = document.querySelector('.app-wrapper') || document.body;
        const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
        if (!m) return false;
        const [r, g, b] = m.map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
    }
    let lightNow = null;
    setInterval(() => { const l = isLight(); if (l !== lightNow) { lightNow = l; emit('theme', { light: l }); } }, 1000);

    // ---------- 外からの変化 ----------
    reduceMQ.addEventListener?.('change', () => { refreshAll(); renderSettingsIfOpen(); });
    window.addEventListener('storage', (e) => { if (e.key === KEY) { store = load(); refreshAll(); renderSettingsIfOpen(); } });
    document.addEventListener('DOMContentLoaded', () => { ready = true; refreshAll(); });
    function renderSettingsIfOpen() { if (typeof renderFxSettings === 'function') renderFxSettings(); }

    return {
        register, on, emit, addTicker, removeTicker, settingsOf, set, reset, setGlobal, globals, osReduced, allowed,
        isActive, refresh, refreshAll, action, isLight, music,
        list: () => [...defs.values()],
    };
})();
