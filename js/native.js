export function isNativeApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}

export async function openExternalUrl(url) {
  const browser = window.Capacitor?.Plugins?.Browser;
  if (isNativeApp() && browser) {
    await browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadAndInstallUpdate(url, version) {
  const updater = window.Capacitor?.Plugins?.AppUpdater
    || window.Capacitor?.registerPlugin?.('AppUpdater');
  if (!isNativeApp() || !updater?.downloadAndInstall) {
    throw new Error('Updater Android tidak tersedia');
  }
  return updater.downloadAndInstall({ url, version });
}
