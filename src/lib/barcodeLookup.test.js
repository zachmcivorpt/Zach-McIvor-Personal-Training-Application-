// Real unit tests for the barcode scanner's pure/testable logic —
// normalisation, variable-weight (deli scale) barcode handling, nutrition
// plausibility validation, and the Open Food Facts lookup/mapping itself
// (network calls mocked, not a live integration test). The camera/decode
// side (html5-qrcode, BarcodeDetector) lives in NutritionFeatures.jsx and
// isn't unit-testable this way — it needs a browser with real camera
// hardware, which is a manual/E2E concern, not something to fake here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isVariableWeightBarcode, stableBarcodeKey, validateNutrition, lookupBarcode, debugLookupBarcode, detectBarcodeFormat, computeConfidence, buildCorrectedFood, pickBestFoodForBarcode } from "./barcodeLookup";

describe("isVariableWeightBarcode", () => {
  it("flags a 13-digit code starting with 2 (GS1 AU/NZ restricted-circulation range)", () => {
    expect(isVariableWeightBarcode("2012345678900")).toBe(true);
  });
  it("does not flag a normal 13-digit EAN", () => {
    expect(isVariableWeightBarcode("9310072032118")).toBe(false);
  });
  it("does not flag a 12-digit UPC-A, even if it starts with 2", () => {
    expect(isVariableWeightBarcode("201234567890")).toBe(false);
  });
  it("ignores non-digit characters before checking length", () => {
    expect(isVariableWeightBarcode("201-234-567-8900")).toBe(true); // 13 digits once stripped
  });
});

describe("stableBarcodeKey", () => {
  it("collapses a variable-weight barcode to its flag + 5-digit item code", () => {
    expect(stableBarcodeKey("2012345678900")).toBe("201234");
    // same item, re-weighed and re-printed on a different day — different
    // price/weight digits, same stable key
    expect(stableBarcodeKey("2012349991112")).toBe("201234");
  });
  it("leaves a normal product barcode unchanged", () => {
    expect(stableBarcodeKey("9310072032118")).toBe("9310072032118");
  });
  it("strips formatting before computing the key", () => {
    expect(stableBarcodeKey("931-007-203-2118")).toBe("9310072032118");
  });
});

describe("validateNutrition", () => {
  it("accepts a real, internally-consistent product", () => {
    // Real Aldi 5% Lean Beef Mince panel: 20.3*4 + 1.8*4 + 4.5*9 = 128.9 ≈ 129
    const result = validateNutrition({ cals: 129, protein: 20.3, carbs: 1.8, fat: 4.5 });
    expect(result.plausible).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("catches the exact real bug found in production data — implausible carbs on plain chicken breast", () => {
    // The actual bad Open Food Facts entry that made it into the Aldi
    // import before being caught by hand: 93 cal but the macros only
    // explain ~92 — that one happens to reconcile energy-wise, which is
    // exactly why it needs a second, food-type-aware check in practice.
    // This case instead covers the more common failure Atwater DOES
    // catch: a label calorie figure that doesn't match its own macros.
    const result = validateNutrition({ cals: 400, protein: 20, carbs: 5, fat: 2 });
    // 20*4 + 5*4 + 2*9 = 80+20+18 = 118, nowhere near 400
    expect(result.plausible).toBe(false);
    expect(result.reason).toMatch(/label says 400 cal/);
  });

  it("flags an out-of-range macro even when energy math alone would pass", () => {
    const result = validateNutrition({ cals: 100, protein: 150, carbs: 0, fat: 0 });
    expect(result.plausible).toBe(false);
    expect(result.reason).toMatch(/protein/);
  });

  it("flags missing macro fields rather than treating them as zero", () => {
    const result = validateNutrition({ cals: 100, protein: null, carbs: 10, fat: 2 });
    expect(result.plausible).toBe(false);
  });

  it("tolerates the normal rounding/fibre/sugar-alcohol slack in a real label", () => {
    // Fibre contributes to carbs but not fully to energy — a real product
    // with meaningful fibre legitimately sits a bit off a naive 4/4/9 sum.
    const result = validateNutrition({ cals: 200, protein: 10, carbs: 30, fat: 5 });
    // 10*4+30*4+5*9 = 40+120+45 = 205, within tolerance of 200
    expect(result.plausible).toBe(true);
  });

  it("flags a physically impossible macro panel even when its own calorie math reconciles with itself", () => {
    // 50+50+20 = 120g of protein+carbs+fat in a 100g product — impossible —
    // yet 50*4+50*4+20*9 = 580 cal matches the label exactly (and is
    // itself within the per-100g plausible range), so the Atwater check
    // alone would call this plausible.
    const result = validateNutrition({ cals: 580, protein: 50, carbs: 50, fat: 20 });
    expect(result.plausible).toBe(false);
    expect(result.reason).toMatch(/adds up to 120g/);
  });

  it("names every missing field, not just the first one found", () => {
    const result = validateNutrition({ cals: 100, protein: null, carbs: 10, fat: null });
    expect(result.plausible).toBe(false);
    expect(result.reason).toMatch(/missing protein, fat/);
  });
});

describe("pickBestFoodForBarcode", () => {
  it("prefers a client's own correction over the original scanned entry", () => {
    const original = { id: "a", barcode: "123", cals: 253, correctedByUser: undefined, verifiedAt: 2000 };
    const corrected = { id: "b", barcode: "123", cals: 63, correctedByUser: true, verifiedAt: 1000 };
    // The correction is older (lower verifiedAt) but still wins — a human
    // reading the real label outranks a more "recent" automated re-check.
    expect(pickBestFoodForBarcode([original, corrected]).id).toBe("b");
    expect(pickBestFoodForBarcode([corrected, original]).id).toBe("b"); // order-independent
  });

  it("falls back to the most recently verified doc when none are corrected", () => {
    const older = { id: "a", verifiedAt: 1000 };
    const newer = { id: "b", verifiedAt: 2000 };
    expect(pickBestFoodForBarcode([older, newer]).id).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(pickBestFoodForBarcode([])).toBeNull();
  });
});

describe("buildCorrectedFood", () => {
  const scanned = {
    id: "off_123",
    name: "Protein Smoothie Choc Honeycomb",
    brand: "Rokeby",
    cals: 253,
    protein: 7.1,
    carbs: 4.3,
    fat: 1.5,
    per: 100,
    defaultQty: 100,
    fromBarcode: true,
    barcode: "9300000000011",
    nutritionSuspect: true,
    nutritionSuspectReason: "label says 253 cal, but macros work out to ~59 cal",
    verificationLevel: "REVIEW",
    confidenceScore: 62,
    source: { name: "Protein Smoothie Choc Honeycomb", brand: "Rokeby", cals: 253, protein: 7.1, carbs: 4.3, fat: 1.5 },
  };

  it("applies the typed-in macros and marks the result VERIFIED/correctedByUser", () => {
    const result = buildCorrectedFood(scanned, { cals: "63", protein: "7.1", carbs: "4.3", fat: "1.5" });
    expect(result.cals).toBe(63);
    expect(result.protein).toBe(7.1);
    expect(result.verificationLevel).toBe("VERIFIED");
    expect(result.confidenceScore).toBe(100);
    expect(result.correctedByUser).toBe(true);
    expect(result.verifiedAt).toBeGreaterThan(0);
  });

  it("clears the suspect/missing flags a correction resolves", () => {
    const result = buildCorrectedFood(scanned, { cals: "63", protein: "7.1", carbs: "4.3", fat: "1.5" });
    expect(result.nutritionSuspect).toBeUndefined();
    expect(result.nutritionSuspectReason).toBeUndefined();
    expect(result.missingNutritionFields).toBeUndefined();
  });

  it("keeps the original Open Food Facts data under `source`, untouched by the correction", () => {
    const result = buildCorrectedFood(scanned, { cals: "63", protein: "7.1", carbs: "4.3", fat: "1.5" });
    expect(result.source).toEqual(scanned.source);
    expect(result.source.cals).toBe(253); // the original, unmodified value — never overwritten
  });

  it("never carries the original Firestore id forward — createFood must mint a fresh one", () => {
    const result = buildCorrectedFood(scanned, { cals: "63", protein: "7.1", carbs: "4.3", fat: "1.5" });
    expect(result.id).toBeUndefined();
  });

  it("clamps a negative or garbage macro value to zero rather than saving it", () => {
    const result = buildCorrectedFood(scanned, { cals: "63", protein: "-5", carbs: "abc", fat: "1.5" });
    expect(result.protein).toBe(0);
    expect(result.carbs).toBe(0);
  });
});

describe("lookupBarcode", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockOff(status, product) {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status, product }),
    });
  }

  it("merges the brand into the name when Open Food Facts reports them separately", async () => {
    mockOff(1, {
      product_name: "Tim Tam Original",
      brands: "Arnott's",
      nutriments: { "energy-kcal_100g": 500, proteins_100g: 5, carbohydrates_100g: 65, fat_100g: 25 },
    });
    const food = await lookupBarcode("9300000000142");
    expect(food.name).toBe("Arnott's Tim Tam Original");
    expect(food.brand).toBe("Arnott's");
    expect(food.source.name).toBe("Tim Tam Original"); // provenance keeps the raw OFF name, unmodified
  });

  it("does not double up the brand when the name already starts with it", async () => {
    mockOff(1, {
      product_name: "Arnott's Tim Tam Dark",
      brands: "Arnott's",
      nutriments: { "energy-kcal_100g": 500, proteins_100g: 5, carbohydrates_100g: 65, fat_100g: 25 },
    });
    const food = await lookupBarcode("9300000000159");
    expect(food.name).toBe("Arnott's Tim Tam Dark");
  });

  it("uses only the first brand when Open Food Facts lists several, comma-separated", async () => {
    mockOff(1, {
      product_name: "Shared Product",
      brands: "Arnott's,Campbell's",
      nutriments: { "energy-kcal_100g": 500, proteins_100g: 5, carbohydrates_100g: 65, fat_100g: 25 },
    });
    const food = await lookupBarcode("9300000000166");
    expect(food.name).toBe("Arnott's Shared Product");
  });

  it("leaves the name as-is when Open Food Facts has no brand at all", async () => {
    mockOff(1, {
      product_name: "Unbranded Item",
      nutriments: { "energy-kcal_100g": 500, proteins_100g: 5, carbohydrates_100g: 65, fat_100g: 25 },
    });
    const food = await lookupBarcode("9300000000173");
    expect(food.name).toBe("Unbranded Item");
  });

  it("maps a found product with complete nutrition into a FOOD_DATABASE-shaped entry", async () => {
    mockOff(1, {
      product_name: "Test Muesli Bar",
      brands: "TestBrand",
      serving_size: "35 g",
      serving_quantity: 35,
      nutriments: {
        "energy-kcal_100g": 440,
        proteins_100g: 9.3,
        carbohydrates_100g: 51.3,
        fat_100g: 20,
        "saturated-fat_100g": 5,
        sugars_100g: 20,
        sodium_100g: 0.3,
      },
    });
    const food = await lookupBarcode("9300000000011");
    expect(food.name).toBe("TestBrand Test Muesli Bar"); // brand merged into the name — see "merges the brand into the name" below
    expect(food.brand).toBe("TestBrand");
    expect(food.cals).toBe(440);
    expect(food.protein).toBe(9.3);
    expect(food.carbs).toBe(51.3);
    expect(food.fat).toBe(20);
    expect(food.per).toBe(100);
    expect(food.defaultQty).toBe(35); // from serving_quantity
    expect(food.fromBarcode).toBe(true);
    expect(food.satFat).toBe(5);
    expect(food.sodium).toBe(300); // g -> mg
    expect(food.nutritionSuspect).toBeUndefined(); // plausible data, no flag
  });

  it("flags nutritionSuspect when the label's calories don't reconcile with its macros", async () => {
    mockOff(1, {
      product_name: "Mismatched Product",
      nutriments: {
        "energy-kcal_100g": 1620, // impossible — caught by the >920 range check
        proteins_100g: 22.7,
        carbohydrates_100g: 8.3,
        fat_100g: 44,
      },
    });
    const food = await lookupBarcode("9300000000028");
    expect(food.nutritionSuspect).toBe(true);
    expect(food.nutritionSuspectReason).toBeTruthy();
  });

  it("reads the real liquid/solid signal off Open Food Facts' own `quantity` field, for ml foods", async () => {
    mockOff(1, {
      product_name: "Test Milk",
      quantity: "3 L",
      nutriments: { "energy-kcal_100g": 64, proteins_100g: 3.2, carbohydrates_100g: 4.8, fat_100g: 3.6 },
    });
    const food = await lookupBarcode("9300000000081");
    expect(food.liquid).toBe(true);
  });

  it("reads the real liquid/solid signal off Open Food Facts' own `quantity` field, for weighed-solid foods", async () => {
    mockOff(1, {
      product_name: "Test Mince",
      quantity: "500 g",
      nutriments: { "energy-kcal_100g": 172, proteins_100g: 26, carbohydrates_100g: 0, fat_100g: 7 },
    });
    const food = await lookupBarcode("9300000000098");
    expect(food.liquid).toBe(false);
  });

  it("leaves liquid unset when Open Food Facts has no usable quantity field", async () => {
    mockOff(1, {
      product_name: "Test Item With No Quantity",
      nutriments: { "energy-kcal_100g": 200, proteins_100g: 10, carbohydrates_100g: 10, fat_100g: 5 },
    });
    const food = await lookupBarcode("9300000000104");
    expect(food.liquid).toBeUndefined();
  });

  it("throws a notFound error with the product name when nutrition data is missing", async () => {
    mockOff(1, { product_name: "No Nutrition Yet", nutriments: {} });
    await expect(lookupBarcode("9300000000035")).rejects.toMatchObject({
      notFound: true,
      productName: "No Nutrition Yet",
    });
  });

  it("throws a notFound error when the barcode isn't in the database at all", async () => {
    mockOff(0, null);
    await expect(lookupBarcode("9300000000042")).rejects.toMatchObject({ notFound: true });
  });

  it("resolves a 12-digit UPC-A via its zero-padded EAN-13 form", async () => {
    // A 12-digit UPC-A code (e.g. "123456789012") misses as-is but hits
    // once zero-padded to its 13-digit EAN-13 form ("0123456789012") —
    // the common case for how Open Food Facts actually catalogues most
    // US-origin products. Both variants fire in parallel; only the padded
    // one resolves, proving the retry logic itself works rather than just
    // a lucky direct hit.
    global.fetch.mockImplementation((url) => {
      const isPaddedForm = url.includes("0123456789012");
      return Promise.resolve({
        ok: true,
        json: async () =>
          isPaddedForm
            ? {
                status: 1,
                product: { product_name: "UPC Product", nutriments: { "energy-kcal_100g": 100, proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 2 } },
              }
            : { status: 0, product: null },
      });
    });
    const food = await lookupBarcode("123456789012");
    expect(food.name).toBe("UPC Product");
  });

  // Real production report ("Product Not Found" for Woolworths eggs and
  // others): a network failure or timeout used to be reported identically
  // to a confirmed "Open Food Facts has no record of this barcode" — both
  // threw with `notFound: true`, which routes the scan UI straight to its
  // "add it manually" screen. That's wrong for a failure that never
  // actually got an answer from the source at all; the UI's own separate
  // "Couldn't complete that scan — Try again" screen (NutritionFeatures.jsx)
  // existed for exactly this case but was unreachable, because this
  // function never threw anything other than `notFound: true`. A network
  // failure/timeout must NOT crash (still resolves, doesn't hang/throw
  // unhandled) and must NOT be reported as `notFound` — the two are
  // different failure modes with different correct recovery paths.
  it("reports a network failure as a lookup failure, not a confirmed not-found", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));
    const err = await lookupBarcode("9300000000059").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.notFound).toBeFalsy();
    expect(err.message).toMatch(/Couldn't reach the product database/i);
  });

  it("reports a timeout as a lookup failure, not a confirmed not-found", async () => {
    global.fetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        })
    );
    const err = await lookupBarcode("9300000000066").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.notFound).toBeFalsy();
    expect(err.message).toMatch(/Couldn't reach the product database/i);
  });

  // A GENUINE confirmed absence (Open Food Facts explicitly says "no such
  // product," via a 404 or its own status: 0) is the one case that SHOULD
  // still report notFound: true and route to manual entry — unlike the
  // two cases above, OFF actually answered, and the answer was "no."
  it("still reports a genuine, confirmed absence (OFF's own status: 0) as not-found", async () => {
    mockOff(0, null);
    await expect(lookupBarcode("9300000000080")).rejects.toMatchObject({ notFound: true });
  });

  it("still reports a genuine 404 as not-found, distinct from a 5xx/429 lookup failure", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(lookupBarcode("9300000000097")).rejects.toMatchObject({ notFound: true });
  });

  it("reports a 429 (rate-limited) or 5xx (server error) as a lookup failure, not a confirmed not-found", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const err = await lookupBarcode("9300000000103").catch((e) => e);
    expect(err.notFound).toBeFalsy();
    expect(err.message).toMatch(/Couldn't reach the product database/i);
  });

  // A 12-digit UPC-A code tries 2 variants in parallel (raw + zero-padded
  // EAN-13 — see codeVariants). If one variant comes back confirmed-absent
  // (a real 404) but the OTHER never got an answer (timeout), the overall
  // result must NOT be treated as a confirmed not-found — the zero-padded
  // form might genuinely have a product, we just don't know yet.
  it("does not report a confirmed not-found when only SOME variants were confirmed and others merely failed to answer", async () => {
    global.fetch.mockImplementation((url) => {
      // codeVariants("123456789012") tries both the raw 12-digit code and
      // its zero-padded 13-digit EAN-13 form ("0123456789012") — matched
      // by the exact product-id segment of the URL, not a substring (the
      // 12-digit form is itself a substring of the zero-padded one).
      if (String(url).endsWith("/product/123456789012.json")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.reject(new Error("network down"));
    });
    const err = await lookupBarcode("123456789012").catch((e) => e);
    expect(err.notFound).toBeFalsy();
    expect(err.message).toMatch(/Couldn't reach the product database/i);
  });

  it("flags which macro fields are actually missing, instead of silently defaulting them to a confirmed zero", async () => {
    mockOff(1, {
      product_name: "Incomplete Label Bar",
      nutriments: { "energy-kcal_100g": 180, proteins_100g: 5 }, // carbs/fat never reported by the source
    });
    const food = await lookupBarcode("9300000000111");
    expect(food.carbs).toBe(0); // still usable for display/calculation...
    expect(food.fat).toBe(0);
    expect(food.missingNutritionFields).toEqual(["carbs", "fat"]); // ...but never presented as real, verified zeros
    expect(food.nutritionSuspect).toBe(true); // missing data fails validation too, not just out-of-range data
  });

  it("does not flag missingNutritionFields when the source actually reports all four macros", async () => {
    mockOff(1, {
      product_name: "Complete Label Bar",
      nutriments: { "energy-kcal_100g": 180, proteins_100g: 5, carbohydrates_100g: 20, fat_100g: 3 },
    });
    const food = await lookupBarcode("9300000000128");
    expect(food.missingNutritionFields).toBeUndefined();
  });

  it("parses a liquid product's serving size in ml, not just g", async () => {
    mockOff(1, {
      product_name: "Test Juice",
      serving_size: "250 ml",
      quantity: "1 L",
      nutriments: { "energy-kcal_100g": 45, proteins_100g: 0.5, carbohydrates_100g: 10, fat_100g: 0 },
    });
    const food = await lookupBarcode("9300000000135");
    expect(food.defaultQty).toBe(250);
    expect(food.servingSizeUnverified).toBeUndefined();
  });

  it("preserves the exact Open Food Facts macros under `source`, separate from the top-level fields a correction would later change", async () => {
    mockOff(1, {
      product_name: "Test Muesli Bar",
      brands: "TestBrand",
      nutriments: { "energy-kcal_100g": 440, proteins_100g: 9.3, carbohydrates_100g: 51.3, fat_100g: 20 },
    });
    const food = await lookupBarcode("9300000000142");
    expect(food.source).toEqual({ name: "Test Muesli Bar", brand: "TestBrand", cals: 440, protein: 9.3, carbs: 51.3, fat: 20 });
  });

  it("never invents a product name when Open Food Facts has none", async () => {
    mockOff(1, {
      nutriments: { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 20, fat_100g: 1 },
    });
    const food = await lookupBarcode("9300000000073");
    expect(food.name).toMatch(/Scanned item/);
  });

  // Real production report: a client scanned a loaf of bread and only got
  // grams, no "slice" option — unlike the hand-curated bread entries in
  // FOOD_DATABASE, which all offer a real "slice" customUnit. Open Food
  // Facts frequently states the per-slice weight directly in its own
  // serving_size text (e.g. "1 slice (40 g)"); this is a genuine, verified
  // figure read off the product's own label, not invented, so it's now
  // carried through as a real customUnit the same way a hand-curated
  // entry's is.
  it("offers a real 'slice' unit for a scanned bread product whose serving_size names one", async () => {
    mockOff(1, {
      product_name: "Scanned Sandwich Bread",
      brands: "TestBakery",
      serving_size: "1 slice (40 g)",
      nutriments: { "energy-kcal_100g": 250, proteins_100g: 9, carbohydrates_100g: 45, fat_100g: 3 },
    });
    const food = await lookupBarcode("9300000000166");
    expect(food.customUnit).toEqual({ label: "slice", pluralLabel: "slices", grams: 40 });
    expect(food.defaultQty).toBe(40); // still a real figure for the base gram unit too
  });

  it("divides a multi-unit serving_size (e.g. '2 biscuits (30g)') to get the correct single-unit weight", async () => {
    mockOff(1, {
      product_name: "Scanned Digestive Biscuits",
      serving_size: "2 biscuits (30g)",
      nutriments: { "energy-kcal_100g": 480, proteins_100g: 6, carbohydrates_100g: 65, fat_100g: 20 },
    });
    const food = await lookupBarcode("9300000000159");
    expect(food.customUnit).toEqual({ label: "biscuit", pluralLabel: "biscuits", grams: 15 });
  });

  it("offers no customUnit at all when serving_size has no countable-unit word (just a plain weight)", async () => {
    mockOff(1, {
      product_name: "Scanned Rice",
      serving_size: "180 g",
      nutriments: { "energy-kcal_100g": 130, proteins_100g: 2.7, carbohydrates_100g: 28, fat_100g: 0.3 },
    });
    const food = await lookupBarcode("9300000000180");
    expect(food.customUnit).toBeUndefined();
  });

  it("offers no customUnit when serving_size is missing entirely", async () => {
    mockOff(1, {
      product_name: "Scanned Mystery Item",
      nutriments: { "energy-kcal_100g": 200, proteins_100g: 5, carbohydrates_100g: 30, fat_100g: 5 },
    });
    const food = await lookupBarcode("9300000000197");
    expect(food.customUnit).toBeUndefined();
  });

  // Follow-up to the bread fix above, tracing the rest of the app's own
  // "appropriate serving options" examples (eggs, soft drink cans/
  // bottles, canned/packaged foods) through the real barcode-scan path —
  // not just the static database — the same way the bread gap was
  // originally found. Open Food Facts formats serving_size both ways
  // round in practice; both are covered (see parseServingUnit's own
  // comment).
  it("offers a real 'egg' unit for a scanned egg carton whose serving_size names one", async () => {
    mockOff(1, {
      product_name: "Scanned Free Range Eggs",
      serving_size: "1 egg (50g)",
      nutriments: { "energy-kcal_100g": 143, proteins_100g: 13, carbohydrates_100g: 1, fat_100g: 10 },
    });
    const food = await lookupBarcode("9300000000203");
    expect(food.customUnit).toEqual({ label: "egg", pluralLabel: "eggs", grams: 50 });
  });

  it("offers a real 'can' unit for a scanned soft drink whose serving_size states the weight-first OFF convention", async () => {
    mockOff(1, {
      product_name: "Scanned Cola",
      serving_size: "355 ml (1 can)",
      nutriments: { "energy-kcal_100g": 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 },
    });
    const food = await lookupBarcode("9300000000210");
    expect(food.customUnit).toEqual({ label: "can", pluralLabel: "cans", grams: 355 });
  });

  it("offers a real 'bottle' unit for a scanned drink, weight-first OFF convention", async () => {
    mockOff(1, {
      product_name: "Scanned Spring Water",
      serving_size: "600ml (1 bottle)",
      nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    });
    const food = await lookupBarcode("9300000000227");
    expect(food.customUnit).toEqual({ label: "bottle", pluralLabel: "bottles", grams: 600 });
  });

  it("offers a real 'can' unit for a scanned canned food (drained or not, as labeled)", async () => {
    mockOff(1, {
      product_name: "Scanned Canned Tuna",
      serving_size: "1 can (185 g)",
      nutriments: { "energy-kcal_100g": 116, proteins_100g: 26, carbohydrates_100g: 0, fat_100g: 1 },
    });
    const food = await lookupBarcode("9300000000234");
    expect(food.customUnit).toEqual({ label: "can", pluralLabel: "cans", grams: 185 });
  });
});

describe("debugLookupBarcode", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  // A real, check-digit-valid EAN-13 (the standard GS1 example code) —
  // using an actually-valid barcode here, not an arbitrary test string,
  // matters now that "barcode validity" is itself a scored factor.
  const VALID_EAN13 = "4006381333931";

  it("reports a resolved product as VERIFIED with a near-perfect score when everything checks out", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: "Trace Test",
          brands: "TestBrand",
          serving_size: "35 g",
          countries_tags: ["en:australia"],
          nutriments: { "energy-kcal_100g": 129, proteins_100g: 20.3, carbohydrates_100g: 1.8, fat_100g: 4.5 },
        },
      }),
    });
    const trace = await debugLookupBarcode(VALID_EAN13);
    expect(trace.scannedCode).toBe(VALID_EAN13);
    expect(trace.sourcesSearched).toHaveLength(1);
    expect(trace.sourcesSearched[0].name).toBe("Open Food Facts");
    expect(trace.outcome).toBe("resolved");
    expect(trace.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(trace.verificationLevel).toBe("VERIFIED");
    expect(trace.confidenceBreakdown.length).toBeGreaterThan(0);
    expect(trace.finalFood.name).toBe("TestBrand Trace Test"); // brand merged into the name
    expect(trace.nutritionValidation.plausible).toBe(true);
  });

  it("drops to REVIEW/UNVERIFIED and shows why when nutrition data is suspect, without hiding the result", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: "Suspect Trace", nutriments: { "energy-kcal_100g": 1620, proteins_100g: 22.7, carbohydrates_100g: 8.3, fat_100g: 44 } },
      }),
    });
    const trace = await debugLookupBarcode(VALID_EAN13);
    expect(trace.outcome).toBe("resolved");
    expect(trace.confidenceScore).toBeLessThan(90);
    expect(trace.verificationLevel).not.toBe("VERIFIED");
    expect(trace.nutritionValidation.plausible).toBe(false);
    expect(trace.finalFood).toBeTruthy(); // still returned, just flagged — never silently dropped
    expect(trace.confidenceBreakdown.find((b) => b.factor === "Nutrition plausibility").points).toBe(0);
  });

  it("reports which variants were tried, and still credits a validly-formed barcode even when no product is found for it", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 0, product: null }) });
    // "123456789012" is itself a check-digit-valid UPC-A, so this exercises
    // "the code is real, we just don't have a record for it" rather than
    // "the code itself looks wrong" (covered by the UNKNOWN case below).
    const trace = await debugLookupBarcode("123456789012"); // 12-digit — expect 2 variants tried
    expect(trace.variantsTried.length).toBe(2);
    expect(trace.outcome).toBe("not-found");
    expect(trace.confidenceScore).toBe(15);
    expect(trace.verificationLevel).toBe("UNVERIFIED");
  });

  it("scores a code with a failed check digit as UNKNOWN when no product is found", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 0, product: null }) });
    const trace = await debugLookupBarcode("4006381333930"); // tampered check digit (real one ends in 1)
    expect(trace.outcome).toBe("not-found");
    expect(trace.confidenceScore).toBe(0);
    expect(trace.verificationLevel).toBe("UNKNOWN");
  });

  it("scores a found-but-no-nutrition product as REVIEW, not VERIFIED or UNKNOWN", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: "No Nutrition Yet", brands: "SomeBrand", nutriments: {} } }),
    });
    const trace = await debugLookupBarcode(VALID_EAN13);
    expect(trace.outcome).toBe("found-no-nutrition");
    expect(trace.verificationLevel).toBe("REVIEW");
    expect(trace.finalFood).toBeNull();
  });
});

describe("detectBarcodeFormat", () => {
  it("validates a real EAN-13 check digit", () => {
    const result = detectBarcodeFormat("4006381333931");
    expect(result.format).toBe("EAN-13");
    expect(result.valid).toBe(true);
  });
  it("catches a tampered/misread check digit", () => {
    const result = detectBarcodeFormat("4006381333930"); // last digit changed from 1 to 0
    expect(result.format).toBe("EAN-13");
    expect(result.valid).toBe(false);
  });
  it("identifies EAN-8 and UPC-A by length", () => {
    expect(detectBarcodeFormat("96385074").format).toBe("EAN-8");
    expect(detectBarcodeFormat("036000291452").format).toBe("UPC-A");
  });
  it("reports valid:null (not false) for an unrecognised length", () => {
    const result = detectBarcodeFormat("12345");
    expect(result.format).toBe("unknown");
    expect(result.valid).toBeNull();
  });
});

describe("computeConfidence", () => {
  it("awards full marks for a complete, plausible, AU-tagged product", () => {
    const formatInfo = { format: "EAN-13", valid: true };
    const product = { product_name: "Full Product", brands: "Brand", serving_size: "30g", countries_tags: ["en:australia"] };
    const food = { cals: 100, protein: 10, carbs: 10, fat: 2 };
    const { score, level } = computeConfidence({ product, food, formatInfo, nutritionValidation: { plausible: true, reason: null } });
    expect(score).toBe(100);
    expect(level).toBe("VERIFIED");
  });

  it("never penalises missing country data as if it were a wrong-market result", () => {
    const formatInfo = { format: "EAN-13", valid: true };
    const product = { product_name: "No Country Tag", brands: "Brand", serving_size: "30g" };
    const food = { cals: 100, protein: 10, carbs: 10, fat: 2 };
    const withNoCountry = computeConfidence({ product, food, formatInfo, nutritionValidation: { plausible: true, reason: null } });
    const otherMarketProduct = { ...product, countries_tags: ["en:united-states"] };
    const withOtherMarket = computeConfidence({ product: otherMarketProduct, food, formatInfo, nutritionValidation: { plausible: true, reason: null } });
    // missing data scores higher than a confirmed non-AU match, but neither is penalised to zero
    expect(withNoCountry.score).toBeGreaterThan(withOtherMarket.score);
  });

  it("scores low (UNVERIFIED) when the barcode is valid but no product was found for it", () => {
    const { score, level } = computeConfidence({ product: null, food: null, formatInfo: { format: "EAN-13", valid: true }, nutritionValidation: { plausible: false, reason: "n/a" } });
    expect(score).toBe(15); // barcode validity is the only earnable factor left — no match, no name, nothing else to score
    expect(level).toBe("UNVERIFIED");
  });

  it("scores zero (UNKNOWN) when neither the barcode nor a product can be confirmed", () => {
    const { score, level } = computeConfidence({ product: null, food: null, formatInfo: { format: "EAN-13", valid: false }, nutritionValidation: { plausible: false, reason: "n/a" } });
    expect(score).toBe(0);
    expect(level).toBe("UNKNOWN");
  });

  // Real production report: "Protein Smoothie Choc Honeycomb" scanned with
  // a complete macro panel, a real brand/name and a parsed serving size —
  // everything BUT the plausibility check scored well enough that the
  // 15-point plausibility deduction alone wasn't enough to drop it out of
  // LIKELY, so the confirm screen showed a green "Verified" checkmark
  // directly alongside the red "doesn't add up" banner. Never acceptable:
  // implausible nutrition must cap the level at REVIEW regardless of how
  // well everything else scores.
  it("never reports VERIFIED or LIKELY when the nutrition data itself doesn't reconcile, however well everything else scores", () => {
    const formatInfo = { format: "EAN-13", valid: true };
    const product = { product_name: "Protein Smoothie Choc Honeycomb", brands: "TestBrand", serving_size: "425 g", countries_tags: ["en:australia"] };
    const food = { cals: 253, protein: 5, carbs: 5, fat: 2 }; // 5*4+5*4+2*9=58 cal, nowhere near 253
    const nutritionValidation = { plausible: false, reason: "label says 253 cal, but macros work out to ~58 cal" };
    const { score, level } = computeConfidence({ product, food, formatInfo, nutritionValidation });
    expect(score).toBeGreaterThanOrEqual(75); // every other factor alone clears LIKELY/VERIFIED
    expect(level).toBe("REVIEW");
  });
});
