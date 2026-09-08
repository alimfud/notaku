// sqlJsLoader.js — memuat sql.js hanya saat dibutuhkan (import database lama),
// supaya beban awal aplikasi tetap ringan untuk pemakaian sehari-hari.

let _sqlJsPromise = null;

export function loadSqlJs() {
  if (_sqlJsPromise) return _sqlJsPromise;
  _sqlJsPromise = new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      window.initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` })
        .then(resolve, reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
    script.onload = () => {
      window.initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` })
        .then(resolve, reject);
    };
    script.onerror = () => reject(new Error('Gagal memuat modul pembaca database. Periksa koneksi internet.'));
    document.head.appendChild(script);
  });
  return _sqlJsPromise;
}
