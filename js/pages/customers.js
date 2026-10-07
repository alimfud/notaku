// pages/customers.js

import { getAllCustomers, getCustomer, saveCustomer, deleteCustomer } from '../services/customerService.js';
import * as db from '../db.js';
import { escapeHtml, rupiah, dateShort } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions } from '../app.js';

const STATUS_LABELS = { PAID: 'LUNAS', PARTIAL: 'SEBAGIAN', UNPAID: 'BELUM BAYAR', OVERPAID: 'LEBIH BAYAR' };

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

export async function render(root, params = []) {
  if (params[0]) return renderDetail(root, decodeURIComponent(params[0]));
  setPageTitle('Pelanggan');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="customers-page">
      <div class="customers-heading">
        <div><span>Kontak</span><h2>Daftar pelanggan</h2></div>
        <small id="customerCount">0 pelanggan</small>
      </div>
      <label class="customers-search">
        <span aria-hidden="true">⌕</span>
        <input id="cSearch" placeholder="Cari nama atau nomor telepon" autocomplete="off">
      </label>
      <div id="cList" class="customers-list"></div>
    </div>
    <button class="fab" id="fabAdd" aria-label="Tambah pelanggan">+</button>
  `;
  let initialSearch = '';
  try { initialSearch = sessionStorage.getItem('notaku-global-query') || ''; sessionStorage.removeItem('notaku-global-query'); } catch {}
  root.querySelector('#cSearch').value = initialSearch;
  let debounce;
  root.querySelector('#cSearch').oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => drawList(root, e.target.value), 150);
  };
  root.querySelector('#fabAdd').onclick = () => openForm(root, null);
  await drawList(root, initialSearch);
}

async function renderDetail(root, customerId) {
  setPageTitle('Detail Pelanggan');
  setTopbarActions([]);
  root.innerHTML = `<div class="customer-detail-loading">Menyiapkan detail pelanggan…</div>`;

  const customer = await getCustomer(customerId);
  if (!customer || customer.isActive === 0) {
    root.innerHTML = `<div class="empty-state"><p>Pelanggan tidak ditemukan.</p><button class="btn" id="backCustomers" type="button">Kembali ke pelanggan</button></div>`;
    root.querySelector('#backCustomers').onclick = () => navigate('customers');
    return;
  }

  const [allSales, allPayments] = await Promise.all([db.getAll('sales'), db.getAll('payments')]);
  const customerName = normalizeName(customer.name);
  const sales = allSales
    .filter((sale) => !sale.isDeleted && (sale.customerId === customerId || (!sale.customerId && normalizeName(sale.customerName) === customerName)))
    .sort((a, b) => (b.saleDate + b.saleTime).localeCompare(a.saleDate + a.saleTime) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const saleIds = new Set(sales.map((sale) => sale.id));
  const paidBySale = new Map();
  for (const payment of allPayments) {
    if (saleIds.has(payment.saleId)) paidBySale.set(payment.saleId, (paidBySale.get(payment.saleId) || 0) + Number(payment.amount || 0));
  }
  const totalTransactions = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalPaid = sales.reduce((sum, sale) => sum + (paidBySale.get(sale.id) || 0), 0);
  const receivable = Math.max(0, totalTransactions - totalPaid);
  const initials = escapeHtml((customer.name || '?').trim().slice(0, 1).toUpperCase());

  root.innerHTML = `
    <div class="customer-detail-page">
      <section class="customer-detail-profile">
        <div class="customer-detail-avatar">${initials}</div>
        <div class="customer-detail-identity">
          <h2>${escapeHtml(customer.name)}</h2>
          <p>${escapeHtml(customer.phone || 'Nomor telepon belum diisi')}</p>
          ${customer.address ? `<p>${escapeHtml(customer.address)}</p>` : ''}
        </div>
        <button class="customer-detail-edit" id="editCustomer" type="button">Edit</button>
      </section>
      <section class="customer-detail-stats" aria-label="Ringkasan pelanggan">
        <div class="customer-stat"><small>Total transaksi</small><strong>${rupiah(totalTransactions)}</strong><span>${sales.length} nota</span></div>
        <div class="customer-stat"><small>Total pembayaran</small><strong>${rupiah(totalPaid)}</strong><span>Semua pembayaran</span></div>
        <div class="customer-stat customer-stat--debt"><small>Piutang</small><strong>${rupiah(receivable)}</strong><span>${receivable > 0 ? 'Belum lunas' : 'Tidak ada piutang'}</span></div>
      </section>
      <section class="customer-detail-history">
        <div class="customer-detail-section-head"><div><small>RIWAYAT TRANSAKSI</small><h3>Seluruh nota</h3></div><b>${sales.length}</b></div>
        <div class="customer-history-list">
          ${sales.length ? sales.map((sale) => {
            const paid = paidBySale.get(sale.id) || 0;
            const remaining = Math.max(0, Number(sale.total || 0) - paid);
            const status = paid > sale.total ? 'OVERPAID' : paid >= sale.total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
            return `<button class="customer-history-row" type="button" data-sale-id="${escapeHtml(sale.id)}">
              <span class="customer-history-main"><b>${escapeHtml(sale.invoiceNumber || 'Nota tanpa nomor')}</b><small>${escapeHtml(dateShort(sale.saleDate))}${sale.saleTime ? ` · ${escapeHtml(sale.saleTime)}` : ''}</small></span>
              <span class="customer-history-side"><strong>${rupiah(sale.total)}</strong><em data-status="${escapeHtml(status)}">${STATUS_LABELS[status] || escapeHtml(status)}</em>${remaining > 0 ? `<small>Piutang ${rupiah(remaining)}</small>` : ''}</span>
              <span class="customer-history-chevron" aria-hidden="true">›</span>
            </button>`;
          }).join('') : '<div class="customer-detail-empty"><p>Belum ada nota untuk pelanggan ini.</p><button class="btn" id="newCustomerSale" type="button">Buat nota</button></div>'}
        </div>
      </section>
    </div>`;

  root.querySelector('#editCustomer').onclick = () => openForm(root, customer, '', () => renderDetail(root, customerId), () => navigate('customers'));
  root.querySelectorAll('[data-sale-id]').forEach((row) => {
    row.onclick = () => navigate(`sale/${encodeURIComponent(row.dataset.saleId)}`);
  });
  root.querySelector('#newCustomerSale')?.addEventListener('click', () => navigate('sale/new'));
}

async function drawList(root, search) {
  const customers = await getAllCustomers({ search });
  const el = root.querySelector('#cList');
  const count = root.querySelector('#customerCount');
  if (count) count.textContent = `${customers.length} pelanggan`;
  if (!customers.length) {
    el.innerHTML = `<div class="empty-state"><p>${search ? 'Pelanggan tidak ditemukan.' : 'Belum ada pelanggan.<br>Tambahkan pelanggan pertama Anda.'}</p></div>`;
    return;
  }
  el.innerHTML = customers.map((c) => `
    <button class="customer-card" data-id="${c.id}" type="button">
      <div class="avatar">${c.name[0]?.toUpperCase() || '?'}</div>
      <div class="customer-card-body">
        <div class="customer-name">${escapeHtml(c.name)}</div>
        <div class="customer-contact">${escapeHtml(c.phone || 'Nomor telepon belum diisi')}</div>
        ${c.address ? `<div class="customer-address">${escapeHtml(c.address)}</div>` : ''}
      </div>
      <span class="customer-chevron" aria-hidden="true">›</span>
    </button>`).join('');
  el.querySelectorAll('.customer-card').forEach((r) => {
    r.onclick = () => navigate(`customers/${encodeURIComponent(r.dataset.id)}`);
  });
}

async function openForm(root, existing, search = '', afterSave = null, afterDelete = null) {
  const result = await openSheet((body, close) => {
    body.classList.add('customer-form-sheet');
    body.innerHTML = `
      <div class="customer-sheet-header">
        <div><small>${existing ? 'EDIT KONTAK' : 'KONTAK BARU'}</small><div class="sheet-title">${existing ? 'Ubah Pelanggan' : 'Pelanggan Baru'}</div></div>
        <button type="button" class="customer-sheet-close" id="customerClose" aria-label="Tutup">×</button>
      </div>
      <div class="customer-form-fields">
        <label class="customer-field"><span>Nama pelanggan</span><input id="fName" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Masukkan nama pelanggan" autofocus></label>
        <label class="customer-field"><span>Nomor telepon <em>Opsional</em></span><input id="fPhone" type="tel" value="${existing ? escapeHtml(existing.phone) : ''}" placeholder="Contoh: 0812 3456 7890"></label>
        <label class="customer-field"><span>Alamat <em>Opsional</em></span><textarea id="fAddress" rows="3" placeholder="Alamat pelanggan">${existing ? escapeHtml(existing.address) : ''}</textarea></label>
      </div>
      <div class="customer-sheet-actions ${existing ? 'has-delete' : ''}">
        ${existing ? `<button class="btn danger" id="fDelete" type="button">Hapus</button>` : ''}
        <button class="btn" id="fSave" type="button">${existing ? 'Simpan Perubahan' : 'Simpan Pelanggan'}</button>
      </div>
    `;
    body.querySelector('#customerClose').onclick = () => close(undefined);
    body.querySelector('#fSave').onclick = async () => {
      try {
        await saveCustomer({
          id: existing?.id,
          name: body.querySelector('#fName').value,
          phone: body.querySelector('#fPhone').value,
          address: body.querySelector('#fAddress').value,
        });
        close('saved');
      } catch (e) { toast(e.message); }
    };
    const del = body.querySelector('#fDelete');
    if (del) del.onclick = () => close('delete');
  });

  if (result === 'saved') { toast('Pelanggan disimpan'); if (afterSave) await afterSave(); else await drawList(root, search); }
  else if (result === 'delete') {
    const confirmed = await confirmDialog({ title: 'Hapus Pelanggan?', message: `Pelanggan "${existing.name}" akan disembunyikan dari daftar.`, confirmLabel: 'Hapus', dangerous: true });
    if (confirmed) {
      await deleteCustomer(existing.id);
      toast('Pelanggan dihapus');
      if (afterDelete) await afterDelete(); else await drawList(root, search);
    }
  }
}
