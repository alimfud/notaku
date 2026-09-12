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
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 10px;gap:10px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-soft);">
        <input type="checkbox" id="onlyIncompleteToggle" ${_onlyIncomplete ? 'checked' : ''}>
        Proses
      </label>
      <select id="sortSelect" style="font-size:12.5px;border:1px solid var(--outline);border-radius:8px;padding:6px 8px;background:var(--surface-dim);color:var(--ink);">
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

async function renderList(root) {
  const today = todayDbDate();
  let dateFrom = null, dateTo = null;
  if (_dateFilter === 'today') { dateFrom = dateTo = today; }
  else if (_dateFilter === 'week') {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - (day - 1));
    dateFrom = monday.toISOString().slice(0, 10);
    dateTo = today;
  } else if (_dateFilter === 'month') {
    dateFrom = today.slice(0, 8) + '01';
    dateTo = today;
  }

  const summaries = await getAllSaleSummaries({ search: _search, dateFrom, dateTo, sortBy: _sortBy, onlyIncomplete: _onlyIncomplete });

  // Ringkasan BULAN INI (bukan hari ini) — supaya pemilik toko langsung lihat progres bulanan.
  const monthStart = today.slice(0, 8) + '01';
  const monthSummaries = await getAllSaleSummaries({ dateFrom: monthStart, dateTo: today });
  const monthRevenue = monthSummaries.reduce((s, x) => s + x.sale.total, 0);
  const monthCount = monthSummaries.length;

  root.querySelector('#summaryCard').innerHTML = `
    <div class="summary-block">
      <div class="summary-label">Omzet Bulan Ini</div>
      <div class="summary-value">${rupiah(monthRevenue)}</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-block" style="flex:0;">
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
    const autoTag = s.sale.autoMarkedPaid ? ' <span style="font-weight:400;font-style:italic;">(otomatis)</span>' : '';
    const dateLabel = _sortBy === 'created'
      ? new Date(s.sale.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : `${dateShort(s.sale.saleDate)} • ${s.sale.saleTime}`;
    return `
      <button class="row" data-id="${s.sale.id}" style="opacity:${s.sale.completed ? 0.55 : 1};">
        <div class="avatar">${initials(s.sale.customerName)}</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(s.sale.customerName)}${s.sale.completed ? ' <span style="font-size:10px;font-weight:700;color:var(--primary);border:1px solid var(--primary);border-radius:5px;padding:1px 5px;vertical-align:middle;">SELESAI</span>' : ''}</div>
          <div class="row-meta">${dateLabel} • ${escapeHtml(s.sale.invoiceNumber)}</div>
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
