// @vitest-environment jsdom
//
// Regression coverage for a real production report: a client said a
// scanned product "seemed to not add," scanned it again, and it landed
// in their nutrition log twice. FoodQuantitySheet's ADD button fired
// onConfirm and immediately let the parent close the sheet regardless of
// whether the underlying Firestore save (a real network round trip) had
// actually finished — on a slow connection that looked identical to the
// tap doing nothing, so the client repeated the whole scan-and-confirm
// flow, and both saves went through as two genuine adds.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FoodQuantitySheet } from "./NutritionFeatures";

afterEach(() => cleanup());

const food = { id: "food-1", name: "Chicken Breast", cals: 165, protein: 31, carbs: 0, fat: 3.6, defaultQty: 100 };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FoodQuantitySheet", () => {
  it("disables ADD and ignores a second tap while the save is still in flight", async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(<FoodQuantitySheet food={food} onClose={() => {}} onConfirm={onConfirm} />);

    const button = screen.getByText(/ADD/).closest("button");
    fireEvent.click(button);
    fireEvent.click(button); // a second, impatient tap while the first save is still pending

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(screen.getByText("ADDING…")).toBeTruthy();

    resolve();
    await promise;
  });

  it("re-enables ADD (for a retry) when the save fails, instead of leaving it stuck", async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error("offline")));
    render(<FoodQuantitySheet food={food} onClose={() => {}} onConfirm={onConfirm} />);

    const button = screen.getByText(/ADD/).closest("button");
    fireEvent.click(button);

    await screen.findByText("ADD"); // back from "ADDING…" once the rejection is handled
    expect(button.disabled).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
