// ==========================================
// ★ テーマ（選択は localStorage に保存し、次回起動時も維持）
// ==========================================
// bg = [Nexus, Command Center, Canvas] の背景 / accent = [dark, base, light] のテーマ色
// 元からある 4 テーマは背景だけ変わる従来の見た目のまま。追加テーマはアクセント色も変わる。
const THEME_KEY = 'archyndium_theme';
const DEFAULT_ACCENT = ['#1A2D42', '#2E4156', '#AAB7B7'];

const THEMES = [
    { id: 'default',  name: 'Default Dark',     bg: ['#0A0A0C', '#121214', '#18181A'] },
    { id: 'navy',     name: 'Navy & Slate',     bg: ['#080C14', '#0F1520', '#151C28'] },
    { id: 'green',    name: 'Forest Green',     bg: ['#08120D', '#0E1A13', '#14221A'] },
    { id: 'purple',   name: 'Amethyst Purple',  bg: ['#100814', '#180E20', '#22152B'] },
    { id: 'oled',     name: 'OLED Black',       bg: ['#000000', '#050505', '#0A0A0A'], accent: ['#1C1C1E', '#3A3A3C', '#D1D1D6'] },
    { id: 'graphite', name: 'Graphite',         bg: ['#121316', '#1A1B1F', '#222328'], accent: ['#2B2E35', '#454A55', '#C5CAD3'] },
    { id: 'nord',     name: 'Nord Frost',       bg: ['#1B1F27', '#232833', '#2B313D'], accent: ['#3B4252', '#4C566A', '#88C0D0'] },
    { id: 'indigo',   name: 'Midnight Indigo',  bg: ['#090A16', '#0F1122', '#16182E'], accent: ['#22265A', '#353B87', '#A5ACF5'] },
    { id: 'ocean',    name: 'Ocean Teal',       bg: ['#061112', '#0B191B', '#102224'], accent: ['#0F3B3E', '#1B5E62', '#7FD6CF'] },
    { id: 'crimson',  name: 'Crimson Night',    bg: ['#12070A', '#1B0C10', '#241116'], accent: ['#4A1420', '#7A2335', '#F2A0AE'] },
    { id: 'sakura',   name: 'Sakura',           bg: ['#140A0F', '#1E1017', '#28151F'], accent: ['#4A2033', '#7A3A57', '#F5B5CF'] },
    { id: 'amber',    name: 'Sunset Amber',     bg: ['#130D06', '#1C140A', '#251B0F'], accent: ['#4A3210', '#7A5419', '#F2C27A'] },
];

let currentThemeId = 'default';

function applyTheme(id, { save = true } = {}) {
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    const root = document.documentElement;
    const [nexus, command, canvas] = theme.bg;
    const [dark, base, light] = theme.accent || DEFAULT_ACCENT;
    root.style.setProperty('--bg-nexus', nexus);
    root.style.setProperty('--bg-command', command);
    root.style.setProperty('--bg-canvas', canvas);
    root.style.setProperty('--theme-dark', dark);
    root.style.setProperty('--theme-base', base);
    root.style.setProperty('--theme-light', light);
    currentThemeId = theme.id;
    if (save) { try { localStorage.setItem(THEME_KEY, theme.id); } catch(e) {} }
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
        return `<div class="theme-card ${t.id === currentThemeId ? 'selected' : ''}" data-theme="${t.id}" title="${t.name}">
            <div class="theme-swatch" style="background: linear-gradient(135deg, ${t.bg[0]} 0 34%, ${t.bg[2]} 34% 67%, ${base} 67%);">
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
