# Every recipe in FORGED FUEL Part V: The Fakeaway Files.
# Ingredient tuples: (text shown in the book, food key in foods.py, grams counted).
# key None = seasoning / garnish counted as zero (salt, pepper, dried spices,
# a few herb leaves) - each is well under 5 kcal per serve.

RECIPES = [
# ---------------------------------------------------------------- 1
dict(
  slug="chicken-burger", title="CRISPY CHICKEN BURGER", serves=2, prep=15, cook=16,
  section="Burgers & Handhelds",
  ingredients=[
    ("Chicken", [
      ("320 g chicken breast (2 fillets)", "chicken_breast", 320),
      ("80 g high-protein Greek yoghurt", "greek_yog", 80),
      ("20 ml lite milk + 1 tsp lemon juice", None, 0),
      ("40 g cornflakes, lightly crushed", "cornflakes", 40),
      ("20 g panko breadcrumbs", "panko", 20),
      ("1 tsp smoked paprika, ½ tsp garlic powder, ½ tsp onion powder, ¼ tsp cayenne, 1 tsp chicken salt", None, 0),
      ("Olive oil spray (about 3 g)", "olive_oil", 3),
    ]),
    ("Burger", [
      ("2 soft white burger buns (approx. 70 g each)", "burger_bun", 140),
      ("40 g iceberg lettuce, shredded", "iceberg", 40),
      ("20 g light mayonnaise", "light_mayo", 20),
      ("20 g Greek yoghurt + ½ small garlic clove, grated", "greek_yog", 20),
    ]),
  ],
  _extra=[("lite_milk", 20), ("lemon_juice", 5), ("garlic", 2)],
  steps=[
    ("Flatten & marinate", "Pound each fillet between baking paper to an even 1.5 cm thick so it cooks before it dries out. Mix the yoghurt, milk, lemon juice, half the paprika and a pinch of salt, coat the chicken and refrigerate for 30 minutes (or overnight)."),
    ("Crumb", "Mix the crushed cornflakes, panko and remaining spices. Lift the chicken from the marinade, let the excess drip off, then press firmly into the crumb on both sides."),
    ("Cook", "Spray all over with oil. Air fry at 190°C for 14–16 minutes, turning halfway, until golden and cooked through (74°C in the centre). Oven: 200°C fan-forced on a rack over a tray, 20–22 minutes. Rest 3 minutes on the rack."),
    ("Build", "Stir the mayo, yoghurt and garlic together. Toast the buns cut-side down in a dry pan, then layer sauce, lettuce, chicken and a final spoon of sauce."),
  ],
  tip="Every patch of crumb you miss with the oil spray stays pale, so coat it properly. Resting on a rack, not a plate, keeps the base crunchy.",
),
# ---------------------------------------------------------------- 2
dict(
  slug="smash-burger", title="THE BIG SMAC", serves=2, prep=10, cook=10,
  section="Burgers & Handhelds",
  ingredients=[
    ("Patties", [
      ("300 g 5-star beef mince (5% fat), rolled into 4 loose balls", "beef_mince_5", 300),
      ("4 light burger cheese slices (80 g)", "cheese_slice_lt", 80),
      ("Olive oil spray (about 3 g)", "olive_oil", 3),
      ("Salt & cracked black pepper", None, 0),
    ]),
    ("Special sauce", [
      ("40 g high-protein Greek yoghurt", "greek_yog", 40),
      ("20 g light mayonnaise", "light_mayo", 20),
      ("10 g tomato sauce + 5 g American mustard", "tomato_sauce", 10),
      ("15 g dill pickles, finely diced, + 1 tsp pickle juice", "dill_pickles", 15),
      ("¼ tsp each smoked paprika, garlic powder & onion powder", None, 0),
    ]),
    ("To serve", [
      ("2 soft burger buns (approx. 70 g each)", "burger_bun", 140),
      ("30 g dill pickle slices", "dill_pickles", 30),
    ]),
  ],
  _extra=[("mustard", 5)],
  steps=[
    ("Sauce first", "Stir all the special sauce ingredients together and chill while you cook – it tastes better after 10 minutes."),
    ("Roll, don't knead", "Shape the mince into 4 loose balls and keep them cold. Overworking makes the patties tight and dry."),
    ("Smash", "Heat a heavy frying pan over high heat for 3 minutes, then spray lightly with oil. Add 2 balls and immediately smash each to 1 cm thick with a sturdy spatula (baking paper on top stops sticking). Season and cook untouched for 2 minutes until deeply browned."),
    ("Flip & stack", "Scrape under the crust, flip, top each patty with a cheese slice and cook 45–60 seconds. Repeat with the remaining balls."),
    ("Build", "Toast the buns. Spread sauce on both halves, add pickles, then stack two cheesy patties per burger."),
  ],
  tip="Smash once, in the first 30 seconds, and never press again. Lean mince gets its flavour from that crust, so the pan must be properly hot.",
),
# ---------------------------------------------------------------- 3
dict(
  slug="nachos", title="LOADED BEEF NACHOS", serves=2, prep=15, cook=25,
  section="Pizza, Mexican & Greek",
  ingredients=[
    ("Chips & beef", [
      ("6 small corn tortillas (150 g), each cut into 6 wedges", "corn_tortilla", 150),
      ("Olive oil spray (about 4 g)", "olive_oil", 4),
      ("300 g 5-star beef mince (5% fat)", "beef_mince_5", 300),
      ("½ brown onion (60 g), finely diced + 1 garlic clove, crushed", "onion", 60),
      ("1 tsp each ground cumin & smoked paprika; ½ tsp each chilli powder & oregano", None, 0),
      ("20 g tomato paste", "tomato_paste", 20),
      ("120 g canned black beans, rinsed (about ½ can)", "black_beans", 120),
      ("50 g light tasty cheese, grated", "tasty_light", 50),
    ]),
    ("Toppings", [
      ("60 g high-protein Greek yoghurt (your 'sour cream')", "greek_yog", 60),
      ("70 g avocado, mashed with lime juice & salt", "avocado", 70),
      ("100 g tomato + 20 g red onion, diced, with coriander", "tomato", 100),
      ("20 g pickled jalapeños + 20 g radish, sliced; lime wedges", "jalapenos", 20),
    ]),
  ],
  _extra=[("garlic", 5), ("onion", 20), ("radish", 20), ("lemon_juice", 10), ("herbs", 5)],
  steps=[
    ("Bake the chips", "Spread the wedges over two lined trays, spray with oil and salt lightly. Bake at 200°C fan-forced for 8–10 minutes until crisp and lightly golden."),
    ("Cook the beef", "Brown the mince well in a hot non-stick pan – the browning is the flavour. Add onion and garlic for 2 minutes, then the spices for 30 seconds. Stir in tomato paste, beans and 60 ml water; simmer until thick, not wet."),
    ("Layer", "On an ovenproof platter, layer half the chips, half the beef and half the cheese, then repeat. Bake 5 minutes until the cheese melts."),
    ("Load up", "Loosen the yoghurt with lime and drizzle over, then add the avocado, tomato salsa, jalapeños, radish and coriander. Serve straight away."),
  ],
  tip="Two thin layers beat one big pile – every chip gets beef and cheese, not just the top ones. Keep the beef thick so the chips stay crunchy.",
),
# ---------------------------------------------------------------- 4
dict(
  slug="quesadilla", title="CHIPOTLE QUESADILLAS", serves=2, prep=10, cook=16,
  section="Pizza, Mexican & Greek",
  ingredients=[
    ("Filling", [
      ("300 g chicken breast, diced into 1.5 cm pieces", "chicken_breast", 300),
      ("1 chipotle chilli in adobo, chopped (15 g) – or 1 tsp smoked paprika for mild", "chipotle_adobo", 15),
      ("1 tsp ground cumin, ½ tsp garlic powder, salt & pepper", None, 0),
      ("½ red capsicum (75 g), diced", "capsicum", 75),
      ("60 g corn kernels, drained", "corn_kernels", 60),
      ("2 spring onions (30 g), sliced", "spring_onion", 30),
      ("70 g light shredded mozzarella", "mozz_light", 70),
      ("2 large wholemeal wraps (approx. 60 g each)", "wrap", 120),
      ("Olive oil spray (about 3 g)", "olive_oil", 3),
    ]),
    ("Avocado crema & salsa", [
      ("60 g high-protein Greek yoghurt", "greek_yog", 60),
      ("40 g avocado + juice of ½ lime", "avocado", 40),
      ("80 g tomato salsa (jarred, e.g. thick & chunky)", "salsa", 80),
    ]),
  ],
  _extra=[("lemon_juice", 10)],
  steps=[
    ("Cook the chicken", "Toss the chicken with the chipotle, spices and a little salt. Cook in a hot pan sprayed with oil for 6–7 minutes until golden and cooked through. Add capsicum and corn for the last 2 minutes, then stir through the spring onion and let it cool for a few minutes."),
    ("Make the crema", "Blend or mash the yoghurt, avocado, lime and a pinch of salt until smooth and pale green."),
    ("Fill & fold", "Over half of each wrap, scatter a little cheese, then the filling, then the rest of the cheese – cheese on both sides glues it together. Fold over and press flat."),
    ("Toast", "Cook in a dry non-stick pan over medium heat for 2–3 minutes a side, pressing with a spatula, until golden and spotted. Rest 1 minute, cut each into 2 wedges and serve with crema and salsa."),
  ],
  tip="Medium heat, not high. The wrap needs a few minutes for the cheese inside to melt before the outside scorches.",
),
# ---------------------------------------------------------------- 5
dict(
  slug="pizza", title="PEPPERONI PIZZA", serves=2, prep=15, cook=17,
  section="Pizza, Mexican & Greek",
  ingredients=[
    ("Protein dough", [
      ("150 g self-raising flour (+ 10 g for dusting)", "sr_flour", 160),
      ("150 g high-protein Greek yoghurt", "greek_yog", 150),
      ("Pinch of salt", None, 0),
    ]),
    ("Sauce & topping", [
      ("60 g tomato passata", "passata", 60),
      ("½ garlic clove, grated + ½ tsp dried oregano", "garlic", 3),
      ("120 g light shredded mozzarella", "mozz_light", 120),
      ("40 g sliced pepperoni", "pepperoni", 40),
      ("10 g parmesan, finely grated", "parmesan", 10),
      ("Fresh basil & chilli flakes, to finish", None, 0),
    ]),
  ],
  steps=[
    ("Heat the tray", "Put a pizza tray or large baking tray in the oven and heat to 220°C fan-forced. A hot tray is what gives you a crisp base."),
    ("Make the dough", "Stir the flour, yoghurt and salt into a shaggy dough, then knead on a floured bench for 1–2 minutes until smooth and only slightly tacky. Roll out to a 30 cm round on baking paper."),
    ("Par-bake", "Slide the base (on its paper) onto the hot tray and bake 5 minutes, until set and lightly puffed."),
    ("Top & bake", "Mix the passata, garlic and oregano and spread thinly, leaving a 2 cm border. Add mozzarella, pepperoni and parmesan. Bake another 10–12 minutes until the cheese is bubbling and the pepperoni edges curl and crisp."),
    ("Rest", "Rest 2 minutes before slicing so the cheese sets. Finish with basil and chilli flakes."),
  ],
  tip="Go easy on the sauce – a thin layer keeps the base crisp. Too much passata is the number one cause of a soggy homemade pizza.",
),
# ---------------------------------------------------------------- 6
dict(
  slug="doner", title="BEEF DONER KEBAB", serves=2, prep=20, cook=30,
  section="Pizza, Mexican & Greek",
  ingredients=[
    ("Doner meat", [
      ("300 g 5-star beef mince (5% fat)", "beef_mince_5", 300),
      ("30 g brown onion, finely grated", "onion", 30),
      ("1 tsp each ground cumin, smoked paprika & dried oregano; ½ tsp each ground coriander, garlic powder & salt", None, 0),
    ]),
    ("Chips", [
      ("250 g washed potatoes, cut into thin chips", "potato", 250),
      ("1 tsp olive oil (4 g) + salt", "olive_oil", 4),
    ]),
    ("Garlic sauce & wrap", [
      ("80 g high-protein Greek yoghurt", "greek_yog", 80),
      ("1 garlic clove, grated + 1 tsp lemon juice", "garlic", 5),
      ("2 Lebanese breads or large pitas (approx. 70 g each)", "pita", 140),
      ("½ red onion (60 g), thinly sliced", "onion", 60),
      ("Flat-leaf parsley + 1 long green chilli, sliced (optional)", "chilli_fresh", 10),
    ]),
  ],
  _extra=[("lemon_juice", 5), ("herbs", 5)],
  steps=[
    ("Make the doner", "Knead the mince with the onion and spices for 2 minutes until sticky and paste-like. That gives doner its dense, sliceable texture. Press into a 15 x 8 cm loaf on a lined tray."),
    ("Bake", "Bake at 180°C fan-forced for 25 minutes. Rest 5 minutes, then slice as thinly as you can."),
    ("Chips", "Toss the potatoes with oil and salt. Air fry at 200°C for 18–20 minutes, shaking twice, until golden (oven: 220°C on a lined tray, 30 minutes)."),
    ("Crisp the meat", "Fry the doner slices in a very hot dry pan for 1–2 minutes until the edges char and crisp."),
    ("Wrap", "Stir the yoghurt, garlic, lemon and a pinch of salt together. Warm the bread, spread with garlic sauce, then pile on meat, chips, onion, parsley and chilli. Roll tightly in baking paper."),
  ],
  tip="Searing the thin slices just before serving is what makes it taste like it came off the spit, with crisp edges and a tender centre.",
),
# ---------------------------------------------------------------- 7
dict(
  slug="souvlaki", title="PORK SOUVLAKI PLATE", serves=2, prep=20, cook=25,
  section="Pizza, Mexican & Greek",
  ingredients=[
    ("Skewers", [
      ("350 g pork loin steaks, fat trimmed, cut into 2.5 cm cubes", "pork_loin", 350),
      ("2 tsp olive oil (8 g) + juice of ½ lemon (20 ml)", "olive_oil", 8),
      ("2 garlic cloves, crushed + 1 tsp oregano + ½ tsp smoked paprika", "garlic", 10),
    ]),
    ("Plate", [
      ("300 g washed potatoes, cut into chips + 1 tsp oil (5 g)", "potato", 300),
      ("2 pita breads (approx. 70 g each), cut into wedges", "pita", 140),
      ("150 g tomatoes + 60 g red onion, sliced; lemon & parsley", "tomato", 150),
    ]),
    ("Tzatziki", [
      ("120 g high-protein Greek yoghurt", "greek_yog", 120),
      ("80 g cucumber, grated & squeezed dry", "cucumber", 80),
      ("1 garlic clove, grated + squeeze of lemon + dill", "garlic", 5),
    ]),
  ],
  _extra=[("lemon_juice", 25), ("olive_oil", 5), ("onion", 60), ("herbs", 5)],
  steps=[
    ("Marinate", "Toss the pork with the oil, lemon, garlic, oregano, paprika, salt and pepper. Refrigerate 30 minutes to 4 hours. Soak 4 bamboo skewers in water."),
    ("Chips", "Toss the potatoes with oil and salt and air fry at 200°C for 20 minutes, shaking twice (oven: 220°C, 30 minutes)."),
    ("Tzatziki", "Squeeze the cucumber hard in a clean tea towel so the tzatziki stays thick. Mix with the yoghurt, garlic, lemon, dill and salt."),
    ("Grill", "Thread the pork onto the skewers. Cook on a very hot grill pan or BBQ for 8–10 minutes, turning every 2 minutes, until charred and just cooked through. Rest 3 minutes."),
    ("Plate up", "Warm the pita on the grill, then serve with the chips, tomato, onion, tzatziki and lemon."),
  ],
  tip="Cut every cube the same size and leave gaps on the skewer. Heat reaches every side, so the edges char before the centre dries out.",
),
# ---------------------------------------------------------------- 8
dict(
  slug="butter-chicken", title="CHICKEN TIKKA MASALA", serves=3, prep=15, cook=35,
  section="Asian & Curry House",
  ingredients=[
    ("Chicken tikka", [
      ("500 g chicken breast, cut into 3 cm pieces", "chicken_breast", 500),
      ("100 g high-protein Greek yoghurt", "greek_yog", 100),
      ("2 garlic cloves (10 g) + 10 g ginger, grated", "garlic", 10),
      ("1 tsp each garam masala, ground cumin & Kashmiri chilli; ½ tsp turmeric; 1 tsp salt; juice of ½ lemon", "lemon_juice", 15),
    ]),
    ("Masala sauce", [
      ("10 g butter + 1 tsp olive oil (5 g)", "butter", 10),
      ("1 brown onion (150 g), diced + 1 green chilli (10 g), sliced", "onion", 150),
      ("2 garlic cloves (10 g) + 10 g ginger, grated", "garlic", 10),
      ("2 tsp garam masala, 1 tsp each ground coriander & smoked paprika, ½ tsp turmeric", None, 0),
      ("400 g can crushed tomatoes + 20 g tomato paste", "canned_tomato", 400),
      ("1 tsp honey (7 g)", "honey", 7),
      ("150 ml light & creamy evaporated milk", "evap_light", 150),
      ("180 g basmati rice (dry), to serve", "basmati_rice", 180),
    ]),
  ],
  _extra=[("ginger", 20), ("olive_oil", 5), ("tomato_paste", 20), ("herbs", 5), ("chilli_fresh", 10)],
  steps=[
    ("Marinate", "Mix the chicken with the yoghurt, garlic, ginger, spices, salt and lemon. Marinate 20 minutes, or overnight for the best flavour."),
    ("Char the tikka", "Air fry in a single layer at 220°C for 10–12 minutes, shaking once, until charred at the edges and cooked through (or under a hot grill, 12–15 minutes, turning once). Those dark spots are the tikka flavour."),
    ("Build the masala", "Cook the onion and chilli in the butter and oil over medium-low heat for 8–10 minutes until golden. Add garlic and ginger for 1 minute, the spices for 30 seconds, then the tomatoes, paste and honey. Simmer 12–15 minutes, stirring often."),
    ("Finish", "On low heat, stir in the evaporated milk – a hard boil can split it. Add the chicken and its juices and simmer 3–4 minutes."),
    ("Serve", "Serve over the rice with fresh coriander and a squeeze of lemon."),
  ],
  tip="Simmer the tomato until it's jammy and a little oil pools at the edges. By then the raw tang is gone and the spices taste toasted, not dusty.",
),
# ---------------------------------------------------------------- 9
dict(
  slug="honey-soy", title="HONEY SOY CHICKEN", serves=2, prep=10, cook=15,
  section="Asian & Curry House",
  ingredients=[
    ("Chicken", [
      ("350 g chicken breast, cut into 3 cm pieces", "chicken_breast", 350),
      ("1 egg white (30 g) + 20 g cornflour + pinch of salt", "egg_white", 30),
      ("2 tsp vegetable or olive oil (8 g)", "olive_oil", 8),
    ]),
    ("Honey soy garlic sauce", [
      ("30 g honey", "honey", 30),
      ("30 ml reduced-salt soy sauce", "soy_sauce", 30),
      ("3 garlic cloves (15 g) + 10 g ginger, finely grated", "garlic", 15),
      ("2 tsp rice vinegar + 60 ml water", None, 0),
      ("1 tsp cornflour (4 g) mixed with 1 tbsp water", "cornflour", 4),
    ]),
    ("To serve", [
      ("120 g jasmine rice (dry)", "jasmine_rice", 120),
      ("150 g broccoli or Asian greens", "broccoli", 150),
      ("5 g sesame seeds + 2 spring onions (30 g), sliced", "sesame_seeds", 5),
    ]),
  ],
  _extra=[("cornflour", 20), ("ginger", 10), ("spring_onion", 30)],
  steps=[
    ("Coat", "Toss the chicken with the egg white, cornflour and salt until every piece is coated. This thin coat keeps the chicken juicy and gives the sauce something to cling to."),
    ("Rice & greens", "Get the rice on. Steam or microwave the greens for 2–3 minutes just before serving."),
    ("Fry", "Heat the oil in a large non-stick pan over medium-high heat. Cook the chicken in a single layer, turning, for 6–8 minutes until golden all over and cooked through. Remove to a plate."),
    ("Glaze", "Add the honey, soy, garlic, ginger, vinegar and water to the pan and bubble for 1 minute. Stir in the cornflour slurry and simmer until syrupy and glossy, about 1 minute. Return the chicken and toss to coat."),
    ("Serve", "Spoon over rice with the greens, then scatter with sesame seeds and spring onion."),
  ],
  tip="Take the sauce off the heat once it coats the back of a spoon. Honey keeps thickening as it cools, and if it goes too far it turns sticky and burns.",
),
# ---------------------------------------------------------------- 10
dict(
  slug="korean", title="KOREAN FRIED CHICKEN", serves=2, prep=15, cook=18,
  section="Asian & Curry House",
  ingredients=[
    ("Chicken", [
      ("400 g chicken breast, cut into 3 cm pieces", "chicken_breast", 400),
      ("1 egg white (30 g)", "egg_white", 30),
      ("40 g cornflour + ½ tsp each garlic powder & ground ginger, salt & pepper", "cornflour", 40),
      ("Olive oil spray (about 4 g)", "olive_oil", 4),
    ]),
    ("Gochujang glaze", [
      ("30 g gochujang (Korean chilli paste)", "gochujang", 30),
      ("20 g honey", "honey", 20),
      ("20 ml reduced-salt soy sauce", "soy_sauce", 20),
      ("2 garlic cloves (10 g) + 5 g ginger, grated", "garlic", 10),
      ("1 tsp sesame oil (5 g)", "sesame_oil", 5),
      ("2 tsp rice vinegar + 30 ml water", None, 0),
    ]),
    ("To finish", [
      ("10 g sesame seeds", "sesame_seeds", 10),
      ("2 spring onions (25 g), finely sliced", "spring_onion", 25),
    ]),
  ],
  _extra=[("ginger", 5)],
  side=("Serve with 60 g (dry) jasmine rice per person", "jasmine_rice", 60),
  steps=[
    ("Coat", "Toss the chicken with the egg white, then with the cornflour and seasonings until each piece is dry and dusty. Shake off the excess."),
    ("Air fry", "Spray the basket and chicken well with oil. Air fry at 200°C for 12–14 minutes, shaking halfway, until crisp and cooked through (oven: 220°C fan-forced, 18–20 minutes, turning once)."),
    ("Make the glaze", "While the chicken cooks, simmer all the glaze ingredients in a large pan for 2–3 minutes until thick and glossy."),
    ("Toss", "Take the pan off the heat, add the hot chicken and toss quickly until coated. Tip into a bowl and shower with sesame seeds and spring onion."),
  ],
  tip="Glaze at the last second. Toss hot, crisp chicken in thick sauce off the heat and eat it straight away, while the coating still crunches through the glaze.",
),
# ---------------------------------------------------------------- 11
dict(
  slug="mongolian", title="MONGOLIAN BEEF", serves=2, prep=15, cook=12,
  section="Asian & Curry House",
  ingredients=[
    ("Beef", [
      ("350 g lean rump steak, fat trimmed", "beef_rump", 350),
      ("15 g cornflour + 1 tsp soy sauce", "cornflour", 15),
      ("2 tsp vegetable or olive oil (8 g)", "olive_oil", 8),
    ]),
    ("Sauce", [
      ("30 ml reduced-salt soy sauce", "soy_sauce", 30),
      ("15 g brown sugar", "brown_sugar", 15),
      ("15 g oyster sauce", "oyster_sauce", 15),
      ("2 garlic cloves (10 g) + 10 g ginger, grated", "garlic", 10),
      ("60 ml water + 1 tsp cornflour (4 g)", "cornflour", 4),
    ]),
    ("To serve", [
      ("250 g broccoli florets", "broccoli", 250),
      ("120 g jasmine rice (dry)", "jasmine_rice", 120),
      ("1 spring onion (15 g), sliced", "spring_onion", 15),
    ]),
  ],
  _extra=[("soy_sauce", 5), ("ginger", 10)],
  steps=[
    ("Slice thin", "Freeze the steak for 20 minutes so it firms up, then slice across the grain into 5 mm strips. Cutting across the grain is what makes it tender. Toss with the cornflour and soy."),
    ("Rice & broccoli", "Cook the rice. Blanch the broccoli in boiling water for 2 minutes, then drain well."),
    ("Sear", "Heat half the oil in a wok or large pan until smoking. Sear half the beef in a single layer for 1 minute a side until browned, then remove. Repeat with the remaining oil and beef."),
    ("Sauce", "Mix the soy, sugar, oyster sauce, garlic, ginger, water and cornflour. Pour into the hot wok and bubble for 1–2 minutes until thick and glossy."),
    ("Toss", "Return the beef and broccoli and toss for 30 seconds to coat. Serve over rice with spring onion."),
  ],
  tip="Cook the beef in two batches, in a smoking-hot pan. Fill the pan in one go and the beef stews grey instead of searing brown.",
),
# ---------------------------------------------------------------- 12
dict(
  slug="sweet-sour", title="SWEET & SOUR PORK", serves=2, prep=15, cook=18,
  section="Asian & Curry House",
  ingredients=[
    ("Crispy pork", [
      ("350 g pork fillet, trimmed, cut into 2.5 cm pieces", "pork_fillet", 350),
      ("1 egg (50 g), beaten", "egg", 50),
      ("40 g cornflour + pinch of salt & white pepper", "cornflour", 40),
      ("Olive oil spray (about 4 g)", "olive_oil", 4),
    ]),
    ("Sauce & vegetables", [
      ("210 g mixed red, yellow & green capsicum, in 2 cm pieces", "capsicum", 210),
      ("½ brown onion (75 g), cut into wedges", "onion", 75),
      ("1 tsp oil (4 g)", "olive_oil", 4),
      ("80 ml pineapple juice", "pineapple_juice", 80),
      ("40 g tomato sauce", "tomato_sauce", 40),
      ("15 g brown sugar + 20 ml white or rice vinegar", "brown_sugar", 15),
      ("10 ml reduced-salt soy sauce", "soy_sauce", 10),
      ("1 tsp cornflour (5 g) mixed with 30 ml water", "cornflour", 5),
      ("5 g sesame seeds, to finish", "sesame_seeds", 5),
    ]),
  ],
  side=("Serve with 60 g (dry) jasmine rice per person", "jasmine_rice", 60),
  steps=[
    ("Coat", "Dip the pork in beaten egg, then roll in the seasoned cornflour, pressing so it sticks. Rest 5 minutes so the coating hydrates – it fries up crisper."),
    ("Air fry", "Spray well with oil and air fry at 200°C for 12–14 minutes, shaking halfway, until golden and cooked through. Oven: 220°C fan-forced, 18–20 minutes."),
    ("Stir-fry the veg", "Heat the oil in a wok over high heat and stir-fry the onion and capsicum for 2–3 minutes. They should still have some crunch."),
    ("Sauce", "Add the pineapple juice, tomato sauce, sugar, vinegar and soy and bring to the boil. Stir in the cornflour slurry and simmer 1 minute until glossy."),
    ("Toss & serve", "Add the crispy pork, toss quickly to coat and scatter with sesame seeds."),
  ],
  tip="The sauce should be sharp as well as sweet. Taste it before the pork goes in and add a splash more vinegar if it's flat.",
),
# ---------------------------------------------------------------- 13
dict(
  slug="fried-rice", title="PRAWN FRIED RICE", serves=2, prep=10, cook=12,
  section="Asian & Curry House",
  ingredients=[
    ("Fried rice", [
      ("120 g jasmine rice (dry), cooked the day before and chilled", "jasmine_rice", 120),
      ("300 g raw peeled prawns, deveined", "prawns_raw", 300),
      ("2 eggs (100 g) + 2 egg whites (60 g), lightly beaten", "egg", 100),
      ("120 g frozen peas, corn & carrot", "frozen_mixed_veg", 120),
      ("2 garlic cloves (10 g), finely chopped", "garlic", 10),
      ("2 spring onions (30 g), sliced", "spring_onion", 30),
      ("2 tsp vegetable oil (8 g) + 1 tsp sesame oil (3 g)", "olive_oil", 8),
    ]),
    ("Seasoning", [
      ("25 ml reduced-salt soy sauce", "soy_sauce", 25),
      ("10 g oyster sauce", "oyster_sauce", 10),
      ("Pinch of white pepper", None, 0),
    ]),
  ],
  _extra=[("egg_white", 60), ("sesame_oil", 3)],
  steps=[
    ("Use cold rice", "Day-old rice is drier and firmer, so it fries instead of turning to mush. In a hurry, spread freshly cooked rice on a tray and refrigerate it uncovered for an hour."),
    ("Prawns", "Heat half the oil in a wok or large pan until smoking. Cook the prawns for 1–2 minutes until just pink, then remove."),
    ("Eggs", "Pour in the eggs and scramble softly for 30–40 seconds until just set. Remove."),
    ("Fry", "Add the remaining oil, garlic and frozen veg and toss 1 minute. Add the rice, break up any clumps, then press it against the pan and toss for 3–4 minutes until hot and lightly toasted."),
    ("Finish", "Pour the soy and oyster sauce around the edge of the wok so they sizzle. Return the eggs and prawns, add spring onion, sesame oil and white pepper, and toss to combine."),
  ],
  tip="Pour the sauces around the hot edge of the wok, not over the rice. They caramelise as they hit the metal, which gives you that smoky takeaway 'wok hei' flavour.",
),
# ---------------------------------------------------------------- 14
dict(
  slug="pad-thai", title="PRAWN PAD THAI", serves=2, prep=25, cook=10,
  section="Asian & Curry House",
  ingredients=[
    ("Noodles", [
      ("140 g dried flat rice noodles (5 mm)", "rice_noodles", 140),
      ("300 g raw peeled prawns, tails on", "prawns_raw", 300),
      ("2 eggs (100 g), beaten", "egg", 100),
      ("2 tsp vegetable oil (8 g)", "olive_oil", 8),
      ("1 small brown onion or 2 shallots (40 g) + 2 garlic cloves (10 g), sliced", "onion", 40),
      ("100 g bean sprouts", "bean_sprouts", 100),
      ("3 spring onions or garlic chives (30 g), cut into 4 cm lengths", "spring_onion", 30),
      ("15 g roasted peanuts, chopped + lime wedges", "peanuts", 15),
    ]),
    ("Pad Thai sauce", [
      ("30 g tamarind puree", "tamarind", 30),
      ("20 ml fish sauce", "fish_sauce", 20),
      ("15 g brown sugar", "brown_sugar", 15),
      ("1 tsp sriracha (5 g), or to taste", "sriracha", 5),
    ]),
  ],
  _extra=[("garlic", 10)],
  steps=[
    ("Soak, don't boil", "Soak the noodles in warm (not boiling) water for 20–25 minutes until bendy but still firm in the centre. They finish cooking in the pan. Boiled noodles turn to mush. Drain."),
    ("Sauce", "Stir the tamarind, fish sauce, sugar and sriracha until the sugar dissolves. Taste it: it should be sour, salty and sweet in equal measure."),
    ("Prawns", "Heat the oil in a wok over high heat. Cook the prawns for 1–2 minutes until pink, then remove. Add the onion and garlic and stir-fry for 1 minute."),
    ("Egg & noodles", "Push everything to one side, pour in the egg and scramble until just set. Add the noodles and sauce and toss for 2–3 minutes until the sauce is absorbed and the noodles are tender. Add a splash of water if they stick."),
    ("Finish", "Return the prawns with the sprouts and spring onion and toss for 30 seconds. Top with peanuts, with lime wedges on the side."),
  ],
  tip="Keep the noodles moving and the pan hot. If they start to clump, add a tablespoon of water rather than more oil.",
),
# ---------------------------------------------------------------- 15
dict(
  slug="fish-chips", title="FISH & CHIPS", serves=2, prep=15, cook=25,
  section="Chippy & Sweet Treats",
  ingredients=[
    ("Crumbed fish", [
      ("2 flathead or barramundi fillets, skinless (360 g)", "white_fish", 360),
      ("20 g plain flour + ½ tsp lemon pepper", "plain_flour", 20),
      ("1 egg (50 g) beaten with 1 tbsp lite milk", "egg", 50),
      ("50 g panko breadcrumbs + ½ tsp garlic powder", "panko", 50),
      ("Olive oil spray (about 4 g)", "olive_oil", 4),
    ]),
    ("Chips", [
      ("400 g washed potatoes, cut into 1 cm chips", "potato", 400),
      ("1½ tsp olive oil (6 g) + salt or chicken salt", "olive_oil", 6),
    ]),
    ("Tartare", [
      ("60 g high-protein Greek yoghurt + 15 g light mayonnaise", "greek_yog", 60),
      ("15 g gherkins, finely diced + 5 g capers, chopped", "dill_pickles", 15),
      ("1 tsp lemon juice + chopped dill or parsley", "lemon_juice", 5),
      ("Lemon wedges, to serve", None, 0),
    ]),
  ],
  _extra=[("lite_milk", 15), ("light_mayo", 15), ("capers", 5)],
  steps=[
    ("Start the chips", "Soak the cut chips in cold water for 10 minutes, then dry very well. Toss with oil and salt. Air fry at 200°C for 20–22 minutes, shaking twice (oven: 220°C, 30–35 minutes)."),
    ("Toast the crumbs", "Stir the panko in a dry frying pan over medium heat for 2–3 minutes until light golden, then mix in the garlic powder. Pre-toasting means the crumb comes out golden, not pale."),
    ("Crumb", "Pat the fish dry. Dust in the seasoned flour, dip in egg, then press into the toasted panko."),
    ("Cook", "Spray both sides with oil. Air fry at 200°C for 8–10 minutes, until the fish flakes easily (oven: 220°C, 12–14 minutes). Cook it while the chips have 10 minutes left."),
    ("Tartare", "Mix the yoghurt, mayo, gherkins, capers, lemon and herbs. Serve with the fish, chips and lemon wedges."),
  ],
  tip="Dry the chips properly after soaking. Surface water steams them instead of crisping them.",
),
# ---------------------------------------------------------------- 16
dict(
  slug="lava", title="CHOC LAVA CAKES", serves=2, prep=10, cook=12,
  section="Chippy & Sweet Treats",
  ingredients=[
    ("Makes 2 (150 ml ramekins)", [
      ("2 eggs (100 g)", "egg", 100),
      ("40 g chocolate whey protein", "whey", 40),
      ("15 g cocoa powder (+ a little for the ramekins)", "cocoa", 15),
      ("15 g self-raising flour", "sr_flour", 15),
      ("20 g brown sugar", "brown_sugar", 20),
      ("40 g high-protein Greek yoghurt", "greek_yog", 40),
      ("30 g dark chocolate (70%): 10 g melted, 2 x 10 g squares for the centres", "dark_choc", 30),
      ("Oil spray for greasing (about 1 g)", "olive_oil", 1),
      ("4 g icing sugar, to dust", "icing_sugar", 4),
    ]),
  ],
  steps=[
    ("Prep", "Heat the oven to 180°C fan-forced. Spray two 150 ml ramekins with oil and dust the inside with cocoa, tapping out the excess. This is what lets them turn out cleanly."),
    ("Batter", "Whisk the eggs and sugar for 1 minute until frothy. Whisk in the yoghurt and the 10 g of melted chocolate, then sift in the protein, cocoa and flour and fold until just smooth."),
    ("Fill", "Half-fill each ramekin, press a square of chocolate into the centre, then cover with the remaining batter."),
    ("Bake", "Bake 10–12 minutes, until the edges are set and the centre still wobbles when you nudge the tray."),
    ("Turn out", "Rest 1 minute, run a knife around the edge and invert onto a plate. Dust with icing sugar and serve immediately."),
  ],
  tip="Take them out while the middle still wobbles. Whey protein sets fast and keeps firming as it rests, and a minute too long costs you the lava.",
),
# ---------------------------------------------------------------- 17
dict(
  slug="shake", title="CARAMEL THICKSHAKE", serves=1, prep=5, cook=0,
  section="Chippy & Sweet Treats",
  ingredients=[
    ("Thickshake", [
      ("150 g vanilla high-protein yoghurt, frozen in an ice-cube tray", "vanilla_pro_yog", 150),
      ("250 ml skim milk", "skim_milk", 250),
      ("30 g vanilla whey protein (1 scoop)", "whey", 30),
      ("1 cup ice (about 150 g)", None, 0),
      ("2 tsp sugar-free salted caramel syrup + a pinch of sea salt", None, 0),
    ]),
    ("Topping", [
      ("15 g caramel topping, drizzled inside the jar", "caramel_topping", 15),
      ("15 g aerosol whipped cream", "whipped_cream", 15),
    ]),
  ],
  steps=[
    ("Freeze ahead", "Spoon the yoghurt into an ice-cube tray and freeze for at least 4 hours. This is what makes it thick like a real shake instead of a protein drink."),
    ("Drip the jar", "Drizzle the caramel topping around the inside rim of a chilled jar and let it run down the sides."),
    ("Blend", "Blend the frozen yoghurt, milk, protein, ice, syrup and salt on high for 45–60 seconds until thick and smooth. Add a splash more milk only if the blender stalls."),
    ("Serve", "Pour into the jar, top with whipped cream and a last thread of caramel. Serve with a wide straw and a spoon."),
  ],
  tip="Add the liquid first and the frozen cubes last, then start the blender on low. It blends faster and needs less extra milk, so it stays thick.",
),
]
