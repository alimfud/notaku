// pages/home.js

import { getAllSaleSummaries } from '../services/saleService.js';
import { rupiah, dateShort, initials, escapeHtml, todayDbDate } from '../format.js';
import { STATUS_LABEL, resolveStatus } from '../services/saleCalculation.js';
import { navigate, setTopbarActions, setPageTitle } from '../app.js';

let _search = '';
let _filter = 'all'; // all | today | week | month

export async function render(root) {
  setPageTitle('NotaKu');
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
    <div id="notaList" class="list"></div>
    <button class="fab" id="fabNew" aria-label="Buat nota baru">+</button>
  `;

  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.f === _filter);
    c.onclick = () => { _filter = c.dataset.f; renderList(root); };
  });

  let debounce;
  root.querySelector('#searchInput').oninput = (e) => {
    _search = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => renderList(root), 150);
  };

  root.querySelector('#fabNew').onclick = () => navigate('sale/new');

  await renderList(root);
}

async function renderList(root) {
  const today = todayDbDate();
  let dateFrom = null, dateTo = null;
  if (_filter === 'today') { dateFrom = dateTo = today; }
  else if (_filter === 'week') {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - (day - 1));
    dateFrom = monday.toISOString().slice(0, 10);
    dateTo = today;
  } else if (_filter === 'month') {
    dateFrom = today.slice(0, 8) + '01';
    dateTo = today;
  }

  const summaries = await getAllSaleSummaries({ search: _search, dateFrom, dateTo });
  const todaySummaries = await getAllSaleSummaries({ dateFrom: today, dateTo: today });
  const todayRevenueAll = todaySummaries.reduce((s, x) => s + x.sale.total, 0);
  const todayCountAll = todaySummaries.length;

  root.querySelector('#summaryCard').innerHTML = `
    <div class="summary-block">
      <div class="summary-label">Omzet Hari Ini</div>
      <div class="summary-value">${rupiah(todayRevenueAll)}</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-block" style="flex:0;">
      <div class="summary-label">Transaksi</div>
      <div class="summary-value">${todayCountAll}</div>
    </div>
  `;

  const listEl = root.querySelector('#notaList');
  if (!summaries.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M5 3h14v18l-3.5-2.2L12 21l-3.5-2.2L5 21V3z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <p>Belum ada nota.<br>Ketuk tombol + untuk membuat nota pertama.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = summaries.map((s) => {
    const status = resolveStatus(s.sale.total, s.paidAmount);
    const colorVar = { PAID: 'var(--status-lunas)', PARTIAL: 'var(--status-partial)', OVERPAID: 'var(--status-overpaid)', UNPAID: 'var(--status-unpaid)' }[status];
    return `
      <button class="row" data-id="${s.sale.id}">
        <div class="avatar">${initials(s.sale.customerName)}</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(s.sale.customerName)}</div>
          <div class="row-meta">${dateShort(s.sale.saleDate)} • ${s.sale.saleTime} • ${escapeHtml(s.sale.invoiceNumber)}</div>
        </div>
        <div class="row-trailing">
          <div class="row-money">${rupiah(s.sale.total)}</div>
          <div class="row-status" style="color:${colorVar}">${STATUS_LABEL[status]}</div>
        </div>
      </button>`;
  }).join('');

  listEl.querySelectorAll('.row').forEach((r) => {
    r.onclick = () => navigate(`sale/${r.dataset.id}`);
  });
}
