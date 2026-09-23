// Run against XAMPP in a fresh browser context; never uses the user's browser data.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await context.addInitScript(() => {
    window.__bleChunks = [];
    const characteristic = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: async bytes => window.__bleChunks.push(Array.from(bytes)) };
    const server = { connected: true, getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) };
    const device = { id: 'test-ble', name: 'Test BLE', gatt: { connect: async () => server }, addEventListener() {} };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => device, getDevices: async () => [device] } });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.NOTAKU_URL || 'http://localhost/notaku/';
  const output = path.join(__dirname, 'output');
  try {
    await page.goto(base);
    await page.waitForSelector('#pageTitle');
    const invoices = await page.evaluate(async () => {
      const { saveSettings } = await import('./js/services/settingsService.js');
      const { generateAndAdvance } = await import('./js/services/invoiceNumber.js');
      await saveSettings({ invoicePrefix: 'INV-', invoiceDigitCount: 3, invoiceNumberFormat: 'DAILY_SEQUENCE', invoiceLastResetDate: '2026-09-01', invoiceNextNumber: '9' });
      const values = [];
      for (const date of ['2026-09-23', '2026-09-24', '2026-10-01', '2026-10-31', '2027-01-01']) values.push(await generateAndAdvance(new Date(date + 'T12:00:00')));
      await saveSettings({ invoiceNumberFormat: 'SEQUENTIAL', invoiceResetMode: 'NEVER', invoiceDigitCount: 5, invoiceNextNumber: 42 });
      values.push(await generateAndAdvance(new Date('2027-02-01T12:00:00')));
      for (const mode of ['DAILY', 'MONTHLY']) {
        await saveSettings({ invoiceResetMode: mode, invoiceLastResetDate: '2027-01-31', invoiceNextNumber: 88 });
        values.push(await generateAndAdvance(new Date('2027-02-01T12:00:00')));
      }
      return values;
    });
    assert.deepEqual(invoices, ['INV-2609009', 'INV-2609010', 'INV-2610001', 'INV-2610002', 'INV-2701001', 'INV-00042', 'INV-00001', 'INV-00001']);
    console.log('PASS monthly/year rollover, same-month continuity, legacy sequential settings');

    const saleId = await page.evaluate(async () => {
      const { saveSettings } = await import('./js/services/settingsService.js');
      const { createSale } = await import('./js/services/saleService.js');
      await saveSettings({ storeName: 'TOKO UJI', storeAddress: 'Jalan Contoh 12', storePhone: '08123456789', storeLogoData: '', storeLogoMaxWidth: 100, printPreview: true, invoiceNumberFormat: 'DAILY_SEQUENCE', invoiceDigitCount: 2, customerPhoneDisplay: 'LAST3', footerNote: 'Terima kasih\n[print_datetime]', qrisEnabled: true, qrisImageData: new URL('icons/icon-192.png', location.href).href });
      const sale = await createSale({ customer: { name: 'Pelanggan Uji', phone: '081234567890', address: 'Alamat pelanggan' }, lines: [
        { name: 'Produk dengan nama panjang untuk memeriksa wrapping dan alignment', qty: 2.5, unit: 'meter', price: 12000, note: 'Catatan barang tetap tampil' },
        { name: 'Barang kedua', qty: 1, unit: 'pcs', price: 7500 },
      ], discountAmount: 1500, initialPayment: 10000, note: 'Catatan nota uji' });
      return typeof sale === 'string' ? sale : sale.id;
    });
    assert.ok(saleId);
    await page.goto(base + '#/sale/' + saleId);
    await page.waitForSelector('#receiptCapture');
    await page.locator('#receiptCapture img').first().evaluate(img => img.decode());
    assert.equal(await page.locator('.receipt-qris').count(), 1);
    await page.locator('#receiptCapture').screenshot({ path: path.join(output, 'detail.png') });

    for (const width of [10, 55, 100]) {
      await page.goto(base + '#/settings/store');
      await page.waitForSelector('#logoMaxWidth');
      await page.locator('#logoMaxWidth').evaluate((slider, value) => { slider.value = value; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change')); }, String(width));
      await page.waitForFunction(async value => (await import('./js/services/settingsService.js')).getSettings().then(s => s.storeLogoMaxWidth === value), width);
      assert.equal(await page.locator('#logoWidthValue').textContent(), `${width}%`);
      await page.goto(base + '#/sale/' + saleId);
      await page.waitForSelector('#receiptCapture');
      const ratio = await page.locator('.receipt-logo').evaluate(img => img.getBoundingClientRect().width / img.parentElement.getBoundingClientRect().width);
      assert.ok(Math.abs(ratio - width / 100) < 0.005);
      const nativeResult = await page.evaluate(async logoWidth => {
        const { buildReceiptBytes } = await import('./js/services/printing/bluetoothPrinter.js');
        const data = {
          storeName: 'TOKO UJI', storeAddress: 'Jalan Contoh 12', storePhone: '08123456789',
          logoData: new URL('docs/logo.webp', location.href).href, logoMaxWidth: logoWidth,
          invoiceNumber: 'INV-260901', dateLabel: '23 Sep 2026', timeLabel: '11:44',
          customerName: 'Pelanggan Uji', customerAddress: 'Alamat pelanggan', customerPhoneDisplay: '*******890',
          lines: [{ name: 'Produk dengan nama panjang untuk memeriksa wrapping dan alignment', qty: 2.5, unit: 'meter', price: 12000, subtotal: 30000, note: 'Catatan barang' }],
          discount: 1500, shipping: 5000, other: 0, total: 33500, paid: 10000, remaining: 23500,
          note: 'Catatan nota', qrisImageData: new URL('icons/icon-192.png', location.href).href, footerNote: 'Terima kasih',
        };
        const results = [];
        for (const charWidth of [32, 48]) {
          const bytes = await buildReceiptBytes(data, charWidth);
          const ascii = String.fromCharCode(...bytes);
          const rasterHeaders = [];
          for (let i = 0; i < bytes.length - 7; i++) {
            if (bytes[i] === 29 && bytes[i + 1] === 118 && bytes[i + 2] === 48) {
              rasterHeaders.push({ widthBytes: bytes[i + 4] + bytes[i + 5] * 256, rows: bytes[i + 6] + bytes[i + 7] * 256 });
            }
          }
          results.push({ length: bytes.length, ascii, rasterHeaders });
        }
        return results;
      }, width);
      for (const result of nativeResult) {
        assert.match(result.ascii, /TOKO UJI/);
        assert.match(result.ascii, /Produk dengan nama/);
        assert.match(result.ascii, /TOTAL/);
        assert.match(result.ascii, /Rp33\.500/);
        assert.equal(result.rasterHeaders.length, 2);
        assert.ok(result.length < 50000, 'native output must not rasterize the full receipt');
      }
      assert.equal(nativeResult[0].rasterHeaders[0].widthBytes, Math.floor(384 * width / 100 / 8));
      assert.equal(nativeResult[1].rasterHeaders[0].widthBytes, Math.floor(576 * width / 100 / 8));
      console.log(`PASS logo ${width}% with native ESC/POS text on 58/80mm`);
    }
    await page.locator('#printBtn').click();
    await page.locator('#btPrint').click();
    await page.waitForSelector('.bluetooth-native-preview');
    await page.locator('.sheet').screenshot({ path: path.join(output, 'bluetooth-preview.png') });
    await page.locator('#cancelPreview').click();
    assert.equal(await page.locator('.sheet').count(), 0);
    console.log('PASS Bluetooth preview and cancellation');

    await page.locator('#printBtn').click(); await page.locator('#btPrint').click();
    await page.waitForSelector('.bluetooth-native-preview');
    await page.locator('#confirmPrint').click(); await page.locator('#connectReceiptPrinter').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Berhasil dikirim ke printer'));
    const ble = await page.evaluate(async () => {
      const { getSettings } = await import('./js/services/settingsService.js');
      const chunks = window.__bleChunks;
      const bytes = chunks.flat();
      return { id: (await getSettings()).btPrinterId, length: bytes.length, maxChunk: Math.max(...chunks.map(c => c.length)), first: bytes.slice(0, 5), last: bytes.slice(-3) };
    });
    assert.equal(ble.id, 'test-ble'); assert.ok(ble.length > 1000); assert.ok(ble.maxChunk <= 180);
    assert.deepEqual(ble.first, [27, 64, 27, 77, 0]); assert.deepEqual(ble.last, [29, 86, 0]);
    assert.ok(await page.evaluate(() => String.fromCharCode(...window.__bleChunks.flat()).includes('TOTAL')));
    console.log('PASS simulated BLE connection, persisted printer, native text and chunked transmission');

    await page.evaluate(async () => (await import('./js/services/settingsService.js')).saveSettings({ printPreview: false }));
    await page.goto(base + '#/home'); await page.goto(base + '#/sale/' + saleId); await page.waitForSelector('#receiptCapture');
    await page.locator('#printBtn').click(); await page.locator('#btPrint').click();
    await page.waitForFunction(() => document.querySelector('#loadingOverlay').classList.contains('hidden'));
    assert.equal(await page.locator('.bluetooth-native-preview').count(), 0);
    await page.evaluate(async () => (await import('./js/services/settingsService.js')).saveSettings({ printPreview: true }));
    await page.goto(base + '#/home'); await page.goto(base + '#/sale/' + saleId); await page.waitForSelector('#receiptCapture');
    console.log('PASS preview setting controls Bluetooth only');

    await page.evaluate(() => { window.open = url => { window.__openedUrl = url; return null; }; });
    await page.locator('#printBtn').click(); await page.locator('#chatWa').click();
    await page.waitForFunction(() => window.__openedUrl);
    assert.equal(await page.evaluate(() => window.__openedUrl), 'https://wa.me/6281234567890');
    await page.locator('#printBtn').click(); await page.locator('#shareText').click();
    await page.waitForFunction(() => window.__openedUrl.includes('?text='));
    const textUrl = await page.evaluate(() => window.__openedUrl);
    assert.match(decodeURIComponent(textUrl), /Diskon/);
    assert.match(decodeURIComponent(textUrl), /Catatan nota uji/);
    console.log('PASS Chat WA has no shared text; text share targets customer with receipt details');

    for (const type of ['image', 'pdf']) {
      await page.locator('#printBtn').click();
      await page.locator(type === 'image' ? '#shareImage' : '#doPrint').click();
      await page.waitForSelector('#fileWa');
      assert.equal(await page.locator('.bluetooth-native-preview').count(), 0);
      const download = page.waitForEvent('download');
      await page.locator('#fileWa').click();
      const file = await download;
      assert.match(file.suggestedFilename(), type === 'image' ? /\.png$/ : /\.pdf$/);
      await file.saveAs(path.join(output, file.suggestedFilename()));
      assert.equal(await page.evaluate(() => window.__openedUrl), 'https://wa.me/6281234567890');
    }
    console.log('PASS PNG/PDF file downloads and customer WA destination');

    const pdfs = await page.evaluate(async () => {
      const { createReceiptPdf } = await import('./js/services/printerService.js');
      const result = [];
      for (const paper of ['THERMAL_58MM', 'THERMAL_80MM', 'PDF_A4']) {
        const file = await createReceiptPdf(document.querySelector('#receiptCapture'), 'TEST', paper);
        result.push({ type: file.type, size: file.size, header: await file.slice(0, 5).text() });
      }
      return result;
    });
    for (const pdf of pdfs) { assert.equal(pdf.type, 'application/pdf'); assert.equal(pdf.header, '%PDF-'); assert.ok(pdf.size > 1000); }
    console.log('PASS generated PDF in all three paper settings');

    await page.evaluate(async id => {
      const db = await import('./js/db.js');
      const sale = await db.get('sales', id);
      await db.put('sales', { ...sale, customerPhone: '' });
    }, saleId);
    await page.reload(); await page.waitForSelector('#receiptCapture');
    await page.locator('#printBtn').click();
    assert.equal(await page.locator('#chatWa').count(), 0);
    await page.locator('#shareImage').click(); await page.waitForSelector('#fileShare');
    assert.equal(await page.locator('#fileWa').count(), 0);
    const download = page.waitForEvent('download');
    await page.locator('#fileSave').click(); await download;
    console.log('PASS general file sharing when customer has no phone');

    await page.goto(base + '#/settings/store'); await page.waitForSelector('#fLogo');
    await page.locator('#fName').fill('Nama belum disimpan');
    await page.locator('#fLogo').setInputFiles(path.join(__dirname, '../icons/icon-192.png'));
    await page.waitForFunction(() => document.querySelector('#storeLogoPreview').src.startsWith('data:image'));
    assert.equal(await page.locator('#fName').inputValue(), 'Nama belum disimpan');
    await page.locator('#removeLogo').click();
    await page.waitForFunction(() => document.querySelector('#storeLogoPreview').src.endsWith('/docs/logo.webp'));
    assert.equal(await page.locator('#fName').inputValue(), 'Nama belum disimpan');
    await page.goto(base + '#/sale/' + saleId); await page.waitForSelector('#receiptCapture');
    console.log('PASS upload/remove logo restores fallback without losing unsaved store fields');

    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(async () => { const cache = await caches.open('notaku-web-v1.5.6'); return !!await cache.match('./js/vendor/jspdf.umd.min.js') && !!await cache.match('./js/vendor/html2canvas.min.js'); });
    await context.setOffline(true);
    await page.reload(); await page.waitForSelector('#receiptCapture');
    await page.locator('#printBtn').click(); await page.locator('#btPrint').click();
    await page.waitForSelector('.bluetooth-native-preview'); await page.locator('#cancelPreview').click();
    await page.locator('#printBtn').click(); await page.locator('#doPrint').click(); await page.waitForSelector('#fileSave');
    assert.deepEqual(errors, []);
    console.log('PASS offline logo, Bluetooth preview, PDF, and no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
