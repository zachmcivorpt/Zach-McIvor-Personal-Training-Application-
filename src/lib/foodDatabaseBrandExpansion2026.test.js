// Data-integrity checks for the branded-product expansion added directly
// to FOOD_DATABASE (171 new branded Australian foods across butter/
// margarine/oils, dairy, sauces/dressings/baking, drinks, nuts/snacks,
// bread/bakery, cereals, confectionery, biscuits, deli/canned/frozen/
// protein/eggs — researched from manufacturer pages, major AU retailer
// listings and FatSecret AU). Same rules every other verified source in
// this app follows: brand present in the name, Atwater-valid, no invented
// macro, correct liquid/solid unit classification, and no duplicate of
// something already in the library.
import { describe, expect, it } from "vitest";
import { FOOD_DATABASE, isLiquidFood } from "./foodDatabase";
import { validateNutrition } from "./barcodeLookup";

const expansion = FOOD_DATABASE.filter((f) => f.source === "BrandResearch2026");

describe("FOOD_DATABASE — branded product expansion (2026)", () => {
  it("adds a genuinely sized batch of new branded foods", () => {
    expect(expansion.length).toBeGreaterThanOrEqual(100);
    expect(expansion.length).toBeLessThanOrEqual(250);
  });

  it("every entry reconciles under the same Atwater check a barcode scan gets", () => {
    const failures = expansion.filter((f) => !validateNutrition({ cals: f.cals, protein: f.protein, carbs: f.carbs, fat: f.fat }).plausible);
    expect(failures.map((f) => f.name)).toEqual([]);
  });

  it("no entry is missing a core macro field", () => {
    for (const f of expansion) {
      expect(f.cals).not.toBeNull();
      expect(f.protein).not.toBeNull();
      expect(f.carbs).not.toBeNull();
      expect(f.fat).not.toBeNull();
    }
  });

  it("every id is unique across the whole FOOD_DATABASE, not just this expansion", () => {
    const ids = FOOD_DATABASE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no entry duplicates an existing FOOD_DATABASE name (exact, case-insensitive)", () => {
    const priorNames = new Set(FOOD_DATABASE.filter((f) => f.source !== "BrandResearch2026").map((f) => f.name.toLowerCase().trim()));
    const collisions = expansion.filter((f) => priorNames.has(f.name.toLowerCase().trim()));
    expect(collisions.map((f) => f.name)).toEqual([]);
  });

  it("no two entries within this expansion share the same name (a cross-prior check alone wouldn't catch an internal repeat)", () => {
    const names = expansion.map((f) => f.name.toLowerCase().trim());
    const counts = {};
    for (const n of names) counts[n] = (counts[n] || 0) + 1;
    const internalDupes = Object.entries(counts).filter(([, c]) => c > 1).map(([n]) => n);
    expect(internalDupes).toEqual([]);
  });

  it("carries source/sourceUrl provenance and the standard per-100 shape — never kg/lb units", () => {
    for (const f of expansion) {
      expect(f.source).toBe("BrandResearch2026");
      expect(typeof f.sourceUrl).toBe("string");
      expect(f.sourceUrl.startsWith("http")).toBe(true);
      expect(f.per).toBe(100);
      expect(typeof f.defaultQty).toBe("number");
      expect(f.defaultQty).toBeGreaterThan(0);
      expect(f.units || []).not.toContain("kg");
      expect(f.units || []).not.toContain("lb");
    }
  });

  it("every entry's name starts with a brand/product name, not a bare single-word generic", () => {
    // Every candidate here was sourced specifically because it's a named
    // branded product — so each name should either be a multi-word brand +
    // product name, or (rare, same as existing "Vegemite"/"Nutella"
    // entries) a single word that is itself a trademark, never a plain
    // single-word category like "Milk" or "Cheese" on its own.
    const bare = expansion.filter((f) => f.name.trim().split(/\s+/).length === 1 && /^(milk|cheese|butter|cream|oil|juice|yoghurt|yogurt)$/i.test(f.name.trim()));
    expect(bare.map((f) => f.name)).toEqual([]);
  });

  it("plain milk/juice/soft drink entries are classified liquid (condensed milk and milk chocolate are correctly excluded)", () => {
    const drinks = expansion.filter(
      (f) => /\b(milk|juice|sprite|fanta|lemonade|ginger ale|iced coffee)\b/i.test(f.name) && !/condensed milk|choc bits|caramello|marble|rocky road/i.test(f.name)
    );
    expect(drinks.length).toBeGreaterThan(0);
    for (const f of drinks) {
      expect(isLiquidFood(f)).toBe(true);
    }
  });

  it("oil and dairy cream are classified solid/grams, matching the existing static Olive Oil / AFCD Cream entries", () => {
    const oilsAndCreams = expansion.filter((f) => /\boil$/i.test(f.name.trim()) || (/\bcream\b/i.test(f.name) && !/milk|cream cheese/i.test(f.name)));
    expect(oilsAndCreams.length).toBeGreaterThan(0);
    for (const f of oilsAndCreams) {
      expect(isLiquidFood(f)).toBe(false);
    }
  });

  it("a canned tuna product packed 'in oil' is not misclassified as a pourable oil", () => {
    const tuna = expansion.find((f) => /tuna.*oil/i.test(f.name));
    expect(tuna).toBeTruthy();
    expect(isLiquidFood(tuna)).toBe(false);
    expect(tuna.units || []).not.toContain("tbsp");
  });
});
