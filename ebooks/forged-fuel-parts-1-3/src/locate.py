from PIL import Image, ImageDraw
import numpy as np, glob, json, sys
out={}; crops=[]
for f in sorted(glob.glob(sys.argv[1]+'/*.png')):
    name=f.split('/')[-1][:-4]
    im=Image.open(f).convert('L'); a=np.array(im)<100
    reg=a[250:1100, 95:420]; prof=reg.sum(1)
    bands=[];inb=False
    for y,v in enumerate(prof):
        if v>3 and not inb: s=y; inb=True
        elif v<=3 and inb:
            if y-s>15: bands.append((s+250,y+250))
            inb=False
    cal=[b for b in bands if b[0]>=290 and 34<=b[1]-b[0]<=46]
    if not cal: continue
    y0,y1=cal[0]
    cols=a[y0-4:y1+6, :].sum(0); cols[:80]=0; cols[1640:]=0
    xs=np.where(cols>0)[0]
    clusters=[];s=xs[0];p=xs[0]
    for x in xs[1:]:
        if x-p>22: clusters.append((s,p)); s=x
        p=x
    clusters.append((s,p))
    # clusters: CALORIES, '-', number...
    i=next((k for k,c in enumerate(clusters) if k>0 and c[1]-c[0]<45), None)  # dash
    if i is None or i+1>=len(clusters): print('FAIL',name,clusters); continue
    num=[clusters[i+1]]
    for c in clusters[i+2:]:
        if c[0]-num[-1][1]<40: num.append(c)
        else: break
    x0,x1=num[0][0],num[-1][1]
    # tight vertical
    sub=a[y0-10:y1+12, x0:x1+1]; ys=np.where(sub.sum(1)>0)[0]
    box=[int(x0),int(y0-10+ys.min()),int(x1),int(y0-10+ys.max())]
    out[name]=dict(box=box, dash=[int(clusters[i][0]),int(clusters[i][1])], word=[int(clusters[0][0]),int(clusters[0][1])])
    crops.append((name, im.crop((box[0]-60,box[1]-30,box[2]+60,box[3]+30))))
json.dump(out,open(sys.argv[2],'w'),indent=0)
W=max(c.width for _,c in crops); H=sum(c.height+4 for _,c in crops)
sh=Image.new('L',(W+200,H),255); d=ImageDraw.Draw(sh); y=0
for n,c in crops: sh.paste(c,(200,y)); d.text((2,y+10),n,fill=0); y+=c.height+4
sh.save(sys.argv[3]); print(len(out))
