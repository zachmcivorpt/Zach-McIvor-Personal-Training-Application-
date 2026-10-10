// Fuel IQ's local suggestion engine must match the client's current local
// time / meal period when no explicit meal-type keyword is in the message
// (e.g. tapping "McDonald's" or "Not sure what to eat" rather than typing
// "breakfast"), while still respecting an explicit keyword when present,
// and falling back gracefully for chains with no breakfast menu at all.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalNutritionSuggestion } from "./restaurantNutrition";

function baseContext(overrides = {}) {
  return {
    caloriesRemaining: 700,
    proteinRemaining: 40,
    carbsRemaining: 60,
    fatRemaining: 25,
    calorieTarget: 2000,
    proteinTarget: 150,
    allergies: "",
    dietaryPreferences: [],
    goal: "",
    ...overrides,
  };
}

function setHour(hour) {
  const now = new Date();
  now.setHours(hour, 0, 0, 0);
  vi.setSystemTime(now);
}

describe("getLocalNutritionSuggestion — time-of-day meal matching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("McDonald's at 9am suggests breakfast menu items only", () => {
    setHour(9);
    const { suggestions } = getLocalNutritionSuggestion("McDonald's", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(/mcmuffin|hash brown|brekkie|egg/i.test(s.name)).toBe(true);
    }
  });

  it("McDonald's at 1pm excludes breakfast-only items", () => {
    setHour(13);
    const { suggestions } = getLocalNutritionSuggestion("McDonald's", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(/mcmuffin|hash brown|brekkie/i.test(s.name)).toBe(false);
    }
  });

  it("McDonald's at 7pm excludes breakfast-only items", () => {
    setHour(19);
    const { suggestions } = getLocalNutritionSuggestion("McDonald's", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(/mcmuffin|hash brown|brekkie/i.test(s.name)).toBe(false);
    }
  });

  it("a chain with no breakfast menu (KFC) still returns suggestions at 9am via fallback", () => {
    setHour(9);
    const { suggestions } = getLocalNutritionSuggestion("KFC", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("'Not sure what to eat' at 1pm returns lunch-tagged home-meal candidates", () => {
    setHour(13);
    const { suggestions } = getLocalNutritionSuggestion("Not sure what to eat", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("an explicit 'dinner' keyword overrides the current-time default even at 9am", () => {
    setHour(9);
    const atTime = getLocalNutritionSuggestion("McDonald's", baseContext(), []);
    const explicit = getLocalNutritionSuggestion("McDonald's dinner", baseContext(), []);
    for (const s of atTime.suggestions) {
      expect(/mcmuffin|hash brown|brekkie|egg/i.test(s.name)).toBe(true);
    }
    for (const s of explicit.suggestions) {
      expect(/mcmuffin|hash brown|brekkie/i.test(s.name)).toBe(false);
    }
  });

  it("Macro Match at McDonald's at 9am only builds combos from breakfast items", () => {
    setHour(9);
    const { suggestions } = getLocalNutritionSuggestion("macro match McDonald's", baseContext(), []);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      const itemNames = s.contents ? s.contents.map((c) => c.name) : [s.name];
      for (const name of itemNames) {
        expect(/mcmuffin|hash brown|brekkie|egg/i.test(name)).toBe(true);
      }
    }
  });
});
