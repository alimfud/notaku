// Visual/boot smoke check in an isolated browser; no customer data is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const theme of ['clay', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await context.addInitScript(value => localStorage.setItem('notaku-theme', value), theme);
      await context.route('http://localhost/notaku/**', async route => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/notaku\//, '') || 'index.html';
        try {
          await route.fulfill({ body: await fs.readFile(path.join(root, name)), contentType: mime[path.extname(name)] || 'application/octet-stream' });
        } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost/notaku/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('.thermal-paper').getAnimations().length > 0);
      assert.equal(await page.locator('#loadingOverlay').evaluate(el => el.classList.contains('is-startup')), true);
      assert.equal(await page.locator('#loadingOverlay').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'clay' ? 'rgb(251, 240, 224)' : 'rgb(14, 19, 50)');
      assert.equal(await page.locator('#loadingOverlay img').count(), 0, 'no static logo before animation');
      const before = await page.locator('.thermal-paper').first().evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(450);
      const after = await page.locator('.thermal-paper').first().evaluate(el => getComputedStyle(el).transform);
      assert.notEqual(before, after, `${theme}: receipt must move`);
      await page.waitForFunction(() => document.getElementById('loadingOverlay').classList.contains('hidden'));
      assert.equal(await page.locator('#loadingOverlay').evaluate(el => el.classList.contains('is-startup')), false);
      assert.equal(await page.locator('#pageRoot').innerText().then(text => text.length > 0), true);
      // Preview the full receipt using the same loader used for long operations.
      await page.evaluate(() => {
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.querySelector('.thermal-paper').getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 1500; });
      });
      await page.waitForTimeout(350); // Allow the overlay entrance to finish before visual QA.
      assert.equal(await page.locator('.thermal-printer').first().evaluate(el => el.scrollWidth <= 390), true);
      if (process.env.THERMAL_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.THERMAL_PREVIEW_DIR, `thermal-${theme}.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.thermal-paper').first().evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.deepEqual(errors, []);
      console.log(`${theme}: receipt animates, splash closes, reduced motion works, no page errors`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
