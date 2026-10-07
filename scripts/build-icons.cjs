// Deterministic raster variants of the code-native thermal-printer brand.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/build-icons.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const source = await fs.readFile(path.join(root, 'icons/printer.svg'), 'utf8');
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/)[0];
  const mark = source.slice(source.indexOf('<g id="printer-mark">'), source.lastIndexOf('</svg>'));
  const wrap = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${content}</svg>`;
  const assets = [96, 128, 180, 192, 256, 512].map(size => ({ name: `icon-${size}.png`, width: size, height: size, svg: source }));
  assets.push(
    { name: 'icon-maskable-512.png', width: 512, height: 512, svg: wrap(512, 512, `<rect width="512" height="512" fill="#fbf0e0"/><g transform="translate(256 256) scale(.84) translate(-256 -256)">${mark}</g>`) },
    { name: 'logo-horizontal.png', width: 720, height: 240, svg: wrap(720, 240, `<g transform="translate(0 -3) scale(.48)">${mark}</g><text x="253" y="147" font-family="Arial,sans-serif" font-size="96" font-weight="800" letter-spacing="-4" fill="#65503e">Nota<tspan fill="#e7774b">Ku</tspan></text>`) },
    { name: 'logo-vertical.png', width: 512, height: 576, svg: wrap(512, 576, `${mark}<text x="256" y="521" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="800" letter-spacing="-2" fill="#65503e">Nota<tspan fill="#e7774b">Ku</tspan></text>`) },
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
