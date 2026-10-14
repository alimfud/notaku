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

