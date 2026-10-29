"""Correct calorie figures and page numbers on Forged Fuel Parts I-III.

For each recipe page: a small patch image (rebuilt background + corrected
text, 600 dpi) is laid over the original PDF page at the exact position of the
old calorie figure, and over the inside of the page-number circle.
"""
import io, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter, Transformation

S = '/tmp/claude-0/-home-user-Zach-McIvor-Personal-Training-Application-/9fedb239-77a4-546b-96fb-df1193f48de7/scratchpad'
SHRIKHAND = S + '/book/fonts/Shrikhand.ttf'
NOTO = S + '/book/fonts/NotoSans-Bold.ttf'
K = 2  # patch supersampling: 300 dpi renders -> 600 dpi patches

BOOKS = {
    'b1': dict(src='/root/.claude/uploads/9fedb239-77a4-546b-96fb-df1193f48de7/d580bb5f-FORGED_FUEL_I.pdf', recipes=[
        ("Big Mac Salad", 520, 50, 35, 20), ("Chicken Parm Bowl", 550, 60, 45, 15), ("Dumpling Bowl", 520, 45, 55, 20),
        ("Juicy Chicken Wrap", 550, 60, 45, 15), ("Tuna Salad", 550, 55, 45, 12), ("Beefy Taco Bowls", 620, 60, 45, 15),
        ("Loaded Animal Fries", 470, 45, 30, 17), ("Burrito Bowl", 510, 55, 45, 20), ("Chicken Wrap", 660, 75, 30, 25),
        ("Chicken Alfredo", 600, 60, 40, 18)]),
    'b2': dict(src='/root/.claude/uploads/9fedb239-77a4-546b-96fb-df1193f48de7/b7aea6e1-FORGED_FUEL_II_.pdf', recipes=[
        ("Raspberry Cheesecake Overnight Weetbix", 495, 51, 46, 10), ("Bacon & Egg McMuffin", 485, 40, 31, 22),
        ("Malteser Weetbix", 430, 45, 40, 12), ("Power Bowl", 420, 45, 40, 8), ("Crunchy Choc PB Oats", 520, 45, 45, 15),
        ("Biscoff Pancake Bowl", 450, 35, 45, 12), ("Aero Mint Weetbix", 445, 36, 40, 11),
        ("Cookies N' Cream Weetbix", 500, 50, 50, 15), ("Nutella Crunch Bowl", 420, 45, 40, 8), ("Brekkie Wrap", 400, 36, 22, 12),
        ("Berry Fuel Smoothie", 340, 25, 55, 6), ("Egg & Avo Toast", 350, 30, 30, 20)]),
    'b3': dict(src='/root/.claude/uploads/9fedb239-77a4-546b-96fb-df1193f48de7/f4e917b6-FORGED_FUEL_III.pdf', recipes=[
        ("Zingaa Chicken Burga", 470, 59, 49, 15), ("Tuna Melt", 760, 66, 44, 28), ("Potato Gem Cups", 120, 10, 8, 6),
        ("Forged Brekkie Wrap", 650, 50, 22, 35), ("Popcorn Chicken N' Chips", 680, 50, 70, 20), ("Greek Gyros", 660, 52, 62, 18),
        ("Berry Fuel Smoothie", 340, 25, 55, 15), ("Egg & Avo Toast", 350, 30, 30, 25)]),
}


def kcal(p, c, f):
    return int(5 * round((4 * p + 4 * c + 9 * f) / 5))


def ink_box(text, font):
    im = Image.new('L', (font.size * len(text) * 2, font.size * 3), 0)
    ImageDraw.Draw(im).text((font.size // 2, font.size // 2), text, font=font, fill=255)
    return im.getbbox(), im


def calorie_patch(rgb, box, old_text, new_text):
    x0, y0, x1, y1 = box
    hgt = y1 - y0 + 1
    # font size whose ink height (old string) matches the original figure
    lo, hi = 10, 400
    while hi - lo > 1:
        mid = (lo + hi) // 2
        bb, _ = ink_box(old_text, ImageFont.truetype(SHRIKHAND, mid))
        if bb[3] - bb[1] < hgt * K: lo = mid
        else: hi = mid
    font = ImageFont.truetype(SHRIKHAND, lo)
    nbb, nim = ink_box(new_text, font)
    new_w = (nbb[2] - nbb[0]) / K
    px0, py0 = x0 - 6, y0 - 6
    px1, py1 = int(max(x1, x0 + new_w)) + 7, y1 + 7
    a = np.asarray(rgb).astype(float)[py0:py1, px0:px1].copy()
    # mask = old glyph pixels (dark), grown by 3 px; fill them from the surroundings
    dark = a.mean(2) < 140
    m = dark.copy()
    for _ in range(3):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    known = ~m
    fill = a.copy(); fill[m] = 0
    wgt = known.astype(float)
    for _ in range(400):
        acc = np.zeros_like(fill); cnt = np.zeros_like(wgt)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(fill * wgt[..., None], (dy, dx), (0, 1)); cnt += np.roll(wgt, (dy, dx), (0, 1))
        upd = m & (cnt > 0)
        fill[upd] = acc[upd] / cnt[upd][:, None]
        wgt = np.where(m, np.minimum(1, cnt), 1.0)
    patch = Image.fromarray(fill.clip(0, 255).astype('uint8')).resize(((px1 - px0) * K, (py1 - py0) * K), Image.BICUBIC)
    glyph = nim.crop(nbb)
    ox = (x0 - px0) * K
    oy = (y1 + 1 - py0) * K - glyph.height
    patch.paste((0, 0, 0), (ox, oy), glyph)
    return patch, (px0, py0), dict(size=lo, old_w=x1 - x0, new_w=round(new_w))


def number_patch(rgb, cx, cy, n):
    r_in = 30
    px0, py0 = int(round(cx)) - r_in - 1, int(round(cy)) - r_in - 1
    size = 2 * (r_in + 1)
    patch = rgb.crop((px0, py0, px0 + size, py0 + size)).resize((size * K, size * K), Image.BICUBIC)
    SS = 4
    mask = Image.new('L', (size * K * SS, size * K * SS), 0)
    c = size * K * SS / 2
    rr = (r_in - 0.5) * K * SS
    ImageDraw.Draw(mask).ellipse((c - rr, c - rr, c + rr, c + rr), fill=255)
    mask = mask.resize((size * K, size * K), Image.LANCZOS)
    patch.paste((255, 255, 255), (0, 0), mask)
    font = ImageFont.truetype(NOTO, 1)
    # digit height in the originals: 19-20 px at 300 dpi
    for s in range(10, 200):
        f = ImageFont.truetype(NOTO, s)
        bb, _ = ink_box('1', f)
        if bb[3] - bb[1] >= 19.5 * K: font = f; break
    bb, gim = ink_box(str(n), font)
    g = gim.crop(bb)
    patch.paste((0, 0, 0), ((size * K - g.width) // 2, (size * K - g.height) // 2), g)
    return patch, (px0, py0)


def as_pdf(img):
    buf = io.BytesIO()
    img.convert('RGB').save(buf, 'PDF', resolution=300 * K)
    buf.seek(0)
    return PdfReader(buf).pages[0]


def main(out_dir):
    boxes = json.load(open(S + '/ff/boxes.json'))
    circles = json.load(open(S + '/ff/circles.json'))
    report = {}
    for b, info in BOOKS.items():
        r = PdfReader(info['src'])
        w = PdfWriter(clone_from=r)
        rows = []
        for i, (name, cal, p, c, f) in enumerate(info['recipes']):
            page_idx = i + 1
            key = f'{b}-{page_idx + 1:02d}'
            page = w.pages[page_idx]
            H = float(page.mediabox.height); TOP = float(page.mediabox.top); LEFT = float(page.mediabox.left)
            rgb = Image.open(f'{S}/ff/rgb/{key}.png').convert('RGB')
            scale = H / rgb.height  # pt per 300-dpi pixel
            new = kcal(p, c, f)
            patches = []
            if new != cal:
                old_text = f'{cal}cal' if not (b == 'b2' and name.startswith('Biscoff')) else '450al'
                img, (px, py), dbg = calorie_patch(rgb, boxes[key]['box'], old_text, f'{new}cal')
                patches.append((img, px, py))
            ci = circles.get(key, dict(cx=873, cy=2418))
            img, (px, py) = number_patch(rgb, ci['cx'], ci['cy'], page_idx)
            patches.append((img, px, py))
            for img, px, py in patches:
                ov = as_pdf(img)
                hpt = img.height / K * scale
                k = scale * 300 / 72   # overlay PDF is at 600 dpi = K x 300
                page.merge_transformed_page(ov, Transformation().scale(k, k).translate(LEFT + px * scale, TOP - py * scale - hpt))
            rows.append(dict(name=name, page=page_idx, old=cal, kcal=new, p=p, c=c, f=f))
        tmp = f'{out_dir}/{b}-fixed.pdf'
        w.write(tmp)
        report[b] = rows
    json.dump(report, open(f'{out_dir}/menu-data.json', 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
