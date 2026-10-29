"""Prepare recipe photography: clean cut-outs (PNG) and print-sized crops (JPEG)."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

S = sys.argv[1]; OUT = sys.argv[2]
CUT = ["chicken-burger","smash-burger","korean","lava","nachos","shake","butter-chicken","pizza-top"]
RECT = ["fish-chips","honey-soy","pizza","quesadilla","souvlaki","mongolian","pad-thai","doner",
        "sweet-sour","fried-rice"]

def clean_cutout(k):
    im = Image.open(f"{S}/cut/{k}.png").convert("RGBA")
    a = np.array(im)
    alpha = a[..., 3].astype(np.float32)
    alpha[alpha < 24] = 0
    lab, n = ndimage.label(alpha > 0)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.04 * sizes.max()]
        alpha[~np.isin(lab, keep)] = 0
    a[..., 3] = alpha.astype(np.uint8)
    ys, xs = np.where(a[..., 3] > 0)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(a)
    im.thumbnail((900, 900), Image.LANCZOS)
    im.save(f"{OUT}/{k}.png", optimize=True)
    print(k, im.size)

def rect(k):
    im = Image.open(f"{S}/photos/{k}.jpg").convert("RGB")
    im.thumbnail((1300, 1300), Image.LANCZOS)
    im.save(f"{OUT}/{k}.jpg", quality=82, optimize=True, progressive=True)
    print(k, im.size)

for k in CUT: clean_cutout(k)
for k in RECT: rect(k)
