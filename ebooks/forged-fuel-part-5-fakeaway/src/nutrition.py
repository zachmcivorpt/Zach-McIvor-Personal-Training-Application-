from foods import FOODS, kcal
from recipes import RECIPES

def items(r):
    for _, lines in r["ingredients"]:
        for text, key, g in lines:
            if key: yield key, g
    for key, g in r.get("_extra", []): yield key, g

def totals(pairs):
    t=[0,0,0,0]
    for k,g in pairs:
        v=FOODS[k]
        for i in range(4): t[i]+=v[i]*g/100
    return t

def per_serve(r):
    t=totals(items(r)); n=r["serves"]
    p,c,f,fib=[x/n for x in t]
    return dict(p=p,c=c,f=f,fib=fib,kcal=kcal(p,c,f,fib))

def rounded(r):
    s=per_serve(r)
    return dict(kcal=int(5*round(s["kcal"]/5)), p=round(s["p"]), c=round(s["c"]), f=round(s["f"]), fib=round(s["fib"]))

def side(r):
    if "side" not in r: return None
    text,key,g=r["side"]; p,c,f,fib=totals([(key,g)])
    return dict(text=text,kcal=int(5*round(kcal(p,c,f,fib)/5)),p=round(p),c=round(c),f=round(f))

if __name__=="__main__":
    for r in RECIPES:
        s=per_serve(r); R=rounded(r)
        chk=4*R['p']+4*R['c']+9*R['f']+2*R['fib']
        print(f"{r['title']:28s} {R['kcal']:4d} kcal  P{R['p']:3d} C{R['c']:3d} F{R['f']:3d} Fib{R['fib']:2d}  (raw {s['kcal']:.0f}; from rounded {chk})  side={side(r)}")
