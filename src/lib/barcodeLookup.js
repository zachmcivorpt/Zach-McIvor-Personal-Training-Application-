// Looks up a scanned barcode against Open Food Facts — a free, public,
// no-API-key food database. This is a real network lookup, not mocked.
//
// Returns a food shaped exactly like a FOOD_DATABASE entry (per-100g
// macros + a `per: 100` unit + a `defaultQty` in grams) rather than
// pre-scaled totals, so it can go straight into the same FoodQuantitySheet
// every other food uses — the client sees a real serving size by default
// (parsed from Open Food Facts' serving info, not always available or
// accurate) and can still adjust it before adding, exactly like manual
// search results.
function parseServingGrams(product) {
  // `serving_quantity` is Open Food Facts' own parsed numeric grams for
  // `serving_size` (e.g. "30 g" -> 30) — prefer it when present. It's
  // already unit-agnostic (g for a solid, ml for a liquid), matching how
  // this app's own `per`/`defaultQty` pair treats g and ml as the same
  // base numeric unit (see UNIT_DEFS in foodDatabase.js).
  if (product.serving_quantity != null) {
    const n = Number(product.serving_quantity);
    if (n > 0) return n;
  }
  // Fallback: parse the free-text `serving_size` label. A liquid product's
  // serving is normally printed in ml (e.g. "250 ml"), not g — the g-only
  // regex this used to have missed every one of those, silently falling
  // back to the 100-unit placeholder for a real, known serving size. US-
  // origin products occasionally label the serving in oz instead; that
  // value is converted to the internal g/ml figure here so it's never
  // lost, but oz/lb/kg themselves are never surfaced as a logging UNIT for
  // a scanned item's serving — only grams/ml ever are (see `per: 100`
  // below and UNIT_DEFS/autoUnitIds in foodDatabase.js).
  const gramsOrMl = String(product.serving_size || "").match(/(\d+(?:\.\d+)?)\s*(?:g|ml|mL)\b/i);
  if (gramsOrMl) {
    const n = parseFloat(gramsOrMl[1]);
    if (n > 0) return n;
  }
  const oz = String(product.serving_size || "").match(/(\d+(?:\.\d+)?)\s*oz\b/i);
  if (oz) {
    const n = parseFloat(oz[1]) * 28.35;
    if (n > 0) return Math.round(n * 10) / 10;
  }
  return null;
}

// Real production report: a scanned bread product offered only grams, no
// "slice" option — even though Open Food Facts' own `serving_size` text
// often spells one out directly (e.g. "1 slice (40 g)", "2 biscuits
// (30g)", "1 piece (25g)"). This extracts a genuine, verified per-unit
// weight straight from that text — never invented or guessed — so a
// scanned bread/cracker/biscuit-style product gets the same real "slice"/
// "piece" unit a hand-curated database entry already offers, whenever the
// product's own label actually states one. A count prefix ("2 biscuits")
// divides the parenthetical weight to get the correct single-unit weight;
// a serving_size with no countable-unit word at all (just "30 g", "250
// ml") correctly yields nothing here, leaving the food on its base g/ml
// unit only, exactly as before.
const COUNTABLE_UNIT_WORDS = {
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  biscuit: "biscuit", biscuits: "biscuit",
  cracker: "cracker", crackers: "cracker",
  cookie: "cookie", cookies: "cookie",
  bar: "bar", bars: "bar",
  pita: "pita", pitas: "pita",
  wrap: "wrap", wraps: "wrap",
  tortilla: "tortilla", tortillas: "tortilla",
  scoop: "scoop", scoops: "scoop",
  sachet: "sachet", sachets: "sachet",
  bun: "bun", buns: "bun",
  roll: "roll", rolls: "roll",
};
function parseServingUnit(product) {
  const text = String(product.serving_size || "");
  const match = text.match(/(?:(\d+(?:\.\d+)?)\s*)?\b([a-z]+)\b[^(0-9]*\((\d+(?:\.\d+)?)\s*(?:g|ml)\)/i);
  if (!match) return null;
  const word = COUNTABLE_UNIT_WORDS[match[2].toLowerCase()];
  if (!word) return null;
  const count = Number(match[1]) || 1;
  const totalGrams = Number(match[3]);
  if (!(totalGrams > 0) || !(count > 0)) return null;
  const perUnitGrams = Math.round((totalGrams / count) * 10) / 10;
  if (!(perUnitGrams > 0)) return null;
  return { label: word, pluralLabel: `${word}s`, grams: perUnitGrams };
}

// Open Food Facts' `quantity` field is the real package size as printed on
// the pack (e.g. "500 g", "3 L", "750mL", "1kg") — far more reliable than
// guessing from the product name whether a scanned item is a liquid (ml)
// or a weighed solid (g), and it's also exactly the figure that becomes
// the "1 container (...)" unit, same as every other food-tracking app
// offers for a scanned product's own pack size.
function parseQuantity(product) {
  const raw = String(product.quantity || product.product_quantity || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|mL)\b/i);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(",", "."));
  if (!(amount > 0)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "kg") return { grams: amount * 1000, liquid: false };
  if (unit === "g") return { grams: amount, liquid: false };
  if (unit === "l") return { grams: amount * 1000, liquid: true };
  return { grams: amount, liquid: true }; // ml
}

// Open Food Facts is crowd-sourced — anyone can submit a product's label,
// and mismatched/mistyped entries do slip through (a flavoured variant's
// numbers saved under the plain product's barcode, a misplaced decimal,
// kJ typed into the kcal field). A scanned product silently trusted as
// "definitely correct" either way is exactly the failure mode a barcode
// scanner can't afford, so every result is checked against its own
// Atwater energy math (protein*4 + carbs*4 + fat*9 ≈ calories) and basic
// per-100g plausibility before it's handed back — not to reject it (a
// borderline real product shouldn't become unloggable), but so the
// confirm screen can tell the client "double-check this one against the
// label" instead of presenting every scan with equal, unearned confidence.
// Real GS1 check-digit validation, not just a length check — works for
// every standard GTIN length this app encounters (EAN-8, UPC-A/EAN-12,
// EAN-13). From the rightmost digit of the payload (everything but the
// check digit itself), alternate ×3/×1; the check digit is whatever
// makes the total a multiple of 10. A code of a non-standard length (or
// one that fails this) isn't necessarily garbage — a damaged/partial
// decode, a non-retail code, or a format this app doesn't special-case —
// so this reports `valid: null` ("can't confirm") rather than `false`
// ("confirmed wrong") when the length itself is unrecognised.
export function detectBarcodeFormat(code) {
  const digits = String(code).replace(/\D/g, "");
  const formatsByLength = { 8: "EAN-8", 12: "UPC-A", 13: "EAN-13", 14: "GTIN-14" };
  const format = formatsByLength[digits.length] || "unknown";
  if (!formatsByLength[digits.length]) return { format, valid: null, digits };

  const payload = digits.slice(0, -1);
  const checkDigit = Number(digits[digits.length - 1]);
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    sum += Number(payload[payload.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  const computedCheck = (10 - (sum % 10)) % 10;
  return { format, valid: computedCheck === checkDigit, digits };
}

export function validateNutrition({ cals, protein, carbs, fat }) {
  const reasons = [];
  // Missing is a distinct failure from "present but implausible" — a null
  // field means Open Food Facts' own label data simply doesn't have it,
  // not that it was checked and found wrong. Both still fail validation
  // (a scan with a real gap in its macro panel is exactly the case this
  // function exists to catch), but the math checks below need real
  // numbers on all four fields, so a missing one always short-circuits
  // straight to this reason instead of silently treating it as zero.
  const missing = [];
  if (cals == null) missing.push("calories");
  else if (cals < 0 || cals > 920) reasons.push("calories outside a plausible per-100g range");
  if (protein == null) missing.push("protein");
  else if (protein < 0 || protein > 100) reasons.push("protein outside a plausible per-100g range");
  if (carbs == null) missing.push("carbs");
  else if (carbs < 0 || carbs > 100) reasons.push("carbs outside a plausible per-100g range");
  if (fat == null) missing.push("fat");
  else if (fat < 0 || fat > 100) reasons.push("fat outside a plausible per-100g range");
  if (missing.length > 0) reasons.unshift(`missing ${missing.join(", ")} data`);

  if (reasons.length === 0) {
    const totalMacroGrams = protein + carbs + fat;
    // Protein + carbs + fat physically can't exceed the 100g/100ml this is
    // all supposed to be measured per — fibre, water and ash make up the
    // rest, hence some slack, but this catches an impossible panel (e.g a
    // misplaced decimal) that the calorie-reconciliation check below can
    // miss on its own when a bad calorie figure happens to "reconcile"
    // with equally bad macro figures.
    if (totalMacroGrams > 105) {
      reasons.push(`protein + carbs + fat adds up to ${Math.round(totalMacroGrams)}g, more than the 100g/100ml this is meant to be per`);
    }
  }
  if (reasons.length === 0) {
    const expected = protein * 4 + carbs * 4 + fat * 9;
    // Generous tolerance — fibre, sugar alcohols, alcohol and rounding on
    // the source label all legitimately widen the gap between the two
    // sides of this check for a real product; this is a "flag it," not a
    // "reject it," threshold.
    if (expected > 5 && Math.abs(cals - expected) / Math.max(expected, cals, 1) > 0.35) {
      reasons.push(`label says ${Math.round(cals)} cal, but ${protein}g protein + ${carbs}g carbs + ${fat}g fat works out to ~${Math.round(expected)} cal`);
    }
  }
  return reasons.length > 0 ? { plausible: false, reason: reasons[0] } : { plausible: true, reason: null };
}

// Named verification states, lowest-information to highest — mirrors how
// the confirm screen should actually treat a result: UNKNOWN means "don't
// log this without typing it in yourself," VERIFIED means "safe to trust
// without a second look." A score outside this scale is a bug, not a
// sixth state, so the fallback is UNVERIFIED (the safest default) rather
// than silently passing through.
export const VERIFICATION_LEVELS = { VERIFIED: "VERIFIED", LIKELY: "LIKELY", REVIEW: "REVIEW", UNVERIFIED: "UNVERIFIED", UNKNOWN: "UNKNOWN" };

function levelForScore(score) {
  if (score >= 90) return VERIFICATION_LEVELS.VERIFIED;
  if (score >= 75) return VERIFICATION_LEVELS.LIKELY;
  if (score >= 50) return VERIFICATION_LEVELS.REVIEW;
  if (score >= 1) return VERIFICATION_LEVELS.UNVERIFIED;
  return VERIFICATION_LEVELS.UNKNOWN;
}

// A transparent, additive 0-100 score — every point is earned for a
// specific, named piece of real evidence this scan actually has, not an
// arbitrary number. There's exactly one product source wired into this
// app (Open Food Facts; see the top-of-file note), so "do multiple
// sources agree" and "manufacturer-confirmed" aren't scoreable factors
// yet — rather than fake agreement between sources that don't exist,
// those two factors are left out of the breakdown entirely until a real
// second source is added (see the barcode scanner audit report for what
// that would take).
export function computeConfidence({ product, food, formatInfo, nutritionValidation }) {
  const breakdown = [];
  let score = 0;

  function add(factor, points, max, reason) {
    score += points;
    breakdown.push({ factor, points, max, reason });
  }

  // Barcode validity (15 pts) — a real, recognised GTIN format with a
  // correct check digit is strong evidence the scanner read it right in
  // the first place, independent of whether a product comes back for it.
  if (formatInfo.valid === true) add("Barcode validity", 15, 15, `${formatInfo.format}, check digit valid`);
  else if (formatInfo.valid === null) add("Barcode validity", 8, 15, `${formatInfo.format} — unrecognised length, can't confirm check digit`);
  else add("Barcode validity", 0, 15, `${formatInfo.format} — check digit does not match`);

  // Exact barcode match (25 pts) — a barcode is a 1:1 identifier by
  // design, so a product coming back for this exact code at all is the
  // single strongest signal available; everything else below refines it.
  add("Exact barcode match", product ? 25 : 0, 25, product ? "product record found for this exact code" : "no record for this code");
  if (!product) return { score, level: levelForScore(score), breakdown };

  // Product name / brand present (10 + 5 pts) — distinguishes a fully
  // catalogued product from a bare barcode-only stub.
  const hasRealName = !!(product.product_name || product.generic_name);
  add("Product name", hasRealName ? 10 : 0, 10, hasRealName ? `"${product.product_name || product.generic_name}"` : "no name on record");
  add("Brand", product.brands ? 5 : 0, 5, product.brands ? product.brands : "no brand on record");

  if (!food) return { score, level: levelForScore(score), breakdown };

  // Nutrition completeness (20 pts) — full macro panel vs. partial. Reads
  // `missingNutritionFields` (set by mapProductToFood from the RAW, un-
  // defaulted Open Food Facts fields) rather than checking food.cals/
  // protein/carbs/fat for null — those are always numbers by the time
  // they reach here (a missing field is defaulted to 0 for display/
  // calculation), so a null check here would always see "4/4 present"
  // even when a field was actually missing and silently zeroed.
  const missingFields = food.missingNutritionFields || [];
  const presentCount = 4 - missingFields.length;
  add(
    "Nutrition completeness",
    Math.round((presentCount / 4) * 20),
    20,
    presentCount === 4 ? "4/4 macro fields present" : `${presentCount}/4 macro fields present — missing ${missingFields.join(", ")}`
  );

  // Nutrition plausibility (15 pts) — the Atwater sanity check.
  add(
    "Nutrition plausibility",
    nutritionValidation.plausible ? 15 : 0,
    15,
    nutritionValidation.plausible ? "calories reconcile with protein/carbs/fat" : nutritionValidation.reason
  );

  // Serving size (5 pts) — a real parsed serving vs. the 100g fallback.
  const hasRealServing = product.serving_quantity != null || /\d/.test(String(product.serving_size || ""));
  add("Serving size data", hasRealServing ? 5 : 0, 5, hasRealServing ? String(product.serving_size || product.serving_quantity) : "no serving size on record, defaulted to 100g");

  // Australian market match (5 pts, bonus — never a penalty). APEX is an
  // AU app, so AU-tagged data earns a bonus; the common case (no country
  // tag at all on the record) is scored neutral rather than assumed
  // wrong, since most OFF entries simply don't carry this field.
  const countries = (product.countries_tags || []).map((c) => String(c).toLowerCase());
  const isAu = countries.some((c) => c.includes("australia"));
  const isOtherMarketOnly = countries.length > 0 && !isAu;
  if (isAu) add("Australian market match", 5, 5, "tagged en:australia on Open Food Facts");
  else if (isOtherMarketOnly) add("Australian market match", 0, 5, `tagged ${countries.join(", ")} — not confirmed for the AU market, formulation may differ`);
  else add("Australian market match", 2, 5, "no country data on record — can't confirm or rule out AU formulation");

  let level = levelForScore(score);
  // The 15-point plausibility deduction alone isn't always enough to pull
  // a product below the VERIFIED/LIKELY threshold — a product with a
  // complete macro panel, a real brand/name and a parsed serving size can
  // still clear 75+ points even when its own calories don't reconcile
  // with its macros at all (the real "Protein Smoothie" report: label and
  // macros disagreed by 4x, yet the other factors alone scored LIKELY).
  // Showing a reassuring "Verified"/"Likely" checkmark on data that's
  // actively flagged as internally inconsistent is worse than not scoring
  // it at all, so implausible nutrition caps the level at REVIEW no
  // matter how well everything else scores.
  if (nutritionValidation && nutritionValidation.plausible === false && (level === VERIFICATION_LEVELS.VERIFIED || level === VERIFICATION_LEVELS.LIKELY)) {
    level = VERIFICATION_LEVELS.REVIEW;
  }

  return { score, level, breakdown };
}

async function fetchProduct(code, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.status === 1 && data.product ? data.product : null;
  } catch {
    return null; // timeout, offline, or a malformed response — treat as "not found" so the caller's fallbacks/manual-entry path still runs
  } finally {
    clearTimeout(timer);
  }
}

// Barcode scanners and product databases don't always agree on how many
// digits a code should have — a UPC-A code (12 digits) is frequently
// catalogued in Open Food Facts under its EAN-13 form (zero-padded to 13),
// and occasionally the reverse. Try the scanned code as-is first, then the
// zero-padded and leading-zero-stripped variants before giving up — this
// alone recovers a meaningful share of "not found" results that are
// actually a formatting mismatch, not a missing product.
// In-store scale barcodes — printed at the deli/meat/produce counter for a
// randomly-weighed item — use GS1's "restricted circulation number" range
// (a 13-digit EAN starting with "2", the convention Australian/NZ
// supermarkets including IGA use for these). Unlike a real product barcode,
// most of the digits after the store's item code aren't identity at all —
// they're that day's price or weight baked into the barcode, per GS1
// Australia's variable-measure item spec: digit 1 is the "2" flag, digits
// 2-6 are the item's own code, and digits 7-12 are the variable
// price/weight + a check digit that's different literally every time the
// same product is weighed and re-printed.
export function isVariableWeightBarcode(code) {
  const digits = String(code).replace(/\D/g, "");
  return digits.length === 13 && digits[0] === "2";
}

// The part of a variable-weight barcode that actually identifies the
// product — just the "2" flag plus the 5-digit item code — so the SAME
// deli item scanned on two different days (two different weights, two
// completely different full barcodes) still resolves to the one saved
// library entry instead of demanding a fresh manual entry every single
// time. A normal product barcode is returned unchanged; there's nothing
// variable in it to strip.
export function stableBarcodeKey(code) {
  const digits = String(code).replace(/\D/g, "");
  return isVariableWeightBarcode(digits) ? digits.slice(0, 6) : digits;
}

// Exported so the debug trace (below) can show exactly which variants a
// scanned code expands to, not just that "a lookup happened."
export function codeVariants(code) {
  const digits = String(code).replace(/\D/g, "");
  const variants = [digits];
  if (digits.length === 12) variants.push("0" + digits);
  if (digits.length === 13 && digits[0] === "0") variants.push(digits.slice(1));
  return [...new Set(variants)];
}

// Fires every code variant's lookup at once instead of one-after-another —
// a UPC-A scan needing its zero-padded EAN-13 form (the common case for
// most US-origin products, since that's how Open Food Facts catalogues
// them) used to pay for two full network round-trips in sequence before
// resolving. Running them in parallel means the total wait is however long
// the SLOWEST variant takes, not the sum of all of them, since the first
// one to come back with an actual product wins immediately rather than
// waiting for a previous attempt to fail first.
async function fetchFirstMatch(variants) {
  return new Promise((resolve) => {
    let pending = variants.length;
    let settled = false;
    variants.forEach((variant) => {
      fetchProduct(variant).then((product) => {
        if (settled) return;
        if (product) {
          settled = true;
          resolve(product);
          return;
        }
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          resolve(null);
        }
      });
    });
  });
}

// Open Food Facts stores a product's brand separately from its name
// (`product.brands`), and crowd-sourced `product_name` entries often don't
// repeat it ("Tim Tam Original" with brands: "Arnott's") — so a scanned
// product's own displayed/searched name silently had no brand in it at
// all. That matters here specifically: `matchesSearch` (search.js) only
// ever checks `food.name`, and every search results list only ever
// renders `food.name` — never `food.brand` — so an unprefixed name meant
// the product couldn't be found by searching its brand, and read as
// generic in every list it appeared in. Every branded FOOD_DATABASE entry
// already carries its brand in the name string for exactly this reason;
// this makes a scanned product follow the same rule. Only the first
// listed brand is used (OFF sometimes comma-separates several), and only
// when the name doesn't already start with it — many OFF entries already
// do include the brand, and prefixing it twice ("Arnott's Arnott's Tim
// Tam Original") would be worse than the gap this fixes.
function withBrandInName(name, brands) {
  if (!brands) return name;
  const primaryBrand = brands.split(",")[0].trim();
  if (!primaryBrand) return name;
  if (name.toLowerCase().startsWith(primaryBrand.toLowerCase())) return name;
  return `${primaryBrand} ${name}`;
}

// Maps a raw Open Food Facts product onto a FOOD_DATABASE-shaped entry, or
// returns a {notFound, reason, productName} descriptor when there's no
// usable nutrition on it yet. Pulled out of lookupBarcode so the debug
// trace (below) can report the exact same mapping/validation a real scan
// would get, instead of a second hand-rolled copy that could drift out of
// sync with it.
function mapProductToFood(product, code) {
  const n = product.nutriments || {};
  // The raw OFF name, kept for `source` (provenance — see below) and for
  // the not-found/no-nutrition error paths, where there's no brand-merge
  // benefit (nothing gets saved/searched in those cases).
  const rawName = product.product_name || product.generic_name || `Scanned item (${code})`;
  const name = withBrandInName(rawName, product.brands);
  // Raw, un-defaulted values — kept distinct from the 0-defaulted ones
  // below so a field Open Food Facts genuinely doesn't have can be
  // detected and flagged (missingNutritionFields) rather than silently
  // invented as a real zero. hasNutrition only needs at least one of the
  // four to exist; "found but incomplete" is a `missingNutritionFields`
  // flag on an otherwise-usable result, not a "not found."
  const rawCals = n["energy-kcal_100g"];
  const rawProtein = n["proteins_100g"];
  const rawCarbs = n["carbohydrates_100g"];
  const rawFat = n["fat_100g"];
  const hasNutrition = rawCals != null || rawProtein != null || rawCarbs != null || rawFat != null;

  if (!hasNutrition) {
    const formatInfo = detectBarcodeFormat(code);
    const confidence = computeConfidence({ product, food: null, formatInfo, nutritionValidation: { plausible: false, reason: "no nutrition data" } });
    return { notFound: true, reason: "no-nutrition", productName: name, confidenceScore: confidence.score, verificationLevel: confidence.level, confidenceBreakdown: confidence.breakdown };
  }

  const missingNutritionFields = [];
  if (rawCals == null) missingNutritionFields.push("calories");
  if (rawProtein == null) missingNutritionFields.push("protein");
  if (rawCarbs == null) missingNutritionFields.push("carbs");
  if (rawFat == null) missingNutritionFields.push("fat");

  const cals = Math.round(rawCals || 0);
  const protein = Math.round((rawProtein || 0) * 10) / 10;
  const carbs = Math.round((rawCarbs || 0) * 10) / 10;
  const fat = Math.round((rawFat || 0) * 10) / 10;

  const servingGrams = parseServingGrams(product);
  const servingUnit = parseServingUnit(product);

  const packageInfo = parseQuantity(product);

  const food = {
    id: `off_${code}`,
    name,
    brand: product.brands || "",
    cals,
    protein,
    carbs,
    fat,
    per: 100,
    defaultQty: servingGrams || 100,
    fromBarcode: true,
    // Open Food Facts gave no real serving size for this product — the
    // 100 above is a last-resort placeholder to keep the quantity sheet
    // usable, never a real figure read off the product, and that
    // distinction matters: a client trusting it as "the actual serving
    // size" could log a wildly wrong amount. Flagged (separate from
    // nutritionSuspect, which is about the macros not reconciling, not
    // the serving size) so the confirm screen can say so plainly instead
    // of presenting a guess as fact.
    ...(servingGrams == null ? { servingSizeUnverified: true } : {}),
    // Real production report: a scanned bread product offered only grams,
    // no "slice" option. When Open Food Facts' own serving_size text
    // names a genuine countable unit (see parseServingUnit above), carry
    // it through as a real customUnit — exactly the same "1 egg"/"1
    // slice"-style piece unit a hand-curated database entry already gets,
    // just derived from the product's own verified label instead of
    // typed in by hand. Never invented: absent when OFF's text doesn't
    // clearly name one.
    ...(servingUnit ? { customUnit: servingUnit } : {}),
    // Lets unitsFor() (foodDatabase.js) show ml/cup/tbsp instead of
    // g/oz/lb/kg — read straight off Open Food Facts' own `quantity`
    // field rather than guessing from the product name, since every
    // scanned product has this real, structured data available. (A
    // "container" unit at this package size was tried too and removed —
    // real client feedback: it didn't read as a meaningful answer to
    // "how much did you have," just the whole package regardless of how
    // much was actually consumed.)
    ...(packageInfo ? { liquid: packageInfo.liquid } : {}),
    ...(missingNutritionFields.length ? { missingNutritionFields } : {}),
    // The exact macros Open Food Facts returned for this barcode, kept
    // untouched for as long as this entry exists — a later client
    // correction (see buildCorrectedFood) only ever changes the top-level
    // cals/protein/carbs/fat, never this, so what the source actually said
    // stays auditable rather than being overwritten and lost.
    source: { name: rawName, brand: product.brands || "", cals, protein, carbs, fat },
  };

  // Validated against the RAW (possibly-null) values, not the 0-defaulted
  // ones above — a missing field must be caught as missing, never treated
  // as a confirmed zero.
  const validation = validateNutrition({
    cals: rawCals != null ? cals : null,
    protein: rawProtein != null ? protein : null,
    carbs: rawCarbs != null ? carbs : null,
    fat: rawFat != null ? fat : null,
  });
  if (!validation.plausible) {
    food.nutritionSuspect = true;
    food.nutritionSuspectReason = validation.reason;
  }

  const formatInfo = detectBarcodeFormat(code);
  const confidence = computeConfidence({ product, food, formatInfo, nutritionValidation: validation });
  food.confidenceScore = confidence.score;
  food.verificationLevel = confidence.level;
  food.confidenceBreakdown = confidence.breakdown;

  // Open Food Facts already reports these when the product's label has been
  // entered in full — real per-100g figures, not estimated — so a scanned
  // barcode is the one food source in the app that can carry complete
  // micronutrient data for free. OFF reports sodium/potassium/calcium/iron/
  // cholesterol/vitamin-c in grams per 100g; the app's own micronutrient
  // fields use mg for those (matching how a nutrition label reads), hence
  // the ×1000. A field OFF doesn't have for this product is left off
  // entirely rather than written as 0 — "unknown" and "none" aren't the
  // same thing for something like sodium.
  const microMap = {
    satFat: n["saturated-fat_100g"],
    transFat: n["trans-fat_100g"],
    fiber: n["fiber_100g"],
    sugar: n["sugars_100g"],
    sodium: n["sodium_100g"] != null ? n["sodium_100g"] * 1000 : null,
    potassium: n["potassium_100g"] != null ? n["potassium_100g"] * 1000 : null,
    calcium: n["calcium_100g"] != null ? n["calcium_100g"] * 1000 : null,
    iron: n["iron_100g"] != null ? n["iron_100g"] * 1000 : null,
    cholesterol: n["cholesterol_100g"] != null ? n["cholesterol_100g"] * 1000 : null,
    vitaminC: n["vitamin-c_100g"] != null ? n["vitamin-c_100g"] * 1000 : null,
  };
  Object.entries(microMap).forEach(([key, val]) => {
    if (val != null && !Number.isNaN(val)) food[key] = Math.round(val * 10) / 10;
  });

  return food;
}

export async function lookupBarcode(code) {
  const product = await fetchFirstMatch(codeVariants(code));
  const digits = String(code).replace(/\D/g, "");

  if (!product) {
    const err = new Error(`Barcode scanned: ${digits}\nProduct not found — you can still add it manually below.`);
    err.notFound = true;
    err.scannedCode = digits;
    throw err;
  }

  const result = mapProductToFood(product, code);
  if (result.notFound) {
    // The product exists in the database (so we know its name) but nobody's
    // entered its nutrition facts yet — common for smaller/local brands.
    // Surface the name so manual entry can be pre-filled instead of typed
    // from scratch, rather than pretending it's a valid zero-calorie food.
    const err = new Error(
      `Barcode scanned: ${digits}\nFound "${result.productName}", but it doesn't have nutrition info yet — you can add it manually below.`
    );
    err.notFound = true;
    err.productName = result.productName;
    err.scannedCode = digits;
    err.verificationLevel = result.verificationLevel;
    throw err;
  }

  return result;
}

// Developer/test-mode trace: runs the exact same lookup real scans use,
// but reports every step instead of collapsing straight to a result or an
// error — which variant(s) were tried, which one (if any) actually hit,
// the raw Open Food Facts product, and the nutrition validation outcome.
// Source list is honest about what this app actually has: Open Food Facts
// is the only product database wired in right now (see the top-of-file
// note), so "sources searched" has exactly one real entry rather than a
// fabricated multi-source list.
export async function debugLookupBarcode(code) {
  const startedAt = Date.now();
  const digits = String(code).replace(/\D/g, "");
  const variants = codeVariants(code);

  const perVariant = await Promise.all(
    variants.map(async (variant) => {
      const t0 = Date.now();
      const product = await fetchProduct(variant);
      return { variant, found: !!product, product, ms: Date.now() - t0 };
    })
  );

  const trace = {
    scannedCode: digits,
    sourcesSearched: [{ name: "Open Food Facts", url: "https://world.openfoodfacts.org", type: "barcode-exact-match" }],
    variantsTried: perVariant.map(({ variant, found, ms }) => ({ variant, found, ms })),
    totalMs: Date.now() - startedAt,
  };

  const hit = perVariant.find((v) => v.found);
  if (!hit) {
    const formatInfo = detectBarcodeFormat(code);
    const confidence = computeConfidence({ product: null, food: null, formatInfo, nutritionValidation: { plausible: false, reason: "no product found" } });
    trace.selectedVariant = null;
    trace.rawProduct = null;
    trace.outcome = "not-found";
    trace.confidenceScore = confidence.score;
    trace.verificationLevel = confidence.level;
    trace.confidenceBreakdown = confidence.breakdown;
    trace.finalFood = null;
    return trace;
  }

  trace.selectedVariant = hit.variant;
  trace.rawProduct = hit.product;
  // mapProductToFood computes the one real confidence score this scanner
  // has (see computeConfidence) and attaches it whether or not usable
  // nutrition came back — reused here rather than a second, debug-only
  // scoring pass that could drift from what a real scan actually scores.
  const mapped = mapProductToFood(hit.product, code);
  trace.confidenceScore = mapped.confidenceScore;
  trace.verificationLevel = mapped.verificationLevel;
  trace.confidenceBreakdown = mapped.confidenceBreakdown;

  if (mapped.notFound) {
    trace.outcome = "found-no-nutrition";
    trace.productName = mapped.productName;
    trace.finalFood = null;
    return trace;
  }

  trace.outcome = "resolved";
  // Reconstructs the same raw (possibly-null) inputs mapProductToFood
  // itself validated against — missingNutritionFields names which of the
  // defaulted values below were actually absent, so the debug trace never
  // reports a missing field as a confirmed, reconciling zero.
  const missing = new Set(mapped.missingNutritionFields || []);
  trace.nutritionValidation = validateNutrition({
    cals: missing.has("calories") ? null : mapped.cals,
    protein: missing.has("protein") ? null : mapped.protein,
    carbs: missing.has("carbs") ? null : mapped.carbs,
    fat: missing.has("fat") ? null : mapped.fat,
  });
  trace.finalFood = mapped;
  return trace;
}

// Multiple customFoods docs can legitimately share a barcode. A client's
// own correction (buildCorrectedFood, below) is always a fresh CREATE,
// never an UPDATE — the shared food library's Firestore rules only let a
// coach update/delete an existing doc, any signed-in client can only
// create one (see firestore.rules) — so the original Open Food Facts
// result and a client's correction for the same barcode end up as two
// separate docs rather than one being overwritten. Whenever more than one
// doc is found for a barcode, this is what decides which one a scan
// actually uses: a corrected entry always wins over an uncorrected one
// (a human read it off the real pack); among same-status docs, the most
// recently verified one wins — never an arbitrary array/query order.
export function pickBestFoodForBarcode(foods) {
  if (!foods || foods.length === 0) return null;
  const sorted = [...foods].sort((a, b) => {
    const aCorrected = a.correctedByUser ? 1 : 0;
    const bCorrected = b.correctedByUser ? 1 : 0;
    if (aCorrected !== bCorrected) return bCorrected - aCorrected;
    return (b.verifiedAt || 0) - (a.verifiedAt || 0);
  });
  return sorted[0];
}

// Builds the food record a client's own correction saves, when a scanned
// product's nutrition data failed validation (nutritionSuspect) or was
// missing fields (missingNutritionFields) and they typed in the real
// numbers off the pack. Typed straight off the label by a person beats
// anything a crowd-sourced database returned, so this is marked VERIFIED
// outright — same treatment the existing barcode "add manually" flow
// already gives a from-scratch manual entry (see addManual() in
// NutritionFeatures.jsx) — rather than inheriting the scan's own uncertain
// score. `food.source` (set once, in mapProductToFood, from the exact
// values Open Food Facts returned) is carried forward untouched — a
// correction only ever changes the top-level macros a client sees and
// logs against, never the record of what the source actually said.
export function buildCorrectedFood(food, corrected) {
  const next = { ...food };
  delete next.id; // createFood mints its own real Firestore id
  next.cals = Math.max(0, Math.round(Number(corrected.cals) || 0));
  next.protein = Math.max(0, Number(corrected.protein) || 0);
  next.carbs = Math.max(0, Number(corrected.carbs) || 0);
  next.fat = Math.max(0, Number(corrected.fat) || 0);
  next.per = 100;
  if (corrected.defaultQty != null && Number(corrected.defaultQty) > 0) {
    next.defaultQty = Number(corrected.defaultQty);
    next.servingSizeUnverified = false;
  }
  delete next.nutritionSuspect;
  delete next.nutritionSuspectReason;
  delete next.missingNutritionFields;
  next.verificationLevel = VERIFICATION_LEVELS.VERIFIED;
  next.confidenceScore = 100;
  next.correctedByUser = true;
  next.verifiedAt = Date.now();
  if (!next.source) {
    next.source = { name: food.name, brand: food.brand || "", cals: food.cals, protein: food.protein, carbs: food.carbs, fat: food.fat };
  }
  return next;
}
