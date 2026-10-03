// theme.js — pilihan tema tampilan: "light" (maroon asli) atau "dark" (Neo).
// Pilihan disimpan per perangkat di localStorage agar bisa diterapkan sebelum
// halaman tampil (tanpa kedip). Tidak menyentuh data usaha / IndexedDB.
const STORAGE_KEY = 'notaku-theme';
const THEME_COLOR = { light: '#791e38', dark: '#1b2354' };

export function getTheme() {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const neo = document.getElementById('themeNeo');
  if (neo) neo.media = t === 'dark' ? 'all' : 'not all';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[t];
  syncThemeControls();
}

export function setTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme === 'dark' ? 'dark' : 'light'); } catch { /* penyimpanan dinonaktifkan */ }
  applyTheme(theme);
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// Perbarui tampilan semua kontrol tema yang sedang ada di layar.
function syncThemeControls() {
  const t = getTheme();
  const drawerBtn = document.getElementById('btnDrawerTheme');
  if (drawerBtn) drawerBtn.textContent = t === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    const active = btn.dataset.themeChoice === t;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// Dipakai halaman Setting: sambungkan tombol Terang/Gelap di dalam `root`.
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
      toggleTheme();
      document.getElementById('drawerOverlay')?.click(); // tutup drawer
    });
  }
  // Sinkron antar tab/jendela.
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) applyTheme(getTheme()); });
}
