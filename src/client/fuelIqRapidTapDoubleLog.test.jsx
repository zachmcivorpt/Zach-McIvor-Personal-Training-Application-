// @vitest-environment jsdom
//
// Recurring production bug: a client logs a food from Fuel IQ / Macro
// Match once, and it lands in the nutrition log twice. A prior fix
// (fuelIqDoubleLog.test.jsx) added addedSuggestionKeys (useState) to stop
// re-adding the same suggestion after its detail sheet is *reopened* —
// that works because a render genuinely happens in between. It does NOT
// close the actual race: two click dispatches landing in the same task
// (the common real-world cause on touch devices — a touchend/click
// double-fire for one physical tap, or just two fast taps arriving before
// React's next commit) both read addedSuggestionKeys from the SAME
// pre-update render, since a useState update is only visible once React
// re-renders, not the instant it's set. Both calls to addSuggestion then
// pass the "not yet added" check and both call onAddFood.
//
// These tests force exactly that: both click dispatches inside one `act`
// callback, so there is no commit between them — the one scenario a
// sequence of two separate fireEvent.click() calls each in their own act()
// doesn't actually reproduce, because RTL's fireEvent already flushes a
// commit before returning. addSuggestionBusyRef (a ref, mutated
// synchronously, not dependent on any commit) is what actually closes
// this, for both the inline suggestion chip and the detail sheet's own
// "ADD TO LOG" button.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiNutritionHelpCard } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    nutritionAiHelp: vi.fn().mockResolvedValue({
      reply: "Here's an option.",
      suggestions: [{ name: "Large Big Mac Meal", calories: 1268, protein: 35, carbs: 155, fat: 55, contents: [] }],
    }),
  }),
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn() }));

afterEach(() => cleanup());

const targets = { calories: 2200, protein: 160, carbs: 242, fat: 66 };
const todayNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: {} };

async function askAndGetSuggestionChip() {
  fireEvent.click(screen.getByText("Not sure what to eat"));
  await waitFor(() => screen.getByText("Large Big Mac Meal"));
  return screen.getByText("ADD TO LOG");
}

describe("Fuel IQ — rapid double-tap does not double-log", () => {
  it("inline suggestion chip: two click dispatches in the same tick call onAddFood exactly once", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(
      <AiNutritionHelpCard targets={targets} todayNutrition={todayNutrition} nutritionProfile={{}} onAddFood={onAddFood} showToast={() => {}} dark={false} />
    );
    const addChip = await askAndGetSuggestionChip();

    // Both dispatches inside one act() — no commit lands between them,
    // the actual shape of the real-world race.
    act(() => {
      fireEvent.click(addChip);
      fireEvent.click(addChip);
    });

    expect(onAddFood).toHaveBeenCalledTimes(1);
  });

  it("detail sheet's own ADD TO LOG button: two click dispatches in the same tick call onAddFood exactly once", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(
      <AiNutritionHelpCard targets={targets} todayNutrition={todayNutrition} nutritionProfile={{}} onAddFood={onAddFood} showToast={() => {}} dark={false} />
    );
    fireEvent.click(screen.getByText("Not sure what to eat"));
    const suggestionCard = await waitFor(() => screen.getByText("Large Big Mac Meal"));
    fireEvent.click(suggestionCard);
    const addButton = await waitFor(() => screen.getByRole("button", { name: "ADD TO LOG" }));

    act(() => {
      fireEvent.click(addButton);
      fireEvent.click(addButton);
    });

    expect(onAddFood).toHaveBeenCalledTimes(1);
  });

  it("passes a stable log-entry id derived from the suggestion, not a fresh one per call", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(
      <AiNutritionHelpCard targets={targets} todayNutrition={todayNutrition} nutritionProfile={{}} onAddFood={onAddFood} showToast={() => {}} dark={false} />
    );
    const addChip = await askAndGetSuggestionChip();
    fireEvent.click(addChip);

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [, food, logId] = onAddFood.mock.calls[0];
    expect(food.id).toBe(logId);
    expect(logId).not.toMatch(/^ai-\d+$/); // not the old Date.now()-only scheme
  });

  it("after the add settles, a different later suggestion can still be logged (not permanently blocked)", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(
      <AiNutritionHelpCard targets={targets} todayNutrition={todayNutrition} nutritionProfile={{}} onAddFood={onAddFood} showToast={() => {}} dark={false} />
    );
    const addChip = await askAndGetSuggestionChip();
    await act(async () => {
      fireEvent.click(addChip);
    });
    expect(onAddFood).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("KFC"));
    await waitFor(() => expect(screen.getAllByText("Large Big Mac Meal").length).toBeGreaterThan(1));
    // The first chip now reads "ADDED ✓" (already logged) — the only
    // remaining "ADD TO LOG" is the second exchange's own chip.
    const secondChip = screen.getByText("ADD TO LOG");
    await act(async () => {
      fireEvent.click(secondChip);
    });

    expect(onAddFood).toHaveBeenCalledTimes(2);
    expect(onAddFood.mock.calls[0][2]).not.toBe(onAddFood.mock.calls[1][2]);
  });
});
