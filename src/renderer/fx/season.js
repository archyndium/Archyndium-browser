// ==========================================
// ★ 演出：季節（タブバーに雪・桜・雨・落ち葉が降って、タブの上に積もる）
// ==========================================
// ・降るのはタブバーの中だけ。積もる高さには上限があり、タブの文字やボタンは隠さない
// ・タブをつかむ・閉じる・ウィンドウを揺らすと、積もった分が落ちる
// ・音楽と連動：一時停止中は降らない（積もった分は残る）／歌詞の行が変わるとひとひら落ちる／
//   歌詞の行の間隔から推定した曲の速さで、降る量と速さが変わる
// ・描画は 1 枚のキャンバス（#fx-canvas）。止まっている時はほとんど描き直さない

(() => {
    const cv = document.getElementById('fx-canvas');
    const ctx = cv.getContext('2d');
    let S = {}, kind = 'winter', running = false;
    let playing = false, tempoF = 1, light = false;
    const flakes = [], chunks = [];
    const piles = new Map();   // 冬：tabId -> { h: 高さの配列（2px ごと）, cap: 場所ごとの上限の割合 }
    const stuck = new Map();   // 春夏秋：tabId -> 引っかかっている物の配列
    const gusts = new Map();
    let geo = [], W = 0, H = 0, stripH = 0, clip = { x0: 0, x1: 0 }, dpr = 1;
    let needMeasure = true, fdt = 0, idleT = 0, seasonCheckT = 0;

    // ---------- 季節 ----------
    const pick = (a) => a[Math.random() * a.length | 0];
    const PALETTE = { spring: ['#f7c6d9', '#f3a7c4', '#fbd9e6', '#f9e3ec', '#eeb3cb'], autumn: ['#e2553c', '#f0a35e', '#d18b2c', '#b5482f', '#d6b03a', '#a3b04a'] };
    const AGED = { spring: '#e9d6c8', autumn: '#74492b' };
    const SEASON = {
        winter: { spawn: 1, vy: 20, sway: 10, color: () => light ? '#f2f7ff' : '#ffffff' },
        spring: { spawn: 0.45, vy: 26, sway: 26, color: () => pick(PALETTE.spring) },
        summer: { spawn: 1.4, vy: 260, sway: 0, color: () => light ? 'rgba(70,120,190,.55)' : 'rgba(170,205,255,.55)' },
        autumn: { spawn: 0.35, vy: 34, sway: 34, color: () => pick(PALETTE.autumn) },
    };
    function autoSeason() {
        const m = new Date().getMonth();
        let k = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
        if (S.hemisphere === 'south') k = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[k];
        return k;
    }
    const currentKind = () => S.season === 'auto' ? autoSeason() : S.season;
    const speedMul = () => S.minutes ? 60 / S.minutes : 0;   // 1 = 1 時間で上限まで
    const tempo = () => S.tempo ? tempoF : 1;

    function variant(k) {
        if (k === 'spring') return { asp: 0.45 + Math.random() * 0.35, notch: 0.1 + Math.random() * 0.25, bend: (Math.random() - 0.5) * 0.5 };
        if (k === 'autumn') return { leaf: pick(['oval', 'maple', 'maple', 'ginkgo', 'oval']), asp: 0.7 + Math.random() * 0.5, bend: (Math.random() - 0.5) * 0.6 };
        return null;
    }
    const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

    function spawn(x, y, big) {
        const s = SEASON[kind], leafy = kind === 'spring' || kind === 'autumn';
        flakes.push({ x, y, vy: s.vy * (0.7 + Math.random() * 0.6) * (kind === 'summer' ? 1 : Math.sqrt(tempo())), ph: Math.random() * 6.28,
            r: (big ? 2.2 : leafy ? 0.6 + Math.random() * 1.1 : 0.8 + Math.random() * 1.1) * S.size, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, c: s.color(), v: variant(kind) });
    }

    // ---------- 位置の計測 ----------
    function measure() {
        needMeasure = false;
        const host = cv.parentElement.getBoundingClientRect();
        const strip = document.getElementById('tabstrip').getBoundingClientRect();
        const ll = document.getElementById('lyric-line');
        const bottom = Math.max(document.querySelector('.canvas-header').getBoundingClientRect().bottom, ll.classList.contains('show') ? ll.getBoundingClientRect().bottom : 0);
        dpr = Math.min(2, devicePixelRatio || 1);
        W = host.width; H = Math.max(strip.height, bottom - host.top); stripH = strip.bottom - host.top;
        if (cv.style.height !== H + 'px') cv.style.height = H + 'px';
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        const tr = document.getElementById('ts-tabs').getBoundingClientRect();
        clip = { x0: tr.left - host.left, x1: tr.right - host.left };
        geo = [...document.querySelectorAll('#ts-tabs .ts-tab:not(.ts-leave)')].map(el => {
            const b = el.getBoundingClientRect(), id = el.dataset.id;
            const x0 = b.left - host.left + 9, x1 = b.right - host.left - 9, n = Math.max(2, Math.floor((x1 - x0) / 2));
            let p = piles.get(id);
            if (!p || p.h.length !== n) {   // 幅が変わったら、積もった形を引き伸ばす
                const old = p ? p.h : null, cap = [], seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
                const h = Array.from({ length: n }, (_, i) => old ? old[Math.floor(i * old.length / n)] : 0);
                for (let i = 0; i < n; i++) cap.push(0.62 + 0.38 * (0.5 + 0.5 * Math.sin(i * 0.37 + seed * 1.7) * Math.cos(i * 0.11 + seed)));
                p = { h, cap }; piles.set(id, p);
            }
            return { id, x0, x1, top: b.top - host.top, drag: el.classList.contains('ts-dragging') };
        }).filter(g => g.x1 > clip.x0 && g.x0 < clip.x1);
    }
    const tabAt = (x) => geo.find(g => !g.drag && x >= g.x0 && x <= g.x1);

    // ---------- 積もる ----------
    function depositPerLanding() {
        const perSec = Math.max(0.5, S.rate * SEASON[kind].spawn * tempo());
        return speedMul() * (S.max * 0.8 * Math.max(1, W / 2)) / (perSec * 3600) / 3;
    }
    const limitFor = (g) => Math.max(2, Math.round((g.x1 - g.x0) / 16 * S.max / 6 * (kind === 'summer' ? 1.4 : 1.8)));
    const rMax = () => (0.9 + S.max * 0.22) * S.size;
    const thick = (s) => s.kind === 'spring' ? 0.8 * s.r : 1.3 * s.r;
    const halfW = (s) => s.r * (s.kind === 'spring' ? 2 : 2.4);
    function restOn(under, s) {
        let lift = 0;
        under.forEach(o => { const d = Math.abs(o.dx - s.dx), reach = halfW(o) + halfW(s); if (d < reach && !o.hang) lift = Math.max(lift, o.lift + thick(o) * (1 - d / reach * 0.7)); });
        return lift;
    }
    const relayer = (list) => list.forEach((s, i) => { if (s.kind !== 'summer' && !s.hang) s.lift = restOn(list.slice(0, i), s); });

    function land(f, g) {
        if (!speedMul()) return;
        if (kind === 'winter') {
            const p = piles.get(g.id), i = Math.round((f.x - g.x0) / 2), d = depositPerLanding();
            for (let k = -1; k <= 1; k++) {
                const j = i + k; if (j < 0 || j >= p.h.length) continue;
                const edge = Math.min(1, Math.min(j, p.h.length - 1 - j) / 6);   // 角は低く
                p.h[j] = Math.min(S.max * p.cap[j] * (0.35 + 0.65 * edge), p.h[j] + d * (k ? 0.5 : 1));
            }
        } else {
            if (kind === 'summer') splash(f.x, g.top, f.c);
            if (Math.random() > Math.min(1, speedMul() / 30)) return;
            addStuck(g, f.x, f, false);
        }
    }
    function splash(x, y, c) {
        for (let k = 0; k < 2; k++) chunks.push({ x, y: y - 1, vx: (Math.random() - 0.5) * 70, vy: -40 - Math.random() * 50, r: 0.5, c, life: 1, rot: 0, vr: 0, shape: 'drip', ttl: 0.35 });
    }
    function addStuck(g, x, f, instant) {
        const list = stuck.get(g.id) || []; stuck.set(g.id, list);
        const w = g.x1 - g.x0, dx = x - g.x0;
        if (kind === 'summer') {   // 水滴は近くの水滴とくっついて大きくなる
            const r = (0.5 + Math.random() * 0.45) * S.size;
            const near = list.find(o => !o.slide && Math.abs(o.dx - dx) < (o.r + r) * 1.6);
            if (near) {
                const A = near.r * near.r, B = r * r;
                if (instant && Math.sqrt(A + B) > rMax() * (0.3 + Math.random() * 0.55)) return false;
                near.dx = (near.dx * A + dx * B) / (A + B); near.r = Math.sqrt(A + B); near.wob = instant ? 0 : 1;
            } else {
                if (list.length >= limitFor(g)) return false;
                list.push({ kind, dx, r, wob: instant ? 0 : 1, vx: 0, age: 0 });
            }
            return true;
        }
        if (list.length >= limitFor(g)) return false;
        const turn = Math.round(f.rot / Math.PI) * Math.PI;
        const s = { kind, dx, r: f.r, c: f.c, v: f.v, rot: instant ? turn : f.rot, rest: turn + (Math.random() - 0.5) * 0.5, lift: 0, age: instant ? Math.random() * 0.3 : 0,
            vx: instant ? 0 : Math.sin(f.ph) * SEASON[kind].sway * 0.8 + (Math.random() - 0.5) * 14, settle: instant ? 0 : 1,
            life: kind === 'spring' ? 0.25 + Math.random() * 0.75 : Infinity };
        if (dx < 4 || dx > w - 4) hang(s, w);
        else { s.lift = restOn(list, s); if (s.lift + thick(s) > S.max + 0.5) { if (!instant) dropOff(g, s, 0); return false; } }
        if (instant) s.rot = s.rest;
        list.push(s); return true;
    }
    function hang(s, w) { const side = s.dx < w / 2 ? -1 : 1; s.hang = side; s.dx = side < 0 ? Math.max(-2, s.dx) : Math.min(w + 2, s.dx); s.rest = side * (0.45 + Math.random() * 0.6); s.lift = 0; }
    const agedColor = (s) => s.c[0] === '#' ? mix(s.c, AGED[s.kind], Math.min(1, s.age) * (s.kind === 'autumn' ? 0.85 : 0.55)) : s.c;
    const dropColor = () => light ? 'rgba(90,140,210,.5)' : 'rgba(190,220,255,.6)';
    function dropOff(g, s, push, up) {
        if (s.kind === 'summer') { chunks.push({ x: g.x0 + s.dx, y: g.top - s.r * 0.6, vx: push, vy: 30, r: Math.max(0.6, s.r * 0.8), c: dropColor(), life: 1, rot: 0, vr: 0, shape: 'drip' }); return; }
        chunks.push({ x: g.x0 + s.dx, y: g.top - s.lift - 2, vx: (Math.random() - 0.5) * 60 + push, vy: up ?? (s.kind === 'autumn' ? -140 - Math.random() * 120 : -30), r: s.r, c: agedColor(s), v: s.v, life: 1, rot: s.rot, vr: (Math.random() - 0.5) * 8, shape: s.kind });
    }

    // 崩れて落ちる（frac：落とす割合。id 省略で全部のタブ）
    function crumble(id, frac = 1, push = 0) {
        geo.filter(g => id == null || g.id === id).forEach(g => {
            const p = piles.get(g.id);
            if (p) p.h.forEach((h, i) => {
                const fall = h * frac; if (fall < 0.3) return; p.h[i] -= fall;
                for (let k = Math.ceil(fall / 1.6); k > 0; k--) chunks.push({ x: g.x0 + i * 2 + Math.random() * 2, y: g.top - Math.random() * fall, vx: (Math.random() - 0.5) * 50 + push * 0.25, vy: -Math.random() * 60, r: 0.7 + Math.random() * 1.3, c: SEASON.winter.color(), life: 1, rot: 0, vr: 0, shape: 'dot' });
            });
            const list = stuck.get(g.id); if (!list) return;
            const w = g.x1 - g.x0, keep = [];
            list.slice().sort((a, b) => (b.lift || 0) - (a.lift || 0)).forEach(s => {   // 上に重なっている物ほど落ちやすい
                if (Math.random() > frac * (s.lift > 0 ? 1.3 : 1)) { keep.push(s); return; }
                dropOff(g, s, push * 0.3 + (s.kind === 'summer' ? (s.dx < w / 2 ? -90 : 90) : 0));
            });
            const left = list.filter(s => keep.includes(s)); stuck.set(g.id, left); relayer(left);
        });
        idleT = 1;
    }
    function fill() {
        measure();
        geo.forEach(g => {
            if (kind === 'winter') { const p = piles.get(g.id); p.h = p.h.map((_, i) => { const edge = Math.min(1, Math.min(i, p.h.length - 1 - i) / 6); return S.max * p.cap[i] * (0.35 + 0.65 * edge); }); }
            else for (let k = 0; k < 400; k++) {
                const f = { rot: Math.random() * 6.28, ph: 0, r: (0.6 + Math.random() * 1.1) * S.size, c: SEASON[kind].color(), v: variant(kind) };
                addStuck(g, g.x0 + 1 + Math.random() * (g.x1 - g.x0 - 2), f, true);
            }
        });
        idleT = 1;
    }
    function clearAll() { flakes.length = 0; piles.forEach(p => p.h.fill(0)); stuck.clear(); gusts.clear(); }

    // ---------- 描画 ----------
    function drawParticle(p, alpha) {
        const k = p.shape === 'dot' ? 'winter' : (p.shape || kind);
        ctx.globalAlpha = alpha * (k === 'winter' ? 0.9 : 1);
        ctx.fillStyle = p.c;
        if (k === 'winter' || k === 'drip') { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29); ctx.fill(); }
        else if (k === 'summer') { ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1, p.r * 0.7); ctx.beginPath(); ctx.moveTo(p.x, p.y - 7 * p.r); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        else drawShape(k, p.v, p.x, p.y, p.r, p.rot, p.c, p.sy ?? 0.3 + 0.7 * Math.abs(Math.cos((p.ph ?? p.rot) * 1.3)));
        ctx.globalAlpha = 1;
    }
    function drawShape(k, v, x, y, r, rot, color, sy = 1) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, sy); ctx.fillStyle = color; ctx.beginPath();
        const bend = v?.bend || 0;
        if (k === 'spring') {
            const L = 4.2 * r, Wd = L * (v?.asp ?? 0.6) / 2, n = (v?.notch ?? 0.2) * L;
            ctx.moveTo(-L / 2, 0);
            ctx.bezierCurveTo(-L / 4, -Wd * 1.6 + bend * Wd, L / 2, -Wd * 1.3, L / 2, -Wd * 0.35);
            ctx.lineTo(L / 2 - n, bend * Wd * 0.3); ctx.lineTo(L / 2, Wd * 0.35);
            ctx.bezierCurveTo(L / 2, Wd * 1.3, -L / 4, Wd * 1.6 + bend * Wd, -L / 2, 0);
            ctx.fill();
            ctx.globalAlpha *= 0.3; ctx.strokeStyle = '#c8668d'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2 - n * 1.5, 0); ctx.stroke();
        } else {
            const leaf = v?.leaf || 'oval', a = v?.asp ?? 1;
            if (leaf === 'maple') {
                const ang = [-2.95, -2.3, -1.57, -0.84, -0.19], rad = [2.8, 3.8, 4.4, 3.8, 2.8];
                ctx.moveTo(0, 0.8 * r);
                ang.forEach((t, i) => {
                    const R = rad[i] * r, m = 1.5 * r;
                    ctx.lineTo(Math.cos(t - 0.2) * m, Math.sin(t - 0.2) * m * a);
                    ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R * a + bend * r);
                    ctx.lineTo(Math.cos(t + 0.2) * m, Math.sin(t + 0.2) * m * a);
                });
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = color; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0.6 * r); ctx.lineTo(0.3 * r, 2.4 * r); ctx.stroke();
            } else if (leaf === 'ginkgo') {
                const R = 3.8 * r, cy = 1.4 * r;
                ctx.moveTo(0, cy); ctx.arc(0, cy, R, -2.55, -1.66); ctx.lineTo(0, cy - R * 0.72 + bend * r); ctx.arc(0, cy, R, -1.48, -0.59); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = color; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(0, cy + 1.8 * r); ctx.stroke();
            } else {
                const L = 4.2 * r, Wd = 2.6 * r * a;
                ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -Wd + bend * r, L, 0); ctx.quadraticCurveTo(0, Wd + bend * r, -L, 0); ctx.fill();
                ctx.globalAlpha *= 0.35; ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, bend * r * 0.6, L * 0.9, 0); ctx.stroke();
            }
        }
        ctx.restore();
    }
    // 積もった物を描く。動いている物があれば true を返す
    function drawPiles() {
        const now = performance.now() / 1000, age = fdt * speedMul() / 3600;
        let moving = false;
        geo.forEach(g => {
            const p = piles.get(g.id);
            if (p && p.h.some(h => h > 0.15)) {
                ctx.beginPath(); ctx.moveTo(g.x0, g.top + 0.5);
                p.h.forEach((h, i) => ctx.lineTo(g.x0 + i * 2, g.top + 0.5 - h));
                ctx.lineTo(g.x1, g.top + 0.5); ctx.closePath();
                ctx.fillStyle = light ? '#f4f8ff' : '#ffffff';
                ctx.shadowColor = light ? 'rgba(60,90,150,.45)' : 'rgba(255,255,255,.35)'; ctx.shadowBlur = light ? 3 : 6; ctx.shadowOffsetY = light ? 1 : 0;
                ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
                if (light) { ctx.strokeStyle = 'rgba(110,140,190,.55)'; ctx.lineWidth = 0.8; ctx.stroke(); }
            }
            const list = stuck.get(g.id); if (!list || !list.length) return;
            const w = g.x1 - g.x0;
            let gust = gusts.get(g.id) || { t: 0, str: 0, dir: 1 };
            if (fdt && gust.t <= 0 && Math.random() < fdt * 0.12) gust = { t: 1.4, str: 0.4 + Math.random() * 0.6, dir: Math.random() < 0.5 ? -1 : 1 };
            gust.t -= fdt; gusts.set(g.id, gust);
            const blowing = gust.t > 0 ? gust.str * Math.sin(Math.PI * gust.t / 1.4) : 0;
            if (blowing > 0) moving = true;

            if (kind === 'summer') {
                const big = rMax();
                for (let k = list.length - 1; k >= 0; k--) {
                    const s = list[k];
                    if (!s.slide && s.r > big) { s.slide = s.dx < w / 2 ? -1 : 1; if (Math.random() < 0.25) s.slide *= -1; }
                    if (s.slide) {   // 大きくなった水滴は端へ流れ、通り道の水滴を吸い込む
                        moving = true;
                        s.vx = Math.max(-80, Math.min(80, s.vx + s.slide * 140 * fdt)); s.dx += s.vx * fdt; s.r = Math.max(0.6, s.r - fdt * 0.25);
                        (s.trail ||= []).push({ dx: s.dx, a: 0.5 }); if (s.trail.length > 40) s.trail.shift();
                        list.forEach(o => { if (o !== s && !o.slide && Math.abs(o.dx - s.dx) < (o.r + s.r) * 1.2) { s.r = Math.hypot(s.r, o.r); o.gone = true; } });
                        if (s.dx < -3 || s.dx > w + 3) { dropOff(g, s, s.slide * 40); s.gone = true; }
                    }
                    s.trail?.forEach(t => t.a -= fdt * 0.6);
                    if (s.wob > 0) moving = true;
                }
                for (let k = list.length - 1; k >= 0; k--) if (list[k].gone) list.splice(k, 1);
                list.forEach(s => {
                    s.trail?.forEach(t => { if (t.a <= 0) return; ctx.globalAlpha = t.a; ctx.fillStyle = dropColor(); ctx.fillRect(g.x0 + t.dx - 0.6, g.top - 0.9, 1.2, 0.9); });
                    ctx.globalAlpha = 1;
                    const wob = s.wob > 0 ? Math.sin(now * 32) * 0.22 * s.wob : 0; s.wob = Math.max(0, (s.wob || 0) - fdt * 2.2);
                    const flat = 1.15 - 0.4 * Math.min(1, s.r / big);
                    const rx = s.r * 1.5 * (1 + wob) * (s.slide ? 1.3 : 1), ry = s.r * flat * (1 - wob) * (s.slide ? 0.8 : 1), x = g.x0 + s.dx;
                    ctx.fillStyle = dropColor(); ctx.beginPath(); ctx.ellipse(x, g.top, rx, ry, 0, Math.PI, 2 * Math.PI); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = light ? 'rgba(50,90,160,.45)' : 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.6; ctx.stroke();
                    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.35, g.top - ry * 0.6, Math.max(0.35, rx * 0.2), Math.max(0.3, ry * 0.16), -0.4, 0, 6.29); ctx.fill();
                });
                return;
            }

            let changed = false;
            for (let k = list.length - 1; k >= 0; k--) {
                const s = list[k];
                s.age += age;
                if (s.settle > 0) {   // 着地した後、少しすべってから落ち着く
                    moving = true;
                    s.settle = Math.max(0, s.settle - fdt * 2.2); s.dx += s.vx * fdt; s.vx *= Math.pow(0.03, fdt);
                    if (!s.hang && (s.dx < 3 || s.dx > w - 3)) hang(s, w);
                    if (s.dx < -10 || s.dx > w + 10) { dropOff(g, s, s.vx, 0); list.splice(k, 1); changed = true; continue; }
                    if (!s.hang) s.lift = restOn(list.slice(0, k), s);
                }
                if (Math.abs(s.rest - s.rot) > 0.01) { s.rot += (s.rest - s.rot) * Math.min(1, fdt * 7); moving = true; }
                if (blowing > 0.2) {
                    const top = k === list.length - 1 || s.lift > 0, weight = s.kind === 'spring' ? 1 : 0.5;
                    if (top && Math.random() < fdt * blowing * 1.5 * weight) { s.vx = gust.dir * (8 + Math.random() * 18); s.settle = 0.5; s.rest += (Math.random() - 0.5) * 0.8; }
                    if (s.age > s.life || (s.hang && Math.random() < fdt * blowing * 0.15)) { dropOff(g, s, gust.dir * 60, -40); list.splice(k, 1); changed = true; continue; }
                }
            }
            if (changed) relayer(list);
            list.forEach((s, k) => {
                const flutter = blowing * Math.sin(now * 13 + k * 1.7) * (s.kind === 'spring' ? 0.25 : 0.12) * (s.lift > 0 || s.hang ? 1 : 0.4);
                const curl = s.kind === 'autumn' ? 1 - Math.min(0.4, s.age * 0.4) : 0.85;   // 葉は時間がたつと丸まる
                const y = s.hang ? g.top - 0.5 : g.top - s.lift - thick(s) * 0.5;
                drawShape(s.kind, s.v, g.x0 + s.dx, y, s.r, s.rot + flutter, agedColor(s), curl);
            });
        });
        // 夏の夜（暗いテーマ）はホタル
        if (kind === 'summer' && !light && (playing || !S.onlyPlaying)) {
            moving = true;
            for (let k = 0; k < 4; k++) {
                const x = clip.x0 + ((clip.x1 - clip.x0) * (0.12 + k * 0.24) + Math.sin(now * 0.4 + k) * 40), y = stripH * 0.35 + Math.sin(now * 0.7 + k * 2) * 8;
                ctx.globalAlpha = 0.3 + 0.3 * Math.sin(now * 2 + k); ctx.fillStyle = '#d8ff8a'; ctx.shadowColor = '#d8ff8a'; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.29); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.globalAlpha = 1;
            }
        }
        return moving;
    }

    // ---------- 毎フレーム ----------
    let wasMoving = true;
    function frame(dt) {
        if ((seasonCheckT += dt) > 60) { seasonCheckT = 0; const k = currentKind(); if (k !== kind) { kind = k; clearAll(); } }
        const falling = !S.onlyPlaying || playing;
        // 何も動いていない時は 0.5 秒に 1 回だけ描き直す（CPU を使わない）
        if (!falling && !flakes.length && !chunks.length && !wasMoving && !needMeasure) {
            if ((idleT += dt) < 0.5) return;
        }
        idleT = 0;
        // ▼ 修正：パネルの開閉やタブの出入りのアニメーション中に測ると、終わった後も古い位置のままずれていた。
        //   描くたびに測り直す（タブの数だけ位置を読むだけなので軽い）
        measure();
        fdt = dt;
        if (falling) {
            const n = S.rate * SEASON[kind].spawn * tempo() * dt * ((clip.x1 - clip.x0) / 900);
            for (let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); k > 0; k--) spawn(clip.x0 + Math.random() * (clip.x1 - clip.x0), -4);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const s = SEASON[kind];
        for (let i = flakes.length - 1; i >= 0; i--) {
            const f = flakes[i];
            f.ph += dt * 1.6 * tempo(); f.y += f.vy * dt; f.x += Math.sin(f.ph) * s.sway * dt; f.rot += f.vr * dt;
            const g = tabAt(f.x);
            if (g) {
                const p = piles.get(g.id), j = Math.round((f.x - g.x0) / 2);
                const surface = g.top - (kind === 'winter' && p ? (p.h[j] || 0) : 0);
                if (f.y >= surface && f.y - f.vy * dt < surface + 2) { land(f, g); flakes.splice(i, 1); continue; }
            }
            if (f.y > stripH + 2) { flakes.splice(i, 1); continue; }   // タブバーより下には降らせない
            drawParticle(f, 1);
        }
        ctx.save(); ctx.beginPath(); ctx.rect(clip.x0 - 14, 0, clip.x1 - clip.x0 + 28, H); ctx.clip();
        wasMoving = drawPiles();
        ctx.restore();
        for (let i = chunks.length - 1; i >= 0; i--) {
            const c = chunks[i];
            if (c.ttl != null && (c.ttl -= dt) <= 0) { chunks.splice(i, 1); continue; }
            const leafy = c.shape === 'spring' || c.shape === 'autumn';
            c.vy += (leafy ? 220 : 900) * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
            if (leafy) c.vx += Math.sin(c.rot) * 40 * dt;
            c.life = Math.max(0, 1 - Math.max(0, c.y - stripH) / Math.max(8, H - stripH));   // ページの手前で消える
            if (c.life <= 0 || c.y > H) { chunks.splice(i, 1); continue; }
            drawParticle(c, c.life);
        }
    }

    // ---------- 出来事 ----------
    FX.on('music', ({ playing: p }) => { playing = p; });
    FX.on('tempo', ({ factor }) => { tempoF = factor; });
    FX.on('theme', ({ light: l }) => { light = l; });
    FX.on('tabs-changed', () => { needMeasure = true; });
    FX.on('lyric-line', ({ text }) => {
        if (!running || !S.lyricFlake || !playing || !text) return;
        const el = document.querySelector('#ts-tabs .ts-tab.active');
        const g = el && geo.find(x => x.id === el.dataset.id);
        if (g) spawn(g.x0 + (g.x1 - g.x0) * (0.3 + Math.random() * 0.4), -6, true);
    });
    // つかんだ瞬間に半分ほど崩れ、動かしている間も速さに合わせて少しずつ落ちる
    FX.on('tab-drag-start', ({ id }) => { if (running) { measure(); crumble(id, 0.5, 0); needMeasure = true; } });
    FX.on('tab-drag-move', ({ id, vx }) => {
        if (!running) return;
        measure();
        const frac = Math.min(0.6, Math.abs(vx) / 2500);
        if (frac > 0.02) crumble(id, frac, vx * 0.5);
        wasMoving = true;
    });
    FX.on('tab-close', ({ id }) => { if (running) { measure(); crumble(id, 1); piles.delete(id); stuck.delete(id); needMeasure = true; } });
    FX.on('window-shake', ({ strength, dir }) => { if (running) { measure(); crumble(null, 0.25 + 0.25 * strength, dir * 300); } });
    window.addEventListener('resize', () => { needMeasure = true; });
    // アニメーションが終わった時も、止まっている間の描き直し（0.5 秒ごと）を待たずに測り直す
    ['transitionend', 'animationend'].forEach(ev => document.addEventListener(ev, () => { needMeasure = true; idleT = 1; }, true));

    FX.register({
        id: 'season',
        name: '季節の演出',
        description: 'タブバーに雪・桜・雨・落ち葉が降って、タブの上に少しずつ積もります。タブを動かす・閉じると落ちます',
        group: 'タブバー',
        kind: 'canvas',
        defaultEnabled: true,
        available: () => document.body.classList.contains('layout-top'),
        unavailableNote: 'タブを上に並べている時だけ使えます（設定 → Layout）',
        settings: [
            { key: 'season', type: 'select', label: '季節', default: 'auto', options: [['auto', '自動'], ['winter', '冬・雪'], ['spring', '春・桜'], ['summer', '夏・雨'], ['autumn', '秋・落ち葉']] },
            { key: 'hemisphere', type: 'select', label: '住んでいる地域（自動の時）', default: 'north', options: [['north', '北半球'], ['south', '南半球']], when: (s) => s.season === 'auto' },
            { key: 'rate', type: 'range', label: '降る量', min: 2, max: 40, step: 1, default: 12, format: (v) => `${v} / 秒` },
            { key: 'minutes', type: 'select', label: '上限まで積もる時間', default: 60, options: [[15, '15 分'], [30, '30 分'], [60, '1 時間'], [120, '2 時間'], [0, '積もらない']] },
            { key: 'size', type: 'range', label: '粒の大きさ', min: 0.6, max: 2, step: 0.1, default: 1, format: (v) => '× ' + Number(v).toFixed(1) },
            { key: 'max', type: 'range', label: '積もる高さの上限', min: 2, max: 10, step: 1, default: 6, unit: ' px' },
            { key: 'onlyPlaying', type: 'toggle', label: '音楽の再生中だけ降らせる', sub: 'オフにすると、いつも降ります（積もった分は止めても残ります）', default: true },
            { key: 'tempo', type: 'toggle', label: '曲の速さに合わせる', sub: '歌詞の行が変わる間隔から速さを推定します', default: true },
            { key: 'lyricFlake', type: 'toggle', label: '歌詞の行が変わるとひとひら落とす', default: true },
            { key: 'fill', type: 'action', label: '今すぐ積もらせる（確認用）' },
            { key: 'clear', type: 'action', label: '払い落とす' },
        ],
        start(s) {
            S = s; kind = currentKind(); running = true; light = FX.isLight(); playing = FX.music.playing;
            cv.style.display = 'block'; needMeasure = true; wasMoving = true;
            FX.addTicker(frame);
        },
        stop() {
            running = false; FX.removeTicker(frame);
            flakes.length = 0; chunks.length = 0; clearAll();
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none';
        },
        update(s) {
            const old = kind; S = s; kind = currentKind();
            if (kind !== old) { flakes.length = 0; clearAll(); }
            wasMoving = true;
        },
        onAction(key) { if (key === 'fill') fill(); if (key === 'clear') { measure(); crumble(null, 1); } },
    });
})();
