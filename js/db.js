// db.js — lapisan penyimpanan utama NotaKu Web (IndexedDB).
// Dipilih di atas localStorage karena: async (tidak blok UI thread), mendukung
// index untuk query cepat, dan kapasitas jauh lebih besar. Semua akses IndexedDB
// terpusat di sini — modul lain tidak boleh buka koneksi sendiri.

const DB_NAME = 'notaku-db';
const DB_VERSION = 3;

let _dbPromise = null;

// Cache baca per sesi. Navigasi SPA sering meminta store yang sama beberapa
// kali (dashboard/laporan/status otomatis). IndexedDB tetap menjadi sumber
// data utama; cache ini hanya menghindari transaction + structured-clone yang
// berulang selama datanya belum berubah.
const _readCache = new Map();
const _readLoads = new Map();
const _storeVersions = new Map();
const _cacheChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('notaku-db-cache')
  : null;

function cloneValue(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function invalidateStores(storeNames, notify = false) {
  for (const store of storeNames) {
    _readCache.delete(store);
    // Promise baca lama tidak bisa dibatalkan, tetapi jangan biarkan pembaca
    // baru ikut menunggu hasil yang dibuat sebelum perubahan dimulai.
    _readLoads.delete(store);
    _storeVersions.set(store, (_storeVersions.get(store) || 0) + 1);
  }
  if (notify) _cacheChannel?.postMessage(storeNames);
}

// No database read: used to expire derived caches after local or cross-tab writes.
export function salePaymentRevision() {
  return `${_storeVersions.get('sales') || 0}:${_storeVersions.get('payments') || 0}`;
}

/** Batch read/modify/write while holding one shared sales/payments lock.
 * Skips reading payments when no sale is due; no cache invalidation on a no-op.
 */
export async function mutateSettlementBatch(selectSale, updater) {
  const t = await tx(['sales', 'payments'], 'readwrite');
  return new Promise((resolve, reject) => {
    let changed = 0, failure;
    const salesRequest = t.objectStore('sales').getAll();
    salesRequest.onsuccess = () => {
      try {
        const sales = salesRequest.result.filter(selectSale);
        if (!sales.length) return;
        const paymentsRequest = t.objectStore('payments').getAll();
        paymentsRequest.onsuccess = () => {
          try {
            const result = updater(sales, paymentsRequest.result);
            changed = result.sales.length;
            if (!changed) return;
            invalidateStores(['sales', 'payments']);
            for (const sale of result.sales) t.objectStore('sales').put(sale);
            for (const payment of result.payments) t.objectStore('payments').put(payment);
          } catch (error) { failure = error; t.abort(); }
        };
      } catch (error) { failure = error; t.abort(); }
    };
    t.oncomplete = () => {
      if (changed) invalidateStores(['sales', 'payments'], true);
      resolve(changed);
    };
    t.onabort = () => reject(failure || t.error || new Error('Pelunasan otomatis dibatalkan.'));
    t.onerror = () => reject(failure || t.error);
  });
}

_cacheChannel?.addEventListener('message', (event) => {
  if (Array.isArray(event.data)) invalidateStores(event.data, false);
});

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      // products
      if (!db.objectStoreNames.contains('products')) {
        const s = db.createObjectStore('products', { keyPath: 'id' });
        s.createIndex('name', 'name');
        s.createIndex('isActive', 'isActive');
      }
      // customers
      if (!db.objectStoreNames.contains('customers')) {
        const s = db.createObjectStore('customers', { keyPath: 'id' });
        s.createIndex('name', 'name');
        s.createIndex('isActive', 'isActive');
      }
      // sales
      if (!db.objectStoreNames.contains('sales')) {
        const s = db.createObjectStore('sales', { keyPath: 'id' });
        s.createIndex('saleDate', 'saleDate');
        s.createIndex('isDeleted', 'isDeleted');
        s.createIndex('createdAt', 'createdAt');
      }
      // saleItems
      if (!db.objectStoreNames.contains('saleItems')) {
        const s = db.createObjectStore('saleItems', { keyPath: 'id' });
        s.createIndex('saleId', 'saleId');
      }
      // payments
      if (!db.objectStoreNames.contains('payments')) {
        const s = db.createObjectStore('payments', { keyPath: 'id' });
        s.createIndex('saleId', 'saleId');
      }
      // settings (single row, id = 1)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      // expenses — pengeluaran operasional yang berdiri sendiri dari nota.
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('expenseDate', 'expenseDate');
        s.createIndex('category', 'category');
      }
      // auditLogs — riwayat tindakan penting untuk pelacakan perubahan data.
      if (!db.objectStoreNames.contains('auditLogs')) {
        const s = db.createObjectStore('auditLogs', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('entityType', 'entityType');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => db.transaction(storeNames, mode));
}

/** Ambil semua baris dari sebuah store (opsional filter lewat index). */
export async function getAll(store) {
  if (_readCache.has(store)) return cloneValue(_readCache.get(store));
  if (_readLoads.has(store)) return cloneValue(await _readLoads.get(store));

  const version = _storeVersions.get(store) || 0;
  const t = await tx([store]);
  const load = new Promise((resolve, reject) => {
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  _readLoads.set(store, load);
  try {
    const rows = await load;
    if ((_storeVersions.get(store) || 0) === version) _readCache.set(store, rows);
    return cloneValue(rows);
  } finally {
    if (_readLoads.get(store) === load) _readLoads.delete(store);
  }
}

export async function getByIndex(store, indexName, value) {
  if (_readCache.has(store)) {
    return cloneValue(_readCache.get(store).filter((row) => row[indexName] === value));
  }
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  if (_readCache.has(store)) {
    return cloneValue(_readCache.get(store).find((row) => row.id === key) || null);
  }
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  invalidateStores([store]);
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => invalidateStores([store], true);
  });
}

/** Simpan banyak baris sekaligus dalam SATU transaction (cepat, dipakai import). */
export async function bulkPut(store, values) {
  if (!values.length) return;
  invalidateStores([store]);
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    t.oncomplete = () => { invalidateStores([store], true); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

/** Tulis ke beberapa store berbeda dalam SATU transaction (all-or-nothing). */
export async function bulkPutMulti(storeToValues) {
  const storeNames = Object.keys(storeToValues);
  invalidateStores(storeNames);
  const t = await tx(storeNames, 'readwrite');
  return new Promise((resolve, reject) => {
    for (const name of storeNames) {
      const os = t.objectStore(name);
      for (const v of storeToValues[name]) os.put(v);
    }
    t.oncomplete = () => { invalidateStores(storeNames, true); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

/** Read and change one sale and its payments atomically, including across tabs.
 * The updater is synchronous and returns { sale, payments?, removeIds? } or null.
 */
export async function mutateSalePayments(saleId, updater) {
  invalidateStores(['sales', 'payments']);
  const t = await tx(['sales', 'payments'], 'readwrite');
  return new Promise((resolve, reject) => {
    let sale, payments, ready = 0, changed = false, failure;
    const saleRequest = t.objectStore('sales').get(saleId);
    const paymentRequest = t.objectStore('payments').index('saleId').getAll(saleId);
    const apply = () => {
      if (++ready !== 2 || !sale) return;
      try {
        const result = updater(sale, payments);
        if (!result) return;
        t.objectStore('sales').put(result.sale);
        for (const payment of result.payments || []) t.objectStore('payments').put(payment);
        for (const id of result.removeIds || []) t.objectStore('payments').delete(id);
        changed = true;
      } catch (error) { failure = error; t.abort(); }
    };
    saleRequest.onsuccess = () => { sale = saleRequest.result; apply(); };
    paymentRequest.onsuccess = () => { payments = paymentRequest.result; apply(); };
    t.oncomplete = () => { invalidateStores(['sales', 'payments'], true); resolve(changed); };
    t.onabort = () => reject(failure || t.error || new Error('Transaksi pembayaran dibatalkan.'));
    t.onerror = () => reject(failure || t.error);
  });
}

export async function remove(store, key) {
  invalidateStores([store]);
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    t.oncomplete = () => invalidateStores([store], true);
  });
}

/** Hapus semua baris yang cocok dengan sebuah index value (mis. semua saleItems milik satu sale). */
export async function removeByIndex(store, indexName, value) {
  invalidateStores([store]);
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).index(indexName).openCursor(IDBKeyRange.only(value));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    t.oncomplete = () => { invalidateStores([store], true); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

export async function clearStore(store) {
  invalidateStores([store]);
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    t.oncomplete = () => invalidateStores([store], true);
  });
}

export async function clearAll() {
  const stores = ['products', 'customers', 'sales', 'saleItems', 'payments', 'expenses', 'settings', 'auditLogs'];
  invalidateStores(stores);
  const t = await tx(stores, 'readwrite');
  return new Promise((resolve, reject) => {
    for (const s of stores) t.objectStore(s).clear();
    t.oncomplete = () => { invalidateStores(stores, true); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

/** Dump seluruh database jadi objek biasa (dipakai BackupService). */
export async function dumpAll() {
  const stores = ['products', 'customers', 'sales', 'saleItems', 'payments', 'expenses', 'settings', 'auditLogs'];
  const out = {};
  for (const s of stores) out[s] = await getAll(s);
  return out;
}

/** Timpa seluruh database dari hasil dumpAll() sebelumnya (dipakai restore). */
export async function restoreAll(dump) {
  await clearAll();
  const storeToValues = {};
  // Backup versi lama belum punya expenses; jangan mengirim store asing ke
  // transaction dan jangan gagal saat restore backup lama.
  for (const key of ['products', 'customers', 'sales', 'saleItems', 'payments', 'expenses', 'settings', 'auditLogs']) {
    storeToValues[key] = Array.isArray(dump[key]) ? dump[key] : [];
  }
  await bulkPutMulti(storeToValues);
}
