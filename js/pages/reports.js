// pages/reports.js

import { generateReport, generateAllTimeSummary } from '../services/reportService.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { rupiah, qtyLabel, escapeHtml, dateShort } from '../format.js';
import { dailyChart, statusChart, wireBusinessCharts } from '../ui/businessCharts.js';
import { setPageTitle, setTopbarActions } from '../app.js';
import { toast } from '../ui/toast.js';
import * as db from '../db.js';

let _period = 'year';
let reportView = 'period';
let reportRequest = 0;
let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedYear = new Date().getFullYear();
let availableMonths = [];
let availableYears = [selectedYear];

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function groupMonthlyByYear(months) {
  const groups = new Map();

  months.forEach((month) => {
    const year = month.monthKey.slice(0, 4);
    const group = groups.get(year) || {
      year,
      revenue: 0,
      count: 0,
      months: [],
    };

    group.revenue += month.revenue;
    group.count += month.count;
    group.months.push(month);
    groups.set(year, group);
  });

  return [...groups.values()];
}

export async function render(root) {
  setPageTitle('Laporan');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="reports-view-tabs" role="tablist" aria-label="Bagian laporan">
      <button type="button" role="tab" data-report-view="period">Periode</button>
      <button type="button" role="tab" data-report-view="overall">Keseluruhan</button>
    </div>
    <section class="reports-view-panel" data-report-panel="period" role="tabpanel">
      <div class="reports-layout-1 chip-scroll">
        <button class="chip" data-p="today">Hari Ini</button>
        <button class="chip" data-p="week">7 Hari</button>
        <button class="chip" data-p="month">Bulanan</button>
        <button class="chip" data-p="year">Tahunan</button>
      </div>
      <div class="reports-layout-2" id="reportBody"></div>
    </section>
    <section class="reports-view-panel" data-report-panel="overall" role="tabpanel">
      <div class="reports-overall-heading">
        <span>RINGKASAN USAHA</span>
        <h2>Keseluruhan</h2>
        <p>Akumulasi seluruh transaksi dan rincian setiap tahun.</p>
      </div>
      <div class="reports-layout-3" id="allTimeBody"></div>
    </section>
  `;
  root.querySelectorAll('[data-report-view]').forEach((button) => {
    button.onclick = () => {
      reportView = button.dataset.reportView;
      updateReportView(root);
    };
  });
  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.p === _period);
    c.onclick = () => { _period = c.dataset.p; drawReport(root); };
  });
  updateReportView(root);
  await drawReport(root);
  const allTimeData = await generateAllTimeSummary();
  availableMonths = allTimeData.monthlyBreakdown.map((month) => month.monthKey);
  const earliestDataYear = availableMonths.length ? Number(availableMonths[availableMonths.length - 1].slice(0, 4)) : selectedYear;
  availableYears = Array.from({ length: selectedYear - earliestDataYear + 1 }, (_, index) => selectedYear - index);
  await drawAllTime(root, allTimeData);
  updateReportView(root);
}

async function exportReport(root, format) {
  try {
    const referenceDate = _period === 'month' ? selectedMonth : new Date(selectedYear, 0, 1);
    const data = await generateReport(_period, referenceDate);
    const exported = await buildExportDataset(data);
    const filename = `notaku-data-${String(exported.label || 'keseluruhan').replaceAll(' ', '-')}`;
    if (format === 'csv') {
      const rows = [exported.headers, ...exported.rows];
      const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `${filename}.csv`; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Laporan Excel berhasil dibuat');
      return;
    }
    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
      await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
    }
    if (!window.jspdf?.jsPDF) throw new Error('Komponen PDF belum berhasil dimuat. Coba lagi.');
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.setFontSize(16); pdf.text('LAPORAN PENJUALAN', 14, 16);
    pdf.setFontSize(9); pdf.text(`NotaKu · ${exported.label || ''}`, 14, 23);
    const saleRows = exported.rows.filter((row) => row[0] === 'Nota');
    const expenseRows = exported.rows.filter((row) => row[0] === 'Pengeluaran');
    const columns = [
      ['NO. NOTA', 14, 32], ['TANGGAL', 48, 25], ['PELANGGAN', 76, 45],
      ['TOTAL', 123, 32], ['DIBAYAR', 158, 32], ['SISA', 193, 32], ['STATUS', 228, 35],
    ];
    let y = 32;
    const drawHeader = () => {
      pdf.setFillColor(238, 226, 207); pdf.rect(10, y - 5, 277, 8, 'F');
      pdf.setFontSize(7); pdf.setTextColor(70, 55, 42);
      columns.forEach(([label, x]) => pdf.text(label, x, y));
      pdf.setTextColor(0, 0, 0); y += 8;
    };
    drawHeader();
    pdf.setFontSize(7);
    for (const row of saleRows) {
      if (y > 190) { pdf.addPage(); y = 16; pdf.setFontSize(12); pdf.text('LAPORAN PENJUALAN (LANJUTAN)', 14, y); y += 12; drawHeader(); }
      const values = [row[1], row[2], row[4], row[7], row[8], row[9], row[10]];
      columns.forEach(([, x, width], index) => {
        const text = String(values[index] ?? '-');
        pdf.text(pdf.splitTextToSize(text, width - 2)[0], x, y);
      });
      pdf.setDrawColor(225, 225, 225); pdf.line(10, y + 2, 287, y + 2); y += 7;
    }
    y += 6; pdf.setFontSize(11); pdf.text(`RINGKASAN PENGELUARAN (${expenseRows.length} catatan)`, 14, y); y += 8; pdf.setFontSize(8);
    for (const row of expenseRows) {
      if (y > 195) { pdf.addPage(); y = 18; }
      pdf.text(`${row[2] || '-'} · ${row[11] || '-'} · Nominal: ${row[7] || 0}`, 14, y); y += 6;
    }
    // Gunakan Blob + anchor seperti export CSV agar kompatibel dengan browser
    // Android yang kadang menolak pdf.save() langsung dari library.
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const pdfLink = document.createElement('a');
    pdfLink.href = pdfUrl; pdfLink.download = `${filename}.pdf`; pdfLink.style.display = 'none';
    document.body.appendChild(pdfLink); pdfLink.click(); pdfLink.remove();
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    toast('Laporan PDF berhasil dibuat');
  } catch (error) {
    console.error('[exportReport]', error);
    toast(error.message || 'Laporan belum dapat diekspor. Coba lagi.');
  }
}

async function buildExportDataset(report) {
  const all = await db.dumpAll();
  const allData = reportView === 'overall';
  const inRange = (value) => allData || (!value ? false : value >= report.start && value <= report.end);
  const sales = allData ? all.sales : all.sales.filter((row) => !row.isDeleted && inRange(row.saleDate));
  const saleIds = new Set(sales.map((row) => row.id));
  const sections = {
    Nota: sales,
    DetailNota: allData ? all.saleItems : all.saleItems.filter((row) => saleIds.has(row.saleId)),
    Pembayaran: allData ? all.payments : all.payments.filter((row) => saleIds.has(row.saleId) || inRange(row.paymentDate)),
    Pengeluaran: allData ? all.expenses : all.expenses.filter((row) => inRange(row.expenseDate)),
    Produk: all.products,
    Pelanggan: all.customers,
    RiwayatAktivitas: allData ? (all.auditLogs || []) : (all.auditLogs || []).filter((row) => inRange(String(row.createdAt || '').slice(0, 10))),
    Pengaturan: all.settings,
  };
  const headers = ['Bagian', 'No. Nota', 'Tanggal', 'Jam', 'Pelanggan', 'Telepon', 'Alamat', 'Total Nota', 'Dibayar', 'Sisa', 'Status', 'Catatan'];
  const rows = [];
  for (const sale of sections.Nota) {
    const payments = sections.Pembayaran.filter((payment) => payment.saleId === sale.id);
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const status = sale.status || (paid >= sale.total ? 'LUNAS' : paid ? 'SEBAGIAN' : 'BELUM LUNAS');
    rows.push(['Nota', sale.invoiceNumber, sale.saleDate, sale.saleTime, sale.customerName, sale.customerPhone, sale.customerAddress, sale.total, paid, Math.max(0, sale.total - paid), status, sale.note || '']);
  }
  for (const expense of sections.Pengeluaran) rows.push(['Pengeluaran', '', expense.expenseDate, '', '', '', '', expense.amount, '', '', expense.category || '', `${expense.title || ''}${expense.note ? ` · ${expense.note}` : ''}`]);
  return { label: allData ? 'Keseluruhan data' : `${report.periodLabel} (${report.start} s/d ${report.end})`, sections, headers, rows };
}

function formatExportRecord(section, record) {
  if (section === 'Nota') return `No. Nota: ${record.invoiceNumber} | Tanggal: ${record.saleDate} ${record.saleTime} | Pelanggan: ${record.customerName} | Telepon: ${record.customerPhone || '-'} | Total: ${record.total} | Status: ${record.status || '-'} | Catatan: ${record.note || '-'}`;
  if (section === 'DetailNota') return `Produk: ${record.productName} | Jumlah: ${record.qty} ${record.unit || ''} | Harga: ${record.price} | Subtotal: ${record.subtotal} | Catatan: ${record.note || '-'}`;
  if (section === 'Pembayaran') return `Tanggal: ${record.paymentDate} ${record.paymentTime || ''} | Nominal: ${record.amount} | Catatan: ${record.note || '-'}`;
  if (section === 'Pengeluaran') return `Tanggal: ${record.expenseDate} | ${record.title} | Kategori: ${record.category} | Metode: ${record.method} | Nominal: ${record.amount} | Catatan: ${record.note || '-'}`;
  if (section === 'Produk') return `Nama: ${record.name} | Harga: ${record.price} | Stok: ${record.stock ?? '-'} | Status: ${record.isActive === false ? 'Nonaktif' : 'Aktif'}`;
  if (section === 'Pelanggan') return `Nama: ${record.name} | Telepon: ${record.phone || '-'} | Alamat: ${record.address || '-'} | Status: ${record.isActive === false ? 'Nonaktif' : 'Aktif'}`;
  if (section === 'RiwayatAktivitas') return `Waktu: ${record.createdAt} | ${record.details || record.action} | Data: ${record.entityType || '-'} ${record.entityId || ''}`;
  if (section === 'Pengaturan') return `Konfigurasi aplikasi: ${JSON.stringify(record)}`;
  return JSON.stringify(record);
}

function updateReportView(root) {
  root.querySelectorAll('[data-report-view]').forEach((button) => {
    const active = button.dataset.reportView === reportView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  root.querySelectorAll('[data-report-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.reportPanel !== reportView;
  });
}

function periodNavigator() {
  if (_period !== 'month' && _period !== 'year') return '';

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const earliestMonth = availableMonths[availableMonths.length - 1] || currentMonthKey;

  if (_period === 'month') {
    const monthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;
    return `
      <div class="reports-period-nav" aria-label="Pilih bulan laporan">
        <button type="button" data-period-shift="-1" ${monthKey <= earliestMonth ? 'disabled' : ''} aria-label="Bulan sebelumnya">&#8249;</button>
        <label class="reports-period-picker">
          <strong>${label}</strong><small>Ketuk untuk memilih bulan</small>
          <input type="month" data-period-picker value="${monthKey}" min="${earliestMonth}" max="${currentMonthKey}" aria-label="Pilih bulan laporan">
        </label>
        <button type="button" data-period-shift="1" ${monthKey >= currentMonthKey ? 'disabled' : ''} aria-label="Bulan berikutnya">&#8250;</button>
      </div>`;
  }

  const earliestYear = availableYears[availableYears.length - 1] || selectedYear;
  return `
    <div class="reports-period-nav" aria-label="Pilih tahun laporan">
      <button type="button" data-period-shift="-1" ${selectedYear <= earliestYear ? 'disabled' : ''} aria-label="Tahun sebelumnya">&#8249;</button>
      <label class="reports-period-picker">
        <strong>${selectedYear}</strong><small>Ketuk untuk memilih tahun</small>
        <select data-period-picker aria-label="Pilih tahun laporan">
          ${availableYears.map((year) => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`).join('')}
        </select>
      </label>
      <button type="button" data-period-shift="1" ${selectedYear >= now.getFullYear() ? 'disabled' : ''} aria-label="Tahun berikutnya">&#8250;</button>
    </div>`;
}

function wirePeriodNavigator(root) {
  root.querySelectorAll('[data-period-shift]').forEach((button) => {
    button.onclick = () => {
      const shift = Number(button.dataset.periodShift);
      if (_period === 'month') selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + shift, 1);
      if (_period === 'year') selectedYear += shift;
      drawReport(root);
    };
  });

  const picker = root.querySelector('[data-period-picker]');
  if (!picker) return;
  picker.onchange = () => {
    if (_period === 'month' && picker.value) {
      const [year, month] = picker.value.split('-').map(Number);
      selectedMonth = new Date(year, month - 1, 1);
    }
    if (_period === 'year') selectedYear = Number(picker.value);
    drawReport(root);
  };
}

async function drawReport(root) {
  const request = ++reportRequest;
  root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.p === _period));
  const referenceDate = _period === 'month' ? selectedMonth : new Date(selectedYear, 0, 1);
  const data = await generateReport(_period, referenceDate);
  if (request !== reportRequest || (root.dataset.pendingPage !== 'reports' && root.dataset.page !== 'reports')) return;
  const el = root.querySelector('#reportBody');
  el.innerHTML = `
    ${periodNavigator()}
    <p class="business-period">${dateShort(data.start)} – ${dateShort(data.end)}<br>Nilai nota berdasarkan tanggal pengambilan.</p>
    <div class="reports-layout-4">
      <div class="reports-layout-5 reports-metric reports-metric--revenue">
        <div class="reports-layout-6">Omzet ${data.periodLabel}</div>
        <div class="reports-layout-7">${rupiah(data.revenue)}</div>
      </div>
      <div class="reports-layout-5 reports-metric reports-metric--transactions">
        <div class="reports-layout-6">Transaksi</div>
        <div class="reports-layout-7">${data.transactionCount}</div>
      </div>
    </div>
    <div class="reports-layout-4">
      <div class="reports-layout-5 reports-metric reports-metric--expenses"><div class="reports-layout-6">Pengeluaran</div><div class="reports-layout-8">${rupiah(data.expenseTotal)}</div><div class="row-meta">${data.expenseCount} catatan</div></div>
      <div class="reports-layout-5 reports-metric reports-metric--net"><div class="reports-layout-6">Sisa Omzet</div><div class="reports-layout-7">${rupiah(data.netIncome)}</div></div>
    </div>
    <div class="reports-layout-9 reports-metric reports-metric--receivable">
      <div class="reports-layout-6">Piutang Periode Ini (Belum Lunas)</div>
      <div class="reports-layout-8">${rupiah(data.totalReceivables)}</div>
    </div>
    ${dailyChart(data.daily, { granularity: data.chartGranularity })}
    ${statusChart(data.statusBreakdown)}
    <div class="reports-export-actions" aria-label="Export laporan">
      <span>Export laporan</span>
      <button type="button" class="reports-export-button" id="exportReportCsv">Excel</button>
      <button type="button" class="reports-export-button" id="exportReportPdf">PDF</button>
    </div>
    <div class="reports-product-sections">
      <details class="reports-product-card">
        <summary>
          <span><strong>Produk Terlaris</strong><small>10 produk teratas &middot; ${data.periodLabel}</small></span>
          <span class="reports-product-summary-count">${data.topProducts.length}<i aria-hidden="true">&#8250;</i></span>
        </summary>
        <div class="reports-product-list">
          ${data.topProducts.length ? data.topProducts.map((product, index) => `
            <div class="reports-product-row">
              <span class="reports-product-rank">${index + 1}</span>
              <div class="reports-product-info">
                <strong>${escapeHtml(product.name)}</strong>
                <small>${qtyLabel(product.qty)} terjual</small>
              </div>
              <strong class="reports-product-amount">${rupiah(product.amount)}</strong>
            </div>`).join('') : `<div class="reports-layout-14">Belum ada penjualan pada periode ini.</div>`}
        </div>
      </details>
      <details class="reports-product-card">
        <summary>
          <span><strong>Semua Produk Terjual</strong><small>Seluruh produk pada periode ini</small></span>
          <span class="reports-product-summary-count">${data.soldProducts.length}<i aria-hidden="true">&#8250;</i></span>
        </summary>
        <div class="reports-product-list">
          ${data.soldProducts.length ? data.soldProducts.map((product) => `
            <div class="reports-product-row">
              <div class="reports-product-info">
                <strong>${escapeHtml(product.name)}</strong>
                <small>${qtyLabel(product.qty)} terjual</small>
              </div>
              <strong class="reports-product-amount">${rupiah(product.amount)}</strong>
            </div>`).join('') : `<div class="reports-layout-14">Belum ada penjualan pada periode ini.</div>`}
        </div>
      </details>
    </div>
  `;
  wirePeriodNavigator(root);
  wireBusinessCharts(el);
  wireExportButtons(root);
}

function wireExportButtons(root) {
  root.querySelector('#exportReportCsv')?.addEventListener('click', () => exportReport(root, 'csv'));
  root.querySelector('#exportReportPdf')?.addEventListener('click', () => exportReport(root, 'pdf'));
}

async function drawAllTime(root, data) {
  const el = root.querySelector('#allTimeBody');
  if (!el) return;
  const yearlyBreakdown = groupMonthlyByYear(data.monthlyBreakdown);

  const statusRows = [
    ['PAID', 'var(--status-lunas)'],
    ['PARTIAL', 'var(--status-partial)'],
    ['UNPAID', 'var(--status-unpaid)'],
    ['OVERPAID', 'var(--status-overpaid)'],
  ];
  const totalStatusCount = statusRows.reduce((total, [key]) => total + data.statusBreakdown[key].count, 0);

  el.innerHTML = `
    <div class="reports-layout-15">
      <div class="reports-layout-16">Total Omset Sepanjang Waktu</div>
      <div class="reports-layout-17">${rupiah(data.totalRevenue)}</div>
      <div class="reports-layout-18">${data.totalTransactions} nota tercatat</div>
    </div>

    <div class="reports-summary-grid">
      <div class="reports-layout-20 reports-overall-metric reports-overall-metric--received">
        <div class="reports-layout-21">Sudah Diterima (tercatat)</div>
        <div class="reports-layout-22">${rupiah(data.totalPaidCollected)}</div>
      </div>
      <div class="reports-layout-20 reports-overall-metric reports-overall-metric--receivable">
        <div class="reports-layout-21">Piutang Belum Lunas</div>
        <div class="reports-layout-23">${rupiah(data.totalReceivables)}</div>
      </div>
      <div class="reports-layout-20 reports-overall-metric reports-overall-metric--expenses"><div class="reports-layout-21">Total Pengeluaran</div><div class="reports-layout-23">${rupiah(data.totalExpenses)}</div><div class="row-meta">${data.totalExpenseCount} catatan</div></div>
      <div class="reports-layout-20 reports-overall-metric reports-overall-metric--net"><div class="reports-layout-21">Sisa Omzet</div><div class="reports-layout-24">${rupiah(data.netIncome)}</div></div>
    </div>

    <div class="reports-layout-10">Rincian per Status Pembayaran</div>
    <div class="reports-layout-25">
      <div class="reports-status-overview" role="img" aria-label="Proporsi status pembayaran dari ${totalStatusCount} nota">
        ${statusRows.map(([key, color]) => {
          const count = data.statusBreakdown[key].count;
          return count ? `<span style="flex:${count};background:${color}"></span>` : '';
        }).join('')}
      </div>
      ${statusRows.map(([key, color]) => `
        <div class="reports-layout-26">
          <div class="reports-layout-27">
            <span class="reports-status-dot" style="background:${color};"></span>
            <span class="reports-layout-28">${STATUS_LABEL[key]}</span>
            <span class="reports-layout-29">${data.statusBreakdown[key].count} nota &middot; ${totalStatusCount ? Math.round(data.statusBreakdown[key].count / totalStatusCount * 100) : 0}%</span>
          </div>
          <div class="reports-layout-30">${rupiah(data.statusBreakdown[key].amount)}</div>
        </div>`).join('')}
      ${data.autoMarkedCount > 0 ? `<div class="reports-layout-31"><strong>${data.autoMarkedCount} nota</strong> ditandai lunas otomatis, mulai 1 hari setelah tanggal pengambilan.</div>` : ''}
    </div>

    <div class="reports-layout-10">Rincian per Tahun</div>
    ${yearlyBreakdown.length ? `
      <div class="reports-year-groups">
        ${yearlyBreakdown.map((year, index) => `
          <details class="reports-year-card" ${index === 0 ? 'open' : ''}>
            <summary class="reports-year-summary">
              <span class="reports-year-heading">
                <strong>${year.year}</strong>
                <small>${year.count} nota &middot; ${year.months.length} bulan aktif</small>
              </span>
              <span class="reports-year-value">
                <strong>${rupiah(year.revenue)}</strong>
                <span class="reports-year-chevron" aria-hidden="true">&#8250;</span>
              </span>
            </summary>
            <div class="reports-year-months">
              ${year.months.map((month) => `
                <div class="reports-month-row">
                  <div>
                    <div class="reports-month-name">${month.label.replace(` ${year.year}`, '')}</div>
                    <div class="row-meta">${month.count} nota</div>
                  </div>
                  <div class="reports-month-value">${rupiah(month.revenue)}</div>
                </div>`).join('')}
            </div>
          </details>`).join('')}
      </div>` : `<div class="reports-layout-14">Belum ada data.</div>`}
  `;
}
