# Forged Fuel Recipe Book – Part V: The Fakeaway Files

17 high-protein takeaway recipes in the Forged Fuel series design (Parts I–III):
A5-size pages (419 x 596 pt), heavy black frame, Black Ops One titles, Shrikhand
calories/macros, brush-framed INGREDIENTS / INSTRUCTIONS, M logo top right,
numbered pages, and the black "Forge Your Path" afterword.

- `Forged-Fuel-Part-V-The-Fakeaway-Files.pdf` – the finished book (20 pages).
- `index.html` – editable source. Open it in Chrome to see every page; text can be
  edited directly here, then print to PDF (Chrome: Save as PDF, margins None,
  background graphics on).

## Rebuilding from the recipe data

Recipes, ingredient weights and method text live in `src/recipes.py`; per-100 g
nutrition values in `src/foods.py`. Calories and macros are **calculated** from
those, never typed in:

```
cd ebooks/forged-fuel-part-5-fakeaway
python3 src/nutrition.py      # prints per-serve numbers for every recipe
python3 src/build.py cover && node src/render.cjs cover   # cover thumbnail for the afterword
python3 src/build.py && node src/render.cjs                # index.html + PDF
```

`render.cjs` uses Playwright (Chromium). `src/layout.js` fits each page: it keeps
the title on one line, picks the largest text size (7.6–8.8 pt) that lets the
ingredients and instructions fit inside the frame, and sizes the photo into the
space left.

Nutrition notes: carbohydrate is available carbohydrate (Australian label
convention) with fibre listed separately; energy = 4 kcal/g protein and carbs,
9 kcal/g fat, 2 kcal/g fibre. Dried spices, salt and a few herb leaves are counted
as zero.

## Photography

All food photos are from Unsplash (free for commercial use under the Unsplash
Licence; no attribution required, credited in the book anyway). Cut-outs were made
with `rembg`. `photos/` holds the print-ready versions; `src/prep_photos.py` is
the script that made them from the full-size downloads. Unsplash image IDs:

| Recipe | Unsplash image |
|---|---|
| Crispy Chicken Burger | photo-1692737348416-0a4fa4cf1523 |
| The Big SMAC (also cover) | photo-1607013251379-e6eecfffe234 |
| Loaded Beef Nachos | photo-1734769975334-e42a3be8714d |
| Chipotle Quesadillas | photo-1719957770167-bb66133ba808 |
| Pepperoni Pizza | photo-1541745537411-b8046dc6d66c |
| Beef Doner Kebab | photo-1529006557810-274b9b2fc783 |
| Pork Souvlaki Plate | photo-1603360946369-dc9bb6258143 |
| Chicken Tikka Masala (also cover) | photo-1742599361539-f096753d1100 |
| Honey Soy Chicken | photo-1636401870585-a8852371e84a |
| Korean Fried Chicken | photo-1687966699414-095ca9c35593 |
| Mongolian Beef | photo-1783375175952-705a0600e05c |
| Sweet & Sour Pork | photo-1623689046286-01d812cc8bad |
| Prawn Fried Rice | photo-1551326844-4df70f78d0e9 |
| Prawn Pad Thai | photo-1559314809-0d155014e29e |
| Fish & Chips | photo-1611599538235-128e54f1250f |
| Choc Lava Cakes | photo-1617305855058-336d24456869 |
| Caramel Thickshake (also cover) | photo-1546470427-0d4db154ceb7 |

Full URL: `https://images.unsplash.com/<id>`.

## Brand assets and fonts

- The M logo is a vector trace of the supplied M artwork. The cover title block
  (frame, curved FORGED FUEL / RECIPE BOOK, brush stroke, BY ZACH MCIVOR) is the
  Part I cover itself with its photos and strapline removed (`assets/cover-base.png`). The brush
  underlines, brush frames, "Forge Your Path" lettering and the Part I–IV cover
  thumbnails were taken from the uploaded Part I PDF.
- Fonts (all SIL Open Font License, from Google Fonts): Black Ops One and Shrikhand
  (same as the originals), Fraunces "SuperSoft" standing in for Roca One (a paid
  Canva font), Archivo Black / Archivo Narrow for the cover strapline, Noto Sans
  for small labels.
