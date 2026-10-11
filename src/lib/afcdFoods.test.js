// Data-integrity checks for the bundled Australian Food Composition
// Database subset (afcdFoods.js) — this is a static, offline-built
// dataset, but it's still a nutrition data source real clients log
// against, so it must hold to the exact same rules barcode-scanned data
// does: every entry reconciles under the Atwater energy check, no entry
// is missing a core macro, every id/afcdKey is unique, and a product that
// reads as a drink is actually classified as one (never grams for a
// liquid — the specific failure mode this whole task called out).
import { describe, expect, it } from "vitest";
import { AFCD_FOODS } from "./afcdFoods";
import { validateNutrition } from "./barcodeLookup";
import { isLiquidFood } from "./foodDatabase";

describe("AFCD_FOODS — bundled data integrity", () => {
  it("is a practical, non-trivial, non-bloated subset", () => {
    expect(AFCD_FOODS.length).toBeGreaterThan(50);
    expect(AFCD_FOODS.length).toBeLessThan(500);
  });

  it("every entry reconciles under the same Atwater check a barcode scan gets", () => {
    const failures = AFCD_FOODS.filter((f) => !validateNutrition({ cals: f.cals, protein: f.protein, carbs: f.carbs, fat: f.fat }).plausible);
    expect(failures.map((f) => f.name)).toEqual([]);
  });

  it("no entry is missing a core macro field", () => {
    for (const f of AFCD_FOODS) {
      expect(f.cals).not.toBeNull();
      expect(f.protein).not.toBeNull();
      expect(f.carbs).not.toBeNull();
      expect(f.fat).not.toBeNull();
    }
  });

  it("every id and afcdKey is unique", () => {
    const ids = new Set(AFCD_FOODS.map((f) => f.id));
    const keys = new Set(AFCD_FOODS.map((f) => f.afcdKey));
    expect(ids.size).toBe(AFCD_FOODS.length);
    expect(keys.size).toBe(AFCD_FOODS.length);
  });

  it("every entry carries source/afcdKey provenance and the standard per-100 shape", () => {
    for (const f of AFCD_FOODS) {
      expect(f.source).toBe("AFCD");
      expect(typeof f.afcdKey).toBe("string");
      expect(f.afcdKey.length).toBeGreaterThan(0);
      expect(f.per).toBe(100);
      expect(f.defaultQty).toBe(100);
    }
  });

  it("a plant-milk 'beverage' product is explicitly classified liquid, never defaulted to grams", () => {
    const beverages = AFCD_FOODS.filter((f) => /beverage/i.test(f.name));
    expect(beverages.length).toBeGreaterThan(0);
    for (const f of beverages) {
      expect(isLiquidFood(f)).toBe(true);
    }
  });

  it("an ordinary solid food (meat/veg/grain) is not misclassified as liquid", () => {
    const solids = AFCD_FOODS.filter((f) => !f.liquid).slice(0, 30);
    for (const f of solids) {
      expect(isLiquidFood(f)).toBe(false);
    }
  });
});
