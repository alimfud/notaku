// settingsService.js — pengaturan toko (satu baris, id = 1).

import * as db from '../db.js';
import {
  DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE,
  DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE,
  LEGACY_DEFAULT_WHATSAPP_SHARE_TEMPLATE,
  LEGACY_DETAILED_WHATSAPP_SHARE_TEMPLATE,
  LEGACY_DEFAULT_WHATSAPP_REMINDER_TEMPLATE,
  LEGACY_DETAILED_WHATSAPP_REMINDER_TEMPLATE,
  reminderTemplateForScenario,
  simplifyWhatsAppShareTemplate,
} from './whatsappTemplateService.js';

const DEFAULTS = {
  id: 1,
  storeName: 'Toko Saya',
  storeAddress: '',
  storePhone: '',
  footerNote: 'Terima kasih atas kunjungan Anda.',
  whatsappShareTemplate: DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE,
  whatsappShareProductTemplate: DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE,
  whatsappReminderBothTemplate: DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE,
  whatsappReminderPickupTemplate: DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE,
  whatsappReminderPaymentTemplate: DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE,
  storeLogoData: '',
  storeLogoMaxWidth: 100,
  showStoreNameOnReceipt: true,
  showStoreNameOnBluetooth: true,
  invoicePrefix: 'INV-',
  invoiceDigitCount: 2,
  invoiceNextNumber: 1,
  invoiceResetMode: 'MONTHLY', // NEVER | DAILY | MONTHLY (hanya dipakai mode SEQUENTIAL)
  invoiceLastResetDate: '',
  invoiceNumberFormat: 'DAILY_SEQUENCE', // prefix+YYMM+urutan bulanan | 'SEQUENTIAL' (prefix+nomor urut biasa)
  paperSize: 'THERMAL_58MM', // THERMAL_58MM | THERMAL_80MM | PDF_A4
  printPreview: true,        // pratinjau bitmap sebelum cetak Bluetooth

  // Printer Bluetooth (BLE)
  btPrinterId: '',          // id perangkat Web Bluetooth yang terakhir tersambung (untuk sambung ulang otomatis)
  btPrinterName: '',
  btCharWidth: 32,          // 32 (58mm) atau 48 (80mm) karakter per baris

  // QRIS
  qrisEnabled: false,
  qrisImageData: '',        // base64 data URL gambar QRIS

  // Privasi data pelanggan di struk
  maskCustomerPhone: true,  // kalau true, nomor HP pelanggan di struk cuma tampil 3 digit terakhir
  customerPhoneDisplay: 'LAST3', // FULL | LAST3 | HIDDEN

  // Kunci aplikasi (PIN lokal dan biometrik perangkat melalui WebAuthn).
  security: {
    pinEnabled: false,
    pinHash: '',
    biometricEnabled: false,
    biometricCredentialId: '',
    lockOnBackground: true,
  },

  // Auto backup ke Google Drive
  autoBackup: {
    enabled: false,
    driveConnected: false,
    driveAccountEmail: '',
    backupWindowStart: '07:00',
    backupWindowEnd: '19:00',
    backupDailyLimit: 2,
    backupKeepCount: 15,
    lastBackupFingerprint: '',
    backupPendingSince: '',
    backupCountDate: '',
    backupCountToday: 0,
    confirmBeforeBackup: false,
    lastBackupAt: '',       // ISO datetime backup terakhir berhasil
    lastSyncPushAt: '',     // ISO datetime terakhir kali PUSH ke file sinkron antar perangkat
    lastSyncPullAt: '',     // ISO datetime terakhir kali PULL dari file sinkron antar perangkat
    lastSyncAt: '',         // ISO datetime sinkron otomatis/manual terakhir
    lastSyncFingerprint: '',// sidik data terakhir yang sama di lokal dan Drive
    lastSyncStatus: '',     // status terakhir sinkron otomatis
    lastSyncProblem: false,
    lastSyncPromptKey: '',  // penanda popup mismatch terakhir agar tidak berulang
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 5,
  },
};

let _cache = null;

export async function getSettings() {
  if (_cache) return _cache;
  const existing = await db.get('settings', 1);
  if (existing) {
    const savedShareTemplate = existing.whatsappTextTemplate?.trim();
    const savedSimpleShareTemplate = existing.whatsappShareTemplate?.trim();
    const savedReminderTemplate = existing.whatsappReminderTemplate?.trim();
    const oldReminderIsDefault = !savedReminderTemplate
      || savedReminderTemplate === LEGACY_DEFAULT_WHATSAPP_REMINDER_TEMPLATE
      || savedReminderTemplate === LEGACY_DETAILED_WHATSAPP_REMINDER_TEMPLATE;
    _cache = {
      ...DEFAULTS,
      ...existing,
      whatsappShareTemplate: savedSimpleShareTemplate || (
        !savedShareTemplate
        || savedShareTemplate === LEGACY_DEFAULT_WHATSAPP_SHARE_TEMPLATE
        || savedShareTemplate === LEGACY_DETAILED_WHATSAPP_SHARE_TEMPLATE
          ? DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE
          : simplifyWhatsAppShareTemplate(savedShareTemplate)
      ),
      whatsappShareProductTemplate: existing.whatsappShareProductTemplate?.trim() || DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE,
      whatsappReminderBothTemplate: existing.whatsappReminderBothTemplate?.trim()
        || (oldReminderIsDefault ? DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE : reminderTemplateForScenario(savedReminderTemplate, 'both')),
      whatsappReminderPickupTemplate: existing.whatsappReminderPickupTemplate?.trim()
        || (oldReminderIsDefault ? DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE : reminderTemplateForScenario(savedReminderTemplate, 'pickup')),
      whatsappReminderPaymentTemplate: existing.whatsappReminderPaymentTemplate?.trim()
        || (oldReminderIsDefault ? DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE : reminderTemplateForScenario(savedReminderTemplate, 'payment')),
      autoBackup: { ...DEFAULTS.autoBackup, ...existing.autoBackup },
      security: { ...DEFAULTS.security, ...existing.security },
    };
    return _cache;
  }
  await db.put('settings', DEFAULTS);
  _cache = { ...DEFAULTS };
  return _cache;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const normalized = { ...partial };
  if (Object.hasOwn(normalized, 'whatsappShareTemplate')) normalized.whatsappShareTemplate = normalized.whatsappShareTemplate?.trim() || DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE;
  if (Object.hasOwn(normalized, 'whatsappShareProductTemplate')) normalized.whatsappShareProductTemplate = normalized.whatsappShareProductTemplate?.trim() || DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE;
  if (Object.hasOwn(normalized, 'whatsappReminderBothTemplate')) normalized.whatsappReminderBothTemplate = normalized.whatsappReminderBothTemplate?.trim() || DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE;
  if (Object.hasOwn(normalized, 'whatsappReminderPickupTemplate')) normalized.whatsappReminderPickupTemplate = normalized.whatsappReminderPickupTemplate?.trim() || DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE;
  if (Object.hasOwn(normalized, 'whatsappReminderPaymentTemplate')) normalized.whatsappReminderPaymentTemplate = normalized.whatsappReminderPaymentTemplate?.trim() || DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE;
  const updated = { ...current, ...normalized, id: 1 };
  await db.put('settings', updated);
  _cache = updated;
  return updated;
}

export function invalidateCache() {
  _cache = null;
}
