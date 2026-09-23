// Resolve relative to this module, including deployments in a subdirectory.
export const DEFAULT_RECEIPT_LOGO = new URL('../../docs/logo.webp', import.meta.url).href;

export function logoWidth(settings) {
  return Math.round(Math.min(100, Math.max(10, Number(settings.storeLogoMaxWidth) || 100)));
}

export function receiptLogo(settings) {
  return settings.storeLogoData || DEFAULT_RECEIPT_LOGO;
}
