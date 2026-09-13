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
function codeVariants(code) {
  const digits = String(code).replace(/\D/g, "");
  const variants = [digits];
  if (digits.length === 12) variants.push("0" + digits);
  if (digits.length === 13 && digits[0] === "0") variants.push(digits.slice(1));
  return [...new Set(variants)];
}

export async function lookupBarcode(code) {
  let product = null;
  for (const variant of codeVariants(code)) {
    product = await fetchProduct(variant);
    if (product) break;
  }

  if (!product) {
    const digits = String(code).replace(/\D/g, "");
    const err = new Error(`Barcode scanned: ${digits}\nProduct not found — you can still add it manually below.`);
    err.notFound = true;
    err.scannedCode = digits;
    throw err;
  }

  const n = product.nutriments || {};
  const name = product.product_name || product.generic_name || `Scanned item (${code})`;
  const hasNutrition = n["energy-kcal_100g"] != null || n["proteins_100g"] != null || n["carbohydrates_100g"] != null || n["fat_100g"] != null;

  if (!hasNutrition) {
    // The product exists in the database (so we know its name) but nobody's
    // entered its nutrition facts yet — common for smaller/local brands.
    // Surface the name so manual entry can be pre-filled instead of typed
    // from scratch, rather than pretending it's a valid zero-calorie food.
    const digits = String(code).replace(/\D/g, "");
    const err = new Error(
      `Barcode scanned: ${digits}\nFound "${name}", but it doesn't have nutrition info yet — you can add it manually below.`
    );
    err.notFound = true;
    err.productName = name;
    err.scannedCode = digits;
    throw err;
  }

  const cals = Math.round(n["energy-kcal_100g"] || 0);
  const protein = Math.round((n["proteins_100g"] || 0) * 10) / 10;
  const carbs = Math.round((n["carbohydrates_100g"] || 0) * 10) / 10;
  const fat = Math.round((n["fat_100g"] || 0) * 10) / 10;

  const servingGrams = parseServingGrams(product);

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
  };

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
