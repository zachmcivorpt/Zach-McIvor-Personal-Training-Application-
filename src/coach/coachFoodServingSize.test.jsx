// @vitest-environment jsdom
//
// Regression coverage for a real gap found auditing the serving-size
// system: the coach's "Add Food" sheet (CoachFoodLibrary.jsx) had no
// serving-size field at all — only name/cals/protein/carbs/fat — so every
// coach-added food silently saved with no `per`/`defaultQty`, defaulting
// everywhere else in the app to "per 100g" regardless of what serving
// size the coach actually typed the macros for. The name field's own hint
// used to say "Include the serving size, e.g. Chicken Breast (150g)" —
// i.e. serving size was only ever a convention baked into the name
// string, never a real, scalable field. This locks in the fix: a real
// "SERVING SIZE THE MACROS BELOW ARE FOR" field, saved as per/defaultQty,
// mirroring QuickAddFoodSheet's client-side equivalent exactly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FoodSheet } from "./CoachFoodLibrary";

const createFood = vi.fn((data) => ({ id: "food-1", ...data }));
const updateFood = vi.fn();
const deleteFood = vi.fn();
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ createFood, updateFood, deleteFood }) }));

afterEach(() => {
  cleanup();
  createFood.mockClear();
  updateFood.mockClear();
  deleteFood.mockClear();
});

describe("Coach Add Food — serving size", () => {
  it("saves per/defaultQty from the new serving-size field, not just name/macros", () => {
    render(<FoodSheet food={null} open onClose={() => {}} showToast={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Chicken Breast"), { target: { value: "Chicken Breast" } });
    fireEvent.change(screen.getByPlaceholderText("100"), { target: { value: "150" } });
    fireEvent.change(screen.getAllByPlaceholderText("0")[0], { target: { value: "248" } }); // calories (first "0" placeholder)

    fireEvent.click(screen.getByText("ADD FOOD"));

    expect(createFood).toHaveBeenCalledTimes(1);
    const saved = createFood.mock.calls[0][0];
    expect(saved.name).toBe("Chicken Breast");
    expect(saved.per).toBe(150);
    expect(saved.defaultQty).toBe(150);
    expect(saved.cals).toBe(248);
  });

  it("falls back to a sensible 100g default when the serving-size field is left blank", () => {
    render(<FoodSheet food={null} open onClose={() => {}} showToast={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Chicken Breast"), { target: { value: "Mystery Snack" } });
    const calsInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(calsInputs[0], { target: { value: "100" } });

    fireEvent.click(screen.getByText("ADD FOOD"));

    const saved = createFood.mock.calls[0][0];
    expect(saved.per).toBe(100);
    expect(saved.defaultQty).toBe(100);
  });

  // A zero/negative serving size is blocked at the browser level by the
  // field's own min={1} constraint (same pattern the pre-existing cals/
  // protein/carbs/fat fields on this sheet already use via min={0}), so
  // it can't reach submit() through the UI at all — see sanitizeFoodUnits'
  // own dedicated tests in foodDatabase.test.js for the server-side
  // backstop that still clamps it (0/negative/non-numeric) for any path
  // that bypasses the browser's own validation (a barcode import, a
  // direct Firestore write, a future AI-suggested food).

  it("pre-fills the serving-size field from an existing food when editing", () => {
    const existing = { id: "f1", name: "Tuna (canned)", cals: 116, protein: 26, carbs: 0, fat: 1, per: 85, defaultQty: 85 };
    render(<FoodSheet food={existing} open onClose={() => {}} showToast={() => {}} />);

    expect(screen.getByDisplayValue("85")).toBeTruthy();

    fireEvent.click(screen.getByText("SAVE CHANGES"));
    const saved = updateFood.mock.calls[0][1];
    expect(saved.per).toBe(85);
    expect(saved.defaultQty).toBe(85);
  });
});
