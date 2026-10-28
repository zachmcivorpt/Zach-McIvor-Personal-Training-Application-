// @vitest-environment jsdom
//
// The photo versions of TodayWorkoutCard (Home's photo card, `photo`, and
// Training > Today's text-on-photo, `photo="bare"`) must keep every state
// and action of the plain card: Start/Resume/View, View only once done,
// the two-tap discard confirm, and the empty-day message.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodayWorkoutCard } from "./ClientApp";

afterEach(() => cleanup());

const SESSION = { label: "Hypertrophy 1A", muscleGroups: [], exercises: [{ exerciseId: "ex-1", targetSets: 3 }] };
const ACTIVE_LOG = { "ex-1": [{ completed: true }] };

describe.each([[true], ["bare"]])("TodayWorkoutCard photo=%s", (photo) => {
  it("not started: Start and View both work", () => {
    const onStart = vi.fn();
    const onView = vi.fn();
    render(<TodayWorkoutCard photo={photo} todaySession={SESSION} activeLog={null} onStart={onStart} onView={onView} isToday />);
    fireEvent.click(screen.getByText("START WORKOUT"));
    fireEvent.click(screen.getByText("View"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Today's focus")).toBeTruthy();
  });

  it("completed: shows Completed and only View", () => {
    const onView = vi.fn();
    render(<TodayWorkoutCard photo={photo} todaySession={SESSION} activeLog={null} onStart={() => {}} onView={onView} isToday completedOnDate />);
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText("START WORKOUT")).toBeNull();
    fireEvent.click(screen.getByText("View"));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("started: Resume, and discard only after the confirming second tap", () => {
    const onDiscard = vi.fn();
    render(<TodayWorkoutCard photo={photo} todaySession={SESSION} activeLog={ACTIVE_LOG} onStart={() => {}} onView={() => {}} onDiscard={onDiscard} isToday />);
    expect(screen.getByText("RESUME WORKOUT")).toBeTruthy();
    fireEvent.click(screen.getByText("Not started this — discard progress"));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Tap again to discard these sets"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("no session: says nothing is scheduled", () => {
    render(<TodayWorkoutCard photo={photo} todaySession={null} activeLog={null} onStart={() => {}} onView={() => {}} isToday />);
    expect(screen.getByText("No workout scheduled")).toBeTruthy();
  });
});
