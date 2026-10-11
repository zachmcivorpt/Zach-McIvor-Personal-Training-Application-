// @vitest-environment jsdom
//
// Barcode-scanning workflow audit finding: a product discovered via barcode
// (or an AFCD label correction, or a coach's own manual addition) is saved
// to the shared `customFoods` Firestore collection and is searchable in
// NutritionScreen's main "Add to [meal]" flow (see allFoods in
// ClientApp.jsx) — but CreateMealSheet (used both by clients building a
// saved meal AND by coaches building reusable meals in CoachMealLibrary)
// and PhotoEstimateSheet's ingredient picker only ever searched the static
// FOOD_DATABASE, never customFoods. A client scanning a product and a
// coach later trying to add that exact same product to a meal plan would
// find nothing — the shared-library promise ("other clients can find and
// log it through normal food search") silently didn't hold everywhere the
// library is actually used.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreateMealSheet, PhotoEstimateSheet } from "./NutritionFeatures";

// A name guaranteed not to collide with any real FOOD_DATABASE entry — the
// point of this test is to prove customFoods is searched at all, not to
// re-litigate matching/dedup logic against real data.
const SCANNED_PRODUCT = { id: "cf_scanned1", name: "ZzzTestBrand Discovered Snack", cals: 500, protein: 5, carbs: 65, fat: 25, per: 100, defaultQty: 30, barcode: "9300000000142", fromBarcode: true };

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [SCANNED_PRODUCT] },
    createFood: vi.fn((data) => ({ id: `cf_${Math.random().toString(36).slice(2, 8)}`, ...data })),
    updateFood: vi.fn(),
    findCustomFoodByBarcode: vi.fn(async () => null),
  }),
}));

vi.mock("../lib/image", () => ({
  fileToCompressedDataUrl: vi.fn(async () => "data:image/jpeg;base64,fake"),
}));

afterEach(() => cleanup());

describe("CreateMealSheet — ingredient search includes the shared customFoods library", () => {
  it("finds a barcode-discovered product by name, not just FOOD_DATABASE", () => {
    render(<CreateMealSheet open onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search foods"), { target: { value: "ZzzTestBrand" } });
    expect(screen.getByText("ZzzTestBrand Discovered Snack")).toBeTruthy();
  });
});

describe("PhotoEstimateSheet — ingredient search includes the shared customFoods library", () => {
  it("finds a barcode-discovered product by name, not just FOOD_DATABASE", async () => {
    render(<PhotoEstimateSheet open onClose={() => {}} onAdd={() => {}} onSaveAsMeal={() => {}} />);
    const file = new File(["fake"], "meal.jpg", { type: "image/jpeg" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByPlaceholderText("Search foods");
    fireEvent.change(screen.getByPlaceholderText("Search foods"), { target: { value: "ZzzTestBrand" } });
    expect(screen.getByText("ZzzTestBrand Discovered Snack")).toBeTruthy();
  });
});
