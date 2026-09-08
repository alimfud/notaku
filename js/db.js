// db.js — lapisan penyimpanan utama NotaKu Web (IndexedDB).
// Dipilih di atas localStorage karena: async (tidak blok UI thread), mendukung
// index untuk query cepat, dan kapasitas jauh lebih besar. Semua akses IndexedDB
// terpusat di sini — modul lain tidak boleh buka koneksi sendiri.

const DB_NAME = 'notaku-db';
const DB_VERSION = 1;

let _dbPromise = null;

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
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex(store, indexName, value) {
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

/** Simpan banyak baris sekaligus dalam SATU transaction (cepat, dipakai import). */
export async function bulkPut(store, values) {
  if (!values.length) return;
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Tulis ke beberapa store berbeda dalam SATU transaction (all-or-nothing). */
export async function bulkPutMulti(storeToValues) {
  const storeNames = Object.keys(storeToValues);
  const t = await tx(storeNames, 'readwrite');
  return new Promise((resolve, reject) => {
    for (const name of storeNames) {
      const os = t.objectStore(name);
      for (const v of storeToValues[name]) os.put(v);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function remove(store, key) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Hapus semua baris yang cocok dengan sebuah index value (mis. semua saleItems milik satu sale). */
export async function removeByIndex(store, indexName, value) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).index(indexName).openCursor(IDBKeyRange.only(value));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearStore(store) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  const stores = ['products', 'customers', 'sales', 'saleItems', 'payments', 'settings'];
  const t = await tx(stores, 'readwrite');
  return new Promise((resolve, reject) => {
    for (const s of stores) t.objectStore(s).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Dump seluruh database jadi objek biasa (dipakai BackupService). */
export async function dumpAll() {
  const stores = ['products', 'customers', 'sales', 'saleItems', 'payments', 'settings'];
  const out = {};
  for (const s of stores) out[s] = await getAll(s);
  return out;
}

/** Timpa seluruh database dari hasil dumpAll() sebelumnya (dipakai restore). */
export async function restoreAll(dump) {
  await clearAll();
  const storeToValues = {};
  for (const key of Object.keys(dump)) storeToValues[key] = dump[key];
  await bulkPutMulti(storeToValues);
}
