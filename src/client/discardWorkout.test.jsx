// @vitest-environment jsdom
//
// Regression coverage for the missing escape hatch on a stuck
// "RESUME WORKOUT" card: exiting a live session (its X/Cancel button)
// never cleared activeLog/runningSession, only closed the screen — so a
// card showing stray logged sets on a workout the client never (really)
// started had no way to be cleared short of logging out. TodayWorkoutCard
// now shows a "discard progress" action, behind a two-tap confirm so it
// can't nuke real progress with a single accidental tap.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodayWorkoutCard } from "./ClientApp";

afterEach(() => cleanup());

const SESSION = { label: "Full Body Day One", muscleGroups: ["Full Body"], exercises: [{ exerciseId: "ex-1", targetSets: 3 }] };
const ACTIVE_LOG = { "ex-1": [{ completed: true }, { completed: true }] };

describe("TodayWorkoutCard discard progress", () => {
  it("does not call onDiscard on the first tap, only after a confirming second tap", () => {
    const onDiscard = vi.fn();
    render(<TodayWorkoutCard todaySession={SESSION} activeLog={ACTIVE_LOG} onStart={() => {}} onView={() => {}} onDiscard={onDiscard} isToday />);

    const discardBtn = screen.getByText("Not started this — discard progress");
    fireEvent.click(discardBtn);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByText("Tap again to discard these sets")).toBeTruthy();

    fireEvent.click(screen.getByText("Tap again to discard these sets"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("does not show a discard option when the workout hasn't been started", () => {
    render(<TodayWorkoutCard todaySession={SESSION} activeLog={null} onStart={() => {}} onView={() => {}} onDiscard={vi.fn()} isToday />);
    expect(screen.queryByText("Not started this — discard progress")).toBeNull();
  });
});
