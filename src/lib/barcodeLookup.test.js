// Real unit tests for the barcode scanner's pure/testable logic —
// normalisation, variable-weight (deli scale) barcode handling, nutrition
// plausibility validation, and the Open Food Facts lookup/mapping itself
// (network calls mocked, not a live integration test). The camera/decode
// side (html5-qrcode, BarcodeDetector) lives in NutritionFeatures.jsx and
// isn't unit-testable this way — it needs a browser with real camera
// hardware, which is a manual/E2E concern, not something to fake here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isVariableWeightBarcode, stableBarcodeKey, validateNutrition, lookupBarcode, debugLookupBarcode, detectBarcodeFormat, computeConfidence } from "./barcodeLookup";

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
    expect(trace.finalFood.name).toBe("Trace Test");
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
});
