// Deterministic raster variants of the code-native thermal-printer brand.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/build-icons.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const source = await fs.readFile(path.join(root, 'scripts/artwork/printer.svg'), 'utf8');
  const favicon = await fs.readFile(path.join(root, 'icons/favicon.svg'), 'utf8');
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/)[0];
  const mark = source.slice(source.indexOf('<g id="printer-mark">'), source.lastIndexOf('</svg>'));
  const wrap = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${content}</svg>`;
  const assets = [180, 192, 512].map(size => ({ name: `icon-${size}.png`, width: size, height: size, svg: source }));
  assets.push(
    { name: 'icon-maskable-512.png', width: 512, height: 512, svg: wrap(512, 512, `<rect width="512" height="512" fill="#fbf0e0"/><g transform="translate(256 256) scale(.84) translate(-256 -256)">${mark}</g>`) },
    { name: 'favicon-32.png', width: 32, height: 32, svg: favicon },
  );
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    for (const asset of assets) {
      const base64 = await page.evaluate(async ({ svg, width, height }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, asset);
      await fs.writeFile(path.join(root, 'icons', asset.name), Buffer.from(base64, 'base64'));
      console.log(`${asset.name}: ${asset.width} × ${asset.height}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
