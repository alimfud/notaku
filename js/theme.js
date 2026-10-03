// theme.js — pilihan tema tampilan: "light" (maroon asli), "dark" (Neo), "glass" (kaca biru).
// Pilihan disimpan per perangkat di localStorage agar bisa diterapkan sebelum
// halaman tampil (tanpa kedip). Tidak menyentuh data usaha / IndexedDB.
const STORAGE_KEY = 'notaku-theme';
const THEMES = ['light', 'dark', 'glass'];
const THEME_LABEL = { light: 'Terang', dark: 'Gelap', glass: 'Glass' };
const THEME_ICON = { light: '☀️', dark: '🌙', glass: '💎' };
const THEME_COLOR = { light: '#791e38', dark: '#1b2354', glass: '#bcd9f2' };
// Stylesheet tambahan per tema (tema "light" tidak butuh tambahan).
const THEME_LINK = { dark: 'themeNeo', glass: 'themeGlass' };

export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'dark';
  } catch { return 'dark'; }
}

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.dataset.theme = t;
  Object.entries(THEME_LINK).forEach(([name, id]) => {
    const link = document.getElementById(id);
    if (link) link.media = t === name ? 'all' : 'not all';
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[t];
  syncThemeControls();
}

export function setTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'light';
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* penyimpanan dinonaktifkan */ }
  applyTheme(t);
}

// Ganti ke tema berikutnya: Terang → Gelap → Glass → Terang.
export function cycleTheme() {
  setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]);
}

// Perbarui tampilan semua kontrol tema yang sedang ada di layar.
function syncThemeControls() {
  const t = getTheme();
  const drawerBtn = document.getElementById('btnDrawerTheme');
  if (drawerBtn) drawerBtn.textContent = `${THEME_ICON[t]} Tema: ${THEME_LABEL[t]}`;
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    const active = btn.dataset.themeChoice === t;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// Dipakai halaman Setting: sambungkan tombol pilihan tema di dalam `root`.
export function bindThemeSwitch(root) {
  root.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.onclick = () => setTheme(btn.dataset.themeChoice);
  });
  syncThemeControls();
}

export function initTheme() {
  applyTheme(getTheme());
  const drawerBtn = document.getElementById('btnDrawerTheme');
  if (drawerBtn) {
    drawerBtn.addEventListener('click', () => {
      cycleTheme();
      document.getElementById('drawerOverlay')?.click(); // tutup drawer
    });
  }
  // Sinkron antar tab/jendela.
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) applyTheme(getTheme()); });
}
