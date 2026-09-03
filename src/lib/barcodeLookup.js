// Looks up a scanned barcode against Open Food Facts — a free, public,
// no-API-key food database. This is a real network lookup, not mocked.
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

  // Prefer per-serving values when Open Food Facts has them, else per-100g.
  const hasServing = n["energy-kcal_serving"] != null;
  const cals = Math.round(hasServing ? n["energy-kcal_serving"] : n["energy-kcal_100g"] || 0);
  const protein = Math.round(hasServing ? n["proteins_serving"] : n["proteins_100g"] || 0);
  const carbs = Math.round(hasServing ? n["carbohydrates_serving"] : n["carbohydrates_100g"] || 0);
  const fat = Math.round(hasServing ? n["fat_serving"] : n["fat_100g"] || 0);
  const portion = hasServing ? p.serving_size || "1 serving" : "100g";

  return {
    id: `off_${code}`,
    name: `${name} (${portion})`,
    cals,
    protein,
    carbs,
    fat,
  };
}
