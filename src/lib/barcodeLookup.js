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
  // `serving_size` (e.g. "30 g" -> 30) — prefer it when present.
  if (product.serving_quantity != null) {
    const n = Number(product.serving_quantity);
    if (n > 0) return n;
  }
  const match = String(product.serving_size || "").match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? parseFloat(match[1]) : null;
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
  if (cals == null || cals < 0 || cals > 920) reasons.push("calories outside a plausible per-100g range");
  if (protein == null || protein < 0 || protein > 100) reasons.push("protein outside a plausible per-100g range");
  if (carbs == null || carbs < 0 || carbs > 100) reasons.push("carbs outside a plausible per-100g range");
  if (fat == null || fat < 0 || fat > 100) reasons.push("fat outside a plausible per-100g range");
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

  // Nutrition completeness (20 pts) — full macro panel vs. partial.
  const macroFields = [food.cals, food.protein, food.carbs, food.fat];
  const presentCount = macroFields.filter((v) => v != null).length;
  add("Nutrition completeness", Math.round((presentCount / 4) * 20), 20, `${presentCount}/4 macro fields present`);

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

// Maps a raw Open Food Facts product onto a FOOD_DATABASE-shaped entry, or
// returns a {notFound, reason, productName} descriptor when there's no
// usable nutrition on it yet. Pulled out of lookupBarcode so the debug
// trace (below) can report the exact same mapping/validation a real scan
// would get, instead of a second hand-rolled copy that could drift out of
// sync with it.
function mapProductToFood(product, code) {
  const n = product.nutriments || {};
  const name = product.product_name || product.generic_name || `Scanned item (${code})`;
  const hasNutrition = n["energy-kcal_100g"] != null || n["proteins_100g"] != null || n["carbohydrates_100g"] != null || n["fat_100g"] != null;

  if (!hasNutrition) {
    const formatInfo = detectBarcodeFormat(code);
    const confidence = computeConfidence({ product, food: null, formatInfo, nutritionValidation: { plausible: false, reason: "no nutrition data" } });
    return { notFound: true, reason: "no-nutrition", productName: name, confidenceScore: confidence.score, verificationLevel: confidence.level, confidenceBreakdown: confidence.breakdown };
  }

  const cals = Math.round(n["energy-kcal_100g"] || 0);
  const protein = Math.round((n["proteins_100g"] || 0) * 10) / 10;
  const carbs = Math.round((n["carbohydrates_100g"] || 0) * 10) / 10;
  const fat = Math.round((n["fat_100g"] || 0) * 10) / 10;

  const servingGrams = parseServingGrams(product);

  const packageInfo = parseQuantity(product);

  const food = {
    id: `off_${code}`,
    name,
    brand: product.brands || "",
    // Small preview image, not the full-res photo — this is only ever shown
    // at thumbnail size so the client can eyeball "is this really what I
    // scanned" before adding it.
    imageUrl: product.image_front_small_url || product.image_small_url || product.image_url || "",
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
    // Lets unitsFor() (foodDatabase.js) show ml/cup/tbsp instead of
    // g/oz/lb/kg — read straight off Open Food Facts' own `quantity`
    // field rather than guessing from the product name, since every
    // scanned product has this real, structured data available. (A
    // "container" unit at this package size was tried too and removed —
    // real client feedback: it didn't read as a meaningful answer to
    // "how much did you have," just the whole package regardless of how
    // much was actually consumed.)
    ...(packageInfo ? { liquid: packageInfo.liquid } : {}),
  };

  const validation = validateNutrition({ cals, protein, carbs, fat });
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
  trace.nutritionValidation = validateNutrition({ cals: mapped.cals, protein: mapped.protein, carbs: mapped.carbs, fat: mapped.fat });
  trace.finalFood = mapped;
  return trace;
}
