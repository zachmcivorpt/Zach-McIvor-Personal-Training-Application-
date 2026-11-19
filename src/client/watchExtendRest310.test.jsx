// @vitest-environment jsdom
//
// #310 The real workout screen sends each exercise's section to the Watch
// and applies the Watch's +15s exactly like the rest bar's own button.
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

describe("Watch sections and +15s (#310)", () => {
  it("sends the section and extends a running rest by 15 s", () => {
    vi.useFakeTimers();
    posted = [];
    window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
    render(<Harness onFinish={() => {}} onExit={() => {}} onDiscard={() => {}} />);
    const last = () => posted.filter((m) => m.action === "workout").at(-1).workout;
    expect(last().exercises[0].section).toBe("main");

    act(() => {
      window.dispatchEvent(new CustomEvent("apexWatch", { detail: { id: "r1", type: "startRest", exerciseId: "ex-bench" } }));
    });
    const before = last().rest;
    expect(before.total).toBe(90);
    act(() => {
      window.dispatchEvent(new CustomEvent("apexWatch", { detail: { id: "r2", type: "extendRest", seconds: 15 } }));
    });
    const after = last().rest;
    expect(after.total).toBe(105);
    expect(after.endsAt - before.endsAt).toBeGreaterThanOrEqual(14000);
    expect(posted).toContainEqual({ action: "ack", id: "r2" });
  });

  it("+15s with no rest running does nothing", () => {
    posted = [];
    window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
    render(<Harness onFinish={() => {}} onExit={() => {}} onDiscard={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("apexWatch", { detail: { id: "r3", type: "extendRest", seconds: 15 } }));
    });
    expect(posted.filter((m) => m.action === "workout").at(-1).workout.rest).toBeNull();
  });
});
