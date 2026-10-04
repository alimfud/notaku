// motion.js — lapisan animasi global NotaKu (terinspirasi animasi mikro pada video referensi).
//
// Tidak mengubah logika halaman. Semua halaman, sheet, dan dialog otomatis
// mendapat animasi lewat MutationObserver + event delegation:
// 1. Elemen halaman muncul berurutan (stagger) + arah geser mengikuti navigasi.
// 2. Elemen di bawah layar baru muncul saat di-scroll (IntersectionObserver).
// 3. Efek riak (ripple) saat tombol/kartu/baris disentuh.
// 4. Angka ringkasan menghitung naik dari 0.
// 5. Judul topbar bergeser masuk, isi sheet muncul berurutan.
// Semua dimatikan otomatis bila perangkat memakai "reduce motion".
// Gaya animasinya ada di css/motion.css.

const reduceMq = window.matchMedia('(prefers-reduced-motion:reduce)');
const reduced = () => reduceMq.matches;

// Elemen halaman yang dianimasikan saat halaman dibuka (hanya yang paling luar).
const TARGETS = [
  '.summary-card', '.info-card', '.total-box', '.row', '.settings-tile', '.chip-scroll', '.search-row',
  '.section-title', '.empty-state', '.btn', '.field', '.field-radio', '.item-line', '.payment-badge',
  '.dashboard-hero', '.dashboard-section', '.dashboard-shortcuts > *', '.dashboard-attention-item',
  '.business-chart', '.reports-metric', '.reports-overall-metric', '.reports-product-card',
  '.reports-month-row', '.reports-year-card', '.reports-view-tabs', '.reports-period-picker',
  '.customer-card', '.expense-summary', '.expense-row', '.expense-list-heading',
  '.sale-form-card', '.sale-items-card', '.sale-product-card', '.sale-schedule-card',
  '.sale-edit-details-card', '.sale-detail-actions', '.sale-detail-receipt-wrap',
  '.sale-detail-payment-row', '.products-heading', '.customers-heading',
  '.settings-section', '.settings-heading', '.theme-switch',
].join(',');

// Setelah halaman selesai dibuka, hanya elemen daftar ini yang dianimasikan
// ulang (mis. saat hasil pencarian/filter berubah), dengan animasi singkat.
const LATE = [
  '.row', '.item-line', '.customer-card', '.expense-row', '.reports-product-row',
  '.reports-month-row', '.sale-customer-card', '.dashboard-attention-item', '.empty-state', '.info-card',
].join(',');

// Angka yang dihitung naik dari 0.
const COUNT = [
  '.summary-value', '.dashboard-revenue', '.expense-summary strong',
  '.reports-metric > div:nth-child(2)', '.reports-overall-metric > div:nth-child(2)',
  '.reports-month-value', '.reports-year-value', '.total-row.grand > :last-child',
  '.sale-checkout-total',
].join(',');

// Elemen yang memberi riak saat disentuh.
const RIPPLE = [
  'button', 'a[href]', '[role="button"]', '.row', '.settings-tile', '.chip', '.field-radio',
  '.customer-card', '.reports-year-card', '.reports-month-row', '.sale-product-card',
  '.sale-customer-card', '.dashboard-attention-item', '.drawer-item',
].join(',');

// Urutan menu untuk menentukan arah geser antarhalaman.
const RANK = { dashboard: 0, home: 1, sale: 2, products: 3, customers: 4, expenses: 4, reports: 4, settings: 5 };

let started = false;

function routeInfo() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { rank: RANK[parts[0] || 'dashboard'] ?? 0, depth: parts.length };
}

export function initMotion() {
  if (started) return;
  started = true;

  const root = document.getElementById('pageRoot');
  if (!root) return;

  let prev = routeInfo();
  let entranceUntil = performance.now() + 1400; // buka aplikasi pertama kali
  const seen = new WeakSet();
  const seenCount = new WeakSet();

  // ---------- Arah geser mengikuti navigasi ----------
  window.addEventListener('hashchange', () => {
    const cur = routeInfo();
    let dir = 0;
    if (cur.depth > prev.depth) dir = 1;
    else if (cur.depth < prev.depth) dir = -1;
    else dir = Math.sign(cur.rank - prev.rank);
    root.style.setProperty('--mo-dx', `${dir * 22}px`);
    prev = cur;
    entranceUntil = performance.now() + 900;
  });

  // ---------- Menjalankan satu animasi lalu membersihkannya ----------
  function play(el, cls) {
    el.classList.add(cls);
    const clean = () => {
      el.classList.remove(cls);
      el.style.animationDelay = '';
    };
    el.addEventListener('animationend', (e) => { if (e.target === el) clean(); }, { once: false });
    setTimeout(clean, 2200); // jaring pengaman
  }

  // ---------- Muncul saat di-scroll ----------
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        if (!el.classList.contains('mo-pending')) return;
        el.classList.remove('mo-pending');
        play(el, 'mo-in-fast');
      });
    }, { rootMargin: '0px 0px -4% 0px' })
    : null;

  function holdUntilVisible(el) {
    el.classList.add('mo-pending');
    io.observe(el);
    setTimeout(() => { // jaring pengaman: jangan pernah tersembunyi selamanya
      if (el.classList.contains('mo-pending')) { el.classList.remove('mo-pending'); io.unobserve(el); }
    }, 3500);
  }

  // ---------- Angka menghitung naik ----------
  function countUp(el) {
    if (reduced() || seenCount.has(el) || el.children.length) return;
    const node = el.firstChild;
    if (!node || node.nodeType !== 3) return;
    const orig = node.nodeValue;
    const m = orig.trim().match(/^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/);
    if (!m) return;
    const target = parseInt(m[2].replace(/\./g, ''), 10);
    if (!(target >= 10) || target > 1e12) return;
    seenCount.add(el);
    const lead = orig.match(/^\s*/)[0];
    const trail = orig.match(/\s*$/)[0];
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const dur = Math.min(1100, 520 + String(target).length * 60);
    const start = performance.now();
    el.classList.add('mo-counting');
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      node.nodeValue = t < 1 ? lead + m[1] + fmt(Math.round(target * e)) + m[3] + trail : orig;
      if (t < 1) requestAnimationFrame(step);
      else el.classList.remove('mo-counting');
    };
    requestAnimationFrame(step);
  }

  // ---------- Elemen baru di halaman ----------
  function handleAdded(nodes) {
    if (reduced()) return;
    const found = new Set();
    const counters = [];
    nodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(TARGETS)) found.add(n);
      n.querySelectorAll(TARGETS).forEach((e) => found.add(e));
      if (n.matches(COUNT)) counters.push(n);
      n.querySelectorAll(COUNT).forEach((e) => counters.push(e));
    });

    const inEntrance = performance.now() < entranceUntil;
    let i = 0;
    let lateCount = 0;
    found.forEach((el) => {
      if (seen.has(el)) return;
      // hanya elemen terluar yang dianimasikan (anak ikut bergerak bersamanya)
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (found.has(p)) return;
      }
      seen.add(el);
      if (!inEntrance && !el.matches(LATE)) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (io && r.top > window.innerHeight - 24) { holdUntilVisible(el); return; }
      if (inEntrance) {
        el.style.animationDelay = `${Math.min(i++, 12) * 45}ms`;
        play(el, 'mo-in');
      } else if (lateCount++ < 24) {
        play(el, 'mo-in-fast');
      }
    });

    counters.forEach(countUp);
  }

  new MutationObserver((records) => {
    const added = [];
    records.forEach((r) => r.addedNodes.forEach((n) => added.push(n)));
    if (added.length) handleAdded(added);
  }).observe(root, { childList: true, subtree: true });

  // ---------- Isi sheet muncul berurutan ----------
  new MutationObserver((records) => {
    if (reduced()) return;
    records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1 || !n.classList.contains('sheet-backdrop')) return;
      const kids = n.querySelectorAll('.sheet-body > *');
      kids.forEach((el, idx) => {
        if (idx > 9) return;
        el.style.animationDelay = `${110 + idx * 40}ms`;
        play(el, 'mo-in-sheet');
      });
    }));
  }).observe(document.body, { childList: true });

  // ---------- Judul topbar ----------
  const title = document.getElementById('pageTitle');
  if (title) {
    new MutationObserver(() => {
      if (reduced()) return;
      title.classList.remove('mo-title');
      void title.offsetWidth;
      title.classList.add('mo-title');
    }).observe(title, { childList: true, characterData: true, subtree: true });
  }

  // ---------- Riak saat disentuh ----------
  document.addEventListener('pointerdown', (e) => {
    if (reduced() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target.closest ? e.target.closest(RIPPLE) : null;
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    if (t.closest('.receipt, #receiptCapture')) return;
    const rect = t.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cs = getComputedStyle(t);

    const layer = document.createElement('span');
    layer.className = 'mo-ripple-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`
      + `border-radius:${cs.borderRadius};color:${cs.color};`;

    const size = Math.min(640, Math.max(rect.width, rect.height) * 2.2);
    const dot = document.createElement('span');
    dot.className = 'mo-ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;`
      + `top:${e.clientY - rect.top - size / 2}px;`;
    layer.appendChild(dot);
    document.body.appendChild(layer);

    const kill = () => layer.remove();
    dot.addEventListener('animationend', kill, { once: true });
    window.addEventListener('scroll', kill, { once: true, capture: true, passive: true });
    window.addEventListener('pointercancel', kill, { once: true });
    setTimeout(kill, 900);
  }, { passive: true });
}
