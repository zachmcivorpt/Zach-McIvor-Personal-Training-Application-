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

export async function lookupBarcode(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Couldn't reach the food database — check your connection and try again.");
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error("No product found for that barcode.");
  }
  const p = data.product;
  const n = p.nutriments || {};
  const name = p.product_name || p.generic_name || `Scanned item (${code})`;

  const cals = Math.round(n["energy-kcal_100g"] || 0);
  const protein = Math.round((n["proteins_100g"] || 0) * 10) / 10;
  const carbs = Math.round((n["carbohydrates_100g"] || 0) * 10) / 10;
  const fat = Math.round((n["fat_100g"] || 0) * 10) / 10;

  const servingGrams = parseServingGrams(p);

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
