// @vitest-environment jsdom
//
// The faster logging flows on the Nutrition tab: the Add Food page stays
// open between adds (multi-add), a frequently-logged food re-opens at the
// amount last used, a logged entry can be changed or moved in place
// instead of deleted and re-logged, a previous meal can be copied in one
// tap, a logged meal can be saved as a My Meal, and a saved meal can be
// edited.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionScreen } from "./ClientApp";
import { getAllFoods, scaleFoodByUnit } from "../lib/foodDatabase";
import { sourceSnapshot } from "../lib/nutritionLog";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [], mealPlans: {}, masterMeals: [] },
    currentUser: { id: "client-a" },
    swapMealPlanMeal: vi.fn(),
  }),
}));

const CHICKEN = getAllFoods([]).find((f) => f.name === "Chicken Breast");

function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_MEALS = { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] };
function day(meals = {}) {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, meals: { ...EMPTY_MEALS, ...meals } };
}

function baseProps(overrides = {}) {
  return {
    nutritionByDateKey: { [dateKeyOffset(0)]: day() },
    targets: { calories: 2000, protein: 150, carbs: 200, fat: 70, water: 3 },
    onAddFood: vi.fn(() => Promise.resolve()),
    onAddFoods: vi.fn(() => Promise.resolve()),
    onUpdateFood: vi.fn(() => Promise.resolve()),
    onRemoveFood: vi.fn(() => Promise.resolve()),
    onAddWater: vi.fn(),
    savedMeals: [],
    onCreateSavedMeal: vi.fn(),
    onUpdateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("Add Food page — multi-add", () => {
  it("stays open after each add and keeps a running tally", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    const recent = [
      { id: "r1", name: "Eggs (2 eggs)", baseFoodId: "eggs", unitId: "piece", unitQty: 2, cals: 140, protein: 12, carbs: 1, fat: 10 },
      { id: "r2", name: "Sourdough Bread (60g)", baseFoodId: "sourdough", grams: 60, cals: 160, protein: 6, carbs: 30, fat: 1 },
    ];
    render(<NutritionScreen {...baseProps({ onAddFood, recentFoods: recent })} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));

    await act(async () => fireEvent.click(screen.getByLabelText("Log Eggs")));
    await act(async () => fireEvent.click(screen.getByLabelText("Log Sourdough Bread")));

    expect(onAddFood).toHaveBeenCalledTimes(2);
    expect(onAddFood.mock.calls.map((c) => c[0])).toEqual(["Breakfast", "Breakfast"]);
    // Re-logs at the amount last used, as a new entry (no old id carried over).
    expect(onAddFood.mock.calls[0][1]).toMatchObject({ name: "Eggs (2 eggs)", cals: 140 });
    expect(onAddFood.mock.calls[0][1].id).toBeUndefined();
    // Still on the page, with the tally.
    expect(screen.getByPlaceholderText("Search foods, brands, meals")).toBeTruthy();
    expect(screen.getByText(/added ·/).textContent).toMatch(/2 added · 300 kcal/);
  });

  it("the meal can be switched from the header without leaving the page", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood, recentFoods: [{ id: "r1", name: "Apple", cals: 52, protein: 0, carbs: 14, fat: 0 }] })} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.click(screen.getByLabelText("Choose meal"));
    fireEvent.click(screen.getByRole("button", { name: "Snacks" }));
    await act(async () => fireEvent.click(screen.getByLabelText("Log Apple")));
    expect(onAddFood.mock.calls[0][0]).toBe("Snacks");
  });

  it("a search result's + logs its default serving straight away", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);
    fireEvent.click(screen.getByLabelText("Add food to Lunch"));
    fireEvent.change(screen.getByPlaceholderText("Search foods, brands, meals"), { target: { value: "chicken breast" } });
    await act(async () => fireEvent.click(screen.getByLabelText("Log Chicken Breast")));
    const [meal, entry] = onAddFood.mock.calls[0];
    expect(meal).toBe("Lunch");
    // 150g default serving of 165 kcal/100g, with the source kept for editing later.
    expect(entry).toMatchObject({ cals: 248, grams: 150, unitId: "g" });
    expect(entry.src).toMatchObject({ name: "Chicken Breast", cals: 165 });
  });

  it("shows close matches for a typo", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Lunch"));
    fireEvent.change(screen.getByPlaceholderText("Search foods, brands, meals"), { target: { value: "chiken brest" } });
    expect(screen.getByText(/showing close matches/i)).toBeTruthy();
    expect(screen.getByText("Chicken Breast")).toBeTruthy();
  });

  it("tapping a frequent food opens the food page at the amount last logged", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    const last = { ...scaleFoodByUnit(CHICKEN, "g", 220), id: "old" };
    render(<NutritionScreen {...baseProps({ onAddFood, recentFoods: [last] })} />);
    fireEvent.click(screen.getByLabelText("Add food to Dinner"));
    fireEvent.click(screen.getByText("Chicken Breast"));
    expect(screen.getByLabelText("Amount").value).toBe("220");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Log" })));
    expect(onAddFood.mock.calls[0][0]).toBe("Dinner");
    expect(onAddFood.mock.calls[0][1]).toMatchObject({ cals: 165, grams: 100 });
  });
});

describe("editing a logged entry", () => {
  const entry = { ...scaleFoodByUnit(CHICKEN, "g", 150), id: "e1", src: sourceSnapshot(CHICKEN) };

  it("changes the amount and moves it to another meal in one save", async () => {
    const onUpdateFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onUpdateFood, nutritionByDateKey: { [dateKeyOffset(0)]: day({ Breakfast: [entry] }) } })} />);
    fireEvent.click(screen.getByLabelText("View Breakfast"));
    fireEvent.click(screen.getByLabelText(`Edit ${entry.name}`));
    expect(screen.getByText("Edit Entry")).toBeTruthy();
    expect(screen.getByLabelText("Amount").value).toBe("150");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "300" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Lunch" }).at(-1));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(onUpdateFood).toHaveBeenCalledTimes(1);
    const [fromMeal, entryId, toMeal, food, dateKey] = onUpdateFood.mock.calls[0];
    expect([fromMeal, entryId, toMeal, dateKey]).toEqual(["Breakfast", "e1", "Lunch", dateKeyOffset(0)]);
    expect(food).toMatchObject({ cals: 495, grams: 300 });
  });

  it("can delete the entry from the same page", async () => {
    const onRemoveFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onRemoveFood, nutritionByDateKey: { [dateKeyOffset(0)]: day({ Breakfast: [entry] }) } })} />);
    fireEvent.click(screen.getByLabelText("View Breakfast"));
    fireEvent.click(screen.getByLabelText(`Edit ${entry.name}`));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete entry" })));
    expect(onRemoveFood).toHaveBeenCalledWith("Breakfast", "e1", dateKeyOffset(0));
  });

  it("a whole-meal entry is edited in servings", async () => {
    const onUpdateFood = vi.fn(() => Promise.resolve());
    const meal = { id: "m1", name: "Chicken Bowl", cals: 600, protein: 45, carbs: 60, fat: 18 };
    render(<NutritionScreen {...baseProps({ onUpdateFood, nutritionByDateKey: { [dateKeyOffset(0)]: day({ Dinner: [meal] }) } })} />);
    fireEvent.click(screen.getByLabelText("View Dinner"));
    fireEvent.click(screen.getByLabelText("Edit Chicken Bowl"));
    expect(screen.getByText("Number of servings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "0.5 servings" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(onUpdateFood.mock.calls[0][3]).toMatchObject({ cals: 300, protein: 22.5, servings: 0.5 });
  });
});

describe("copying and saving meals", () => {
  const yesterdayBreakfast = [
    { id: "y1", name: "Oats (dry) (40g)", grams: 40, cals: 152, protein: 5, carbs: 27, fat: 3 },
    { id: "y2", name: "Milk (skim) (200ml)", grams: 200, cals: 70, protein: 7, carbs: 10, fat: 0 },
  ];

  it("an empty meal offers yesterday's same meal in one tap", async () => {
    const onAddFoods = vi.fn(() => Promise.resolve());
    render(
      <NutritionScreen
        {...baseProps({ onAddFoods, nutritionByDateKey: { [dateKeyOffset(0)]: day(), [dateKeyOffset(1)]: day({ Breakfast: yesterdayBreakfast }) } })}
      />
    );
    await act(async () => fireEvent.click(screen.getByText(/Same as yesterday · 222 kcal/)));
    expect(onAddFoods).toHaveBeenCalledTimes(1);
    const [meal, foods, dateKey] = onAddFoods.mock.calls[0];
    expect(meal).toBe("Breakfast");
    expect(dateKey).toBe(dateKeyOffset(0));
    expect(foods.map((f) => f.name)).toEqual(["Oats (dry) (40g)", "Milk (skim) (200ml)"]);
    // New entries get their own ids — the old ones aren't reused.
    expect(foods.every((f) => f.id === undefined)).toBe(true);
  });

  it("Copy meal on the Add Food page copies any meal from the last two weeks", async () => {
    const onAddFoods = vi.fn(() => Promise.resolve());
    render(
      <NutritionScreen
        {...baseProps({ onAddFoods, nutritionByDateKey: { [dateKeyOffset(0)]: day(), [dateKeyOffset(3)]: day({ Lunch: yesterdayBreakfast }) } })}
      />
    );
    fireEvent.click(screen.getByLabelText("Add food to Snacks"));
    fireEvent.click(screen.getByText("Copy meal"));
    const copyButton = screen.getAllByRole("button").find((b) => /^Copy .* Lunch$/.test(b.getAttribute("aria-label") || ""));
    await act(async () => fireEvent.click(copyButton));
    expect(onAddFoods.mock.calls[0][0]).toBe("Snacks");
    expect(onAddFoods.mock.calls[0][1]).toHaveLength(2);
  });

  it("a logged meal can be saved as a My Meal", () => {
    render(<NutritionScreen {...baseProps({ nutritionByDateKey: { [dateKeyOffset(0)]: day({ Breakfast: yesterdayBreakfast }) } })} />);
    fireEvent.click(screen.getByLabelText("View Breakfast"));
    fireEvent.click(screen.getByText("Save as meal"));
    expect(screen.getByText("Create Meal")).toBeTruthy();
    expect(screen.getByDisplayValue("Breakfast")).toBeTruthy();
    expect(screen.getByText("Oats (dry) (40g)")).toBeTruthy();
  });

  it("a saved meal can be edited in place", () => {
    const onUpdateSavedMeal = vi.fn();
    const saved = { id: "sm1", name: "Protein Oats", cals: 400, protein: 30, carbs: 50, fat: 8, ingredients: [{ id: "i1", name: "Oats", cals: 400, protein: 30, carbs: 50, fat: 8 }] };
    render(<NutritionScreen {...baseProps({ onUpdateSavedMeal, savedMeals: [saved] })} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.click(screen.getByText("My Meals"));
    fireEvent.click(screen.getByText("Protein Oats"));
    expect(screen.getByText("Edit Meal")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Protein Oats"), { target: { value: "Big Protein Oats" } });
    fireEvent.click(screen.getAllByRole("button").find((b) => /save/i.test(b.textContent) && !b.disabled && /meal/i.test(b.textContent)));
    expect(onUpdateSavedMeal).toHaveBeenCalledWith("sm1", expect.objectContaining({ name: "Big Protein Oats" }));
  });
});
