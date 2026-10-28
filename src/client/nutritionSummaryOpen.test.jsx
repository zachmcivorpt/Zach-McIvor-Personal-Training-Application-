// @vitest-environment jsdom
//
// Home's nutrition section (REGRESSION_TESTS.md #111). On iPhone the title
// growing from "Nutrition" to "Nutrition Today" over a backdrop-filter glass
// card was left half-drawn. The section is now open on the page (no
// backdrop-filter) and its title is the same text on every day; the actions
// keep working.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionSummaryCard, ClientThemeContext } from "./ClientApp";

afterEach(() => cleanup());

const NUTRITION = { calories: 1852, protein: 124.1, carbs: 227.4, fat: 45.9, water: 0.5 };
const TARGETS = { calories: 2250, protein: 174, carbs: 292, fat: 43, water: 3 };

function renderCard(props) {
  return render(
    <ClientThemeContext.Provider value={false}>
      <NutritionSummaryCard nutrition={NUTRITION} targets={TARGETS} onLogFood={() => {}} onLogWater={() => {}} {...props} />
    </ClientThemeContext.Provider>
  );
}

describe("NutritionSummaryCard (open section)", () => {
  it("uses the same title on today and on another day, with no glass blur behind it", () => {
    const { container, unmount } = renderCard({ isToday: true });
    expect(screen.getByRole("heading", { name: "Nutrition" })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/backdrop-filter/i);
    unmount();
    renderCard({ isToday: false, onGoToday: () => {} });
    expect(screen.getByRole("heading", { name: "Nutrition" })).toBeTruthy();
  });

  it("shows calories left and keeps Log food and the water buttons working", () => {
    const onLogFood = vi.fn();
    const onLogWater = vi.fn();
    renderCard({ isToday: true, onLogFood, onLogWater });
    expect(screen.getByText("398")).toBeTruthy();
    fireEvent.click(screen.getByText("+ LOG FOOD"));
    fireEvent.click(screen.getByText("+250ml"));
    fireEvent.click(screen.getByText("+500ml"));
    fireEvent.click(screen.getByLabelText("Remove 250 ml"));
    expect(onLogFood).toHaveBeenCalledTimes(1);
    expect(onLogWater.mock.calls.map((c) => c[0])).toEqual([0.25, 0.5, -0.25]);
  });

  it("on another day offers to jump back to today", () => {
    const onGoToday = vi.fn();
    renderCard({ isToday: false, onGoToday });
    expect(screen.queryByText("+ LOG FOOD")).toBeNull();
    fireEvent.click(screen.getByText("LOG FOOD & WATER FOR TODAY"));
    expect(onGoToday).toHaveBeenCalledTimes(1);
  });
});
