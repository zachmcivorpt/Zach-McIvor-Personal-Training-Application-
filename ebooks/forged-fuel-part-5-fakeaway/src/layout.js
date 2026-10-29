// Fits each recipe page: title to one line, ingredients + instructions inside
// the frame, and the photo into the space left between them.
(function () {
  const PT = 96 / 72;                    // CSS px per pt
  const LIMIT = 563;                     // last usable line inside the frame (pt)
  const pt = (px) => px / PT;
  const report = [];

  function fitTitle(page) {
    const t = page.querySelector('.title'), s = t.querySelector('span');
    let size = 23;
    while (pt(s.offsetWidth) > 328 && size > 15) { size -= 0.25; t.style.fontSize = size + 'pt'; }
    return size;
  }

  function fitRecipe(page) {
    const ing = page.querySelector('.ing'), ins = page.querySelector('.ins');
    const insH = page.querySelector('.ins-h'), photo = page.querySelector('.photo');
    const mode = page.dataset.mode;
    let fi = 7.6, fs = 7.6, ok = false, frameTop = 0;
    const tryFit = (a, b) => {
      ing.style.fontSize = a + 'pt'; ins.style.fontSize = b + 'pt';
      const ingBottom = pt(ing.offsetTop + ing.offsetHeight);
      frameTop = LIMIT - pt(ins.offsetHeight) - 31;
      return frameTop >= ingBottom + 9;
    };
    // One size for both blocks: the largest that fits (ingredients a touch larger when room allows).
    for (let s = 8.6; s >= 7.6 - 1e-9; s = +(s - 0.1).toFixed(2)) {
      if (tryFit(s, s)) { fi = s; fs = s; ok = true; break; }
    }
    if (ok) { for (const a of [fs + 0.3, fs + 0.2, fs + 0.1]) { if (a <= 8.8 && tryFit(a, fs)) { fi = +a.toFixed(2); break; } } }
    if (!ok) tryFit(7.6, 7.6); else tryFit(fi, fs);
    insH.style.top = frameTop + 'pt';
    ins.style.top = (frameTop + 31) + 'pt';
    let ph;
    if (mode === 'rect') {
      ph = Math.min(frameTop - 9 - 104, 395);
      photo.style.height = ph + 'pt';
    } else {
      photo.style.top = '96pt';
      ph = frameTop - 6 - 96;
      photo.style.height = ph + 'pt';
    }
    report.push({ id: page.id, ok, fi, fs, frameTop: Math.round(frameTop), photoH: Math.round(ph),
                  ingBottom: Math.round(pt(ing.offsetTop + ing.offsetHeight)) });
  }

  function fitMenu(page) {
    const intro = page.querySelector('.m-intro');
    const list = page.querySelector('.m-list');
    list.style.top = (pt(intro.offsetTop + intro.offsetHeight) + 11) + 'pt';
    const h = page.querySelector('.m-h'), notes = page.querySelector('.m-notes');
    const top = pt(list.offsetTop + list.offsetHeight) + 12;
    h.style.top = top + 'pt'; notes.style.top = (top + 31) + 'pt';
    const credit = page.querySelector('.m-credit');
    report.push({ id: 'menu', notesBottom: Math.round(pt(notes.offsetTop + notes.offsetHeight)),
                  creditTop: Math.round(pt(credit.offsetTop)) });
  }

  document.fonts.ready.then(() => {
    document.querySelectorAll('.page.recipe').forEach((p) => { fitTitle(p); fitRecipe(p); });
    document.querySelectorAll('.page.menu').forEach((p) => { fitTitle(p); fitMenu(p); });
    window.__layout = report;
    document.documentElement.dataset.ready = '1';
  });
})();
