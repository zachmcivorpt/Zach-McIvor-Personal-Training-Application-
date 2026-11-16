// @vitest-environment jsdom
// #250: since the calendar cards became see-through glass (#248), the red
// swipe-to-delete layer behind them showed through: every card was pink.
// It now only exists while a card is being swiped.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: {} }) }));
import { CalendarEventCard } from "./ClientApp";
afterEach(cleanup);

describe("calendar card (#250)", () => {
  it("no red layer at rest; it appears only while swiping", () => {
    render(<CalendarEventCard dot={{}} done={false} title="Core & Arms" subtitle="x" onDelete={() => {}} />);
    expect(screen.queryByTestId("calendar-delete-layer")).toBeNull();
    const card = screen.getByText("Core & Arms").closest("[data-done], div[style]");
    fireEvent.pointerDown(card, { clientX: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 200, pointerId: 1 });
    expect(screen.getByTestId("calendar-delete-layer")).toBeTruthy();
  });
});
