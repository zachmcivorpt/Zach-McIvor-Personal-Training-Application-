// Real unit tests for the barcode scanner's pure/testable logic —
// normalisation, variable-weight (deli scale) barcode handling, nutrition
// plausibility validation, and the Open Food Facts lookup/mapping itself
// (network calls mocked, not a live integration test). The camera/decode
// side (html5-qrcode, BarcodeDetector) lives in NutritionFeatures.jsx and
// isn't unit-testable this way — it needs a browser with real camera
// hardware, which is a manual/E2E concern, not something to fake here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isVariableWeightBarcode, stableBarcodeKey, validateNutrition, lookupBarcode, debugLookupBarcode } from "./barcodeLookup";

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
    expect(food.name).toBe("Test Muesli Bar");
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

  it("treats a network failure as not-found rather than crashing", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));
    await expect(lookupBarcode("9300000000059")).rejects.toMatchObject({ notFound: true });
  });

  it("treats a timeout as not-found rather than hanging", async () => {
    global.fetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        })
    );
    await expect(lookupBarcode("9300000000066")).rejects.toMatchObject({ notFound: true });
  });

  it("never invents a product name when Open Food Facts has none", async () => {
    mockOff(1, {
      nutriments: { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 20, fat_100g: 1 },
    });
    const food = await lookupBarcode("9300000000073");
    expect(food.name).toMatch(/Scanned item/);
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

  it("reports a resolved product with high confidence when nutrition checks out", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: "Trace Test", nutriments: { "energy-kcal_100g": 129, proteins_100g: 20.3, carbohydrates_100g: 1.8, fat_100g: 4.5 } },
      }),
    });
    const trace = await debugLookupBarcode("9300000000080");
    expect(trace.scannedCode).toBe("9300000000080");
    expect(trace.sourcesSearched).toHaveLength(1);
    expect(trace.sourcesSearched[0].name).toBe("Open Food Facts");
    expect(trace.outcome).toBe("resolved");
    expect(trace.confidence).toBeGreaterThan(0.9);
    expect(trace.finalFood.name).toBe("Trace Test");
    expect(trace.nutritionValidation.plausible).toBe(true);
  });

  it("reports lower confidence when nutrition data is suspect, without hiding the result", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: "Suspect Trace", nutriments: { "energy-kcal_100g": 1620, proteins_100g: 22.7, carbohydrates_100g: 8.3, fat_100g: 44 } },
      }),
    });
    const trace = await debugLookupBarcode("9300000000097");
    expect(trace.outcome).toBe("resolved");
    expect(trace.confidence).toBeLessThan(0.9);
    expect(trace.nutritionValidation.plausible).toBe(false);
    expect(trace.finalFood).toBeTruthy(); // still returned, just flagged — never silently dropped
  });

  it("reports which variants were tried even when nothing is found", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 0, product: null }) });
    const trace = await debugLookupBarcode("123456789012"); // 12-digit — expect 2 variants tried
    expect(trace.variantsTried.length).toBe(2);
    expect(trace.outcome).toBe("not-found");
    expect(trace.confidence).toBe(0);
  });
});
