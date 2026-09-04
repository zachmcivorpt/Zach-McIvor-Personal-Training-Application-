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
    const err = new Error("No product found for that barcode — you can still add it manually below.");
    err.notFound = true;
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
    const err = new Error(`Found "${name}", but it doesn't have nutrition info yet — you can add it manually below.`);
    err.notFound = true;
    err.productName = name;
    throw err;
  }

  const cals = Math.round(n["energy-kcal_100g"] || 0);
  const protein = Math.round((n["proteins_100g"] || 0) * 10) / 10;
  const carbs = Math.round((n["carbohydrates_100g"] || 0) * 10) / 10;
  const fat = Math.round((n["fat_100g"] || 0) * 10) / 10;

  const servingGrams = parseServingGrams(product);

  return {
    id: `off_${code}`,
    name,
    cals,
    protein,
    carbs,
    fat,
    per: 100,
    defaultQty: servingGrams || 100,
  };
}
