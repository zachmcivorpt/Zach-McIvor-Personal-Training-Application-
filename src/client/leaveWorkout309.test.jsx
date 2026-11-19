// @vitest-environment jsdom
//
// #309 Cancel on the phone's workout screen with sets logged asks: Save for
// later / Discard workout (tap twice) / Keep going — so an unfinished
// workout never just stays running (and on the Watch) by default.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useState } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { WorkoutSession } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { workoutComments: {} },
    currentUser: { id: "client-a" },
    addWorkoutComment: vi.fn(),
    moveScheduledWorkout: vi.fn(),
  }),
  getPreviousSets: () => [],
  // Real formula (not a stub) — the test needs genuine e1RM comparisons
  // between ascending sets, same as src/lib/AppContext.jsx's own.
  estimate1RM: (weight, reps) => Math.round(weight * (1 + reps / 30) * 10) / 10,
  // No saved history at all for this exercise — isolates the bug to the
  // in-session comparison, which is exactly what was missing.
  getBestEverStats: () => ({ bestScore: 0, bestSet: null, maxWeight: 0 }),
  getCurrentPhase: () => null,
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn() }));

const BENCH_PRESS = { id: "ex-bench", name: "Bench Press", videoUrl: "" };

function Harness({ initialLog, onExit, onDiscard }) {
  const [activeLog, setActiveLog] = useState(initialLog);
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  return (
    <WorkoutSession
      session={{ id: "s", date: "2026-11-19", label: "Push Day", instructions: "", exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 3, targetReps: 5, targetType: "reps", restSeconds: 90 }] }}
      activeLog={activeLog}
      setActiveLog={setActiveLog}
      logsForClient={[]}
      exercisesById={{ "ex-bench": BENCH_PRESS }}
      exerciseNotes={exerciseNotes}
      setExerciseNotes={setExerciseNotes}
      allExercises={[BENCH_PRESS]}
      exerciseSwaps={exerciseSwaps}
      setExerciseSwaps={setExerciseSwaps}
      extraExercises={extraExercises}
      setExtraExercises={setExtraExercises}
      onFinish={() => {}}
      finishing={false}
      onExit={onExit}
      onDiscard={onDiscard}
      onSaveNote={() => {}}
      clientId="client-a"
      onLiveUpdate={() => {}}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

const TWO_SETS = { "ex-bench": [{ setNumber: 1, reps: "5", weight: "60", completed: true }, { setNumber: 2, reps: "5", weight: "60", completed: true }, { setNumber: 3, reps: "", weight: "", completed: false }] };

let posted = [];
afterEach(() => {
  cleanup();
  delete window.webkit;
  localStorage.clear();
});

function setup(initialLog) {
  posted = [];
  window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
  const h = { onExit: vi.fn(), onDiscard: vi.fn() };
  render(<Harness initialLog={initialLog} {...h} />);
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });
  return h;
}

describe("Leave this workout? (#309)", () => {
  it("with sets logged, Cancel asks instead of leaving", () => {
    const h = setup(TWO_SETS);
    expect(screen.getByText("Leave this workout?")).toBeTruthy();
    expect(screen.getByText(/You've logged 2 sets/)).toBeTruthy();
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.onDiscard).not.toHaveBeenCalled();
  });

  it("Save for later keeps it and sends the Watch home", () => {
    const h = setup(TWO_SETS);
    act(() => {
      fireEvent.click(screen.getByText("SAVE FOR LATER"));
    });
    expect(h.onExit).toHaveBeenCalledTimes(1);
    expect(h.onDiscard).not.toHaveBeenCalled();
    expect(posted).toContainEqual({ action: "clear", reason: "saved" });
  });

  it("Discard needs a second tap", () => {
    const h = setup(TWO_SETS);
    act(() => {
      fireEvent.click(screen.getByText("DISCARD WORKOUT"));
    });
    expect(h.onDiscard).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByText("TAP AGAIN TO DISCARD 2 SETS"));
    });
    expect(h.onDiscard).toHaveBeenCalledTimes(1);
    expect(h.onExit).not.toHaveBeenCalled();
  });

  it("Keep going closes the question only", () => {
    const h = setup(TWO_SETS);
    act(() => {
      fireEvent.click(screen.getByText("Keep going"));
    });
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.onDiscard).not.toHaveBeenCalled();
  });

  it("with nothing logged, Cancel leaves straight away (as before)", () => {
    const h = setup({});
    expect(h.onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Leave this workout?")).toBeNull();
  });
});
