// invoiceNumber.js — penomoran invoice.
//
// Dua mode (lihat Setting → Nomor Nota):
//
// 'DAILY_SEQUENCE' (nama lama yang tetap didukung): prefix + YYMM + nomor urut
// yang RESET SETIAP BULAN, contoh "INV-260901". Nama setting dipertahankan
// agar data pengguna lama tidak rusak.
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
  return generateMonthlySequence(settings, saleDate);
}

async function generateMonthlySequence(settings, saleDate) {
  const todayKey = dbDate(saleDate);
  const yy = String(saleDate.getFullYear()).slice(-2);
  const mm = String(saleDate.getMonth() + 1).padStart(2, '0');
  const currentMonthKey = todayKey.substring(0, 7);
  const lastMonthKey = (settings.invoiceLastResetDate || '').substring(0, 7);
  const shouldReset = lastMonthKey !== currentMonthKey;
  const nextNumber = shouldReset ? 1 : Math.max(1, Math.floor(Number(settings.invoiceNextNumber) || 1));

  const counterPart = String(nextNumber).padStart(settings.invoiceDigitCount || 2, '0');
  const invoiceNumber = `${settings.invoicePrefix}${yy}${mm}${counterPart}`;

  await saveSettings({
    invoiceNextNumber: nextNumber + 1,
    invoiceLastResetDate: todayKey,
  });

  return invoiceNumber;
}

async function generateSequential(settings, saleDate) {
  const todayKey = dbDate(saleDate);
  let nextNumber = Math.max(1, Math.floor(Number(settings.invoiceNextNumber) || 1));
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
