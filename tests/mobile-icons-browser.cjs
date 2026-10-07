// Isolated visual/contrast check; does not open the live app or customer data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const assets = await Promise.all(['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(async name => ({
    name, src: `data:image/png;base64,${(await fs.readFile(path.join(root, 'icons', name))).toString('base64')}`,
  })));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 520, height: 400 }, deviceScaleFactor: 2 });
    for (const asset of assets) {
      const colors = await page.evaluate(async ({ src, scale }) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 512, 512);
        const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
        const markPixel = (x, y) => pixel(Math.round(256 + scale * (x - 256)), Math.round(256 + scale * (y - 256)));
        return { background: pixel(20, 20), printer: markPixel(256, 365), paper: markPixel(256, 160) };
      }, { src: asset.src, scale: asset.name.includes('maskable') ? .92 : 1 });
      const luminance = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => (luminance(a) + .05) / (luminance(b) + .05);
      assert.ok(colors.background[2] > colors.background[0] * 2, `${asset.name}: Neo backdrop`);
      assert.ok(contrast(colors.printer, colors.background) > 6, `${asset.name}: Clay printer stands out`);
      assert.ok(contrast(colors.paper, colors.background) > 8, `${asset.name}: receipt stands out`);
      console.log(`${asset.name}: printer/background contrast ${contrast(colors.printer, colors.background).toFixed(1)}:1`);
    }
    await page.setContent(`<style>body{margin:0;padding:24px;background:#fbf0e0;color:#51463b;font:14px Arial;text-align:center}h3{font-size:16px;margin:0 0 18px}.grid{display:flex;justify-content:center;gap:38px}figure{margin:0}img{width:168px;height:168px;border-radius:34px}.circle{border-radius:50%}figcaption{margin:12px 0 18px}.small{width:56px;height:56px;border-radius:12px}.small.circle{border-radius:50%}</style><h3>Ikon HP · Neo + Clay</h3><div class="grid"><figure><img src="${assets[1].src}" alt=""><figcaption>Ikon utama</figcaption><img class="small" src="${assets[1].src}" alt=""><figcaption>56 px</figcaption></figure><figure><img class="circle" src="${assets[3].src}" alt=""><figcaption>Android maskable</figcaption><img class="small circle" src="${assets[3].src}" alt=""><figcaption>56 px</figcaption></figure></div>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    if (process.env.MOBILE_ICON_PREVIEW_FILE) await page.screenshot({ path: process.env.MOBILE_ICON_PREVIEW_FILE });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
