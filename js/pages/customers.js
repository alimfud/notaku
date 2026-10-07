// pages/customers.js

import { getAllCustomers, saveCustomer, deleteCustomer } from '../services/customerService.js';
import { escapeHtml } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
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
    r.onclick = () => openForm(root, customers.find((c) => c.id === r.dataset.id), search);
  });
}

async function openForm(root, existing, search = '') {
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

  if (result === 'saved') { toast('Pelanggan disimpan'); await drawList(root, search); }
  else if (result === 'delete') {
    const confirmed = await confirmDialog({ title: 'Hapus Pelanggan?', message: `Pelanggan "${existing.name}" akan disembunyikan dari daftar.`, confirmLabel: 'Hapus', dangerous: true });
    if (confirmed) {
      await deleteCustomer(existing.id);
      toast('Pelanggan dihapus');
      await drawList(root, search);
    }
  }
}
