import json
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from pypdf.generic import RectangleObject, DictionaryObject, NameObject, ArrayObject, FloatObject, NumberObject
S='/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad/ff/out'
NAMES={'b1':'Forged-Fuel-Part-I.pdf','b2':'Forged-Fuel-Part-II-The-Breakfast-Blueprint.pdf','b3':'Forged-Fuel-Part-III-The-Weekend-Warrior.pdf'}
for b,name in NAMES.items():
    src=PdfReader(f'{S}/{b}-fixed.pdf'); menu=PdfReader(f'{S}/menu-{b}.pdf').pages[0]
    w=PdfWriter()
    w.add_page(src.pages[0])
    ref=src.pages[1].mediabox
    mp=w.add_page(menu)
    mh=float(mp.mediabox.height)
    mp.mediabox=RectangleObject([0,0,float(ref.width),float(ref.height)]); mp.cropbox=mp.mediabox
    # menu content was laid out from the top: shift so the top edge lines up
    from pypdf import Transformation
    mp.add_transformation(Transformation().translate(0, float(ref.height)-mh))
    for p in src.pages[1:]: w.add_page(p)
    for r in json.load(open(f'{S}/links-{b}.json')):
        H=float(ref.height)
        rect=(r['x'], H-(r['y']+r['h']), r['x']+r['w'], H-r['y'])
        ann=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/Link'),
            NameObject('/Rect'):ArrayObject([FloatObject(v) for v in rect]),NameObject('/Border'):ArrayObject([NumberObject(0)]*3),
            NameObject('/Dest'):ArrayObject([w.pages[r['page']+1].indirect_reference, NameObject('/Fit')])})
        mpage=w.pages[1]
        if '/Annots' not in mpage: mpage[NameObject('/Annots')]=ArrayObject()
        mpage['/Annots'].append(w._add_object(ann))
    w.add_metadata({'/Title': src.metadata.get('/Title','Forged Fuel')})
    w.compress_identical_objects()
    w.write(f'{S}/{name}')
    print(name, len(w.pages))
