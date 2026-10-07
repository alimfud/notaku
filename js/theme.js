// theme.js — dua pilihan tema tampilan: "clay" (default) dan "dark" (Neo).
// Pilihan disimpan per perangkat di localStorage agar bisa diterapkan sebelum
// halaman tampil (tanpa kedip). Tidak menyentuh data usaha / IndexedDB.
const STORAGE_KEY = 'notaku-theme';
const THEMES = ['clay', 'dark'];
const DEFAULT_THEME = 'clay';
const THEME_COLOR = { dark: '#1b2354', clay: '#fbf0e0' };
// Stylesheet tambahan per tema.
const THEME_LINK = { dark: 'themeNeo', clay: 'themeClay' };

export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Nilai tema lama yang tersimpan di perangkat kembali ke Clay.
    return saved === 'dark' ? 'dark' : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : DEFAULT_THEME;
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
  const t = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* penyimpanan dinonaktifkan */ }
  applyTheme(t);
}

// Toggle satu tombol: Clay ↔ Neo.
export function cycleTheme() {
  setTheme(getTheme() === 'dark' ? 'clay' : 'dark');
}

// Perbarui tampilan semua kontrol tema yang sedang ada di layar.
function syncThemeControls() {
  const t = getTheme();
  const toggle = document.getElementById('btnThemeToggle');
  if (toggle) {
    const isNeo = t === 'dark';
    toggle.innerHTML = isNeo
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    toggle.setAttribute('aria-label', isNeo ? 'Gunakan tema Clay' : 'Gunakan tema Neo');
    toggle.title = isNeo ? 'Ganti ke tema Clay' : 'Ganti ke tema Neo';
  }
}

export function initTheme() {
  applyTheme(getTheme());
  const toggle = document.getElementById('btnThemeToggle');
  if (toggle) {
    // onclick menggantikan fallback inline pada index.html, sehingga tidak
    // terjadi toggle dua kali ketika JavaScript versi baru sudah termuat.
    toggle.onclick = cycleTheme;
  }
  // Sinkron antar tab/jendela.
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) applyTheme(getTheme()); });
}
