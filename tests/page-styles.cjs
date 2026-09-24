const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = 'http://localhost/notaku/';
    await page.goto(base);
    const id = await page.evaluate(async () => {
      const { saveProduct } = await import('./js/services/productService.js');
      const { createSale } = await import('./js/services/saleService.js');
      const { saveSettings } = await import('./js/services/settingsService.js');
      await saveProduct({ name: 'Produk tes', unit: 'pcs', price: 8000 });
      await saveSettings({ qrisImageData: new URL('icons/icon-192.png', location.href).href });
      return createSale({ customer: { name: 'Pelanggan Tes' }, lines: [{ name: 'Produk tes', unit: 'pcs', qty: 15, price: 8000 }] });
    });
    await page.reload();
    async function route(path, selector) {
      await page.goto(base + '#/' + path);
      await page.waitForSelector(selector);
    }
    async function alignment(selector, property, expected) {
      const actual = await page.locator(selector).first().evaluate((el, prop) => {
        const style = getComputedStyle(el);
        return prop === 'textAlign' && style[prop] === 'start' && style.direction === 'ltr' ? 'left' : style[prop];
      }, property);
      assert.equal(actual, expected, selector);
    }
    for (const viewport of [390, 320]) {
      await page.setViewportSize({ width: viewport, height: 844 });
      await route('home', '#notaList .row-meta');
      await alignment('#notaList .row-meta', 'textAlign', 'left');
      await route('products', '#pList .row');
      await alignment('#pList .row-meta', 'textAlign', 'left');
      for (const trigger of ['#fabAdd', '#pList .row']) {
        await page.locator(trigger).first().click();
        await alignment('.sheet-body .field', 'textAlignLast', 'auto');
        await alignment('.sheet-body #fName', 'textAlign', 'left');
        assert.equal(await page.locator('.sheet-body').getAttribute('data-page'), 'products');
        await page.screenshot({ path: `tests/output/products-${viewport}.png`, animations: 'disabled' });
        await page.locator('.sheet-backdrop').click({ position: { x: 2, y: 2 } });
      }
      await route('expenses', '#addExpense'); await page.locator('#addExpense').click();
      await alignment('#eTitle', 'textAlign', 'left');
      await alignment('.sheet-body .field', 'textAlignLast', 'auto');
      await page.locator('.sheet-backdrop').click({ position: { x: 2, y: 2 } });
      await route('reports', '#allTimeBody .row-meta');
      await alignment('#allTimeBody .row-meta', 'textAlign', 'left');
      for (const section of ['store', 'invoice']) {
        await route('settings/' + section, '#fSave');
        await alignment('#pageRoot .field', 'textAlignLast', 'auto');
        await alignment('#pageRoot .field input', 'textAlign', 'left');
        if (section === 'store') {
          assert.equal(await page.locator('#pageRoot > :first-child').getAttribute('class'), 'field settings-store-logo');
          const preview = await page.locator('.settings-logo-preview').boundingBox();
          const slider = await page.locator('#logoMaxWidth').boundingBox();
          assert.ok(slider.y >= preview.y + preview.height);
          await page.locator('#logoMaxWidth').fill('65');
          await page.locator('#logoMaxWidth').dispatchEvent('change');
          assert.equal(await page.locator('#logoWidthValue').textContent(), '65%');
          assert.match(await page.locator('#storeLogoPreview').getAttribute('class'), /logo-width-65/);
          await page.waitForFunction(async () => (await (await import('./js/services/settingsService.js')).getSettings()).storeLogoMaxWidth === 65);
          await page.screenshot({ path: `tests/output/store-${viewport}.png`, animations: 'disabled' });
        }
      }
      await route('settings/qris', '.settings-qris-image');
      await alignment('.settings-content', 'textAlign', 'left');
      await page.screenshot({ path: `tests/output/qris-${viewport}.png`, animations: 'disabled' });
      await route('sale/' + id, '#receiptCapture');
      await alignment('.receipt-customer', 'textAlign', 'center');
      await route('sale/' + id + '/edit', '#pageRoot .field');
      await alignment('#pageRoot .field', 'textAlignLast', 'center');
      // An edit specific to Sale Edit must not affect unrelated pages or sheets.
      const injected = await page.addStyleTag({ content: '[data-page="sale-edit"] .field { text-align-last:right; }' });
      await route('products', '#fabAdd'); await page.locator('#fabAdd').click();
      await alignment('.sheet-body .field', 'textAlignLast', 'auto');
      await page.locator('.sheet-backdrop').click({ position: { x: 2, y: 2 } });
      await injected.evaluate(el => el.remove());
      console.log(`PASS page/sheet alignment and CSS isolation at ${viewport}px`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
