// Data-integrity checks for the second branded-product expansion round
// (280 new items: 7-Eleven, Australian takeaway, frozen savoury/ready
// meals/ice cream, deli/cheese/yoghurt, cereals/sauces/snacks,
// confectionery, branded drinks, and verified chain/generic-dish gaps).
// Same rules as the first round: Atwater-valid, no invented macro,
// correct liquid/solid unit classification, no duplicate of anything
// already in the library.
import { describe, expect, it } from "vitest";
import { FOOD_DATABASE, isLiquidFood } from "./foodDatabase";
import { validateNutrition } from "./barcodeLookup";

const expansion = FOOD_DATABASE.filter((f) => f.source === "BrandResearch2026b");

describe("FOOD_DATABASE — branded product expansion round 2 (2026)", () => {
  it("adds a genuinely sized batch of new branded/verified foods", () => {
    expect(expansion.length).toBeGreaterThanOrEqual(200);
    expect(expansion.length).toBeLessThanOrEqual(350);
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
    const priorNames = new Set(FOOD_DATABASE.filter((f) => f.source !== "BrandResearch2026b").map((f) => f.name.toLowerCase().trim()));
    const collisions = expansion.filter((f) => priorNames.has(f.name.toLowerCase().trim()));
    expect(collisions.map((f) => f.name)).toEqual([]);
  });

  it("no two entries within this expansion share the same name", () => {
    const names = expansion.map((f) => f.name.toLowerCase().trim());
    const counts = {};
    for (const n of names) counts[n] = (counts[n] || 0) + 1;
    const internalDupes = Object.entries(counts).filter(([, c]) => c > 1).map(([n]) => n);
    expect(internalDupes).toEqual([]);
  });

  it("carries source provenance and the standard per-100 shape — never kg/lb units", () => {
    for (const f of expansion) {
      expect(f.source).toBe("BrandResearch2026b");
      expect(f.per).toBe(100);
      expect(typeof f.defaultQty).toBe("number");
      expect(f.defaultQty).toBeGreaterThan(0);
      expect(f.units || []).not.toContain("kg");
      expect(f.units || []).not.toContain("lb");
    }
  });

  it("branded soft drinks, energy drinks and cordials are classified liquid even when their name alone wouldn't trigger the shared classifier", () => {
    const drinks = expansion.filter((f) => /\b(kirks|solo|bundaberg|schweppes|sunkist|tru blu|mother energy|red bull|v energy|mount franklin|pump|7-eleven coffee melt)\b/i.test(f.name));
    expect(drinks.length).toBeGreaterThan(0);
    for (const f of drinks) {
      expect(isLiquidFood(f)).toBe(true);
    }
  });

  it("a chocolate/confectionery product with 'milk' in its name is not misclassified as a drink", () => {
    const choc = expansion.find((f) => /caramello koala/i.test(f.name));
    expect(choc).toBeTruthy();
    expect(isLiquidFood(choc)).toBe(false);
  });

  it("an icy pole/frozen confection with a drink word in its name (e.g. 'Lemonade') is not misclassified as a pourable drink", () => {
    const icyPole = expansion.find((f) => /lemonade icy twist/i.test(f.name));
    expect(icyPole).toBeTruthy();
    expect(isLiquidFood(icyPole)).toBe(false);
  });
});
