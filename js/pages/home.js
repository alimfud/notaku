// pages/home.js

import { getAllSaleSummaries, setCompleted } from '../services/saleService.js';
import { rupiah, dateShort, initials, escapeHtml, todayDbDate } from '../format.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { navigate, setTopbarActions, setPageTitle } from '../app.js';

let _search = '';
let _dateFilter = 'all';   // all | today | week | month
let _sortBy = 'pickup';    // pickup (tgl pengambilan) | created (tgl nota dibuat)
let _onlyIncomplete = true; // fokus ke yang belum selesai secara default

export async function render(root) {
  setPageTitle('Daftar Nota');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="summary-card" id="summaryCard"></div>
    <div class="search-row">
      <input class="search-input" id="searchInput" placeholder="Cari nama pelanggan / no. nota" value="${escapeHtml(_search)}">
    </div>
    <div class="chip-scroll">
      <button class="chip" data-f="all">Semua</button>
      <button class="chip" data-f="today">Hari Ini</button>
      <button class="chip" data-f="week">Minggu Ini</button>
      <button class="chip" data-f="month">Bulan Ini</button>
    </div>
    <div class="home-layout-1">
      <label class="home-layout-2">
        <input type="checkbox" id="onlyIncompleteToggle" ${_onlyIncomplete ? 'checked' : ''}>
        Proses
      </label>
      <select class="home-layout-3" id="sortSelect">
        <option value="pickup" ${_sortBy === 'pickup' ? 'selected' : ''}>Tgl Ambil</option>
        <option value="created" ${_sortBy === 'created' ? 'selected' : ''}>Tgl Dibuat</option>
      </select>
    </div>
    <div id="notaList" class="list"></div>
    <button class="fab" id="fabNew" aria-label="Buat nota baru">+</button>
  `;

  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.f === _dateFilter);
    c.onclick = () => { _dateFilter = c.dataset.f; renderList(root); };
  });

  let debounce;
  root.querySelector('#searchInput').oninput = (e) => {
    _search = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => renderList(root), 150);
  };

  root.querySelector('#onlyIncompleteToggle').onchange = (e) => { _onlyIncomplete = e.target.checked; renderList(root); };
  root.querySelector('#sortSelect').onchange = (e) => { _sortBy = e.target.value; renderList(root); };
  root.querySelector('#fabNew').onclick = () => navigate('sale/new');

  await renderList(root);
}

/**
 * PERFORMANCE FIX #3: Reduce redundant database queries
 * Sebelumnya: 2x getAllSaleSummaries() → 2x database query
 * Sesudah: 1x query, filter di memory → instant!
 * 
 * HOTFIX: Fetch semua data tanpa filter tanggal ketat untuk tidak menghilangkan data di masa depan
 */
async function renderList(root) {
  const today = todayDbDate();
  const monthStart = today.slice(0, 8) + '01';
  
  // ✅ Query SEKALI - ambil SEMUA nota (tanpa filter tanggal di level query)
  // Ini penting karena ada data di masa depan yang tidak boleh hilang
  const allMonthlySummaries = await getAllSaleSummaries({ 
    sortBy: _sortBy 
  });

  // Filter untuk display (berdasarkan _dateFilter, _search, _onlyIncomplete)
  const summaries = allMonthlySummaries.filter(s => {
    // Filter 1: onlyIncomplete
    if (_onlyIncomplete && s.sale.completed) {
      return false;
    }
    
    // Filter 2: Search
    if (_search.trim()) {
      const q = _search.trim().toLowerCase();
      const nameMatch = s.sale.customerName.toLowerCase().includes(q);
      const invoiceMatch = s.sale.invoiceNumber.toLowerCase().includes(q);
      if (!nameMatch && !invoiceMatch) {
        return false;
      }
    }
    
    // Filter 3: Date range based on _dateFilter
    if (_dateFilter === 'today') {
      return s.sale.saleDate === today;
    } else if (_dateFilter === 'week') {
      const now = new Date();
      const day = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day - 1));
      const weekStart = monday.toISOString().slice(0, 10);
      return s.sale.saleDate >= weekStart && s.sale.saleDate <= today;
    } else if (_dateFilter === 'month') {
      return s.sale.saleDate >= monthStart && s.sale.saleDate <= today;
    }
    
    // 'all' filter - show ALL data tanpa batasan tanggal (PENTING: jangan hapus data masa depan)
    return true;
  });

  // Filter untuk summary bulan (lebih sederhana karena sudah dalam range)
  const monthSummaries = allMonthlySummaries.filter(s =>
    s.sale.saleDate >= monthStart && s.sale.saleDate <= today
  );
  const monthRevenue = monthSummaries.reduce((s, x) => s + x.sale.total, 0);
  const monthCount = monthSummaries.length;

  root.querySelector('#summaryCard').innerHTML = `
    <div class="summary-block">
      <div class="summary-label">Omzet Bulan Ini</div>
      <div class="summary-value">${rupiah(monthRevenue)}</div>
    </div>
    <div class="summary-divider"></div>
    <div class="home-layout-4 summary-block">
      <div class="summary-label">Transaksi</div>
      <div class="summary-value">${monthCount}</div>
    </div>
  `;

  const listEl = root.querySelector('#notaList');
  if (!summaries.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M5 3h14v18l-3.5-2.2L12 21l-3.5-2.2L5 21V3z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <p>${_onlyIncomplete ? 'Tidak ada nota yang perlu dikerjakan. 🎉' : 'Belum ada nota.<br>Ketuk tombol + untuk membuat nota pertama.'}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = summaries.map((s) => {
    const status = s.displayStatus;
    const colorVar = { PAID: 'var(--status-lunas)', PARTIAL: 'var(--status-partial)', OVERPAID: 'var(--status-overpaid)', UNPAID: 'var(--status-unpaid)' }[status];
    const autoTag = s.sale.autoMarkedPaid ? ' <span class="home-layout-5">(otomatis)</span>' : '';
    const dateLabel = _sortBy === 'created'
      ? new Date(s.sale.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : `${dateShort(s.sale.saleDate)} • ${s.sale.saleTime}`;
    return `
      <button class="row" data-id="${s.sale.id}" style="opacity:${s.sale.completed ? 0.55 : 1};">
        <div class="avatar">${initials(s.sale.customerName)}</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(s.sale.customerName)}${s.sale.completed ? ' <span class="home-layout-6">SELESAI</span>' : ''}</div>
          <div class="row-meta"><span class="nota-date">${dateLabel}</span> <span class="nota-invoice">• ${escapeHtml(s.sale.invoiceNumber)}</span></div>
        </div>
        <div class="row-trailing">
          <div class="row-money">${rupiah(s.sale.total)}</div>
          <div class="row-status" style="color:${colorVar}">${STATUS_LABEL[status]}${autoTag}</div>
        </div>
      </button>`;
  }).join('');

  listEl.querySelectorAll('.row').forEach((r) => {
    r.onclick = () => navigate(`sale/${r.dataset.id}`);
  });
}
