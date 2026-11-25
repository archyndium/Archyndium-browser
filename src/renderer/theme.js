// ==========================================
// ★ テーマ（選択は localStorage に保存し、次回起動時も維持）
// ==========================================
// bg = [タブバー・左の列, サイドバー, ページの周り・選択中のタブ] の背景 / accent = [dark, base, light] のテーマ色
// ▼ 変更：上タブのレイアウトでは「タブバー（bg[0]）」と「選択中のタブ（bg[2]）」の差で今のタブを見分けるため、
//   どのテーマもこの 2 色の明るさの差（コントラスト比）が 1.3 以上になるように作っている。
//   以前の 12 テーマは差が 1.01〜1.15 しかなく見分けにくかったので、色を作り直し、似たもの同士はまとめた。
//   light: true のテーマは、文字色・重ねる色（--ink）などを明るい背景向けに切り替える。
const THEME_KEY = 'archyndium_theme';
const DEFAULT_ACCENT = ['#1A2D42', '#2E4156', '#AAB7B7'];

const THEMES = [
    // ▼ 追加：OS の設定（明るい / 暗い）に合わせて Default Light / Default Dark を自動で切り替える
    { id: 'system',   name: 'System',          system: true, bg: ['#0B0B0D', '#ECEEF1', '#FFFFFF'] },
    { id: 'default',  name: 'Default Dark',    bg: ['#0B0B0D', '#141417', '#2A2A30'] },
    // ▼ 追加：白い標準テーマ（色味の少ない、一般的なブラウザに近い明るさ）
    { id: 'light',    name: 'Default Light',   light: true, bg: ['#DADDE2', '#EEF0F3', '#FFFFFF'], accent: ['#3C4A5C', '#5A6A7E', '#2F5A8A'] },
    { id: 'graphite', name: 'Graphite',        bg: ['#101114', '#1A1B1F', '#30323A'], accent: ['#2B2E35', '#4A505C', '#C5CAD3'] },
    { id: 'navy',     name: 'Navy & Slate',    bg: ['#080D17', '#111826', '#222E43'] },
    { id: 'nord',     name: 'Nord Frost',      bg: ['#191D24', '#232833', '#363E4D'], accent: ['#3B4252', '#4C566A', '#88C0D0'] },
    { id: 'green',    name: 'Forest Green',    bg: ['#07100B', '#0F1B14', '#213629'], accent: ['#163828', '#25563D', '#8FD1A8'] },
    { id: 'purple',   name: 'Amethyst Purple', bg: ['#0E0813', '#181020', '#33243F'], accent: ['#34204A', '#523272', '#C9A8F0'] },
    { id: 'crimson',  name: 'Crimson Night',   bg: ['#110609', '#1C0D12', '#3E212C'], accent: ['#4A1420', '#7A2335', '#F2A0AE'] },
    { id: 'amber',    name: 'Sunset Amber',    bg: ['#110C06', '#1C150C', '#3A2C1C'], accent: ['#4A3210', '#7A5419', '#F2C27A'] },
    { id: 'dusk',     name: 'Dusk',            bg: ['#0F0F18', '#181826', '#2F2F46'], accent: ['#2E2E52', '#4A4A80', '#B9B9F2'] },
    // ▼ 追加：落ち着いたライトテーマ
    { id: 'paper',    name: 'Paper',           light: true, bg: ['#DAD4C9', '#EAE6DF', '#FBFAF7'], accent: ['#6E604D', '#8E7C63', '#6B5A44'] },
    { id: 'mist',     name: 'Mist',            light: true, bg: ['#D3DAE3', '#E5EAF0', '#F9FAFC'], accent: ['#465E7B', '#647F9F', '#3E5C80'] },
    { id: 'sage',     name: 'Sage',            light: true, bg: ['#D3DBCF', '#E5EBE2', '#F8FAF6'], accent: ['#506A4C', '#6E8B69', '#46624A'] },
];
// 削除・統合したテーマを選んでいた人は、近いテーマに移す
const THEME_MOVED = { oled: 'default', indigo: 'navy', ocean: 'green', sakura: 'crimson' };

// 暗いテーマ / 明るいテーマで切り替える共通の色
const THEME_MODE_VARS = {
    dark: {
        '--text-primary': '#EAEAEA', '--text-muted': '#8A8A8E', '--text-strong': '#FFFFFF', '--ink': '255, 255, 255',
        '--border-subtle': 'rgba(255, 255, 255, 0.06)', '--glass-bg': 'rgba(18, 18, 20, 0.85)', '--glass-border': 'rgba(255, 255, 255, 0.08)',
        '--bg-popover': '#161618', '--bg-popover-glass': 'rgba(18, 18, 20, 0.95)',
    },
    light: {
        '--text-primary': '#22252B', '--text-muted': '#6B707A', '--text-strong': '#111317', '--ink': '0, 0, 0',
        '--border-subtle': 'rgba(0, 0, 0, 0.08)', '--glass-bg': 'rgba(255, 255, 255, 0.85)', '--glass-border': 'rgba(0, 0, 0, 0.09)',
        '--bg-popover': '#FFFFFF', '--bg-popover-glass': 'rgba(255, 255, 255, 0.97)',
    },
};

let currentThemeId = 'default';

const systemDarkMQ = matchMedia('(prefers-color-scheme: dark)');
const resolveTheme = (theme) => theme.system ? THEMES.find(t => t.id === (systemDarkMQ.matches ? 'default' : 'light')) : theme;
// System を選んでいる時は、OS の設定が変わったらすぐに切り替える
systemDarkMQ.addEventListener?.('change', () => { if (currentThemeId === 'system') applyTheme('system', { save: false }); });

function applyTheme(id, { save = true } = {}) {
    const chosen = THEMES.find(t => t.id === (THEME_MOVED[id] || id)) || THEMES.find(t => t.id === 'default');
    const theme = resolveTheme(chosen);
    const root = document.documentElement;
    const [nexus, command, canvas] = theme.bg;
    const [dark, base, light] = theme.accent || DEFAULT_ACCENT;
    root.style.setProperty('--bg-nexus', nexus);
    root.style.setProperty('--bg-command', command);
    root.style.setProperty('--bg-canvas', canvas);
    root.style.setProperty('--theme-dark', dark);
    root.style.setProperty('--theme-base', base);
    root.style.setProperty('--theme-light', light);
    Object.entries(THEME_MODE_VARS[theme.light ? 'light' : 'dark']).forEach(([k, v]) => root.style.setProperty(k, v));
    root.classList.toggle('theme-light', !!theme.light);
    currentThemeId = chosen.id;
    if (save) { try { localStorage.setItem(THEME_KEY, chosen.id); } catch(e) {} }
    renderThemeList();
}

function applySavedTheme() {
    let id = 'default';
    try { id = localStorage.getItem(THEME_KEY) || 'default'; } catch(e) {}
    applyTheme(id, { save: false });
}

function renderThemeList() {
    const list = document.getElementById('theme-list');
    if (!list) return;
    list.innerHTML = THEMES.map(t => {
        const [, base, light] = t.accent || DEFAULT_ACCENT;
        const swatch = t.system ? 'linear-gradient(135deg, #0B0B0D 0 50%, #FFFFFF 50%)' : `linear-gradient(135deg, ${t.bg[0]} 0 34%, ${t.bg[2]} 34% 67%, ${base} 67%)`;
        return `<div class="theme-card ${t.id === currentThemeId ? 'selected' : ''}" data-theme="${t.id}" title="${t.system ? 'OS の設定（明るい / 暗い）に合わせる' : t.name}">
            <div class="theme-swatch" style="background: ${swatch};">
              <span class="theme-dot" style="background:${light}"></span>
            </div>
            <span class="theme-name">${t.name}</span>
          </div>`;
    }).join('');
}

document.getElementById('theme-list').addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (card) { e.stopPropagation(); applyTheme(card.getAttribute('data-theme')); }
});
