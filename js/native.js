import { APP_VERSION } from './version.js';

export function isNativeApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}

function compareVersions(left, right) {
  const a = String(left || '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

export async function getNativeUpdateInfo() {
  if (!isNativeApp()) return { available: false, version: APP_VERSION, notes: '' };
  const response = await fetch('https://api.github.com/repos/alimfud/notaku/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return { available: false, version: APP_VERSION, notes: '' };
  }
  return {
    available: compareVersions(version, APP_VERSION) > 0,
    version,
    notes: String(release.body || release.name || '').trim(),
  };
}

export async function downloadAndInstallNativeUpdate(version) {
  const updater = window.Capacitor?.Plugins?.AppUpdater;
  if (!isNativeApp() || !updater?.downloadAndInstall) {
    throw new Error('Pembaruan APK hanya tersedia di aplikasi Android.');
  }
  return updater.downloadAndInstall({ version });
}

export async function openExternalUrl(url) {
  const browser = window.Capacitor?.Plugins?.Browser;
  if (isNativeApp() && browser) {
    await browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
