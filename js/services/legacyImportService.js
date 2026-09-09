// legacyImportService.js — impor data dari database aplikasi nota LAMA (skema
// tbjual/tbjualitem/tbbarang/tbpelanggan/tbsetting) ke skema NotaKu Web.
//
// Logika pemetaan ini port langsung dari lib/domain/services/legacy_import_service.dart
// (versi Flutter), yang sudah divalidasi terhadap file database produksi asli.
// Baca komentar di bawah sebelum mengubah apa pun di sini — ada temuan penting
// soal kolom tbjual.Bayar yang kalau terlewat bisa membuat pembayaran tercatat dobel.

import { loadSqlJs } from './sqlJsLoader.js';
import * as db from '../db.js';
import { getSettings, saveSettings } from './settingsService.js';

// UUID v5-ish deterministik sederhana berbasis string, supaya id yang sama
// selalu dihasilkan untuk baris legacy yang sama (import bisa diulang tanpa duplikasi).
function legacyId(namespace, key) {
  const str = `${namespace}:${key}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
  h2 = (Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0;
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  // Bukan format UUID asli (tidak perlu — ini cuma dipakai sebagai primary key
  // internal IndexedDB), yang penting: deterministik (sama input -> sama output)
  // dan cukup unik untuk data skala UMKM (64-bit hash space).
  return `legacy-${namespace}-${hex}`;
}

function all(sqlDb, sql, params = []) {
  const res = sqlDb.exec(sql, params);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

export async function importLegacyFile(file, { importStoreSettings = true, onProgress } = {}) {
  const report = (msg) => { if (onProgress) onProgress(msg); };

  report('Membuka file database...');
  const SQL = await loadSqlJs();
  const buf = await file.arrayBuffer();
  const legacyDb = new SQL.Database(new Uint8Array(buf));

  const tableRows = all(legacyDb, "SELECT name FROM sqlite_master WHERE type='table'");
  const tables = new Set(tableRows.map((r) => r.name));

  if (!tables.has('tbjual') && !tables.has('tbbarang')) {
    legacyDb.close();
    throw new Error('File ini tidak dikenali sebagai database nota. Pastikan kamu memilih file .db yang benar.');
  }

  const now = new Date().toISOString();
  let productsImported = 0, customersImported = 0, salesImported = 0, paymentsImported = 0, storeInfoImported = false;

  // ---------- Produk ----------
  if (tables.has('tbbarang')) {
    report('Mengimpor produk...');
    // Pakai rowid SQLite (bukan nama) sebagai kunci deterministik — beberapa
    // toko punya produk dengan NAMA SAMA tapi harga berbeda (mis. varian
    // ukuran yang tidak dibedakan namanya di aplikasi lama). Kalau kunci
    // memakai nama, baris kedua akan menimpa baris pertama dan salah satu
    // varian hilang. rowid selalu unik per baris, jadi aman.
    const rows = all(legacyDb, 'SELECT rowid as _rowid_, * FROM tbbarang');
    const products = [];
    for (const row of rows) {
      const name = (row.NamaBarang || '').trim();
      if (!name) continue;
      products.push({
        id: legacyId('tbbarang', row._rowid_),
        name,
        category: (row.Kategori || '').trim(),
        unit: (row.Satuan || '').trim() || 'pcs',
        price: Number(row.HargaSatuan) || 0,
        cost: Number(row.Modal) || 0,
        stock: Number(row.Stok) || 0,
        barcode: (row.Barcode || '').trim(),
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.bulkPut('products', products);
    productsImported = products.length;
  }

  // ---------- Pelanggan ----------
  if (tables.has('tbpelanggan')) {
    report('Mengimpor pelanggan...');
    const rows = all(legacyDb, 'SELECT rowid as _rowid_, * FROM tbpelanggan');
    const customers = [];
    for (const row of rows) {
      const name = (row.Nama || '').trim();
      if (!name || name.toUpperCase() === 'CASH') continue;
      customers.push({
        id: legacyId('tbpelanggan', row._rowid_),
        name,
        phone: (row.Telepon || '').trim(),
        address: (row.Alamat || '').trim(),
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.bulkPut('customers', customers);
    customersImported = customers.length;
  }

  // ---------- Pengaturan toko ----------
  if (importStoreSettings && tables.has('tbsetting')) {
    report('Mengimpor info toko...');
    const rows = all(legacyDb, 'SELECT * FROM tbsetting LIMIT 1');
    if (rows.length) {
      const row = rows[0];
      const current = await getSettings();
      const legacyPrefix = row.PrefixNoNota || '';
      const safePrefix = legacyPrefix.includes('[') ? current.invoicePrefix : legacyPrefix;
      const legacyReset = (row.ResetNoNota || '').toUpperCase();
      const resetMode = legacyReset === 'H' ? 'DAILY' : legacyReset === 'B' ? 'MONTHLY' : 'NEVER';
      await saveSettings({
        storeName: (row.NamaToko || '').trim() || current.storeName,
        storeAddress: (row.Alamat || '').trim() || current.storeAddress,
        storePhone: (row.Telepon || '').trim() || current.storePhone,
        footerNote: (row.CatatanKaki || '').trim() || current.footerNote,
        invoicePrefix: safePrefix || current.invoicePrefix,
        invoiceDigitCount: row.DigitNoNota || current.invoiceDigitCount,
        invoiceResetMode: resetMode,
      });
      storeInfoImported = true;
    }
  }

  // ---------- Nota ----------
  if (tables.has('tbjual')) {
    report('Mengimpor nota...');
    const saleRows = all(legacyDb, 'SELECT * FROM tbjual');
    const sales = [];
    const items = [];
    const payments = [];

    for (const row of saleRows) {
      const legacyNo = row._no;
      if (legacyNo === null || legacyNo === undefined) continue;
      const saleId = legacyId('tbjual', legacyNo);
      const tanggal = row.Tanggal || now.slice(0, 10);
      const waktuRaw = row.Waktu || '00:00';
      const waktu = waktuRaw.length >= 5 ? waktuRaw.slice(0, 5) : waktuRaw;
      const total = Number(row.Total) || 0;
      const dp = Number(row.Bayar) || 0;
      const noNota = (row.NoNota || '').trim();
      const namaPelanggan = (row.Nama || '').trim();

      // PENTING: tbjual.Bayar adalah CACHE dari SUM(tbjualbayar.Bayar), bukan
      // nilai tambahan — divalidasi terhadap data produksi asli (0 selisih di
      // seluruh baris yang diuji). Kalau dijumlahkan lagi, pembayaran akan
      // tercatat dua kali. Jadi: pakai tbjualbayar sebagai sumber utama, dan
      // HANYA pakai tbjual.Bayar sebagai fallback kalau tbjualbayar kosong.
      let totalPaid = 0;
      if (tables.has('tbjualbayar')) {
        const bayarRows = all(legacyDb, 'SELECT * FROM tbjualbayar WHERE _no=?', [legacyNo]);
        for (const b of bayarRows) {
          const amount = Number(b.Bayar) || 0;
          if (amount === 0) continue;
          totalPaid += amount;
          const bWaktuRaw = b.Waktu || '00:00';
          const bWaktu = bWaktuRaw.length >= 5 ? bWaktuRaw.slice(0, 5) : bWaktuRaw;
          payments.push({
            id: legacyId('tbjualbayar', b._id ?? `${legacyNo}-${totalPaid}`),
            saleId,
            amount,
            paymentDate: b.Tanggal || tanggal,
            paymentTime: bWaktu,
            note: (b.Catatan || '').trim() || 'Pembayaran (impor)',
            createdAt: now,
          });
        }
      }
      if (totalPaid === 0 && dp > 0) {
        totalPaid = dp;
        payments.push({
          id: legacyId('tbjual-dp', legacyNo),
          saleId,
          amount: dp,
          paymentDate: tanggal,
          paymentTime: waktu,
          note: 'Pembayaran (impor)',
          createdAt: now,
        });
      }

      let status;
      if (totalPaid <= 0) status = 'UNPAID';
      else if (totalPaid < total) status = 'PARTIAL';
      else if (totalPaid > total) status = 'OVERPAID';
      else status = 'PAID';

      sales.push({
        id: saleId,
        invoiceNumber: noNota || `LEGACY-${legacyNo}`,
        customerId: null,
        customerName: namaPelanggan || 'CASH',
        customerPhone: (row.Telepon || '').trim(),
        customerAddress: (row.Alamat || '').trim(),
        saleDate: tanggal,
        saleTime: waktu,
        subtotal: Number(row.SubTotal) || total,
        discountAmount: Number(row.DiskonRp) || 0,
        total,
        note: (row.Catatan || '').trim(),
        status,
        isDeleted: 0,
        // Nota hasil impor adalah riwayat LAMA — dianggap "selesai" dari awal
        // supaya tidak memenuhi daftar "belum selesai" (yang harusnya fokus
        // ke pesanan baru yang sedang berjalan). Status pembayaran (LUNAS/
        // dst) tetap dihitung apa adanya dari data lama, tidak terpengaruh ini.
        completed: 1,
        autoMarkedPaid: 0,
        autoLunasOverridden: 0,
        createdAt: now,
        updatedAt: now,
      });

      if (tables.has('tbjualitem')) {
        const itemRows = all(legacyDb, 'SELECT * FROM tbjualitem WHERE _no=? ORDER BY UrutanItem ASC', [legacyNo]);
        let order = 0;
        for (const itemRow of itemRows) {
          const productName = (itemRow.NamaBarang || '').trim();
          if (!productName) continue;
          const qty = Number(itemRow.Qty) || 0;
          const harga = Number(itemRow.HargaSatuan) || 0;
          const jumlahNet = Number(itemRow.JumlahHargaNET) || Number(itemRow.JumlahHarga) || qty * harga;
          items.push({
            id: legacyId('tbjualitem', `${legacyNo}-${order + 1}`),
            saleId,
            productId: null,
            productName,
            unit: (itemRow.Satuan || '').trim(),
            qty,
            price: harga,
            subtotal: jumlahNet,
            sortOrder: order,
          });
          order++;
        }
      }
    }

    report(`Menyimpan ${sales.length} nota ke database...`);
    await db.bulkPutMulti({ sales, saleItems: items, payments });
    salesImported = sales.length;
    paymentsImported = payments.length;
  }

  legacyDb.close();

  return { productsImported, customersImported, salesImported, paymentsImported, storeInfoImported };
}
