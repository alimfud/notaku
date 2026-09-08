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
    <div class="search-row" style="padding-top:16px;"><input class="search-input" id="cSearch" placeholder="Cari pelanggan"></div>
    <div id="cList" class="list"></div>
    <button class="fab" id="fabAdd">+</button>
  `;
  let debounce;
  root.querySelector('#cSearch').oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => drawList(root, e.target.value), 150);
  };
  root.querySelector('#fabAdd').onclick = () => openForm(root, null);
  await drawList(root, '');
}

async function drawList(root, search) {
  const customers = await getAllCustomers({ search });
  const el = root.querySelector('#cList');
  if (!customers.length) {
    el.innerHTML = `<div class="empty-state"><p>Belum ada pelanggan.</p></div>`;
    return;
  }
  el.innerHTML = customers.map((c) => `
    <button class="row" data-id="${c.id}">
      <div class="avatar">${c.name[0]?.toUpperCase() || '?'}</div>
      <div class="row-body">
        <div class="row-title">${escapeHtml(c.name)}</div>
        ${c.phone ? `<div class="row-meta">${escapeHtml(c.phone)}</div>` : ''}
      </div>
    </button>`).join('');
  el.querySelectorAll('.row').forEach((r) => {
    r.onclick = () => openForm(root, customers.find((c) => c.id === r.dataset.id), search);
  });
}

async function openForm(root, existing, search = '') {
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">${existing ? 'Ubah Pelanggan' : 'Pelanggan Baru'}</div>
      <div class="field"><label>Nama Pelanggan</label><input id="fName" value="${existing ? escapeHtml(existing.name) : ''}" autofocus></div>
      <div class="field"><label>Telepon (opsional)</label><input id="fPhone" value="${existing ? escapeHtml(existing.phone) : ''}"></div>
      <div class="field"><label>Alamat (opsional)</label><textarea id="fAddress" rows="2">${existing ? escapeHtml(existing.address) : ''}</textarea></div>
      <button class="btn" id="fSave">Simpan</button>
      ${existing ? `<button class="btn danger" id="fDelete">Hapus Pelanggan</button>` : ''}
    `;
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
