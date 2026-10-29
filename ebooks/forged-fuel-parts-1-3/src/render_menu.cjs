const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); await p.emulateMedia({ media: 'print' });
  for (const k of ['b1','b2','b3']) {
    await p.goto('file:///tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad/book/menu-'+k+'.html');
    await p.evaluate(() => document.fonts.ready);
    const rows = await p.evaluate(() => [...document.querySelectorAll('.mm-row')].map(e => { const b = e.getBoundingClientRect(); return { page: +e.dataset.page, x: b.left*0.75, y: b.top*0.75, w: b.width*0.75, h: b.height*0.75 }; }));
    require('fs').writeFileSync('/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad/ff/out/links-'+k+'.json', JSON.stringify(rows));
    await p.pdf({ path: '/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad/ff/out/menu-'+k+'.pdf', printBackground: true, preferCSSPageSize: true });
  }
  await b.close();
})();
