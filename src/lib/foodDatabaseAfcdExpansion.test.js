// Data-integrity checks for the AFCD expansion added directly to
// FOOD_DATABASE (275 of the most commonly logged generic foods/drinks
// not already in the app, sourced from FSANZ's free Australian Food
// Composition Database Release 3). These entries are searched first
// (ahead of the afcdFoods.js fallback), so they need to hold to the same
// rules every other verified source in this app does: Atwater-valid,
// no invented macro, correct liquid/solid unit classification, and no
// duplicate of something already in the library under a different name.
import { describe, expect, it } from "vitest";
import { FOOD_DATABASE, isLiquidFood } from "./foodDatabase";
import { validateNutrition } from "./barcodeLookup";
import { AFCD_FOODS } from "./afcdFoods";

const expansion = FOOD_DATABASE.filter((f) => f.source === "AFCD" && f.id.startsWith("afcddb_"));

describe("FOOD_DATABASE — AFCD expansion", () => {
  it("adds a genuinely in-range number of new foods (250-450)", () => {
    expect(expansion.length).toBeGreaterThanOrEqual(250);
    expect(expansion.length).toBeLessThanOrEqual(450);
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

  it("every id is unique across the whole FOOD_DATABASE, not just the expansion", () => {
    const ids = FOOD_DATABASE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no new entry duplicates an existing FOOD_DATABASE or afcdFoods.js name (exact, case-insensitive)", () => {
    const priorNames = new Set(
      [...FOOD_DATABASE.filter((f) => !(f.source === "AFCD" && f.id.startsWith("afcddb_"))), ...AFCD_FOODS].map((f) => f.name.toLowerCase().trim())
    );
    const collisions = expansion.filter((f) => priorNames.has(f.name.toLowerCase().trim()));
    expect(collisions.map((f) => f.name)).toEqual([]);
  });

  it("every entry carries source/afcdKey provenance and the standard per-100 shape — never kg/lb/container units", () => {
    for (const f of expansion) {
      expect(f.source).toBe("AFCD");
      expect(typeof f.afcdKey).toBe("string");
      expect(f.afcdKey.length).toBeGreaterThan(0);
      expect(f.per).toBe(100);
      expect(typeof f.defaultQty).toBe("number");
      expect(f.defaultQty).toBeGreaterThan(0);
      expect(f.units || []).not.toContain("kg");
      expect(f.units || []).not.toContain("lb");
    }
  });

  it("a plain tea is explicitly classified liquid (its name alone wouldn't trigger the shared classifier)", () => {
    const teas = expansion.filter((f) => /^(tea|green tea)\b/i.test(f.name));
    expect(teas.length).toBeGreaterThan(0);
    for (const f of teas) {
      expect(isLiquidFood(f)).toBe(true);
    }
  });

  it("a cooked grain 'soaked in water' is not misclassified as a drink just because its own text says 'water'", () => {
    const bulgur = expansion.find((f) => /bulgur/i.test(f.name));
    expect(bulgur).toBeTruthy();
    expect(isLiquidFood(bulgur)).toBe(false);
  });

  it("every common requested drink category is actually present", () => {
    const names = expansion.map((f) => f.name.toLowerCase());
    const hasAny = (re) => names.some((n) => re.test(n));
    expect(hasAny(/^tea\b/)).toBe(true);
    expect(hasAny(/soft drink/)).toBe(true);
    expect(hasAny(/juice/)).toBe(true);
    expect(hasAny(/water/)).toBe(true);
  });
});
