# Per-100 g nutrition used for every recipe in this book.
# (protein g, available carbohydrate g, fat g, dietary fibre g)
# Carbohydrate is "available" carbohydrate, as on Australian nutrition panels
# (fibre listed separately). Energy is calculated from these with the
# Australian factors: protein 17 kJ, carbohydrate 17 kJ, fat 37 kJ, fibre 8 kJ
# per gram (= 4 / 4 / 9 / 2 kcal), so every calorie figure in the book agrees
# with its own macros.
#
# Values are typical figures for the generic Australian supermarket product
# (Food Standards Australia NZ AUSNUT / USDA FoodData Central reference values,
# cross-checked against common Coles/Woolworths labels). Brands vary; readers
# are told to check their own labels.

FOODS = {
    # --- Meat & seafood (raw weights) ---
    "chicken_breast":   (23.3, 0.0, 1.6, 0.0),   # skinless fillet, raw
    "beef_mince_5":     (21.0, 0.0, 5.0, 0.0),   # 5-star / <=5% fat mince, raw
    "beef_rump":        (22.5, 0.0, 4.0, 0.0),   # rump steak, fat trimmed, raw
    "pork_fillet":      (22.0, 0.0, 2.5, 0.0),   # pork fillet (tenderloin), raw
    "pork_loin":        (22.5, 0.0, 3.5, 0.0),   # loin steak, fat trimmed, raw
    "prawns_raw":       (20.0, 0.0, 0.6, 0.0),   # green prawns, peeled, raw
    "white_fish":       (20.0, 0.0, 1.2, 0.0),   # flathead / barramundi, skinless, raw
    "pepperoni":        (19.3, 1.2, 46.0, 0.0),
    "egg":              (12.6, 0.7, 9.5, 0.0),   # whole egg, edible portion (~50 g per egg)
    "egg_white":        (10.9, 0.7, 0.2, 0.0),

    # --- Dairy ---
    "greek_yog":        (10.0, 4.0, 0.3, 0.0),   # high-protein plain Greek yoghurt, 0% fat
    "vanilla_pro_yog":  (9.4, 6.1, 0.2, 0.0),    # vanilla high-protein yoghurt (e.g. YoPRO)
    "mozz_light":       (27.0, 1.5, 16.0, 0.0),  # light shredded mozzarella
    "tasty_light":      (29.0, 0.5, 21.0, 0.0),  # light grated tasty cheese
    "cheese_slice_lt":  (22.0, 4.5, 16.0, 0.0),  # light burger cheese slice (~20 g)
    "parmesan":         (36.0, 0.0, 27.0, 0.0),
    "skim_milk":        (3.5, 5.0, 0.1, 0.0),
    "lite_milk":        (3.6, 5.0, 1.3, 0.0),
    "evap_light":       (7.5, 11.0, 2.0, 0.0),   # light & creamy evaporated milk
    "butter":           (0.6, 0.6, 81.0, 0.0),
    "whipped_cream":    (3.2, 12.5, 22.0, 0.0),  # aerosol whipped cream
    "light_mayo":       (0.5, 7.5, 27.5, 0.0),

    # --- Breads, grains, starches (dry / raw weights) ---
    "burger_bun":       (9.0, 46.0, 4.0, 2.5),   # soft white burger bun (~70 g)
    "wrap":             (8.5, 48.0, 7.0, 3.5),   # large wholemeal wrap (~60 g)
    "pita":             (9.5, 50.0, 1.8, 3.5),   # Lebanese / pita bread (~70 g)
    "corn_tortilla":    (5.7, 38.0, 2.9, 6.3),
    "sr_flour":         (9.9, 72.0, 1.0, 2.7),
    "plain_flour":      (10.0, 72.0, 1.0, 2.7),
    "cornflour":        (0.3, 88.0, 0.1, 0.9),
    "panko":            (12.0, 70.0, 3.0, 3.0),
    "cornflakes":       (7.4, 82.5, 0.6, 3.0),
    "jasmine_rice":     (6.9, 79.0, 0.6, 1.0),   # dry
    "basmati_rice":     (8.0, 77.0, 0.9, 1.5),   # dry
    "rice_noodles":     (6.0, 80.0, 0.6, 1.6),   # dry flat rice stick noodles
    "potato":           (2.3, 14.0, 0.1, 1.8),   # raw, skin on
    "black_beans":      (6.0, 10.0, 0.4, 7.0),   # canned, drained

    # --- Vegetables & fruit ---
    "tomato":           (0.9, 2.6, 0.2, 1.2),
    "onion":            (1.1, 7.0, 0.1, 1.7),
    "capsicum":         (1.0, 4.5, 0.3, 2.0),
    "broccoli":         (2.8, 2.5, 0.4, 2.6),
    "iceberg":          (0.9, 2.0, 0.1, 1.2),
    "cucumber":         (0.7, 2.5, 0.1, 0.5),
    "spring_onion":     (1.8, 4.0, 0.2, 2.6),
    "garlic":           (6.4, 30.0, 0.5, 2.1),
    "ginger":           (1.8, 16.0, 0.8, 2.0),
    "bean_sprouts":     (3.0, 4.2, 0.2, 1.8),
    "frozen_mixed_veg": (3.3, 10.5, 0.5, 4.0),   # peas, corn & carrot
    "corn_kernels":     (3.3, 15.0, 1.4, 2.5),
    "jalapenos":        (0.9, 2.0, 0.4, 2.6),
    "radish":           (0.7, 1.9, 0.1, 1.6),
    "avocado":          (2.0, 1.8, 15.0, 6.7),
    "dill_pickles":     (0.5, 1.5, 0.2, 1.0),
    "herbs":            (2.5, 1.0, 0.6, 3.0),    # fresh coriander / parsley / mint / dill
    "lemon_juice":      (0.4, 6.5, 0.2, 0.3),
    "chilli_fresh":     (1.9, 7.0, 0.4, 1.5),
    "pineapple_juice":  (0.4, 12.0, 0.1, 0.2),

    # --- Sauces, pantry ---
    "olive_oil":        (0.0, 0.0, 100.0, 0.0),
    "sesame_oil":       (0.0, 0.0, 100.0, 0.0),
    "soy_sauce":        (8.0, 5.0, 0.1, 0.5),    # reduced-salt soy
    "oyster_sauce":     (1.4, 10.6, 0.3, 0.3),
    "fish_sauce":       (5.1, 3.6, 0.0, 0.0),
    "gochujang":        (4.0, 44.0, 1.5, 2.5),
    "honey":            (0.3, 82.0, 0.0, 0.2),
    "brown_sugar":      (0.0, 98.0, 0.0, 0.0),
    "icing_sugar":      (0.0, 100.0, 0.0, 0.0),
    "tomato_sauce":     (1.2, 24.0, 0.1, 0.6),   # ketchup
    "tomato_paste":     (4.3, 16.0, 0.5, 4.1),
    "canned_tomato":    (1.0, 3.5, 0.2, 1.2),   # canned crushed tomatoes
    "passata":          (1.4, 5.0, 0.2, 1.5),
    "salsa":            (1.2, 6.5, 0.2, 1.5),    # jarred tomato salsa
    "mustard":          (4.0, 3.0, 3.5, 3.0),    # American mustard
    "chipotle_adobo":   (1.5, 8.0, 3.0, 4.0),
    "tamarind":         (1.4, 28.0, 0.3, 2.5),   # tamarind puree (jar)
    "sriracha":         (1.9, 17.0, 0.9, 2.2),
    "caramel_topping":  (0.8, 65.0, 0.5, 0.0),
    "sesame_seeds":     (17.7, 11.6, 49.7, 11.8),
    "peanuts":          (24.0, 13.0, 49.5, 8.4), # dry-roasted, unsalted
    "capers":           (2.4, 1.7, 0.9, 3.2),
    "whey":             (75.0, 8.0, 5.5, 0.0),   # whey protein powder (vanilla or choc)
    "cocoa":            (19.6, 21.0, 13.7, 30.0),
    "dark_choc":        (7.8, 35.0, 42.6, 10.9), # 70% cocoa
}


def kcal(p, c, f, fib):
    return 4 * p + 4 * c + 9 * f + 2 * fib
