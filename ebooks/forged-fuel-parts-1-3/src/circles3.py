from PIL import Image, ImageDraw
import numpy as np, glob, json, math
from scipy import ndimage
S='/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad'
res={}; crops=[]
for f in sorted(glob.glob(S+'/ff/hi/*.png')):
    n=f.split('/')[-1][:-4]
    im=Image.open(f).convert('L'); g=np.array(im); a=g<215; h,w=a.shape
    X0,Y0=760,2150; reg=a[Y0:h-3, X0:990]
    lab,k=ndimage.label(reg); found=None
    for i,sl in enumerate(ndimage.find_objects(lab)):
        hh=sl[0].stop-sl[0].start; ww=sl[1].stop-sl[1].start
        if not (14<=hh<=26 and 4<=ww<=16): continue
        cy=Y0+(sl[0].start+sl[0].stop)/2; cx=X0+(sl[1].start+sl[1].stop)/2
        best=0
        for r in range(28,40):
            pts=[(int(cy+r*math.sin(t)),int(cx+r*math.cos(t))) for t in np.linspace(0,2*math.pi,48,endpoint=False)]
            pts=[(y,x) for y,x in pts if 0<=y<h and 0<=x<w]
            fr=np.mean([g[max(0,y-1):y+2,x-1:x+2].min()<170 for y,x in pts]); 
            if fr>best: best,br=fr,r
        if best>0.8: found=(cx,cy,br,[X0+sl[1].start,Y0+sl[0].start,X0+sl[1].stop,Y0+sl[0].stop])
    if found:
        cx,cy,r,db=found; res[n]=dict(cx=cx,cy=cy,r=r,digit=list(map(int,db)))
        crops.append((n,im.crop((int(cx-45),int(cy-45),int(cx+45),int(cy+45)))))
    else: print('none',n)
json.dump(res,open(S+'/ff/circles.json','w'))
sh=Image.new('L',(len(crops)*60,90),255); d=ImageDraw.Draw(sh)
for i,(n,c) in enumerate(crops): sh.paste(c.resize((55,55)),(i*60,25)); d.text((i*60,2),n[1:],fill=0)
sh.save(S+'/ff/circles.png'); print(len(res))
