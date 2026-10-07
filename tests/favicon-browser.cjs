// Checks real rasterization at tab sizes, on light and dark browser surfaces.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const assets = await Promise.all(['favicon.svg', 'favicon-32.png'].map(async name => ({
    name, src: `data:${name.endsWith('svg') ? 'image/svg+xml' : 'image/png'};base64,${(await fs.readFile(path.join(root, 'icons', name))).toString('base64')}`,
  })));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 230 }, deviceScaleFactor: 2 });
    await page.setContent(`<style>body{margin:0;padding:22px;background:#fbf0e0;font:13px Arial;color:#51463b}h3{margin:0 0 14px;font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tab{display:flex;align-items:center;gap:9px;padding:15px;border-radius:8px;background:#fff;color:#333}.dark{background:#232427;color:#eee}img{flex:none}.size{margin-left:auto;opacity:.6;font-size:11px}</style><h3>Favicon NotaKu · ukuran asli tab browser</h3><div class="grid">${[16, 32].flatMap(size => ['', 'dark'].map(theme => `<div class="tab ${theme}"><img src="${assets[0].src}" width="${size}" height="${size}" alt=""><span>NotaKu</span><span class="size">${size} px</span></div>`)).join('')}</div>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    for (const asset of assets) {
      for (const size of [16, 32]) {
        const pixels = await page.evaluate(async ({ src, size }) => {
          const image = new Image(); image.src = src; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let visible = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 128) visible++;
          return { cornerAlpha: [data[3], data[(size - 1) * 4 + 3], data[(size * (size - 1)) * 4 + 3], data[data.length - 1]], visible };
        }, { src: asset.src, size });
        assert.deepEqual(pixels.cornerAlpha, [0, 0, 0, 0], `${asset.name}: no background`);
        assert.ok(pixels.visible > size * size * .45, `${asset.name}: readable silhouette at ${size}px`);
      }
    }
    if (process.env.FAVICON_PREVIEW_FILE) await page.screenshot({ path: process.env.FAVICON_PREVIEW_FILE });
    console.log('SVG and PNG: transparent background and strong silhouette at 16px / 32px; light/dark preview ready');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
