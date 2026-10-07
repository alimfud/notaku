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
    <div class="products-page">
      <div class="products-heading">
        <div><span>Katalog</span><h2>Daftar produk</h2></div>
        <small id="productCount">0 produk</small>
      </div>
      <div class="products-search">
        <span aria-hidden="true">⌕</span>
        <input id="pSearch" placeholder="Cari nama produk" autocomplete="off">
      </div>
      <div id="pList" class="list"></div>
    </div>
    <button class="fab" id="fabAdd" aria-label="Tambah produk">+</button>
  `;
  let initialSearch = '';
  try { initialSearch = sessionStorage.getItem('notaku-global-query') || ''; sessionStorage.removeItem('notaku-global-query'); } catch {}
  root.querySelector('#pSearch').value = initialSearch;
  let debounce;
  root.querySelector('#pSearch').oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => drawList(root, e.target.value), 150);
  };
  root.querySelector('#fabAdd').onclick = () => openForm(root, null);
  await drawList(root, initialSearch);
}

async function drawList(root, search) {
  const products = await getAllProducts({ search });
  const el = root.querySelector('#pList');
  const count = root.querySelector('#productCount');
  if (count) count.textContent = `${products.length} produk`;
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
    body.classList.add('product-form-sheet');
    body.innerHTML = `
      <div class="product-sheet-header">
        <div class="sheet-title">${existing ? 'Ubah Produk' : 'Produk Baru'}</div>
        <button type="button" class="product-sheet-close" id="productClose" aria-label="Tutup">×</button>
      </div>

      <div class="product-form-fields">
        <div class="product-photo-field">
          <span>Foto produk <em>Opsional</em></span>
          <div class="product-photo-editor">
            <div id="fPhotoEmpty" class="product-photo-empty ${imageData ? 'hidden' : ''}">Foto</div>
            <img id="fPhotoPreview" class="product-photo-preview ${imageData ? '' : 'hidden'}" ${imageData ? `src="${imageData}"` : ''} alt="Preview foto produk">
            <div class="product-photo-actions">
              <input id="fPhoto" type="file" accept="image/jpeg,image/png,image/webp">
              <button type="button" class="btn small ghost ${imageData ? '' : 'hidden'}" id="fRemovePhoto">Hapus foto</button>
            </div>
          </div>
        </div>

        <label class="product-field">
          <span>Nama produk</span>
          <input id="fName" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Masukkan nama produk" autofocus>
        </label>

        <div class="product-field-grid">
          <label class="product-field"><span>Kategori</span><input id="fCategory" value="${existing ? escapeHtml(existing.category) : ''}" placeholder="Contoh: Makanan"></label>
          <label class="product-field"><span>Satuan</span><input id="fUnit" value="${existing ? escapeHtml(existing.unit) : 'pcs'}" placeholder="pcs, kg, dus"></label>
        </div>

        <div class="product-field-grid">
          <label class="product-field"><span>Harga jual</span><div class="product-money-input"><b>Rp</b><input id="fPrice" type="number" inputmode="numeric" min="0" value="${existing ? Math.round(existing.price) : ''}" placeholder="0"></div></label>
          <label class="product-field"><span>Modal <em>Opsional</em></span><div class="product-money-input"><b>Rp</b><input id="fCost" type="number" inputmode="numeric" min="0" value="${existing && existing.cost ? Math.round(existing.cost) : ''}" placeholder="0"></div></label>
        </div>

        <label class="product-field"><span>Stok <em>Opsional</em></span><input id="fStock" type="number" inputmode="decimal" step="any" value="${existing && existing.stock ? existing.stock : ''}" placeholder="0"></label>
      </div>

      <div class="product-sheet-actions ${existing ? 'has-delete' : ''}">
        ${existing ? `<button class="btn danger" id="fDelete" type="button">Hapus</button>` : ''}
        <button class="btn" id="fSave" type="button">${existing ? 'Simpan Perubahan' : 'Simpan Produk'}</button>
      </div>
    `;
    const saveButton = body.querySelector('#fSave');
    const photoInput = body.querySelector('#fPhoto');
    const removePhoto = body.querySelector('#fRemovePhoto');
    const showPhoto = () => {
      const preview = body.querySelector('#fPhotoPreview');
      const empty = body.querySelector('#fPhotoEmpty');
      if (imageData) preview.src = imageData;
      else preview.removeAttribute('src');
      preview.classList.toggle('hidden', !imageData);
      empty.classList.toggle('hidden', !!imageData);
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
    body.querySelector('#productClose').onclick = () => close(undefined);
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
