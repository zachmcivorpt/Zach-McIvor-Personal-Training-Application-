// node src/render.cjs [cover]  -> renders the book PDF (or the cover thumbnail)
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const coverOnly = process.argv[2] === 'cover';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: coverOnly ? 3 : 1 });
  await p.goto('file://' + path.join(ROOT, coverOnly ? 'cover.html' : 'index.html'));
  await p.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  await p.waitForTimeout(500);
  if (coverOnly) {
    await p.emulateMedia({ media: 'print' });
    await p.locator('#cover').screenshot({ path: path.join(ROOT, 'assets', 'cover-part5.png') });
  } else {
    console.log(JSON.stringify(await p.evaluate(() => window.__layout), null, 0).replace(/},/g, '},\n'));
    await p.pdf({ path: path.join(ROOT, process.argv[2] || 'Forged-Fuel-Part-V-The-Fakeaway-Files.pdf'),
                  printBackground: true, preferCSSPageSize: true });
  }
  await b.close();
})();
