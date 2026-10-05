// @vitest-environment jsdom
//
// Regression coverage for the Fuel IQ / Macro Match detail-sheet
// double-log bug: the inline "ADD TO LOG" chip tracks which suggestions
// have already been added (addedSuggestionKeys) and shows "ADDED" once
// used, but the suggestion's own detail sheet (opened by tapping a
// suggestion card) called addSuggestion(detailSuggestion) with NO key,
// so that guard never engaged there. A suggestion card stays visible in
// the chat after use, so a client could tap it again, reopen the detail
// sheet, and tap "ADD TO LOG" a second time — logging (and double-
// counting the calories/macros of) the same suggestion again with no
// guard stopping it. The fix threads the same suggestionKey through to
// the detail sheet via a new detailSuggestionKey state, so a second add
// of the same suggestion is blocked exactly like the inline chip already
// is.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("Fuel IQ detail sheet ADD TO LOG", () => {
  it("does not double-log the same suggestion if its detail sheet is reopened and Add is tapped again", async () => {
    const onAddFood = vi.fn();
    render(
      <AiNutritionHelpCard
        targets={targets}
        todayNutrition={todayNutrition}
        nutritionProfile={{}}
        onAddFood={onAddFood}
        showToast={() => {}}
        dark={false}
      />
    );

    fireEvent.click(screen.getByText("Not sure what to eat"));
    const suggestionCard = await waitFor(() => screen.getByText("Large Big Mac Meal"));

    // First add, via the detail sheet.
    fireEvent.click(suggestionCard);
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "ADD TO LOG" })));
    expect(onAddFood).toHaveBeenCalledTimes(1);

    // The suggestion card is still sitting in the chat history — reopen
    // its detail sheet and tap Add again.
    fireEvent.click(screen.getByText("Large Big Mac Meal"));
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "ADD TO LOG" })));

    expect(onAddFood).toHaveBeenCalledTimes(1);
  });
});
