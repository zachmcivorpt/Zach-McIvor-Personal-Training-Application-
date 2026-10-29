"""Builds book/index.html - the editable source of FORGED FUEL Part V.

Run:  python3 src/build.py      (from the book/ folder)
Then: node src/render.cjs        (writes the PDF)
"""
import html, os
from recipes import RECIPES
from nutrition import rounded, side

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = html.escape

# Photo placement per recipe.
#   cut  = background-removed photo, contained in a box that may bleed off the
#          right edge (as the cut-outs do in Parts I-III)
#   rect = rectangular photo, cropped to fill the box (object-position = focus)
PHOTO = {
    "chicken-burger": dict(mode="cut", left=224, right=446),
    "smash-burger":   dict(mode="cut", left=224, right=432),
    "nachos":         dict(mode="cut", left=224, right=452),
    "quesadilla":     dict(mode="rect", pos="45% 50%"),
    "pizza":          dict(mode="rect", pos="40% 55%"),
    "doner":          dict(mode="rect", pos="72% 50%"),
    "souvlaki":       dict(mode="rect", pos="50% 45%"),
    "butter-chicken": dict(mode="cut", left=224, right=430),
    "honey-soy":      dict(mode="rect", pos="38% 60%"),
    "korean":         dict(mode="cut", left=224, right=428),
    "mongolian":      dict(mode="rect", pos="50% 45%"),
    "sweet-sour":     dict(mode="rect", pos="55% 50%"),
    "fried-rice":     dict(mode="rect", pos="38% 50%"),
    "pad-thai":       dict(mode="rect", pos="42% 50%"),
    "fish-chips":     dict(mode="rect", pos="62% 50%"),
    "lava":           dict(mode="cut", left=224, right=412),
    "shake":          dict(mode="cut", left=232, right=402),
}

# M logo, traced from the supplied logo artwork (zachmcivor M mark).
M_PATHS = ('<polygon points="154,545 224,637 224,711 175,762 154,762"/>'
           '<polygon points="155,522 208,522 299,630 363,549 363,636 299,723"/>'
           '<polygon points="374,522 413,522 444,554 444,762 422,762 374,711"/>')


def logo(cls, colour="#000", shadow=False):
    return (f'<svg class="{cls}" viewBox="150 518 298 248" aria-label="M Personal Training">'
            f'<g fill="{colour}">{M_PATHS}</g></svg>')


def page_number(n):
    return f'<div class="pnum"><span>{n}</span></div>'


def recipe_page(r, n):
    R = rounded(r); ph = PHOTO[r["slug"]]
    ing = []
    for grp, lines in r["ingredients"]:
        if grp:
            ing.append(f'<div class="grp">{E(grp)}</div>')
        ing.append("<ul>" + "".join(f"<li>{E(t)}</li>" for t, _, _ in lines) + "</ul>")
    sd = side(r)
    if sd:
        ing.append(f'<p class="side">{E(sd["text"])}: add {sd["kcal"]} cal, '
                   f'{sd["p"]}g P, {sd["c"]}g C, {sd["f"]}g F.</p>')
    steps = "".join(f'<p><b>{i}. {E(lead)}:</b> {E(txt)}</p>'
                    for i, (lead, txt) in enumerate(r["steps"], 1))
    tip = f'<p class="tip"><b><i>Takeaway secret:</i></b> {E(r["tip"])}</p>'
    cook = f' · COOK {r["cook"]} MIN' if r["cook"] else ""
    meta = f'SERVES {r["serves"]} · PREP {r["prep"]} MIN{cook} · FIBRE {R["fib"]}g'
    ext = "png" if ph["mode"] == "cut" else "jpg"
    style = ""
    if ph["mode"] == "cut":
        style = f'left:{ph["left"]}pt;width:{ph["right"] - ph["left"]}pt;'
    pos = f' style="object-position:{ph["pos"]}"' if ph.get("pos") else ""
    return f'''
<section class="page recipe" id="{r["slug"]}" data-mode="{ph["mode"]}">
  <div class="frame"></div>
  <h1 class="title"><span>{E(r["title"])}</span></h1>
  <img class="underline" src="assets/brush-underline.png" alt="">
  {logo("logo")}
  <div class="cal">CALORIES&nbsp;-&nbsp;{R["kcal"]}cal<span class="ps">per serve</span></div>
  <div class="mac">MACROS&nbsp;&nbsp;{R["p"]}g (P) {R["c"]}g (C) {R["f"]}g (F)</div>
  <div class="meta">{meta}</div>
  <div class="hframe ing-h"><img src="assets/brush-frame-a.png" alt=""><span>INGREDIENTS</span></div>
  <div class="ing">{"".join(ing)}</div>
  <div class="photo {ph["mode"]}" style="{style}"><img src="photos/{r["slug"]}.{ext}" alt="{E(r["title"].title())}"{pos}></div>
  <div class="hframe ins-h"><img src="assets/brush-frame-b.png" alt=""><span>INSTRUCTIONS</span></div>
  <div class="ins">{steps}{tip}</div>
  {page_number(n)}
</section>'''


def cover():
    # Base = the Part I cover itself (frame, curved FORGED FUEL / RECIPE BOOK
    # title, brush stroke, BY ZACH MCIVOR) with its photos and Part I strapline
    # removed, so the series title block is identical across the books.
    return f'''
<section class="page cover" id="cover">
  <img class="c-base" src="assets/cover-base.png" alt="">
  <div class="c-logo">{logo("clogo", shadow=False)}<div class="pt">PERSONAL TRAINING</div></div>
  <svg class="c-part" viewBox="-3 -2 244 68">
    <defs><linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8743a"/><stop offset=".5" stop-color="#7a4019"/><stop offset="1" stop-color="#3b1a08"/>
    </linearGradient></defs>
    <g font-family="Black Ops One" font-size="54" letter-spacing="1">
      <text x="3" y="60" fill="#000" stroke="#000" stroke-width="7" stroke-linejoin="round" textLength="232" lengthAdjust="spacingAndGlyphs">PART V</text>
      <text x="1" y="58" fill="url(#pv)" stroke="#000" stroke-width="5.5" stroke-linejoin="round" paint-order="stroke" textLength="232" lengthAdjust="spacingAndGlyphs">PART V</text>
    </g>
  </svg>
  <div class="c-sub">THE FAKEAWAY FILES</div>
  <img class="c-sub-brush" src="assets/brush-underline.png" alt="">
  <div class="c-plus">+ OUR CRISPY CHICKEN BURGER</div>
  <div class="c-plus-sub">CRUNCHY, JUICY &amp; BUILT TO FIT YOUR MACROS</div>
  <img class="c-img c-tl" src="photos/lava.png" alt="">
  <img class="c-img c-bl" src="photos/shake-cover.png" alt="">
  <img class="c-img c-br" src="photos/chicken-burger.png" alt="">
</section>'''


def contents(pages):
    groups = {}
    for r, n in pages:
        groups.setdefault(r["section"], []).append((r, n))
    rows = []
    for g, items in groups.items():
        rows.append(f'<div class="m-sec">{E(g)}</div>')
        for r, n in items:
            R = rounded(r)
            rows.append(f'<a class="m-row" href="#{r["slug"]}"><span class="m-n">{n:02d}</span>'
                        f'<span class="m-t">{E(r["title"].title().replace("Smac", "SMAC"))}</span>'
                        f'<span class="m-dots"></span>'
                        f'<span class="m-k">{R["kcal"]} cal · {R["p"]}g protein</span></a>')
    return f'''
<section class="page menu" id="menu">
  <div class="frame"></div>
  <h1 class="title"><span>THE MENU</span></h1>
  <img class="underline" src="assets/brush-underline.png" alt="">
  {logo("logo")}
  <p class="m-intro">Seventeen takeaway favourites, rebuilt at home with high-protein ingredients and the
  techniques that make them taste like the real thing. Everything comes from an ordinary Coles or
  Woolworths shop and works on a weeknight.</p>
  <div class="m-list">{"".join(rows)}</div>
  <div class="hframe m-h"><img src="assets/brush-frame-a.png" alt=""><span>BEFORE YOU COOK</span></div>
  <ul class="m-notes">
    <li><b>Nutrition is per serve,</b> calculated from the exact quantities listed: meat and seafood weighed raw, rice and noodles weighed dry. Brands differ, so check your own labels if you track closely.</li>
    <li><b>“High-protein Greek yoghurt”</b> means a plain, 0%-fat style with about 10 g protein per 100 g (e.g. Chobani Fit or a supermarket high-protein tub).</li>
    <li><b>Oven temperatures are fan-forced.</b> Air fryers vary, so check food a few minutes early.</li>
    <li><b>Cook chicken to 74°C</b> in the centre, or until the juices run clear with no pink.</li>
  </ul>
  <p class="m-credit">Food photography: Unsplash contributors, used under the Unsplash Licence. Dishes are styled for the camera, so yours may look a little different.</p>
</section>'''


def closing():
    return f'''
<section class="page closing" id="afterword">
  <div class="kframe"></div>
  {logo("klogo", colour="#fff", shadow=False)}
  <img class="k-forge" src="assets/forge-your-path.png" alt="Forge your path">
  <img class="k-under" src="assets/brush-underline-white.png" alt="">
  <h2 class="k-h">Afterword</h2>
  <div class="k-body">
    <p>The fitness industry is full of conflicting advice, fad diets, and people trying to sell you the next “secret.” Most of it is bullshit.<br>
    I’ve worked with enough people to know that the biggest problem isn’t motivation – it’s having meals that are actually realistic. You don’t need to survive on chicken and broccoli or spend hours cooking meals you’ll hate to perform well or get your dream physique.</p>
    <p>That’s exactly why I created these recipe eBooks.</p>
    <p>Every recipe is designed to be:</p>
    <ul><li>High in protein</li><li>Easy to make</li><li>Full of flavour</li><li>Made with everyday ingredients</li><li>Built to help you stay on track without feeling like you’re dieting</li></ul>
  </div>
  <div class="k-ready"><img src="assets/brush-frame-white.png" alt=""><span>Ready for Real Results?</span></div>
  <div class="k-body k-body2">
    <p>The recipe books will show you what to eat.</p>
    <p class="tight">My coaching makes sure you actually do it.<br>If you’re sick of wasting time on random workouts and conflicting advice, let’s keep it simple.</p>
    <p><a href="https://forms.gle/Ana9NaMA2RReS3QAA">Click here to Express your Interest in Online Coaching and let’s build the strongest, leanest version of you.</a></p>
  </div>
  <div class="k-fan">
    <img src="assets/cover-part1.png" alt="Part I"><img src="assets/cover-part2.png" alt="Part II">
    <img src="assets/cover-part3.png" alt="Part III"><img src="assets/cover-part4.png" alt="Part IV">
    <img src="assets/cover-part5.jpg" alt="Part V">
  </div>
</section>'''


def build(only=None):
    pages = [(r, i) for i, r in enumerate(RECIPES, 1)]
    body = cover() if only == "cover" else (
        cover() + contents(pages) + "".join(recipe_page(r, n) for r, n in pages) + closing())
    css = open(os.path.join(ROOT, "src", "book.css")).read()
    js = open(os.path.join(ROOT, "src", "layout.js")).read()
    return f'''<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8">
<title>Forged Fuel Part V – The Fakeaway Files</title>
<style>{css}</style></head>
<body>{body}
<script>{js}</script></body></html>'''


if __name__ == "__main__":
    import sys
    only = sys.argv[1] if len(sys.argv) > 1 else None
    out = "cover.html" if only == "cover" else "index.html"
    open(os.path.join(ROOT, out), "w").write(build(only))
    print("wrote", out)
