// installPrompt.js — mendorong user meng-install NotaKu sebagai app (PWA).
//
// CATATAN JUJUR soal batasan platform: browser (Chrome/Edge/Safari) TIDAK
// mengizinkan web page memaksa instalasi tanpa interaksi user — ini sengaja
// dibuat begitu oleh browser demi keamanan (supaya sembarang situs tidak bisa
// menginstall dirinya sendiri diam-diam). Yang bisa dilakukan, dan sudah
// dilakukan di sini: tampilkan banner mencolok & persisten yang mendorong
// user menekan tombol "Install", memakai event `beforeinstallprompt` bawaan
// browser (Chrome/Edge Android & Desktop). Safari iOS tidak mendukung event
// ini sama sekali — di situ instruksi manual "Bagikan -> Tambah ke Layar
// Utama" ditampilkan sebagai gantinya.

let deferredPrompt = null;

export function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export async function getInstallReadiness() {
  if (isAppInstalled()) return { state: 'installed', label: 'Sudah terpasang', detail: 'NotaKu sedang berjalan sebagai aplikasi.' };
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return { state: 'unavailable', label: 'Belum siap dipasang', detail: 'Instalasi membutuhkan koneksi HTTPS.' };
  }
  if (deferredPrompt) return { state: 'ready', label: 'Siap dipasang', detail: 'Browser sudah menyediakan tombol instalasi NotaKu.' };
  if (isIos()) return { state: 'manual', label: 'Pasang lewat menu Safari', detail: 'Ketuk Bagikan, lalu pilih “Tambah ke Layar Utama”.' };
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  if (!registration) return { state: 'waiting', label: 'Menyiapkan instalasi', detail: 'Buka ulang halaman setelah koneksi internet tersedia.' };
  return { state: 'manual', label: 'Pasang lewat menu browser', detail: 'Buka menu ⋮ Chrome, lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.' };
}

export async function requestInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent('notaku-install-status', { detail: result }));
  return result.outcome === 'accepted';
}

function showBanner(onInstallClick, isIosManual, isManualFallback = false) {
  if (isAppInstalled() || sessionStorage.getItem('installBannerDismissed')) return;
  document.getElementById('installBanner')?.remove();
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.style.cssText = `
    position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:520px;
    background:#14151A;color:#fff;padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 14px);
    display:flex;align-items:center;gap:12px;z-index:150;box-shadow:0 -4px 20px rgba(0,0,0,.2);
  `;
  banner.innerHTML = isIosManual
    ? `<div style="flex:1;font-size:13px;line-height:1.4;">Pasang NotaKu di HP-mu: ketuk tombol <b>Bagikan</b> di Safari, lalu pilih <b>"Tambah ke Layar Utama"</b>.</div>
       <button id="dismissInstall" style="background:none;border:none;color:#fff;font-size:20px;padding:4px 8px;">×</button>`
    : `<div style="flex:1;font-size:13.5px;font-weight:600;">Pasang NotaKu sebagai aplikasi di HP-mu — lebih cepat & bisa dipakai offline.</div>
       <button id="doInstall" style="background:#fff;color:#14151A;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:13px;flex-shrink:0;">${isManualFallback ? 'Cara install' : 'Install'}</button>
       <button id="dismissInstall" style="background:none;border:none;color:#fff;font-size:20px;padding:4px 4px;flex-shrink:0;">×</button>`;
  document.body.appendChild(banner);

  const dismiss = () => {
    sessionStorage.setItem('installBannerDismissed', '1');
    banner.remove();
  };
  banner.querySelector('#dismissInstall').onclick = dismiss;
  const installBtn = banner.querySelector('#doInstall');
  if (installBtn) {
    installBtn.onclick = async () => {
      if (onInstallClick) {
        await onInstallClick();
        banner.remove();
      } else {
        alert('Untuk memasang NotaKu, ketuk menu ⋮ Chrome lalu pilih "Tambahkan ke layar utama" atau "Instal aplikasi".');
      }
    };
  }
}

export function initInstallPrompt() {
  if (isAppInstalled()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner(async () => {
      await requestInstall();
    }, false);
    window.dispatchEvent(new Event('notaku-install-status'));
  });

  // Safari iOS tidak mengirim beforeinstallprompt — tampilkan instruksi manual.
  if (isIos()) {
    setTimeout(() => showBanner(null, true), 1500);
  } else {
    // Chrome hanya mengirim beforeinstallprompt jika seluruh syarat PWA sudah
    // terpenuhi. Tetap tampilkan bantuan manual bila event belum tersedia.
    setTimeout(() => {
      if (!deferredPrompt && !document.getElementById('installBanner')) {
        showBanner(null, false, true);
      }
    }, 2500);
  }

  window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('installBanner');
    if (banner) banner.remove();
    window.dispatchEvent(new Event('notaku-install-status'));
  });
}
