// @vitest-environment jsdom
//
// Regression coverage for a real production report: a client logged a
// single "Pea Protein Shake," and it landed in the food log twice. The
// quantity sheet's own ADD button was already guarded against a fast
// double-tap (see foodQuantityDoubleAdd.test.jsx), but several other
// direct-add paths in NutritionScreen were not: a recent food's row, a
// saved meal's own Plus button, and a saved meal matched by search all
// called onAddFood straight through with nothing stopping a second,
// near-simultaneous tap (the common real-world cause: a touchstart/click
// double-fire, or just an impatient second tap before any visual feedback
// appears) from firing it twice. Fixed by routing all of them through a
// single ref-based guard (NutritionScreen's `guardedAdd`) that drops a
// second call while the first is still in flight — a ref rather than
// state because two taps in the same tick can both run before a state
// update's re-render ever lands.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionScreen } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [], mealPlans: {}, masterMeals: [] },
    currentUser: { id: "client-a" },
    swapMealPlanMeal: vi.fn(),
  }),
}));

const DEFAULT_NUTRITION = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  water: 0,
  meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] },
};

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function baseProps(overrides = {}) {
  return {
    nutritionByDateKey: { [todayKey()]: DEFAULT_NUTRITION },
    targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
    onAddFood: vi.fn(() => Promise.resolve()),
    onRemoveFood: vi.fn(),
    onAddWater: vi.fn(),
    savedMeals: [],
    onCreateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

afterEach(() => cleanup());

describe("NutritionScreen duplicate-add guard", () => {
  it("only logs a recent food once even when its row is tapped twice in quick succession", async () => {
    const { promise, resolve } = deferred();
    const onAddFood = vi.fn(() => promise);
    render(
      <NutritionScreen
        {...baseProps({
          onAddFood,
          recentFoods: [{ id: "f1", name: "Pea Protein Shake", cals: 200, protein: 30, carbs: 10, fat: 5 }],
        })}
      />
    );

    fireEvent.click(screen.getAllByText("Log")[0]);
    const row = screen.getByText("Pea Protein Shake").closest("button");
    fireEvent.click(row);
    fireEvent.click(row); // a second, near-simultaneous tap before the first add has settled

    expect(onAddFood).toHaveBeenCalledTimes(1);
    resolve();
    await promise;
  });

  it("only logs a saved meal once even when its own Plus button is tapped twice in quick succession", async () => {
    const { promise, resolve } = deferred();
    const onAddFood = vi.fn(() => promise);
    render(
      <NutritionScreen
        {...baseProps({
          onAddFood,
          savedMeals: [{ id: "m1", name: "Pea Protein Shake", cals: 200, protein: 30, carbs: 10, fat: 5 }],
        })}
      />
    );

    fireEvent.click(screen.getAllByText("Log")[0]);
    fireEvent.click(screen.getByText("My Meals"));
    const plusButtons = screen.getAllByRole("button").filter((b) => b.querySelector(".lucide-plus"));
    const mealPlusButton = plusButtons.find((b) => b.className.includes("rounded-full"));
    fireEvent.click(mealPlusButton);
    fireEvent.click(mealPlusButton);

    expect(onAddFood).toHaveBeenCalledTimes(1);
    resolve();
    await promise;
  });
});
