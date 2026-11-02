// Ranked food search (foodSearch.js) against the real built-in library.
// The old plain filter returned matches in database order: "rice" led with
// Rice Protein Powder, "apple" listed Pineapple second, a typo found
// nothing, and a client's everyday foods were buried.
import { describe, expect, it } from "vitest";
import { getAllFoods } from "./foodDatabase";
import { AFCD_FOODS } from "./afcdFoods";
import { rankFoods } from "./foodSearch";

const ALL = getAllFoods([]);
const names = (r) => r.results.map((f) => f.name);

describe("rankFoods", () => {
  it("returns nothing for an empty query", () => {
    expect(rankFoods("", ALL).results).toEqual([]);
    expect(rankFoods("   ", ALL).results).toEqual([]);
  });

  it("puts the plain food ahead of foods that merely contain the word", () => {
    const apple = names(rankFoods("apple", ALL));
    expect(apple[0]).toBe("Apple");
    expect(apple.indexOf("Apple Pie")).toBeLessThan(apple.indexOf("Pineapple"));
    expect(names(rankFoods("chicken", ALL))[0]).toBe("Chicken Breast");
    expect(names(rankFoods("banana", ALL))[0]).toBe("Banana");
    expect(names(rankFoods("avocado", ALL))[0]).toBe("Avocado");
  });

  it("keeps supplements out of the top results unless they're searched for", () => {
    const rice = names(rankFoods("rice", ALL));
    expect(rice.slice(0, 5).some((n) => /powder/i.test(n))).toBe(false);
    expect(rice.slice(0, 6)).toContain("White Rice (cooked)");
    // …but asked for directly, they come first.
    expect(names(rankFoods("protein powder", ALL))[0]).toMatch(/Protein Powder/);
  });

  it("still requires every word, in any order", () => {
    const r = names(rankFoods("breast chicken", ALL));
    expect(r[0]).toBe("Chicken Breast");
    expect(r.every((n) => /breast/i.test(n) && /chicken/i.test(n))).toBe(true);
  });

  it("falls back to close matches for a typo, flagged as fuzzy", () => {
    const r = rankFoods("chiken", ALL);
    expect(r.fuzzy).toBe(true);
    expect(r.results[0].name).toBe("Chicken Breast");
    expect(rankFoods("brocoli", ALL).results[0].name).toMatch(/Broccoli/);
  });

  it("does not report fuzzy when exact matches exist, and finds nothing for gibberish", () => {
    expect(rankFoods("chicken", ALL).fuzzy).toBe(false);
    expect(rankFoods("zzqxv", ALL).results).toEqual([]);
  });

  it("puts the client's own most-logged food first", () => {
    const target = ALL.find((f) => f.name === "Brown Rice (cooked)");
    const counts = new Map([[target.id.toLowerCase(), 12]]);
    expect(names(rankFoods("rice", ALL, { historyCounts: counts }))[0]).toBe("Brown Rice (cooked)");
  });

  it("works on the AFCD list and tolerates entries with no name", () => {
    expect(rankFoods("rice", AFCD_FOODS).results.length).toBeGreaterThan(0);
    expect(() => rankFoods("rice", [{ id: "x" }, null, { id: "y", name: "Rice" }])).not.toThrow();
  });
});
