// motion.js — animasi angka NotaKu.
//
// Animasi teks sengaja tidak dipakai supaya perpindahan konten terasa instan.
// Yang tersisa hanya angka ringkasan (omzet, total, dll) menghitung naik dari 0.
// Dimatikan otomatis bila perangkat memakai "reduce motion".

const reduceMq = window.matchMedia('(prefers-reduced-motion:reduce)');
const reduced = () => reduceMq.matches;

// Angka yang dihitung naik dari 0.
const COUNT = [
  '.summary-value', '.dashboard-revenue', '.expense-summary strong',
  '.reports-metric > div:nth-child(2)', '.reports-overall-metric > div:nth-child(2)',
  '.reports-month-value', '.reports-year-value', '.total-row.grand > :last-child',
  '.sale-checkout-total',
].join(',');

// Teks di area ini tidak disentuh (struk/cetak harus tetap utuh).
const SKIP = '.receipt, #receiptCapture, .print-preview-wrap, svg, script, style, textarea, select, option, input, canvas, [contenteditable]';

let started = false;

export function initMotion() {
  if (started) return;
  started = true;

  const root = document.getElementById('pageRoot');
  if (!root) return;

  const seenCount = new WeakSet();

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

  function handleAdded(nodes) {
    if (reduced()) return;
    const counters = [];
    nodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.closest(SKIP)) return;
      if (n.matches(COUNT)) counters.push(n);
      n.querySelectorAll(COUNT).forEach((e) => counters.push(e));
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

  // ---------- Angka di sheet / dialog ----------
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1 || !(n.classList.contains('sheet-backdrop') || n.classList.contains('dialog-backdrop'))) return;
      handleAdded([n]);
    }));
  }).observe(document.body, { childList: true });
}
