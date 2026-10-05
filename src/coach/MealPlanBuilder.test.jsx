// @vitest-environment jsdom
//
// Regression coverage for a new meal plan's startDate being stamped in
// UTC instead of local time. `new Date().toISOString().slice(0, 10)`
// reads the UTC calendar day — for any timezone ahead of UTC (this app's
// data is Australia-specific, AEST/AEDT = UTC+10/+11), publishing a
// brand-new plan between local midnight and ~10-11am stores the PREVIOUS
// calendar day as startDate. Since startDate is reused forever once set
// (`existing?.startDate ||`), this is a permanent off-by-one-day anchor
// that shifts "current week"/"current day" in the client's plan viewer
// for the plan's entire lifetime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MealPlanBuilder from "./MealPlanBuilder";

const setMealPlan = vi.fn();
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { masterMeals: [], mealPlans: {} }, setMealPlan }),
}));

const client = { id: "client-a", name: "Alice", nutritionTargets: { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 } };

afterEach(() => {
  cleanup();
  setMealPlan.mockClear();
  vi.useRealTimers();
});

describe("MealPlanBuilder publish", () => {
  it("stamps a brand-new plan's startDate using the LOCAL calendar day, not UTC", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Australia/Sydney";
    vi.useFakeTimers();
    // 8:30am AEDT on Oct 5, 2026 — but still Oct 4 in UTC.
    vi.setSystemTime(new Date("2026-10-04T21:30:00.000Z"));

    render(<MealPlanBuilder client={client} onClose={() => {}} showToast={() => {}} />);
    fireEvent.click(screen.getByText("Publish"));

    expect(setMealPlan).toHaveBeenCalledTimes(1);
    const [, payload] = setMealPlan.mock.calls[0];
    expect(payload.startDate).toBe("2026-10-05");

    process.env.TZ = originalTz;
  });
});
