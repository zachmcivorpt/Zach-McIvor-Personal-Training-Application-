import json, html, sys
S='/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad'
B=S+'/book'
data=json.load(open(S+'/ff/out/menu-data.json'))
OLD_M=('<polygon points="138,200 150,190 322,465 322,688 138,688"/>'
       '<polygon points="170,160 200,115 345,115 497,365 620,172 620,455 482,682"/>'
       '<polygon points="650,115 790,115 838,162 838,688 650,688"/>')
logo=(f'<svg class="logo" viewBox="120 100 760 625"><g fill="#d4d4d4" transform="translate(26 30)">{OLD_M}</g>'
      f'<g fill="#000">{OLD_M}</g></svg>')
INTRO={
 'b1':("Ten high-protein meals for your everyday routine.", (419.25,595.5)),
 'b2':("The Breakfast Blueprint: twelve high-protein breakfasts to start the day right.", (419.28,595.44)),
 'b3':("The Weekend Warrior: eight high-protein favourites for when you want something a bit more indulgent.", (419.28,595.44)),
}
css=open(B+'/src/book.css').read()
for b,rows in data.items():
    intro,(w,h)=INTRO[b]
    css2=css.replace('@page { size: 419.25pt 595.5pt; margin: 0; }',f'@page {{ size: {w}pt {h}pt; margin: 0; }}').replace('width: 419.25pt; height: 595.5pt;',f'width: {w}pt; height: {h}pt;')
    items=''.join(f'<div class="mm-row" data-page="{r["page"]}"><span class="mm-n">{r["page"]:02d}</span><span class="mm-t">{html.escape(r["name"])}</span>'
                  f'<span class="m-dots"></span><span class="mm-k">{r["kcal"]} cal</span>'
                  f'<span class="mm-m">{r["p"]}g P · {r["c"]}g C · {r["f"]}g F</span></div>' for r in rows)
    gap = 392/len(rows) - 11.5
    doc=f'''<!doctype html><html><head><meta charset="utf-8"><style>{css2}
.logo {{ left: 362pt; top: 25pt; width: 41pt; }}
.mm-list {{ position:absolute; left:24pt; right:24pt; top:126pt; z-index:3; }}
.mm-row {{ display:flex; align-items:baseline; font-size:{10.0 if len(rows)>10 else 10.8}pt; line-height:1.05; padding:{gap/2}pt 0; border-bottom:.5pt solid #d6d6d6; }}
.mm-row:first-child {{ border-top:.5pt solid #d6d6d6; }}
.mm-n {{ width:20pt; flex-shrink:0; font:700 7pt/1 "Noto Sans"; color:#777; }}
.mm-t {{ font-weight:600; white-space:nowrap; }}
.mm-k {{ font:400 11.5pt/1 "Shrikhand"; margin-right:8pt; white-space:nowrap; }}
.mm-m {{ font-size:7.8pt; color:#444; white-space:nowrap; width:94pt; text-align:right; }}
.m-dots {{ flex:1; border-bottom:.6pt dotted #9a9a9a; margin:0 7pt; transform:translateY(-2pt); }}
.mm-note {{ position:absolute; left:24pt; right:24pt; bottom:30pt; font-size:6.6pt; line-height:1.4; color:#6b6b6b; z-index:3; }}
</style></head><body>
<section class="page menu">
  <div class="frame"></div>
  <h1 class="title"><span>THE MENU</span></h1>
  <img class="underline" src="assets/brush-underline.png" alt="">
  {logo}
  <p class="m-intro">{html.escape(intro)}</p>
  <div class="mm-list">{items}</div>
  <p class="mm-note">Calories per serve are calculated from each recipe's macros: protein and carbohydrate 4 kcal per gram, fat 9 kcal per gram.</p>
</section></body></html>'''
    open(f'{B}/menu-{b}.html','w').write(doc)
print('ok')
