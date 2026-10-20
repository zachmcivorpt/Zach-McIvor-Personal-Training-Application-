// @vitest-environment jsdom
//
// Second instance of the same bug class as fuelIqRapidTapDoubleLog.test.jsx:
// FoodQuantitySheet's ADD button (the main food-logging path shared by
// search, barcode scan, quick add, and the meal-choice flow) guarded
// against a double-tap with `saving` (useState) alone. useState only takes
// effect on React's next render, so two click dispatches landing in the
// same task — a touchend/click double-fire for one physical tap, the
// documented real-world cause elsewhere in this app (ClientApp.jsx's
// addBusyRef) — both read saving === false from the same stale render and
// both call onConfirm, each a fully genuine, separately-committed Firestore
// write. This is almost certainly what produced a real production report
// of "DOUBLE ESPRESSO", "SERIOUS MASS", and a "Chicken Schnitzel Sandwich"
// each logged twice with identical macros — all plausibly quick-add/search
// entries, which route through this exact sheet, not through Fuel IQ.
//
// Fixed with the same pattern as Fuel IQ: confirmingRef (a ref, mutated
// synchronously) gates the real call; `saving` state is kept only for the
// "ADDING…" visual/disabled-button treatment. A stable per-sheet-opening
// logId is also now threaded through to addFood as defense in depth.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FoodQuantitySheet } from "./NutritionFeatures";

afterEach(() => cleanup());

const FOOD = { id: "f1", name: "Serious Mass", cals: 1252, protein: 50, carbs: 252, fat: 2.5 };

describe("FoodQuantitySheet — rapid double-tap does not double-log", () => {
  it("calls onConfirm exactly once when ADD gets two click dispatches in the same tick", async () => {
    let resolveConfirm;
    const onConfirm = vi.fn(() => new Promise((res) => { resolveConfirm = res; }));
    render(<FoodQuantitySheet food={FOOD} onClose={() => {}} onConfirm={onConfirm} />);
    const addBtn = screen.getByRole("button", { name: /ADD/ });

    act(() => {
      fireEvent.click(addBtn);
      fireEvent.click(addBtn);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveConfirm();
    });
  });

  it("passes a stable logId that stays the same across the sheet's whole lifetime (reused across a retry)", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    render(<FoodQuantitySheet food={FOOD} onClose={() => {}} onConfirm={onConfirm} />);
    const addBtn = screen.getByRole("button", { name: /ADD/ });

    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [, logId] = onConfirm.mock.calls[0];
    expect(logId).toBeTruthy();
    expect(logId).toMatch(new RegExp(`^${FOOD.id}-`));
  });

  it("after a failed confirm, retrying (a new tap) is allowed and re-fires onConfirm", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    render(<FoodQuantitySheet food={FOOD} onClose={() => {}} onConfirm={onConfirm} />);
    const addBtn = screen.getByRole("button", { name: /ADD/ });

    await act(async () => {
      fireEvent.click(addBtn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(addBtn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
    // Same sheet-opening, same logical add — the retry must reuse the
    // exact same id (not suppress it, not mint a new one) so addFood's
    // own id check can recognize it as the same action either way: a
    // true no-op if the failed attempt actually landed server-side
    // despite the client never seeing success, or a normal single add if
    // it genuinely never landed.
    expect(onConfirm.mock.calls[0][1]).toBe(onConfirm.mock.calls[1][1]);
  });

  it("logging a different food afterwards (a genuinely new sheet-open) is not blocked", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    const { rerender } = render(<FoodQuantitySheet food={FOOD} onClose={() => {}} onConfirm={onConfirm} />);
    const addBtn = screen.getByRole("button", { name: /ADD/ });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const FOOD2 = { id: "f2", name: "Double Espresso", cals: 5, protein: 1, carbs: 1, fat: 0 };
    rerender(<FoodQuantitySheet food={FOOD2} onClose={() => {}} onConfirm={onConfirm} />);
    const addBtn2 = screen.getByRole("button", { name: /ADD/ });
    await act(async () => {
      fireEvent.click(addBtn2);
    });

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm.mock.calls[0][1]).not.toBe(onConfirm.mock.calls[1][1]);
  });
});
