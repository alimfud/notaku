// invoiceNumber.js — penomoran invoice: prefix + nomor urut + reset mode.
// Reset mode: NEVER (terus naik), DAILY (reset tiap hari baru), MONTHLY (reset tiap bulan baru).

import { getSettings, saveSettings } from './settingsService.js';
import { dbDate } from '../format.js';

export async function generateAndAdvance(saleDate = new Date()) {
  const settings = await getSettings();
  const todayKey = dbDate(saleDate);

  let nextNumber = settings.invoiceNextNumber;
  let shouldReset = false;

  if (settings.invoiceResetMode === 'DAILY') {
    shouldReset = settings.invoiceLastResetDate !== todayKey;
  } else if (settings.invoiceResetMode === 'MONTHLY') {
    const currentMonthKey = todayKey.substring(0, 7);
    const lastMonthKey = (settings.invoiceLastResetDate || '').substring(0, 7);
    shouldReset = lastMonthKey !== currentMonthKey;
  }

  if (shouldReset) nextNumber = 1;

  const numberPart = String(nextNumber).padStart(settings.invoiceDigitCount, '0');
  const invoiceNumber = `${settings.invoicePrefix}${numberPart}`;

  await saveSettings({
    invoiceNextNumber: nextNumber + 1,
    invoiceLastResetDate: todayKey,
  });

  return invoiceNumber;
}
