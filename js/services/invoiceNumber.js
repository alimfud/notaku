// invoiceNumber.js — penomoran invoice.
//
// Dua mode (lihat Setting → Nomor Nota):
//
// 'DAILY_SEQUENCE' (default): prefix + YYMMDD + nomor urut yang RESET SETIAP
// HARI, contoh nota pertama hari ini -> "INV #26091001", nota kedua hari yang
// sama -> "INV #26091002", besok mulai dari 01 lagi -> "INV #26091101". Ini
// menghindari tabrakan nomor yang bisa terjadi kalau presisi cuma sampai jam
// (skema lama) — setiap nota di hari yang sama pasti dapat nomor berbeda.
//
// 'SEQUENTIAL': prefix + nomor urut TANPA tanggal, dengan mode reset sendiri
// (NEVER/DAILY/MONTHLY) — skema alternatif untuk yang tidak ingin tanggal
// ikut tercetak di nomor nota.

import { getSettings, saveSettings } from './settingsService.js';
import { dbDate } from '../format.js';

export async function generateAndAdvance(saleDate = new Date()) {
  const settings = await getSettings();

  if (settings.invoiceNumberFormat === 'SEQUENTIAL') {
    return generateSequential(settings, saleDate);
  }
  return generateDailySequence(settings, saleDate);
}

async function generateDailySequence(settings, saleDate) {
  const todayKey = dbDate(saleDate);
  const yy = String(saleDate.getFullYear()).slice(-2);
  const mm = String(saleDate.getMonth() + 1).padStart(2, '0');
  const dd = String(saleDate.getDate()).padStart(2, '0');

  // Counter SELALU reset tiap hari baru untuk mode ini (beda dengan mode
  // SEQUENTIAL yang resetnya bisa diatur NEVER/DAILY/MONTHLY).
  const shouldReset = settings.invoiceLastResetDate !== todayKey;
  const nextNumber = shouldReset ? 1 : settings.invoiceNextNumber;

  const counterPart = String(nextNumber).padStart(settings.invoiceDigitCount || 2, '0');
  const invoiceNumber = `${settings.invoicePrefix}${yy}${mm}${dd}${counterPart}`;

  await saveSettings({
    invoiceNextNumber: nextNumber + 1,
    invoiceLastResetDate: todayKey,
  });

  return invoiceNumber;
}

async function generateSequential(settings, saleDate) {
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
