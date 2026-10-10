// @vitest-environment jsdom
//
// Nutrition Overhaul requirement: remove food/product images throughout
// Nutrition (search results, barcode-scanned products, logged foods, saved
// meals) in favor of a clean, information-first layout — names, servings,
// calories and macros, not decorative photos. This does NOT apply to a
// client's own meal photo (PhotoEstimateSheet's "Log a Meal Photo" / the
// `photoUrl` shown on a saved meal or logged entry) — that's a deliberate,
// user-driven feature, not catalog/product imagery, and stays untouched.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FoodQuantitySheet } from "./NutritionFeatures";

afterEach(() => cleanup());

const SCANNED_PRODUCT = {
  id: "off_1",
  name: "BBQ Sauce",
  brand: "Coles",
  cals: 120,
  protein: 1,
  carbs: 28,
  fat: 0,
  per: 100,
  defaultQty: 20,
  fromBarcode: true,
  imageUrl: "https://images.openfoodfacts.org/some-product-photo.jpg",
  verificationLevel: "VERIFIED",
};

describe("Nutrition shows no food/product images", () => {
  it("never renders a scanned product's own catalog photo in the quantity sheet, even when imageUrl is present", () => {
    render(<FoodQuantitySheet food={SCANNED_PRODUCT} onClose={() => {}} onConfirm={() => {}} />);
    const img = document.querySelector(`img[src="${SCANNED_PRODUCT.imageUrl}"]`);
    expect(img).toBeNull();
  });

  it("renders no <img> at all for a barcode-scanned product's info row", () => {
    render(<FoodQuantitySheet food={SCANNED_PRODUCT} onClose={() => {}} onConfirm={() => {}} />);
    expect(document.querySelector("img")).toBeNull();
  });
});
