// pages/saleFormShared.js
//
// Satu implementasi UI dipakai BERSAMA oleh "Nota Baru" (createSale.js) dan
// "Ubah Nota" (saleEdit.js) — supaya keduanya TIDAK PERNAH tampil beda lagi.
// Beda antara mode 'create' dan 'edit' HANYA pada pembayaran awal (cuma muncul di mode create,
// karena di mode edit pembayaran diatur terpisah lewat riwayat pembayaran).

import { getAllCustomers, cashCustomer, saveCustomer } from '../services/customerService.js';
import { getAllProducts, saveProduct } from '../services/productService.js';
import { calculateSubtotal, computeAdjustments, defaultAdjustments } from '../services/saleCalculation.js';
import { rupiah, escapeHtml, qtyLabel } from '../format.js';
import { openSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

/**
 * @param {HTMLElement} root
 * @param {'create'|'edit'} mode
 * @param {object} initial - { customer, lines, adjustments, note, payment, saleDate, saleTime }
 * @param {(state) => Promise<void>} onSave - dipanggil saat tombol Simpan ditekan, `state` berisi seluruh data form saat ini
 */
export async function renderSaleForm(root, mode, initial, onSave) {
  const state = {
    customer: initial.customer || { id: '', name: '', phone: '', address: '' },
    lines: initial.lines || [],
    adjustments: initial.adjustments || defaultAdjustments(),
    note: initial.note || '',
    payment: initial.payment || 0,
    saleDate: initial.saleDate || null,
    saleTime: initial.saleTime || null,
    stepperQty: 1,
    products: await getAllProducts(),
    saving: false,
    editDetailsExpanded: mode !== 'edit',
  };

  draw(root, mode, state, onSave);
}

function draw(root, mode, state, onSave) {
  root._notakuEditDetailsCleanup?.();
  root._notakuEditDetailsCleanup = null;
  // Disimpan di elemen root supaya semua handler internal (tambah item,
  // hapus item, dst) yang memicu redraw bisa selalu tahu mode & callback
  // simpan yang sedang aktif, tanpa perlu diteruskan manual di tiap pemanggilan.
  root._notakuFormMode = mode;
  root._notakuFormOnSave = onSave;

  const subtotal = calculateSubtotal(state.lines);
  const calc = computeAdjustments(subtotal, state.adjustments);
  const totalQty = state.lines.reduce((s, l) => s + l.qty, 0);
  const c = state.customer;
  const adjustmentSummary = [];
  if (state.adjustments.discount.enabled && state.adjustments.discount.value > 0) {
    adjustmentSummary.push(state.adjustments.discount.mode === 'percent'
      ? `Diskon ${state.adjustments.discount.value}%`
      : `Diskon ${rupiah(state.adjustments.discount.value)}`);
  }
  if (state.adjustments.shipping.enabled && state.adjustments.shipping.amount > 0) adjustmentSummary.push(`Ongkir ${rupiah(state.adjustments.shipping.amount)}`);
  if (state.adjustments.other.enabled && state.adjustments.other.amount > 0) adjustmentSummary.push(state.adjustments.other.label || 'Lain-lain');
  if (mode === 'create' && state.payment > 0) adjustmentSummary.push(`Bayar ${rupiah(state.payment)}`);
  if (state.note.trim()) adjustmentSummary.push('Ada catatan');

  const customerAndScheduleMarkup = mode === 'edit' ? `
      <section id="editDetailsPanel" class="sale-form-card sale-edit-details-card" data-expanded="${state.editDetailsExpanded}">
        <div id="editDetailsHeader" class="sale-edit-details-header" role="button" tabindex="0" aria-expanded="${state.editDetailsExpanded}">
          <div class="sale-edit-summary-column">
            <h2>Informasi pemesan</h2>
            <p id="customerSummary" class="sale-edit-summary" ${state.editDetailsExpanded ? 'hidden' : ''}>${escapeHtml(c.name || 'Nama belum diisi')}${c.phone ? ` · ${escapeHtml(c.phone)}` : ''}</p>
          </div>
          <div class="sale-edit-summary-column">
            <div class="sale-card-kicker">Jadwal</div>
            <p id="scheduleSummary" class="sale-edit-summary" ${state.editDetailsExpanded ? 'hidden' : ''}>${escapeHtml(formatSaleDate(state.saleDate))}${state.saleTime ? ` · ${escapeHtml(state.saleTime)}` : ''}</p>
          </div>
        </div>
        <div id="editDetailsContent" class="sale-edit-details-content" ${state.editDetailsExpanded ? '' : 'hidden'}>
          <div class="sale-edit-customer-fields">
            <button id="pickCustomerBtn" class="sale-text-btn sale-pick-customer-btn" type="button">Pilih dari daftar</button>
            <label class="sale-input-field">
              <span>Nama pelanggan</span>
              <input id="custName" value="${escapeHtml(c.name)}" placeholder="Masukkan nama" autocomplete="name">
            </label>
            <label class="sale-input-field">
              <span>No. WhatsApp <em>Opsional</em></span>
              <input id="custPhone" value="${escapeHtml(c.phone)}" placeholder="08xxxxxxxxxx" inputmode="tel" autocomplete="tel">
            </label>
            <label class="sale-input-field sale-address-field">
              <span>Alamat <em>Opsional</em></span>
              <input id="custAddress" value="${escapeHtml(c.address)}" placeholder="Masukkan alamat pelanggan" autocomplete="street-address">
            </label>
          </div>
          <div class="sale-edit-schedule-fields">
            <label class="sale-input-field">
              <span>Tanggal pengambilan</span>
              <input id="fDate" type="date" value="${state.saleDate || ''}" required>
            </label>
            <label class="sale-input-field">
              <span>Jam pengambilan</span>
              <input id="fTime" type="time" value="${state.saleTime || ''}" required>
            </label>
          </div>
        </div>
      </section>
  ` : `
      <section class="sale-form-card sale-customer-card">
        <div class="sale-card-heading">
          <div><h2>Informasi pemesan</h2></div>
          <button id="pickCustomerBtn" class="sale-text-btn" type="button">Pilih dari daftar</button>
        </div>
        <div class="sale-field-grid sale-field-grid-2">
          <label class="sale-input-field">
            <span>Nama pelanggan</span>
            <input id="custName" value="${escapeHtml(c.name)}" placeholder="Masukkan nama" autocomplete="name">
          </label>
          <label class="sale-input-field">
            <span>No. WhatsApp <em>Opsional</em></span>
            <input id="custPhone" value="${escapeHtml(c.phone)}" placeholder="08xxxxxxxxxx" inputmode="tel" autocomplete="tel">
          </label>
        </div>
        <label class="sale-input-field sale-address-field">
          <span>Alamat <em>Opsional</em></span>
          <input id="custAddress" value="${escapeHtml(c.address)}" placeholder="Masukkan alamat pelanggan" autocomplete="street-address">
        </label>
        <p class="sale-helper"></p>
      </section>

      <section class="sale-form-card sale-schedule-card">
        <div class="sale-card-heading sale-card-heading-compact">
          <div><div class="sale-card-kicker">Jadwal</div></div>
        </div>
        <div class="sale-field-grid sale-field-grid-2">
          <label class="sale-input-field">
            <span>Tanggal pengambilan</span>
            <input id="fDate" type="date" value="${state.saleDate || ''}" required>
          </label>
          <label class="sale-input-field">
            <span>Jam pengambilan</span>
            <input id="fTime" type="time" value="${state.saleTime || ''}" required>
          </label>
        </div>
      </section>
  `;

  root.innerHTML = `
    <div class="sale-form">
      ${customerAndScheduleMarkup}

      <section class="sale-form-card sale-product-card">
        <div class="sale-card-heading">
          <div>
            <div class="sale-card-kicker">Produk</div>
          </div>
          <button id="manualItemBtn" class="sale-text-btn" type="button">+ Item baru</button>
        </div>
        <div class="sale-product-composer">
          <div class="sale-qty-control" aria-label="Jumlah item">
            <span class="sale-control-label">Qty</span>
            <div class="sale-stepper">
              <button id="qtyMinus" type="button" aria-label="Kurangi jumlah">−</button>
              <input id="qtyStepper" type="number" value="${state.stepperQty}" min="1" inputmode="decimal" aria-label="Jumlah produk">
              <button id="qtyPlus" type="button" aria-label="Tambah jumlah">+</button>
            </div>
          </div>
          <div class="sale-search-wrap">
            <label class="sale-control-label" for="scanInput">Cari atau scan produk</label>
            <div class="sale-search-box">
              <span class="sale-search-icon" aria-hidden="true">⌕</span>
              <input id="scanInput" placeholder="Ketik nama atau scan barcode" autocomplete="off">
            </div>
            <div id="suggestList" class="sale-suggestions"></div>
          </div>
        </div>
      </section>

      <section class="sale-form-card sale-items-card">
        <div class="sale-card-heading sale-card-heading-compact">
          <div>
            <div class="sale-card-kicker">Daftar pesanan</div>
          </div>
        </div>
        <div id="linesList" class="sale-lines-list"></div>
      </section>

      <button id="adjustmentsBtn" class="sale-adjustments-trigger ${adjustmentSummary.length ? 'has-active-adjustments' : ''}" type="button">
        <span class="sale-adjustments-icon" aria-hidden="true">+</span>
        <span class="sale-adjustments-copy">
          <strong>Atur tambahan</strong>
          ${adjustmentSummary.length ? `<small>${escapeHtml(adjustmentSummary.join(' · '))}</small>` : ''}
        </span>
      </button>

      <div class="sale-form-bottom-space"></div>
    </div>

    <div class="sale-checkout">
      <div class="sale-checkout-meta">
        <span>${state.lines.length} item</span>
        <span>${qtyLabel(totalQty)} qty</span>
        <span>Subtotal ${rupiah(subtotal)}</span>
      </div>
      <div class="sale-checkout-total">
        <span>Total</span>
        <strong>${rupiah(calc.total)}</strong>
      </div>
      <button id="saveBtn" class="btn" ${state.lines.length ? '' : 'disabled'}>${mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Nota'}</button>
    </div>
  `;

  drawLines(root, state);
  wireScanInput(root, state);

  root.querySelector('#custName')?.addEventListener('input', (e) => { state.customer.name = e.target.value; });
  root.querySelector('#custAddress')?.addEventListener('input', (e) => { state.customer.address = e.target.value; });
  root.querySelector('#custPhone')?.addEventListener('input', (e) => { state.customer.phone = e.target.value; });
  root.querySelector('#pickCustomerBtn')?.addEventListener('click', () => pickCustomer(root, mode, state, onSave));

  if (mode === 'edit') {
    const panel = root.querySelector('#editDetailsPanel');
    const header = root.querySelector('#editDetailsHeader');
    const openDetails = () => {
      if (!state.editDetailsExpanded) {
        state.editDetailsExpanded = true;
        syncEditDetailsPanel(root, state);
      }
    };
    const finishDetails = () => {
      if (!state.editDetailsExpanded) return;
      captureEditDetails(root, state);
      state.editDetailsExpanded = false;
      syncEditDetailsPanel(root, state);
    };
    panel.addEventListener('click', openDetails);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetails();
      }
    });
    root.onpointerdown = (e) => {
      if (state.editDetailsExpanded && !panel.contains(e.target)) finishDetails();
    };
    root.onfocusout = (e) => {
      if (state.editDetailsExpanded && panel.contains(e.target) && !panel.contains(e.relatedTarget)) finishDetails();
    };
    const collapseAfterScroll = () => {
      const bounds = panel.getBoundingClientRect();
      if (state.editDetailsExpanded && (bounds.bottom <= 0 || bounds.top >= window.innerHeight)) finishDetails();
    };
    window.addEventListener('scroll', collapseAfterScroll, true);
    root._notakuEditDetailsCleanup = () => window.removeEventListener('scroll', collapseAfterScroll, true);
  } else {
    root.onpointerdown = null;
    root.onfocusout = null;
  }

  root.querySelector('#fDate')?.addEventListener('change', (e) => { state.saleDate = e.target.value; });
  root.querySelector('#fTime')?.addEventListener('change', (e) => { state.saleTime = e.target.value; });

  root.querySelector('#adjustmentsBtn').onclick = () => editAdjustments(root, mode, state, onSave);
  root.querySelector('#manualItemBtn').onclick = () => addManualItem(root, mode, state, onSave);
  root.querySelector('#saveBtn').onclick = () => save(root, mode, state, onSave);

  root.querySelector('#qtyMinus').onclick = () => {
    state.stepperQty = Math.max(1, state.stepperQty - 1);
    root.querySelector('#qtyStepper').value = state.stepperQty;
  };
  root.querySelector('#qtyPlus').onclick = () => {
    state.stepperQty += 1;
    root.querySelector('#qtyStepper').value = state.stepperQty;
  };
  root.querySelector('#qtyStepper').onchange = (e) => {
    state.stepperQty = Math.max(1, Number(e.target.value) || 1);
  };
}

function formatSaleDate(value) {
  if (!value) return 'Tanggal belum diisi';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function captureEditDetails(root, state) {
  const name = root.querySelector('#custName');
  const phone = root.querySelector('#custPhone');
  const address = root.querySelector('#custAddress');
  const date = root.querySelector('#fDate');
  const time = root.querySelector('#fTime');
  if (name) state.customer.name = name.value;
  if (phone) state.customer.phone = phone.value;
  if (address) state.customer.address = address.value;
  if (date) state.saleDate = date.value || null;
  if (time) state.saleTime = time.value || null;
}

function syncEditDetailsPanel(root, state) {
  const header = root.querySelector('#editDetailsHeader');
  const content = root.querySelector('#editDetailsContent');
  const customerSummary = root.querySelector('#customerSummary');
  const scheduleSummary = root.querySelector('#scheduleSummary');
  if (!header || !content || !customerSummary || !scheduleSummary) return;

  header.setAttribute('aria-expanded', String(state.editDetailsExpanded));
  content.hidden = !state.editDetailsExpanded;
  customerSummary.hidden = state.editDetailsExpanded;
  scheduleSummary.hidden = state.editDetailsExpanded;
  root.querySelector('#editDetailsPanel').dataset.expanded = String(state.editDetailsExpanded);
  if (!state.editDetailsExpanded) {
    const customer = state.customer;
    customerSummary.textContent = `${customer.name || 'Nama belum diisi'}${customer.phone ? ` · ${customer.phone}` : ''}`;
    scheduleSummary.textContent = `${formatSaleDate(state.saleDate)}${state.saleTime ? ` · ${state.saleTime}` : ''}`;
  }
}

function wireScanInput(root, state) {
  const input = root.querySelector('#scanInput');
  const suggestBox = root.querySelector('#suggestList');

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) { suggestBox.style.display = 'none'; return; }
    const matches = state.products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase() === q)
    ).slice(0, 8);
    if (!matches.length) {
      suggestBox.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">Tidak ditemukan. Ketuk "+ item bebas" untuk input manual.</div>`;
      suggestBox.style.display = 'block';
      return;
    }
    suggestBox.innerHTML = matches.map((p) => `
      <button class="row" data-id="${p.id}" style="width:100%;border-bottom:1px solid var(--outline);padding:10px 12px;">
        <div class="row-body"><div class="row-title">${escapeHtml(p.name)}</div>${p.category ? `<div class="row-meta">${escapeHtml(p.category)}</div>` : ''}</div>
        <div class="row-money">${rupiah(p.price)}</div>
      </button>`).join('');
    suggestBox.style.display = 'block';
    suggestBox.querySelectorAll('.row').forEach((r) => {
      r.onclick = () => addProductToLines(root, state, state.products.find((p) => p.id === r.dataset.id));
    });
  }

  input.oninput = (e) => renderSuggestions(e.target.value);

  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const exact = state.products.find((p) => p.barcode && p.barcode === q);
    if (exact) { addProductToLines(root, state, exact); return; }
    const nameMatches = state.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (nameMatches.length === 1) { addProductToLines(root, state, nameMatches[0]); return; }
    toast('Tidak ditemukan produk dengan kode/nama itu.');
  };

  document.addEventListener('click', (e) => {
    if (!suggestBox.contains(e.target) && e.target !== input) suggestBox.style.display = 'none';
  });
}

function addProductToLines(root, state, product) {
  if (!product) return;
  const qty = state.stepperQty || 1;
  const existing = state.lines.find((l) => l.productId === product.id);
  if (existing) existing.qty += qty;
  else state.lines.push({ productId: product.id, name: product.name, unit: product.unit, qty, price: product.price });
  state.stepperQty = 1;
  draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
  const input = root.querySelector('#scanInput');
  if (input) input.focus();
  toast(`+${qty} ${product.name}`);
}

async function addManualItem(root, mode, state, onSave) {
  const line = await openSheet((body, close) => {
    body.classList.add('sale-item-new-sheet');
    body.innerHTML = `
      <div class="sale-sheet-header">
        <div>
          <div class="sheet-title">Item Baru</div>
        </div>
        <button type="button" class="sale-sheet-close" id="mClose" aria-label="Tutup">×</button>
      </div>

      <div class="sale-item-edit-fields">
        <label class="sale-sheet-field sale-item-name-field">
          <span>Nama item</span>
          <input id="mName" placeholder="Masukkan nama item" autofocus>
        </label>

        <div class="sale-item-edit-grid">
          <label class="sale-sheet-field">
            <span>Satuan</span>
            <input id="mUnit" placeholder="pcs, kg, box, dus" value="pcs">
          </label>
          <label class="sale-sheet-field">
            <span>Jumlah</span>
            <input id="mQty" type="number" inputmode="decimal" min="0.01" step="any" value="${state.stepperQty}">
          </label>
        </div>

        <label class="sale-sheet-field">
          <span>Harga satuan</span>
          <div class="sale-money-input"><b>Rp</b><input id="mPrice" type="number" inputmode="numeric" min="0" placeholder="0"></div>
        </label>

      </div>

      <div class="sale-item-total">
        <strong>Jumlah harga</strong>
        <strong id="mSubtotalPreview">${rupiah(0)}</strong>
      </div>

      <div class="sale-sheet-actions">
        <button class="btn" id="mAdd" type="button">Tambahkan Item</button>
      </div>
    `;
    const qtyInput = body.querySelector('#mQty');
    const priceInput = body.querySelector('#mPrice');
    const preview = body.querySelector('#mSubtotalPreview');
    const updatePreview = () => {
      preview.textContent = rupiah((Number(qtyInput.value) || 0) * (Number(priceInput.value) || 0));
    };
    qtyInput.addEventListener('input', updatePreview);
    priceInput.addEventListener('input', updatePreview);
    body.querySelector('#mClose').onclick = () => close(undefined);
    body.querySelector('#mAdd').onclick = () => {
      const name = body.querySelector('#mName').value.trim();
      if (!name) return;
      const unit = body.querySelector('#mUnit').value.trim() || 'pcs';
      const qty = Number(qtyInput.value) || 1;
      const price = Number(priceInput.value) || 0;
      close({ productId: null, name, unit, qty, price });
    };
  });
  if (!line) return;

  // Kalau namanya sudah ada di daftar produk (tidak peka huruf besar/kecil),
  // pakai produk itu (id-nya) — jangan bikin produk duplikat. Kalau belum
  // ada, simpan sebagai produk baru supaya lain kali bisa dicari/di-scan,
  // TIDAK peduli item ditambahkan lewat "item bebas" atau jalur mana pun.
  const existing = state.products.find((p) => p.name.toLowerCase() === name_lower(line.name));
  if (existing) {
    line.productId = existing.id;
  } else {
    try {
      const created = await saveProduct({ name: line.name, unit: line.unit, price: line.price, category: '', cost: 0, stock: 0 });
      line.productId = created.id;
      state.products.push(created); // supaya langsung bisa dicari di sesi yang sama tanpa reload
      toast(`"${created.name}" disimpan sebagai produk baru`);
    } catch (e) {
      console.error('[addManualItem] gagal menyimpan produk baru', e);
      // Tetap lanjut menambahkan ke nota walau gagal disimpan sebagai produk —
      // jangan sampai kegagalan simpan produk menghalangi transaksi berjalan.
    }
  }

  state.lines.push(line);
  state.stepperQty = 1;
  draw(root, mode, state, onSave);
}

function name_lower(s) {
  return (s || '').trim().toLowerCase();
}

function drawLines(root, state) {
  const el = root.querySelector('#linesList');
  if (!state.lines.length) {
    el.innerHTML = `<div class="sale-lines-empty"><span class="sale-lines-empty-icon" aria-hidden="true">+</span><strong>Belum ada item</strong><small>Cari atau scan produk di atas untuk menambahkannya.</small></div>`;
    return;
  }
  el.innerHTML = state.lines.map((l, i) => `
    <div class="item-line" data-i="${i}">
      <div class="il-copy">
        <div class="il-name">${escapeHtml(l.name)}</div>
        <div class="il-detail">${qtyLabel(l.qty)} ${escapeHtml(l.unit || '')} x @ ${rupiah(l.price)},-</div>
        ${l.note ? `<div class="il-note">${escapeHtml(l.note)}</div>` : ''}
      </div>
      <div class="il-actions">
        <div class="il-total">${rupiah(l.qty * l.price)}</div>
        <div><span class="il-edit-hint">Ketuk untuk ubah</span><button class="il-remove" data-i="${i}" type="button">Hapus</button></div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.item-line').forEach((line) => {
    line.addEventListener('click', (e) => {
      if (e.target.classList.contains('il-remove')) return;
      editLine(root, state, Number(line.dataset.i));
    });
  });
  el.querySelectorAll('.il-remove').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.lines.splice(Number(btn.dataset.i), 1);
      draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
    };
  });
}

async function editLine(root, state, index) {
  const line = state.lines[index];
  await openSheet((body, close) => {
    body.classList.add('sale-item-edit-sheet');
    body.innerHTML = `
      <div class="sale-sheet-header">
        <div>
          <div class="sheet-title">Edit Item</div>
        </div>
        <button type="button" class="sale-sheet-close" id="eClose" aria-label="Tutup">×</button>
      </div>

      <div class="sale-item-edit-fields">
        <label class="sale-sheet-field sale-item-name-field">
          <span>Nama item</span>
          <input id="eName" value="${escapeHtml(line.name)}" placeholder="Nama item">
        </label>

        <div class="sale-item-edit-grid">
          <label class="sale-sheet-field">
            <span>Satuan</span>
            <input id="eUnit" value="${escapeHtml(line.unit || '')}" placeholder="pcs, kg, box, dus">
          </label>
          <label class="sale-sheet-field">
            <span>Jumlah</span>
            <input id="eQty" type="number" inputmode="decimal" min="0.01" step="any" value="${line.qty}">
          </label>
        </div>

        <label class="sale-sheet-field">
          <span>Harga satuan</span>
          <div class="sale-money-input"><b>Rp</b><input id="ePrice" type="number" inputmode="numeric" min="0" value="${Math.round(line.price)}"></div>
        </label>

        <label class="sale-sheet-field">
          <span>Catatan item <em>Opsional</em></span>
          <textarea id="eNote" rows="2" placeholder="Contoh: pedas level 2, tanpa bawang">${escapeHtml(line.note || '')}</textarea>
        </label>
      </div>

      <div class="sale-item-total">
        <strong>Jumlah harga</strong>
        <strong id="eSubtotalPreview">${rupiah(line.qty * line.price)}</strong>
      </div>

      <div class="sale-sheet-actions">
        <button class="btn" id="eApply" type="button">Terapkan Perubahan</button>
      </div>
    `;
    const qtyInput = body.querySelector('#eQty');
    const priceInput = body.querySelector('#ePrice');
    const preview = body.querySelector('#eSubtotalPreview');
    function updatePreview() {
      const q = Number(qtyInput.value) || 0;
      const p = Number(priceInput.value) || 0;
      preview.textContent = rupiah(q * p);
    }
    qtyInput.addEventListener('input', updatePreview);
    priceInput.addEventListener('input', updatePreview);
    body.querySelector('#eClose').onclick = () => close(undefined);
    body.querySelector('#eApply').onclick = () => {
      const name = body.querySelector('#eName').value.trim();
      if (name) line.name = name;
      line.unit = body.querySelector('#eUnit').value.trim();
      line.qty = Number(qtyInput.value) || line.qty;
      line.price = Number(priceInput.value) || 0;
      line.note = body.querySelector('#eNote').value.trim();
      close(true);
    };
  });
  draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
}

async function pickCustomer(root, mode, state, onSave) {
  const customers = await getAllCustomers();
  const selected = await openSheet((body, close) => {
    body.classList.add('sale-customer-picker-sheet');
    body.innerHTML = `
      <div class="sale-sheet-header">
        <div class="sheet-title">Pilih Pelanggan</div>
        <button type="button" class="sale-sheet-close" id="custClose" aria-label="Tutup">×</button>
      </div>

      <label class="sale-sheet-field sale-customer-search">
        <span>Cari pelanggan</span>
        <input id="custSearch" placeholder="Ketik nama pelanggan" autofocus>
      </label>

      <button class="row sale-customer-option sale-cash-option" id="cashOpt" type="button">
        <div class="avatar">C</div>
        <div class="row-body"><div class="row-title">CASH</div><div class="row-meta">Isi data pelanggan secara manual</div></div>
      </button>
      <div id="custList" class="list sale-customer-list"></div>
    `;
    const listEl = body.querySelector('#custList');
    function drawList(filter) {
      const f = filter.toLowerCase();
      const rows = customers.filter((c2) => c2.name.toLowerCase().includes(f));
      listEl.innerHTML = rows.map((c2) => `
        <button class="row sale-customer-option" data-id="${c2.id}" type="button">
          <div class="avatar">${c2.name[0]?.toUpperCase() || '?'}</div>
          <div class="row-body"><div class="row-title">${escapeHtml(c2.name)}</div>${c2.phone ? `<div class="row-meta">${escapeHtml(c2.phone)}</div>` : ''}</div>
        </button>`).join('');
      listEl.querySelectorAll('.row').forEach((r) => {
        r.onclick = () => close(rows.find((c2) => c2.id === r.dataset.id));
      });
    }
    drawList('');
    body.querySelector('#custClose').onclick = () => close(undefined);
    body.querySelector('#custSearch').oninput = (e) => drawList(e.target.value);
    body.querySelector('#cashOpt').onclick = () => close(cashCustomer());
  });

  if (selected) {
    state.customer = { id: selected.id || '', name: selected.name, phone: selected.phone || '', address: selected.address || '' };
    if (mode === 'edit') state.editDetailsExpanded = false;
    draw(root, mode, state, onSave);
  }
}

async function editAdjustments(root, mode, state, onSave) {
  const a = state.adjustments;
  await openSheet((body, close) => {
    body.classList.add('sale-adjustments-sheet');
    body.innerHTML = `
      <div class="sale-sheet-header">
        <div>
          <div class="sheet-title">Atur Tambahan</div>
          <p>Aktifkan yang diperlukan.</p>
        </div>
        <button type="button" class="sale-sheet-close" id="tClose" aria-label="Tutup">×</button>
      </div>

      <div class="sale-adjustment-list">
        <section class="sale-adjustment-option" data-option="discount">
          <label class="sale-option-toggle" for="tDiscOn">
            <span><strong>Diskon</strong></span>
            <input type="checkbox" id="tDiscOn" ${a.discount.enabled ? 'checked' : ''}>
          </label>
          <div class="sale-option-fields sale-discount-fields">
            <label class="sale-sheet-field sale-sheet-select">
              <span>Jenis</span>
              <select id="tDiscMode">
                <option value="amount" ${a.discount.mode === 'amount' ? 'selected' : ''}>Rupiah</option>
                <option value="percent" ${a.discount.mode === 'percent' ? 'selected' : ''}>Persen</option>
              </select>
            </label>
            <label class="sale-sheet-field">
              <span>Nilai diskon</span>
              <input id="tDiscValue" type="tel" inputmode="numeric" value="${a.discount.value || ''}" placeholder="0">
            </label>
          </div>
        </section>

        <section class="sale-adjustment-option" data-option="shipping">
          <label class="sale-option-toggle" for="tShipOn">
            <span><strong>Ongkos kirim</strong></span>
            <input type="checkbox" id="tShipOn" ${a.shipping.enabled ? 'checked' : ''}>
          </label>
          <div class="sale-option-fields">
            <label class="sale-sheet-field">
              <span>Nominal ongkir</span>
              <div class="sale-money-input"><b>Rp</b><input id="tShipAmount" type="number" inputmode="numeric" value="${a.shipping.amount || ''}" placeholder="0"></div>
            </label>
          </div>
        </section>

        <section class="sale-adjustment-option" data-option="other">
          <label class="sale-option-toggle" for="tOtherOn">
            <span><strong>Biaya lain-lain</strong></span>
            <input type="checkbox" id="tOtherOn" ${a.other.enabled ? 'checked' : ''}>
          </label>
          <div class="sale-option-fields sale-other-fields">
            <label class="sale-sheet-field"><span>Nama biaya</span><input id="tOtherLabel" value="${escapeHtml(a.other.label || '')}" placeholder="Contoh: Biaya kemasan"></label>
            <label class="sale-sheet-field"><span>Nominal</span><div class="sale-money-input"><b>Rp</b><input id="tOtherAmount" type="number" inputmode="numeric" value="${a.other.amount || ''}" placeholder="0"></div></label>
          </div>
        </section>

        ${mode === 'create' ? `
        <section class="sale-adjustment-option sale-payment-option">
          <div class="sale-option-heading"><span><strong>Pembayaran awal</strong></span></div>
          <div class="sale-option-fields">
            <label class="sale-sheet-field"><span>Bayar sekarang</span><div class="sale-money-input"><b>Rp</b><input id="tPayment" type="number" inputmode="numeric" value="${state.payment || ''}" placeholder="0"></div></label>
          </div>
        </section>` : ''}

        <section class="sale-adjustment-option sale-note-option">
          <div class="sale-option-fields">
            <label class="sale-sheet-field"><span>Catatan nota <em>Opsional</em></span><textarea id="tNote" rows="2" placeholder="Tulis catatan singkat">${escapeHtml(state.note)}</textarea></label>
          </div>
        </section>
      </div>

      <div class="sale-sheet-actions">
        <button class="btn" id="tApply" type="button">Terapkan</button>
      </div>
    `;
    const discValue = body.querySelector('#tDiscValue');
    const discOn = body.querySelector('#tDiscOn');
    const discMode = body.querySelector('#tDiscMode');
    const shipOn = body.querySelector('#tShipOn');
    const otherOn = body.querySelector('#tOtherOn');
    const syncOptionState = () => {
      body.querySelector('[data-option="discount"]').classList.toggle('is-enabled', discOn.checked);
      body.querySelector('[data-option="shipping"]').classList.toggle('is-enabled', shipOn.checked);
      body.querySelector('[data-option="other"]').classList.toggle('is-enabled', otherOn.checked);
      discMode.disabled = !discOn.checked;
      discValue.disabled = !discOn.checked;
      body.querySelector('#tShipAmount').disabled = !shipOn.checked;
      body.querySelector('#tOtherLabel').disabled = !otherOn.checked;
      body.querySelector('#tOtherAmount').disabled = !otherOn.checked;
    };
    discOn.onchange = syncOptionState;
    shipOn.onchange = syncOptionState;
    otherOn.onchange = syncOptionState;
    syncOptionState();
    // Terima input kasir yang lazim: 10000, 10.000, Rp 10.000, atau 10,000.
    // Ketika nominal diisi, aktifkan checkbox agar nilai tidak terabaikan.
    const parseDiscount = () => {
      if (discMode.value === 'percent') return Number(discValue.value.replace(',', '.')) || 0;
      return Number(discValue.value.replace(/[^0-9]/g, '')) || 0;
    };
    discValue.oninput = () => { if (parseDiscount() > 0) discOn.checked = true; };
    discValue.onblur = () => {
      const value = parseDiscount();
      if (discMode.value === 'amount' && value > 0) discValue.value = value.toLocaleString('id-ID');
    };
    discMode.onchange = () => {
      const value = parseDiscount();
      discValue.value = value || '';
      discValue.placeholder = discMode.value === 'amount' ? 'Nominal diskon' : 'Persentase diskon';
    };
    body.querySelector('#tClose').onclick = () => close(undefined);
    body.querySelector('#tApply').onclick = () => {
      const discountValue = parseDiscount();
      state.adjustments = {
        discount: { enabled: discOn.checked, mode: discMode.value, value: discountValue },
        shipping: { enabled: shipOn.checked, amount: Number(body.querySelector('#tShipAmount').value) || 0 },
        other: { enabled: otherOn.checked, label: body.querySelector('#tOtherLabel').value.trim(), amount: Number(body.querySelector('#tOtherAmount').value) || 0 },
      };
      if (mode === 'create') state.payment = Number(body.querySelector('#tPayment').value) || 0;
      state.note = body.querySelector('#tNote').value;
      close(true);
    };
  });
  draw(root, mode, state, onSave);
}

async function save(root, mode, state, onSave) {
  if (!state.customer.name.trim()) { toast('Nama pelanggan wajib diisi.'); return; }
  if (!state.saleDate) { toast('Tanggal pengambilan wajib diisi.'); return; }
  if (!state.saleTime) { toast('Jam pengambilan wajib diisi.'); return; }
  if (state.saving) return;
  state.saving = true;
  const saveBtn = root.querySelector('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';
  try {
    await onSave(state);
  } catch (e) {
    toast(e.userMessage || e.message || 'Gagal menyimpan. Silakan coba lagi.');
    state.saving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Nota';
  }
}
