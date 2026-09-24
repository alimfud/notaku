// pages/products.js

import { getAllProducts, saveProduct, deleteProduct } from '../services/productService.js';
import { rupiah, escapeHtml, initials } from '../format.js';
import { prepareProductImage, safeProductImage } from '../ui/productImage.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
  setPageTitle('Produk');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="products-layout-1 search-row"><input class="search-input" id="pSearch" placeholder="Cari produk"></div>
    <div id="pList" class="list"></div>
    <button class="fab" id="fabAdd" aria-label="Tambah produk">+</button>
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
      <div class="product-photo">${safeProductImage(p.imageData) ? `<img src="${safeProductImage(p.imageData)}" alt="${escapeHtml(p.name)}" loading="lazy">` : `<span aria-hidden="true">${escapeHtml(initials(p.name))}</span>`}</div>
      <div class="row-body">
        <div class="row-title">${escapeHtml(p.name)}</div>
        <div class="row-meta">${escapeHtml(p.category || 'Produk')} · ${escapeHtml(p.unit || 'pcs')}</div>
      </div>
      <div class="row-money">${rupiah(p.price)}</div>
    </button>`).join('');
  el.querySelectorAll('.row').forEach((r) => {
    r.onclick = () => openForm(root, products.find((p) => p.id === r.dataset.id), search);
  });
}

async function openForm(root, existing, search = '') {
  let imageData = safeProductImage(existing?.imageData);
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">${existing ? 'Ubah Produk' : 'Produk Baru'}</div>
      <div class="field product-photo-field"><label for="fPhoto">Foto produk (opsional)</label><img id="fPhotoPreview" class="product-photo-preview ${imageData ? '' : 'hidden'}" ${imageData ? `src="${imageData}"` : ''} alt="Preview foto produk"><input id="fPhoto" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" class="btn small secondary ${imageData ? '' : 'hidden'}" id="fRemovePhoto">Hapus foto</button><p class="product-photo-hint">JPG, PNG, atau WebP. Foto diperkecil otomatis.</p></div>
      <div class="field"><label>Nama Produk</label><input id="fName" value="${existing ? escapeHtml(existing.name) : ''}" autofocus></div>
      <div class="field"><label>Kategori</label><input id="fCategory" value="${existing ? escapeHtml(existing.category) : ''}"></div>
      <div class="field"><label>Satuan (pcs/kg/dus)</label><input id="fUnit" value="${existing ? escapeHtml(existing.unit) : 'pcs'}"></div>
      <div class="field"><label>Harga Jual</label><input id="fPrice" type="number" inputmode="numeric" value="${existing ? Math.round(existing.price) : ''}"></div>
      <div class="field"><label>Modal (opsional)</label><input id="fCost" type="number" inputmode="numeric" value="${existing && existing.cost ? Math.round(existing.cost) : ''}"></div>
      <div class="field"><label>Stok (opsional)</label><input id="fStock" type="number" inputmode="decimal" value="${existing && existing.stock ? existing.stock : ''}"></div>
      <button class="btn" id="fSave">Simpan</button>
      ${existing ? `<button class="btn danger" id="fDelete">Hapus Produk</button>` : ''}
    `;
    const saveButton = body.querySelector('#fSave');
    const photoInput = body.querySelector('#fPhoto');
    const removePhoto = body.querySelector('#fRemovePhoto');
    const showPhoto = () => {
      const preview = body.querySelector('#fPhotoPreview');
      if (imageData) preview.src = imageData;
      else preview.removeAttribute('src');
      preview.classList.toggle('hidden', !imageData);
      removePhoto.classList.toggle('hidden', !imageData);
    };
    photoInput.onchange = async () => {
      const file = photoInput.files[0];
      if (!file) return;
      saveButton.disabled = photoInput.disabled = removePhoto.disabled = true;
      try { imageData = await prepareProductImage(file); showPhoto(); }
      catch (e) { toast(e.message); }
      finally { saveButton.disabled = photoInput.disabled = removePhoto.disabled = false; photoInput.value = ''; }
    };
    removePhoto.onclick = () => { imageData = ''; photoInput.value = ''; showPhoto(); };
    body.querySelector('#fSave').onclick = async () => {
      saveButton.disabled = true;
      try {
        await saveProduct({
          imageData,
          id: existing?.id,
          name: body.querySelector('#fName').value,
          category: body.querySelector('#fCategory').value,
          unit: body.querySelector('#fUnit').value,
          price: body.querySelector('#fPrice').value,
          cost: body.querySelector('#fCost').value,
          stock: body.querySelector('#fStock').value,
        });
        close('saved');
      } catch (e) { toast(e.message); saveButton.disabled = false; }
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
