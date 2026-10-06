// @vitest-environment jsdom
//
// Regression coverage for a real production report: a client scans a
// barcode, taps ADD, it "doesn't add," so they scan and add it again —
// and both the first (seemingly failed) add and the second one land in
// the log. Two compounding bugs: (1) FoodQuantitySheet's ADD button used
// to fire onConfirm and let the parent close the sheet immediately,
// regardless of whether the underlying Firestore save (a real network
// round trip) had actually finished; (2) even once ADD itself was
// guarded, the sheet's own X button and backdrop tap still called onClose
// straight through, so backing out mid-save abandoned the sheet while
// that save kept running in the background and landed anyway.
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

  // The actual escape hatch that was really producing the duplicate: ADD
  // being guarded wasn't enough on its own, because the sheet's own X
  // button and backdrop tap both called onClose directly regardless of an
  // in-flight save. A client could tap ADD, then almost immediately tap
  // away to back out (long before a real network round trip settles),
  // abandon the sheet, and rescan — while the first save kept running in
  // the background and landed anyway once it finished.
  it("ignores the sheet's own close (X) button while a save is in flight", async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    const onClose = vi.fn();
    render(<FoodQuantitySheet food={food} onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText(/ADD/).closest("button"));
    const closeButton = document.querySelector(".lucide-x").closest("button");
    fireEvent.click(closeButton);
    expect(onClose).not.toHaveBeenCalled();

    resolve();
    await screen.findByText(/^ADD$/); // back from "ADDING…" — saving has settled

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
