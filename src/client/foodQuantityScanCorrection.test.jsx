// @vitest-environment jsdom
//
// Barcode scan reliability: when a scanned product's data fails validation
// (nutritionSuspect, from barcodeLookup.js's Atwater/range check) or is
// missing a macro field entirely (missingNutritionFields), the client used
// to have no way to react from this sheet except closing it and starting
// over in search/manual entry — the flagged numbers were otherwise logged
// as-is if they tapped ADD anyway. FoodQuantitySheet now offers an inline
// "Enter the correct numbers from the label" correction form for exactly
// this case, wired through the new onSaveCorrection prop.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FoodQuantitySheet } from "./NutritionFeatures";

afterEach(() => cleanup());

const SUSPECT_FOOD = {
  id: "off_1",
  name: "Protein Smoothie Choc Honeycomb",
  brand: "Rokeby",
  cals: 253,
  protein: 7.1,
  carbs: 4.3,
  fat: 1.5,
  per: 100,
  defaultQty: 425,
  fromBarcode: true,
  liquid: true,
  nutritionSuspect: true,
  nutritionSuspectReason: "label says 253 cal, but 7.1g protein + 4.3g carbs + 1.5g fat works out to ~59 cal",
  verificationLevel: "REVIEW",
};

const MISSING_FIELD_FOOD = {
  id: "off_2",
  name: "Incomplete Label Bar",
  cals: 180,
  protein: 5,
  carbs: 0,
  fat: 0,
  per: 100,
  defaultQty: 40,
  fromBarcode: true,
  missingNutritionFields: ["carbs", "fat"],
  verificationLevel: "UNVERIFIED",
};

describe("FoodQuantitySheet — scanned-data correction", () => {
  it("offers a correction button for a nutritionSuspect scan when onSaveCorrection is provided", () => {
    render(<FoodQuantitySheet food={SUSPECT_FOOD} onClose={() => {}} onConfirm={() => {}} onSaveCorrection={vi.fn()} />);
    expect(screen.getByText("Enter the correct numbers from the label")).toBeTruthy();
  });

  it("does not offer a correction button when no onSaveCorrection handler is given", () => {
    render(<FoodQuantitySheet food={SUSPECT_FOOD} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText("Enter the correct numbers from the label")).toBeNull();
  });

  it("flags missing macro fields with their own banner, distinct from the suspect-data banner", () => {
    render(<FoodQuantitySheet food={MISSING_FIELD_FOOD} onClose={() => {}} onConfirm={() => {}} onSaveCorrection={vi.fn()} />);
    expect(screen.getByText("Missing carbs, fat data")).toBeTruthy();
    expect(screen.queryByText("Double-check this against the label")).toBeNull();
  });

  it("submits typed-in values via onSaveCorrection and hides the warning banner once corrected", () => {
    const onSaveCorrection = vi.fn();
    const { rerender } = render(<FoodQuantitySheet food={SUSPECT_FOOD} onClose={() => {}} onConfirm={() => {}} onSaveCorrection={onSaveCorrection} />);
    fireEvent.click(screen.getByText("Enter the correct numbers from the label"));
    const inputs = document.querySelectorAll('input[type="number"][placeholder]');
    fireEvent.change(inputs[0], { target: { value: "63" } }); // cals
    fireEvent.change(inputs[1], { target: { value: "7.1" } }); // protein
    fireEvent.change(inputs[2], { target: { value: "4.3" } }); // carbs
    fireEvent.change(inputs[3], { target: { value: "1.5" } }); // fat
    fireEvent.click(screen.getByText("Save correction"));
    expect(onSaveCorrection).toHaveBeenCalledWith({ cals: "63", protein: "7.1", carbs: "4.3", fat: "1.5" });

    // Parent applies the correction by replacing `food` — the sheet then
    // reflects the cleared flags instead of still showing the old warning.
    const corrected = { ...SUSPECT_FOOD, cals: 63, nutritionSuspect: false, correctedByUser: true, verificationLevel: "VERIFIED" };
    rerender(<FoodQuantitySheet food={corrected} onClose={() => {}} onConfirm={() => {}} onSaveCorrection={onSaveCorrection} />);
    expect(screen.queryByText("Double-check this against the label")).toBeNull();
    expect(screen.getByText("Verified")).toBeTruthy();
  });

  it("cancelling the correction form restores the warning banner without calling onSaveCorrection", () => {
    const onSaveCorrection = vi.fn();
    render(<FoodQuantitySheet food={SUSPECT_FOOD} onClose={() => {}} onConfirm={() => {}} onSaveCorrection={onSaveCorrection} />);
    fireEvent.click(screen.getByText("Enter the correct numbers from the label"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Double-check this against the label")).toBeTruthy();
    expect(onSaveCorrection).not.toHaveBeenCalled();
  });
});
