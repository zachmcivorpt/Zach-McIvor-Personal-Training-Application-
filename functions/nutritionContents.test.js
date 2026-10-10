// Regression coverage for the "Macro Match" / AI nutrition suggestion
// combo-breakdown feature. The client UI (NutritionScreen's AI Nutrition
// Help, ClientApp.jsx) has always had code ready to render a suggestion's
// "contents" (e.g. "Big Mac Meal" -> burger + fries + Coke listed
// separately), but the Cloud Function behind it never actually asked the
// model for one, or passed one through even if the model produced it — so
// that part of the screen was permanently dead. Fixed by asking for it in
// the system prompt (index.js) and passing it through here, but only ever
// after confirming the breakdown's own numbers genuinely sum to the
// parent suggestion's totals — never trusting an LLM's arithmetic blind,
// per this app's explicit "Macro Match combos — their contents must still
// sum exactly to the parent total" requirement.
import { describe, it, expect } from "vitest";
import { validatedContents, buildSuggestions } from "./nutritionContents.js";

describe("validatedContents", () => {
  const parent = { calories: 550, protein: 25, carbs: 60, fat: 22 };

  it("keeps a breakdown whose items genuinely sum to the parent's totals", () => {
    const contents = [
      { name: "Burger", calories: 300, protein: 15, carbs: 30, fat: 14 },
      { name: "Fries", calories: 150, protein: 2, carbs: 20, fat: 8 },
      { name: "Coke", calories: 100, protein: 8, carbs: 10, fat: 0 },
    ];
    const result = validatedContents(contents, parent);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Burger");
  });

  it("drops a breakdown whose items don't actually add up to the parent (bad model arithmetic)", () => {
    const contents = [
      { name: "Burger", calories: 300, protein: 15, carbs: 30, fat: 14 },
      { name: "Fries", calories: 150, protein: 2, carbs: 20, fat: 8 },
      // Missing the drink entirely — sums to 450/17/50/22, nowhere near
      // the parent's 550/25/60/22.
    ];
    expect(validatedContents(contents, parent)).toBeUndefined();
  });

  it("tolerates a few calories/grams of per-item rounding slack, not real mismatches", () => {
    // 3 items each individually rounded can land a gram or two off a
    // parent that was rounded as one number — this must still pass.
    const contents = [
      { name: "Burger", calories: 301, protein: 15, carbs: 30, fat: 14 },
      { name: "Fries", calories: 149, protein: 3, carbs: 20, fat: 8 },
      { name: "Coke", calories: 101, protein: 7, carbs: 11, fat: 0 },
    ];
    expect(validatedContents(contents, parent)).toHaveLength(3);
  });

  it("drops a single-item 'breakdown' with no real content (empty array)", () => {
    expect(validatedContents([], parent)).toBeUndefined();
  });

  it("returns undefined (no breakdown) when contents is missing/not an array", () => {
    expect(validatedContents(undefined, parent)).toBeUndefined();
    expect(validatedContents(null, parent)).toBeUndefined();
    expect(validatedContents("not an array", parent)).toBeUndefined();
  });

  it("filters out an item with no name rather than crashing on it", () => {
    const contents = [
      { name: "Burger", calories: 300, protein: 15, carbs: 30, fat: 14 },
      { calories: 250, protein: 10, carbs: 30, fat: 8 }, // no name
    ];
    // Without the nameless item, the remaining one item (300/15/30/14)
    // doesn't reconcile with the 550/25/60/22 parent, so this correctly
    // drops the whole breakdown rather than silently keeping a partial,
    // now-mismatched one.
    expect(validatedContents(contents, parent)).toBeUndefined();
  });
});

describe("buildSuggestions", () => {
  it("includes a validated contents breakdown on the returned suggestion", () => {
    const raw = [
      {
        name: "Big Mac Meal",
        calories: 550,
        protein: 25,
        carbs: 60,
        fat: 22,
        contents: [
          { name: "Big Mac", calories: 300, protein: 15, carbs: 30, fat: 14 },
          { name: "Medium Fries", calories: 150, protein: 2, carbs: 20, fat: 8 },
          { name: "Coke", calories: 100, protein: 8, carbs: 10, fat: 0 },
        ],
      },
    ];
    const [suggestion] = buildSuggestions(raw);
    expect(suggestion.contents).toHaveLength(3);
    expect(suggestion.calories).toBe(550);
  });

  it("omits 'contents' entirely (not an empty/broken array) when the model's breakdown doesn't reconcile", () => {
    const raw = [
      {
        name: "Big Mac Meal",
        calories: 550,
        protein: 25,
        carbs: 60,
        fat: 22,
        contents: [{ name: "Big Mac", calories: 300, protein: 15, carbs: 30, fat: 14 }], // fries/drink missing
      },
    ];
    const [suggestion] = buildSuggestions(raw);
    expect(suggestion.contents).toBeUndefined();
    expect(suggestion.calories).toBe(550); // the parent total itself is never rejected over this
  });

  it("still works normally for a plain single-item suggestion with no contents at all", () => {
    const raw = [{ name: "Grilled Chicken Salad", calories: 350, protein: 35, carbs: 15, fat: 12 }];
    const [suggestion] = buildSuggestions(raw);
    expect(suggestion.contents).toBeUndefined();
    expect(suggestion.name).toBe("Grilled Chicken Salad");
  });

  it("caps at 3 suggestions and drops any without a name, same as before", () => {
    const raw = [
      { name: "A", calories: 100, protein: 1, carbs: 1, fat: 1 },
      { calories: 100, protein: 1, carbs: 1, fat: 1 }, // no name
      { name: "B", calories: 100, protein: 1, carbs: 1, fat: 1 },
      { name: "C", calories: 100, protein: 1, carbs: 1, fat: 1 },
      { name: "D", calories: 100, protein: 1, carbs: 1, fat: 1 },
    ];
    expect(buildSuggestions(raw)).toHaveLength(3);
  });

  it("returns an empty array when suggestions is missing/not an array", () => {
    expect(buildSuggestions(undefined)).toEqual([]);
    expect(buildSuggestions(null)).toEqual([]);
  });
});
