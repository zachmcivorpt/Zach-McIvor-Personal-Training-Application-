import { describe, it, expect } from "vitest";
import { mealPlanEndDateKey, isMealPlanEnded } from "./mealPlanEnd";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fn = require("../../functions/mealPlanEnd.js");

const week = (w) => Array.from({ length: 7 }, (_, i) => ({ id: `w${w}d${i}`, weekIndex: w, meals: {} }));
const oneWeek = { startDate: "2026-10-01", days: week(0) };
const twoWeeks = { startDate: "2026-10-01", days: [...week(0), ...week(1)] };

describe("meal guide end date (checked by hand)", () => {
  it("a 1-week guide from 1 Oct ends 7 Oct; 2 weeks ends 14 Oct", () => {
    expect(mealPlanEndDateKey(oneWeek)).toBe("2026-10-07");
    expect(mealPlanEndDateKey(twoWeeks)).toBe("2026-10-14");
  });

  it("crosses a month end (28 Oct + 1 week → 3 Nov)", () => {
    expect(mealPlanEndDateKey({ startDate: "2026-10-28", days: week(0) })).toBe("2026-11-03");
  });

  it("older plans without weekIndex count in blocks of 7 days (10 days = 2 weeks)", () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, meals: {} }));
    expect(mealPlanEndDateKey({ startDate: "2026-10-01", days })).toBe("2026-10-14");
  });

  it("still shows on its last day, gone the day after", () => {
    expect(isMealPlanEnded(oneWeek, "2026-10-07")).toBe(false);
    expect(isMealPlanEnded(oneWeek, "2026-10-08")).toBe(true);
    expect(isMealPlanEnded(oneWeek, "2026-09-30")).toBe(false);
  });

  it("a plan with no start date or no days never ends on its own", () => {
    expect(isMealPlanEnded({ days: week(0) }, "2030-01-01")).toBe(false);
    expect(isMealPlanEnded({ startDate: "2026-10-01", days: [] }, "2030-01-01")).toBe(false);
    expect(isMealPlanEnded(null, "2030-01-01")).toBe(false);
  });

  it("the Cloud Function's copy of the rule gives the same end dates", () => {
    for (const plan of [oneWeek, twoWeeks, { startDate: "2026-10-28", days: week(0) }]) {
      expect(fn.mealPlanEndDateKey(plan)).toBe(mealPlanEndDateKey(plan));
    }
  });
});

describe("coach reminder push", () => {
  it("fires 2 days before, on the last day and the day after — not otherwise", () => {
    const r = (today) => fn.mealPlanReminder(oneWeek, "Alice", today);
    expect(r("2026-10-04")).toBeNull();
    expect(r("2026-10-05").title).toBe("Meal guide ending soon");
    expect(r("2026-10-05").body).toContain("Alice");
    expect(r("2026-10-06")).toBeNull();
    expect(r("2026-10-07").title).toBe("Meal guide ends today");
    expect(r("2026-10-08").title).toBe("Meal guide ended");
    expect(r("2026-10-09")).toBeNull();
    expect(fn.mealPlanReminder({ days: week(0) }, "Alice", "2026-10-08")).toBeNull();
  });
});
