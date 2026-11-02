// @vitest-environment jsdom
//
// The coach's Nutrition Adherence score counted a day as "logged" whenever
// that day's nutritionLogs doc existed — and tapping +250ml of water alone
// creates it. A water-only day was then scored as logged-but-missed every
// calorie and protein target (non-adherence) instead of not tracked. And
// the window ended today, so every morning's half-logged day counted as a
// miss too. It now scores food-logged days only, over completed days.
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/AppContext", () => ({ useApp: () => ({}) }));
vi.mock("../lib/firebase", () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const { adherenceWindows } = await import("./CoachClientDetail");

function key(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const targets = { calories: 2000, protein: 150, carbs: 200, fat: 70 };
const fullDay = (daysAgo) => ({
  date: key(daysAgo),
  calories: 2000,
  protein: 160,
  meals: { Breakfast: [{ id: "a", name: "x", cals: 600 }], Lunch: [{ id: "b", name: "y", cals: 700 }], Dinner: [{ id: "c", name: "z", cals: 700 }] },
});

describe("Nutrition Adherence windows", () => {
  it("doesn't count a water-only day as logged", () => {
    const logs = [{ date: key(1), water: 2, calories: 0, protein: 0, meals: { Breakfast: [] } }, fullDay(2)];
    const r = adherenceWindows(logs, targets, 7).current;
    expect(r.loggedCount).toBe(1);
    expect(r.dayDetails.filter((d) => d.logged)).toHaveLength(1);
  });

  it("scored over completed days, today's half-logged day can't count as a miss", () => {
    const halfToday = { date: key(0), calories: 400, protein: 20, meals: { Breakfast: [{ id: "a", name: "x", cals: 400 }] } };
    const logs = [halfToday, ...[1, 2, 3, 4, 5, 6, 7].map(fullDay)];
    const r = adherenceWindows(logs, targets, 7).current;
    expect(r.loggedCount).toBe(7);
    expect(r.calorieConsistency).toBe(100);
    expect(r.proteinConsistency).toBe(100);
  });
});
