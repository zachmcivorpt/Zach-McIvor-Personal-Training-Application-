// @vitest-environment jsdom
//
// Regression coverage for custom food macros accepting negative values.
// QuickAddFoodSheet.submit() (and the barcode sheet's identical "add
// manually" path) did `Number(manual.cals) || 0` with no clamp, so a
// client could type e.g. "-500" into calories and save it straight to
// the SHARED food library (searchable by every client). Logging it then
// subtracted from a day's total with no floor either, so a day's
// calorie/macro totals could be pushed below zero.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickAddFoodSheet } from "./NutritionFeatures";

const createFood = vi.fn((data) => ({ id: "food-1", ...data }));
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ createFood }) }));

afterEach(() => {
  cleanup();
  createFood.mockClear();
});

describe("QuickAddFoodSheet manual entry", () => {
  it("clamps negative macro values to zero before saving to the shared food library", () => {
    const onAdd = vi.fn();
    render(<QuickAddFoodSheet open onClose={() => {}} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText(/Honey Chicken Sushi Roll/), { target: { value: "Test Food" } });
    fireEvent.change(screen.getByPlaceholderText("cals"), { target: { value: "-500" } });
    fireEvent.change(screen.getByPlaceholderText("protein"), { target: { value: "-10" } });
    fireEvent.change(screen.getByPlaceholderText("carbs"), { target: { value: "-20" } });
    fireEvent.change(screen.getByPlaceholderText("fat"), { target: { value: "-5" } });

    fireEvent.click(screen.getByText("Log it"));

    expect(createFood).toHaveBeenCalledTimes(1);
    const saved = createFood.mock.calls[0][0];
    expect(saved.cals).toBe(0);
    expect(saved.protein).toBe(0);
    expect(saved.carbs).toBe(0);
    expect(saved.fat).toBe(0);
  });

  it("still saves ordinary positive values unchanged", () => {
    const onAdd = vi.fn();
    render(<QuickAddFoodSheet open onClose={() => {}} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText(/Honey Chicken Sushi Roll/), { target: { value: "Chicken Breast" } });
    fireEvent.change(screen.getByPlaceholderText("cals"), { target: { value: "165" } });
    fireEvent.change(screen.getByPlaceholderText("protein"), { target: { value: "31" } });
    fireEvent.change(screen.getByPlaceholderText("carbs"), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText("fat"), { target: { value: "3.6" } });

    fireEvent.click(screen.getByText("Log it"));

    const saved = createFood.mock.calls[0][0];
    expect(saved.cals).toBe(165);
    expect(saved.protein).toBe(31);
    expect(saved.fat).toBe(3.6);
  });
});
