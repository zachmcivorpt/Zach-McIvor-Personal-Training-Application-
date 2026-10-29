# Forged Fuel Parts I–III – corrected editions

Each book now has:

- **A menu page** after the cover: every recipe with its page number, calories
  and macros. Each row links to its recipe.
- **Calories that match the macros.** Every calorie figure was recalculated as
  protein × 4 + carbs × 4 + fat × 9, rounded to the nearest 5. The printed
  macros were kept as they are.
- **Correct page numbers.** Every recipe page used to say "1".

| Book | Recipe | Was | Now |
|---|---|---|---|
| I | Big Mac Salad | 520 | 520 |
| I | Chicken Parm Bowl | 550 | 555 |
| I | Dumpling Bowl | 520 | 580 |
| I | Juicy Chicken Wrap | 550 | 555 |
| I | Tuna Salad | 550 | 510 |
| I | Beefy Taco Bowls | 620 | 555 |
| I | Loaded Animal Fries | 470 | 455 |
| I | Burrito Bowl | 510 | 580 |
| I | Chicken Wrap | 660 | 645 |
| I | Chicken Alfredo | 600 | 560 |
| II | Raspberry Cheesecake Overnight Weetbix | 495 | 480 |
| II | Bacon & Egg McMuffin | 485 | 480 |
| II | Malteser Weetbix | 430 | 450 |
| II | Power Bowl | 420 | 410 |
| II | Crunchy Choc PB Oats | 520 | 495 |
| II | Biscoff Pancake Bowl | 450 ("450al") | 430 |
| II | Aero Mint Weetbix | 445 | 405 |
| II | Cookies N' Cream Weetbix | 500 | 535 |
| II | Nutella Crunch Bowl | 420 | 410 |
| II | Brekkie Wrap | 400 | 340 |
| II | Berry Fuel Smoothie | 340 | 375 |
| II | Egg & Avo Toast | 350 | 420 |
| III | Zingaa Chicken Burga | 470 | 565 |
| III | Tuna Melt | 760 | 690 |
| III | Potato Gem Cups | 120 | 125 |
| III | Forged Brekkie Wrap | 650 | 605 |
| III | Popcorn Chicken N' Chips | 680 | 660 |
| III | Greek Gyros | 660 | 620 |
| III | Berry Fuel Smoothie | 340 | 455 |
| III | Egg & Avo Toast | 350 | 465 |

How it was done (`src/`): the Canva originals were left untouched apart from
small 600 dpi patches laid exactly over each old calorie figure and the inside of
each page-number circle. The old digits were removed by filling from the
surrounding pixels, so photos behind the text stay intact. Then the new figure was
set in Shrikhand, the same font as the originals. The menu pages are HTML,
rendered with Playwright and inserted after each cover.
