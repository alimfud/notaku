// pages/products.js

import { getAllProducts, saveProduct, deleteProduct } from '../services/productService.js';
import { rupiah, escapeHtml } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
  setPageTitle('Produk');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="search-row" style="padding-top:16px;"><input class="search-input" id="pSearch" placeholder="Cari produk"></div>
    <div id="pList" class="list"></div>
    <button class="fab" id="fabAdd">+</button>
  `;
  let debounce;
  root.querySelector('#pSearch').oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => drawList(root, e.target.value), 150);
  };
  root.querySelector('#fabAdd').onclick = () => openForm(root, null);
  await drawList(root, '');
}

async function drawList(root, search) {
  const products = await getAllProducts({ search });
  const el = root.querySelector('#pList');
  if (!products.length) {
    el.innerHTML = `<div class="empty-state"><p>Belum ada produk.</p></div>`;
    return;
  }
  el.innerHTML = products.map((p) => `
    <button class="row" data-id="${p.id}">
      <div class="row-body">
        <div class="row-title">${escapeHtml(p.name)}</div>
        <div class="row-meta">${escapeHtml(p.category || p.unit)}</div>
      </div>
      <div class="row-money">${rupiah(p.price)}</div>
    </button>`).join('');
  el.querySelectorAll('.row').forEach((r) => {
    r.onclick = () => openForm(root, products.find((p) => p.id === r.dataset.id), search);
  });
}

async function openForm(root, existing, search = '') {
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">${existing ? 'Ubah Produk' : 'Produk Baru'}</div>
      <div class="field"><label>Nama Produk</label><input id="fName" value="${existing ? escapeHtml(existing.name) : ''}" autofocus></div>
      <div class="field"><label>Kategori</label><input id="fCategory" value="${existing ? escapeHtml(existing.category) : ''}"></div>
      <div class="field"><label>Satuan (pcs/kg/dus)</label><input id="fUnit" value="${existing ? escapeHtml(existing.unit) : 'pcs'}"></div>
      <div class="field"><label>Harga Jual</label><input id="fPrice" type="number" inputmode="numeric" value="${existing ? Math.round(existing.price) : ''}"></div>
      <div class="field"><label>Modal (opsional)</label><input id="fCost" type="number" inputmode="numeric" value="${existing && existing.cost ? Math.round(existing.cost) : ''}"></div>
      <div class="field"><label>Stok (opsional)</label><input id="fStock" type="number" inputmode="decimal" value="${existing && existing.stock ? existing.stock : ''}"></div>
      <button class="btn" id="fSave">Simpan</button>
      ${existing ? `<button class="btn danger" id="fDelete">Hapus Produk</button>` : ''}
    `;
    body.querySelector('#fSave').onclick = async () => {
      try {
        await saveProduct({
          id: existing?.id,
          name: body.querySelector('#fName').value,
          category: body.querySelector('#fCategory').value,
          unit: body.querySelector('#fUnit').value,
          price: body.querySelector('#fPrice').value,
          cost: body.querySelector('#fCost').value,
          stock: body.querySelector('#fStock').value,
        });
        close('saved');
      } catch (e) { toast(e.message); }
    };
    const del = body.querySelector('#fDelete');
    if (del) del.onclick = () => close('delete');
  });

  if (result === 'saved') { toast('Produk disimpan'); await drawList(root, search); }
  else if (result === 'delete') {
    const confirmed = await confirmDialog({ title: 'Hapus Produk?', message: `Produk "${existing.name}" akan disembunyikan dari daftar.`, confirmLabel: 'Hapus', dangerous: true });
    if (confirmed) {
      await deleteProduct(existing.id);
      toast('Produk dihapus');
      await drawList(root, search);
    }
  }
}
