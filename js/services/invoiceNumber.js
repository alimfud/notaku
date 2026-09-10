// invoiceNumber.js — penomoran invoice.
//
// Dua mode (lihat Setting → Nomor Nota):
//
// 'DATETIME' (default): prefix + YYMMDDHH dari WAKTU NOTA DIBUAT, contoh
// untuk nota dibuat 9 September 2026 jam 21:xx -> "INV-26090921". Sederhana
// dan langsung menunjukkan kapan nota dibuat tanpa perlu simpan counter.
// PERLU DIKETAHUI: karena hanya presisi sampai jam (bukan menit/detik), DUA
// nota yang dibuat di jam yang sama pada hari yang sama akan mendapat nomor
// yang SAMA PERSIS di skema ini — nomor invoice bisa saja tidak unik kalau
// toko ramai. Ini pilihan desain sesuai permintaan (meniru format aplikasi
// nota populer lain); ID internal tiap nota (dipakai untuk semua keperluan
// teknis: cari, hapus, dsb) tetap selalu unik terlepas dari ini.
//
// 'SEQUENTIAL': prefix + nomor urut dengan reset mode (NEVER/DAILY/MONTHLY) —
// skema yang sudah ada sebelumnya, dijamin unik.

import { getSettings, saveSettings } from './settingsService.js';
import { dbDate } from '../format.js';

export async function generateAndAdvance(saleDate = new Date()) {
  const settings = await getSettings();

  if (settings.invoiceNumberFormat === 'SEQUENTIAL') {
    return generateSequential(settings, saleDate);
  }
  return generateDateTime(settings, saleDate);
}

function generateDateTime(settings, saleDate) {
  const yy = String(saleDate.getFullYear()).slice(-2);
  const mm = String(saleDate.getMonth() + 1).padStart(2, '0');
  const dd = String(saleDate.getDate()).padStart(2, '0');
  const hh = String(saleDate.getHours()).padStart(2, '0');
  return Promise.resolve(`${settings.invoicePrefix}${yy}${mm}${dd}${hh}`);
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
