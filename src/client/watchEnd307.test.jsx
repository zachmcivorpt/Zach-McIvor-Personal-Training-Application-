// @vitest-environment jsdom
//
// #307 End workout from the Watch: Complete / Save for later / Cancel run
// the workout screen's own handlers — after a set the Watch logged just
// before has reached the log.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useState } from "react";
import { cleanup, render } from "@testing-library/react";
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

function scheduledSession() {
  return {
    id: "sched-1",
    date: "2026-10-10",
    label: "Push Day",
    instructions: "",
    exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 3, targetReps: 5, targetType: "reps", restSeconds: 90 }],
  };
}

function Harness({ onFinish, onExit, onDiscard }) {
  const [activeLog, setActiveLog] = useState({});
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  return (
    <WorkoutSession
      session={scheduledSession()}
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
      onFinish={() => onFinish(activeLog)}
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

let posted = [];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.webkit;
  localStorage.clear();
});

function setup() {
  vi.useFakeTimers();
  posted = [];
  window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
  const handlers = { onFinish: vi.fn(), onExit: vi.fn(), onDiscard: vi.fn() };
  render(<Harness {...handlers} />);
  return handlers;
}

function fromWatch(detail) {
  act(() => {
    window.dispatchEvent(new CustomEvent("apexWatch", { detail }));
  });
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

describe("End workout from the Watch (#307)", () => {
  it("Complete finishes with the set the Watch logged just before", () => {
    const h = setup();
    fromWatch({ id: "s1", type: "logSet", exerciseId: "ex-bench", setIndex: 0, reps: 5, weight: 50 });
    fromWatch({ id: "e1", type: "finishWorkout" });
    expect(h.onFinish).not.toHaveBeenCalled();
    settle();
    expect(h.onFinish).toHaveBeenCalledTimes(1);
    expect(h.onFinish.mock.calls[0][0]["ex-bench"][0]).toMatchObject({ reps: "5", weight: "50" });
    expect(posted).toContainEqual({ action: "ack", id: "e1" });
    expect(h.onDiscard).not.toHaveBeenCalled();
  });

  it("Complete sent twice (re-sent until acked) finishes once", () => {
    const h = setup();
    fromWatch({ id: "e2", type: "finishWorkout" });
    fromWatch({ id: "e2", type: "finishWorkout" });
    settle();
    expect(h.onFinish).toHaveBeenCalledTimes(1);
  });

  it("Save for later closes the screen, keeps the workout and sends the Watch home", () => {
    const h = setup();
    fromWatch({ id: "e3", type: "saveForLater" });
    settle();
    expect(h.onExit).toHaveBeenCalledTimes(1);
    expect(h.onFinish).not.toHaveBeenCalled();
    expect(h.onDiscard).not.toHaveBeenCalled();
    expect(posted).toContainEqual({ action: "clear", reason: "saved" });
  });

  it("Cancel discards", () => {
    const h = setup();
    fromWatch({ id: "e4", type: "discardWorkout" });
    settle();
    expect(h.onDiscard).toHaveBeenCalledTimes(1);
    expect(h.onFinish).not.toHaveBeenCalled();
    expect(h.onExit).not.toHaveBeenCalled();
  });
});
