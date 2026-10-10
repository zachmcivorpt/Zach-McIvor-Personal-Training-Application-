// @vitest-environment jsdom
//
// Regression coverage for a real production report: a scanned sports
// drink ("Berry Ice," a Powerade — 27 cal/100ml) offered "tbsps" as a
// loggable unit at all, and the quantity sheet even defaulted to it (1
// tbsp selected, "4 Cals / 0g protein / 0.9g carbs / 0g fat" — a 15ml
// serving) instead of the full 600ml the barcode's own package data gave.
// Nobody measures a drink in tablespoons.
//
// Two compounding bugs: (1) FoodQuantitySheet's default-unit effect was
// hardcoded to `setUnitId("g")` regardless of what kind of food it was —
// for a liquid (whose own unit list no longer even contains "g", since
// liquids correctly use ml as their base unit) this meant the sheet
// opened on a unit that didn't exist in its own picker, silently falling
// back elsewhere in the component to a plain UNIT_DEFS.g — mislabeling
// the quantity and logging the entry under the wrong unit entirely.
// (2) the auto-unit classifier handed every liquid tbsp/tsp
// unconditionally — right for a pourable cooking liquid (oil, cream) but
// wrong for an actual drink.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FoodQuantitySheet } from "./NutritionFeatures";

afterEach(() => cleanup());

const BERRY_ICE = {
  id: "off_123",
  name: "Berry Ice",
  brand: "Powerade",
  cals: 27,
  protein: 0,
  carbs: 6,
  fat: 0,
  per: 100,
  defaultQty: 600,
  fromBarcode: true,
  liquid: true,
  containerGrams: 600,
  verificationLevel: "VERIFIED",
};

describe("FoodQuantitySheet — correct default unit for a scanned drink", () => {
  it("defaults to ml (the drink's real package size), not grams or tbsp", () => {
    render(<FoodQuantitySheet food={BERRY_ICE} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByDisplayValue("600")).toBeTruthy();
    // "ml" is the selected unit chip (dark/selected styling, and uses
    // "transition-colors" — unique to the top unit-selector row, unlike
    // the quantity presets below it) — "tbsps" doesn't even appear for a
    // drink (see the next test).
    const mlChip = screen.getAllByText("ml").map((el) => el.closest("button")).find((b) => b.className.includes("transition-colors"));
    expect(mlChip.className).toMatch(/bg-black text-white/);
  });

  it("does not offer tablespoons at all for a drink", () => {
    render(<FoodQuantitySheet food={BERRY_ICE} onClose={() => {}} onConfirm={() => {}} />);
    // tbsps still shouldn't appear as a real option a client would pick —
    // confirmed absent from the chip row entirely once the classifier is
    // fixed (see foodDatabase.test.js for the unit-list assertion itself;
    // this just confirms the sheet renders consistently with it).
    expect(screen.queryByText("tbsps")).toBeNull();
  });

  it("still offers tablespoons for a pourable cooking liquid like oil", () => {
    const oil = { id: "oil1", name: "Olive Oil", cals: 884, protein: 0, carbs: 0, fat: 100, per: 100, defaultQty: 15, liquid: true };
    render(<FoodQuantitySheet food={oil} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("tbsps")).toBeTruthy();
  });

  it("recalculates macros correctly after switching units on a liquid", () => {
    const onConfirm = vi.fn();
    render(<FoodQuantitySheet food={BERRY_ICE} onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("cups"));
    // 1 cup = 240ml of a 27 cal/100ml drink = ~65 cal
    expect(screen.getByText("65")).toBeTruthy();
  });

  it("shows a 'serving size not on the label' note instead of silently presenting a guessed default as real", () => {
    const noServingData = { ...BERRY_ICE, servingSizeUnverified: true };
    render(<FoodQuantitySheet food={noServingData} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Serving size not on the label")).toBeTruthy();
  });

  it("does not show that note when a real serving size was found", () => {
    render(<FoodQuantitySheet food={BERRY_ICE} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText("Serving size not on the label")).toBeNull();
  });
});
