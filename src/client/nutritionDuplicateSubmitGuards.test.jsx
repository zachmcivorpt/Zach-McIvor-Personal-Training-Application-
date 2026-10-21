// @vitest-environment jsdom
//
// Nutrition Overhaul audit finding: FoodQuantitySheet's ADD button was
// already double-tap safe (see foodQuantityDoubleAdd.test.jsx) and
// ClientApp.jsx's guardedAdd/addBusyRef already protects every direct-log
// path (saved meals, recent foods, photo "ADD TO TODAY"). But three
// sibling write paths had no equivalent guard at all: QuickAddFoodSheet's
// "Log it" (creates a shared customFoods doc), CreateMealSheet's "Save"
// (creates a saved-meal doc), and PhotoEstimateSheet's "ALSO SAVE AS A
// MEAL" (same). Each of these fires a synchronous, fire-and-forget
// Firestore write with no "saving" state to disable the button on a
// genuine double-tap before the sheet closes — a real double-tap could
// create two duplicate library/saved-meal docs for the same food/meal.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickAddFoodSheet, CreateMealSheet, PhotoEstimateSheet } from "./NutritionFeatures";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [] },
    createFood: vi.fn((data) => ({ id: `cf_${Math.random().toString(36).slice(2, 8)}`, ...data })),
    updateFood: vi.fn(),
    findCustomFoodByBarcode: vi.fn(async () => null),
  }),
}));

vi.mock("../lib/image", () => ({
  fileToCompressedDataUrl: vi.fn(async () => "data:image/jpeg;base64,fake"),
}));

afterEach(() => cleanup());

describe("QuickAddFoodSheet — double-tap on 'Log it' creates only one food", () => {
  it("calls onAdd only once for two rapid taps", () => {
    const onAdd = vi.fn();
    render(<QuickAddFoodSheet open onClose={() => {}} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Honey Chicken Sushi Roll"), { target: { value: "Test Food" } });
    const [calsInput] = screen.getAllByPlaceholderText("cals");
    fireEvent.change(calsInput, { target: { value: "200" } });

    const button = screen.getByText("Log it").closest("button");
    fireEvent.click(button);
    fireEvent.click(button); // a second, impatient tap

    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("CreateMealSheet — double-tap on 'Save' creates only one saved meal", () => {
  it("calls onSave only once for two rapid taps", () => {
    const onSave = vi.fn();
    render(<CreateMealSheet open onClose={() => {}} onSave={onSave} prefill={{ name: "My Meal", ingredients: [{ id: "i1", name: "Chicken", cals: 165, protein: 31, carbs: 0, fat: 3.6 }] }} />);

    const button = screen.getByText("SAVE MEAL").closest("button");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("PhotoEstimateSheet — double-tap on 'ALSO SAVE AS A MEAL' creates only one saved meal", () => {
  it("calls onSaveAsMeal only once for two rapid taps", async () => {
    const onAdd = vi.fn();
    const onSaveAsMeal = vi.fn();
    render(<PhotoEstimateSheet open onClose={() => {}} onAdd={onAdd} onSaveAsMeal={onSaveAsMeal} />);

    // Picking a photo (even a fake one, compression mocked above) is what
    // moves the sheet from "pick" to "build" status.
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["fake"], "meal.jpg", { type: "image/jpeg" });
    await fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.change(await screen.findByPlaceholderText("e.g. Lunch"), { target: { value: "My Lunch" } });
    fireEvent.click(screen.getByText(/Add manually/));
    fireEvent.change(screen.getByPlaceholderText("Ingredient name"), { target: { value: "Rice" } });
    fireEvent.click(screen.getAllByText("Add").at(-1).closest("button"));

    const saveButton = screen.getByText("ALSO SAVE AS A MEAL").closest("button");
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSaveAsMeal).toHaveBeenCalledTimes(1);
  });
});
