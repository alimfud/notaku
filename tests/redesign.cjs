// Fresh browser data only: dashboard totals, photo persistence, backup and responsive layout.
const assert = require('node:assert/strict');
const path = require('node:path');
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
    await page.waitForSelector('.dashboard-hero');
    assert.equal(await page.locator('.dashboard-revenue').textContent(), 'Rp0');
    const ids = await page.evaluate(async () => {
      const { saveProduct } = await import('./js/services/productService.js');
      const { createSale } = await import('./js/services/saleService.js');
      const { saveSettings } = await import('./js/services/settingsService.js');
      await saveSettings({ storeName:'Toko Contoh' });
      const products = [];
      for (const [name, category, price] of [['Nasi box ayam','Makanan',25000],['Snack box','Makanan',15000],['Kue bolu','Makanan',45000],['Es teh manis','Minuman',5000],['Kopi susu','Minuman',18000],['Air mineral','Minuman',4000]]) products.push(await saveProduct({name,category,price,unit:'pcs'}));
      const sale = await createSale({customer:{name:'Siti Aminah'},lines:[{name:'Nasi box ayam',price:25000,qty:4}],initialPayment:20000});
      await createSale({customer:{name:'Budi Santoso'},lines:[{name:'Snack box',price:15000,qty:2}],initialPayment:30000});
      return { product:products.find(p=>p.name==='Nasi box ayam').id,sale };
    });
    await page.reload();
    await page.waitForSelector('.dashboard-orders .row');
    assert.equal(await page.locator('.dashboard-revenue').textContent(), 'Rp130.000');
    assert.equal(await page.locator('.dashboard-hero-bottom strong').last().textContent(), 'Rp50.000');
    assert.equal(await page.locator('.dashboard-attention strong').last().textContent(), 'Rp80.000');
    console.log('PASS live dashboard totals and separate payment/fulfillment states');
    await page.locator('.nav-btn[data-route="products"]').click();
    await page.locator(`[data-id="${ids.product}"]`).click();
    await page.locator('#fPhoto').setInputFiles(path.join(__dirname,'../icons/icon-192.png'));
    await page.waitForFunction(()=>document.querySelector('#fPhotoPreview').src.startsWith('data:image/jpeg') && !document.querySelector('#fSave').disabled);
    await page.locator('#fSave').click();
    await page.waitForSelector('.sheet', {state:'detached'});
    await page.reload();
    await page.waitForSelector(`[data-id="${ids.product}"] img`);
    const photo = await page.evaluate(async id => {
      const { getProduct,saveProduct } = await import('./js/services/productService.js');
      const { createBackupBlob } = await import('./js/services/backupService.js');
      const p = await getProduct(id);
      const { imageData, ...oldCallerFields } = p;
      await saveProduct(oldCallerFields);
      const backup = JSON.parse(await (await createBackupBlob()).text());
      return {stored:(await getProduct(id)).imageData,backup:backup.data.products.find(x=>x.id===id).imageData};
    }, ids.product);
    assert.ok(photo.stored.startsWith('data:image/jpeg;base64,'));
    assert.equal(photo.backup,photo.stored);
    await page.locator(`[data-id="${ids.product}"]`).click();
    await page.locator('#fRemovePhoto').click();
    await page.locator('#fSave').click();
    await page.waitForSelector('.sheet',{state:'detached'});
    assert.equal(await page.locator(`[data-id="${ids.product}"] img`).count(),0);
    console.log('PASS upload, compression, reload, backward-compatible edits, backup and photo removal');
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:900});
      for (const [route,selector] of [['dashboard','.dashboard-hero'],['home','#notaList .row'],['products','#pList .row'],['settings','.settings-hub'],['reports','#allTimeBody'],['sale/new','#saveBtn']]) {
        await page.goto(base+'#/'+route);
        await page.waitForSelector(selector);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        assert.equal(overflow,false,route+' overflow at '+width);
        if (route==='dashboard'||route==='products'||route==='sale/new') await page.screenshot({path:path.join(__dirname,'output',`redesign-${route.replace('/','-')}-${width}.png`),fullPage:true,animations:'disabled',style:'#toast { visibility:hidden; }'});
      }
    }
    await page.goto(base+'#/dashboard');
    await page.waitForSelector('.dashboard-hero');
    await page.waitForFunction(async()=>{const {APP_VERSION}=await import('./js/version.js');const c=await caches.open('notaku-web-v'+APP_VERSION);return !!await c.match('./js/pages/dashboard.js')&&!!await c.match('./css/theme.css')&&!!await c.match('./js/ui/productImage.js');});
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dashboard-hero');
    await page.locator('.nav-btn[data-route="products"]').click();
    await page.waitForSelector('#pList .row');
    assert.deepEqual(errors,[]);
    console.log('PASS mobile/tablet/desktop layout, offline dashboard/catalog and no browser errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
