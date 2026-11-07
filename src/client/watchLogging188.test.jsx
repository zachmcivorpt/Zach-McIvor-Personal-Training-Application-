// @vitest-environment jsdom
//
// #188 Apple Watch workout logging: the Watch's actions reach the phone's
// workout screen as "apexWatch" events and are applied exactly like a tap,
// and the screen sends the Watch every change.
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

function LiveSessionHarness({ onLiveUpdate }) {
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
      onFinish={() => {}}
      finishing={false}
      onExit={() => {}}
      onSaveNote={() => {}}
      clientId="client-a"
      onLiveUpdate={onLiveUpdate}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

import { buildWatchWorkout, applyWatchSet, alreadyApplied } from "../lib/watchBridge";

let posted = [];
afterEach(() => {
  cleanup();
  delete window.webkit;
  localStorage.clear();
});

function installBridge() {
  posted = [];
  window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
}

function fromWatch(detail) {
  act(() => {
    window.dispatchEvent(new CustomEvent("apexWatch", { detail }));
  });
}

const lastWorkout = () => posted.filter((m) => m.action === "workout").at(-1).workout;

describe("Apple Watch logging (#188)", () => {
  it("sends the workout to the Watch and logs a set from it like a tap (PR, live update, ack)", () => {
    installBridge();
    const onLiveUpdate = vi.fn();
    render(<LiveSessionHarness onLiveUpdate={onLiveUpdate} />);

    const first = lastWorkout();
    expect(first.label).toBe("Push Day");
    expect(first.exercises[0]).toMatchObject({ id: "ex-bench", name: "Bench Press", restSeconds: 90 });
    expect(first.exercises[0].sets).toHaveLength(3);
    expect(first.exercises[0].sets[0]).toMatchObject({ index: 0, reps: null, weight: null, done: false });

    fromWatch({ id: "w1", type: "logSet", exerciseId: "ex-bench", setIndex: 1, reps: 5, weight: 82.5 });

    const live = onLiveUpdate.mock.calls.at(-1)[1].activeLog["ex-bench"];
    expect(live[1]).toMatchObject({ reps: "5", weight: "82.5", completed: true, isPR: true });
    expect(posted).toContainEqual({ action: "ack", id: "w1" });
    expect(lastWorkout().exercises[0].sets[1]).toMatchObject({ reps: 5, weight: 82.5, done: true, pr: true });
    // Phone's own inputs show it too.
    const reps = document.querySelectorAll('input[type="number"][inputmode="numeric"]');
    expect(reps[1].value).toBe("5");
  });

  it("applies a repeated action once (the iPhone app re-sends until acked)", () => {
    installBridge();
    render(<LiveSessionHarness onLiveUpdate={() => {}} />);
    fromWatch({ id: "add-1", type: "addSet", exerciseId: "ex-bench" });
    fromWatch({ id: "add-1", type: "addSet", exerciseId: "ex-bench" });
    expect(lastWorkout().exercises[0].sets).toHaveLength(4);
    expect(posted.filter((m) => m.action === "ack" && m.id === "add-1")).toHaveLength(2);
  });

  it("starts and skips the rest timer from the Watch, with a wall-clock end for the Watch", () => {
    installBridge();
    render(<LiveSessionHarness onLiveUpdate={() => {}} />);
    const before = Date.now();
    fromWatch({ id: "r1", type: "startRest", exerciseId: "ex-bench" });
    const rest = lastWorkout().rest;
    expect(rest.total).toBe(90);
    expect(rest.endsAt).toBeGreaterThanOrEqual(before + 88000);
    expect(rest.endsAt).toBeLessThanOrEqual(Date.now() + 90000);
    fromWatch({ id: "r2", type: "skipRest" });
    expect(lastWorkout().rest).toBeNull();
  });

  it("ignores a set without reps or for an exercise not in the workout", () => {
    installBridge();
    const onLiveUpdate = vi.fn();
    render(<LiveSessionHarness onLiveUpdate={onLiveUpdate} />);
    fromWatch({ id: "bad1", type: "logSet", exerciseId: "ex-bench", setIndex: 0, reps: null, weight: 50 });
    fromWatch({ id: "bad2", type: "logSet", exerciseId: "ex-other", setIndex: 0, reps: 5, weight: 50 });
    expect(onLiveUpdate).not.toHaveBeenCalled();
    expect(lastWorkout().exercises[0].sets.every((s) => !s.done)).toBe(true);
  });

  it("does nothing without the native bridge (browser, Android, older iPhone build)", () => {
    expect(() => render(<LiveSessionHarness onLiveUpdate={() => {}} />)).not.toThrow();
  });
});

describe("watchBridge helpers", () => {
  it("applyWatchSet fills untouched planned rows and treats 0 kg as bodyweight", () => {
    const out = applyWatchSet({}, "e1", 2, { reps: 12, weight: 0 });
    expect(out.index).toBe(2);
    expect(out.log.e1).toHaveLength(3);
    expect(out.log.e1[2]).toMatchObject({ setNumber: 3, reps: "12", weight: "" });
    expect(applyWatchSet({}, "e1", -1, { reps: 5 })).toBeNull();
    expect(applyWatchSet({}, "e1", 0, { reps: 5.5 })).toBeNull();
    expect(applyWatchSet({}, "e1", 0, { reps: 5, weight: -2 })).toBeNull();
  });
  it("buildWatchWorkout turns typed strings into numbers and blanks into null", () => {
    const w = buildWatchWorkout({ sessionId: "s", label: "L", exercises: [{ id: "e", name: "Squat", rows: [{ reps: "8", weight: "", completed: true }], previousSets: [{ reps: 8, weight: 100 }] }], rest: null });
    expect(w.exercises[0].sets[0]).toEqual({ index: 0, reps: 8, weight: null, done: true, pr: false, prevReps: 8, prevWeight: 100 });
  });
  it("alreadyApplied remembers ids on the phone", () => {
    expect(alreadyApplied("x")).toBe(false);
    expect(alreadyApplied("x")).toBe(true);
    expect(alreadyApplied(undefined)).toBe(false);
  });
});
