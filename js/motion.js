// motion.js — animasi TEKS NotaKu.
//
// Hanya teks yang beranimasi (tidak ada kartu, tombol, sheet, atau riak):
// 1. Teks halaman muncul berurutan (naik + memudar), arah geser mengikuti navigasi.
// 2. Teks di dalam sheet/dialog muncul berurutan saat dibuka.
// 3. Angka ringkasan (omzet, total, dll) menghitung naik dari 0.
// 4. Judul topbar bergeser masuk saat berganti halaman.
// Tidak mengubah logika halaman. Dimatikan otomatis bila perangkat memakai
// "reduce motion". Gaya ada di css/motion.css.

const reduceMq = window.matchMedia('(prefers-reduced-motion:reduce)');
const reduced = () => reduceMq.matches;

// Angka yang dihitung naik dari 0.
const COUNT = [
  '.summary-value', '.dashboard-revenue', '.expense-summary strong',
  '.reports-metric > div:nth-child(2)', '.reports-overall-metric > div:nth-child(2)',
  '.reports-month-value', '.reports-year-value', '.total-row.grand > :last-child',
  '.sale-checkout-total',
].join(',');

// Setelah halaman selesai dibuka, teks di dalam daftar ini tetap dianimasikan
// singkat saat berubah (mis. hasil pencarian/filter).
const LATE = [
  '.row', '.item-line', '.customer-card', '.expense-row', '.reports-product-row',
  '.reports-month-row', '.sale-customer-card', '.dashboard-attention-item', '.empty-state', '.info-card',
].join(',');

// Teks di area ini tidak disentuh (struk/cetak harus tetap utuh).
const SKIP = '.receipt, #receiptCapture, .print-preview-wrap, svg, script, style, textarea, select, option, input, canvas, [contenteditable]';

// Urutan menu untuk menentukan arah geser antarhalaman.
const RANK = { dashboard: 0, home: 1, sale: 2, products: 3, customers: 4, expenses: 4, reports: 4, settings: 5 };

let started = false;

function routeInfo() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { rank: RANK[parts[0] || 'dashboard'] ?? 0, depth: parts.length };
}

// Kumpulkan elemen yang punya teks langsung di dalam `nodes`.
function collectTextParents(nodes) {
  const out = new Set();
  nodes.forEach((n) => {
    if (n.nodeType === 3) {
      if (n.nodeValue.trim() && n.parentElement) out.add(n.parentElement);
      return;
    }
    if (n.nodeType !== 1) return;
    const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      if (t.nodeValue.trim() && t.parentElement) out.add(t.parentElement);
    }
  });
  return out;
}

function playText(el, delay, fast) {
  el.style.animationDelay = `${delay}ms`;
  el.classList.add(fast ? 'mo-text-fast' : 'mo-text');
  const clean = () => {
    el.classList.remove('mo-text', 'mo-text-fast');
    el.style.animationDelay = '';
  };
  el.addEventListener('animationend', (e) => { if (e.target === el) clean(); });
  setTimeout(clean, 2000); // jaring pengaman
}

export function initMotion() {
  if (started) return;
  started = true;

  const root = document.getElementById('pageRoot');
  if (!root) return;

  let prev = routeInfo();
  let entranceUntil = performance.now() + 1400; // buka aplikasi pertama kali
  const seenCount = new WeakSet();

  // ---------- Arah geser mengikuti navigasi ----------
  window.addEventListener('hashchange', () => {
    const cur = routeInfo();
    let dir = 0;
    if (cur.depth > prev.depth) dir = 1;
    else if (cur.depth < prev.depth) dir = -1;
    else dir = Math.sign(cur.rank - prev.rank);
    root.style.setProperty('--mo-dx', `${dir * 14}px`);
    prev = cur;
    entranceUntil = performance.now() + 900;
  });

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

  // ---------- Teks baru di halaman ----------
  function handleAdded(nodes, { baseDelay = 0, forceEntrance = false } = {}) {
    if (reduced()) return;
    const inEntrance = forceEntrance || performance.now() < entranceUntil;
    const counters = [];
    nodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(COUNT)) counters.push(n);
      n.querySelectorAll(COUNT).forEach((e) => counters.push(e));
    });

    let i = 0;
    let lateCount = 0;
    collectTextParents(nodes).forEach((el) => {
      if (el.closest(SKIP) || el.matches(COUNT) || el.classList.contains('mo-text')) return;
      if (!inEntrance && !el.closest(LATE)) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.bottom < 0 || r.top > window.innerHeight) return; // di luar layar: tidak perlu
      if (inEntrance) playText(el, baseDelay + Math.min(i++, 26) * 30, false);
      else if (lateCount++ < 40) playText(el, 0, true);
    });

    counters.forEach(countUp);
  }

  new MutationObserver((records) => {
    const added = [];
    records.forEach((r) => {
      if (r.type === 'characterData') { if (r.target.parentElement) added.push(r.target); return; }
      r.addedNodes.forEach((n) => added.push(n));
    });
    if (added.length) handleAdded(added);
  }).observe(root, { childList: true, subtree: true });

  // ---------- Teks di sheet / dialog ----------
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1 || !(n.classList.contains('sheet-backdrop') || n.classList.contains('dialog-backdrop'))) return;
      handleAdded([n], { baseDelay: 90, forceEntrance: true });
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
}
