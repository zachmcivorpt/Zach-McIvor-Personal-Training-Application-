// @vitest-environment jsdom
//
// #308 The Watch lists the exercises in the phone's order: grouped by
// section (Warm-up, Main, Cool-down) as the workout screen shows them, not
// in the order they were saved in the session.
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

const EX = {
  a: { id: "a", name: "Bench Press", videoUrl: "" },
  b: { id: "b", name: "Band Pull-apart", videoUrl: "" },
  c: { id: "c", name: "Chest Stretch", videoUrl: "" },
  d: { id: "d", name: "Incline DB Press", videoUrl: "" },
  e: { id: "e", name: "Arm Circles", videoUrl: "" },
};
const ex = (id, section) => ({ exerciseId: id, section, targetSets: 2, targetReps: 8, targetType: "reps", restSeconds: 90 });

function Harness() {
  const [activeLog, setActiveLog] = useState({});
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([{ ...ex("e", "warmup") }]);
  return (
    <WorkoutSession
      session={{ id: "s", date: "2026-11-19", label: "Upper A", instructions: "", exercises: [ex("a", "main"), ex("b", "warmup"), ex("c", "cooldown"), ex("d", "main")] }}
      activeLog={activeLog}
      setActiveLog={setActiveLog}
      logsForClient={[]}
      exercisesById={EX}
      exerciseNotes={exerciseNotes}
      setExerciseNotes={setExerciseNotes}
      allExercises={Object.values(EX)}
      exerciseSwaps={exerciseSwaps}
      setExerciseSwaps={setExerciseSwaps}
      extraExercises={extraExercises}
      setExtraExercises={setExtraExercises}
      onFinish={() => {}}
      finishing={false}
      onExit={() => {}}
      onSaveNote={() => {}}
      clientId="client-a"
      onLiveUpdate={() => {}}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
  delete window.webkit;
  localStorage.clear();
});

describe("Watch exercise order (#308)", () => {
  it("matches the phone: warm-up first (incl. an added one), then main, then cool-down", () => {
    const posted = [];
    window.webkit = { messageHandlers: { apexWatch: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } };
    render(<Harness />);
    const watchOrder = posted.filter((m) => m.action === "workout").at(-1).workout.exercises.map((e) => e.name);
    expect(watchOrder).toEqual(["Band Pull-apart", "Arm Circles", "Bench Press", "Incline DB Press", "Chest Stretch"]);
    // The phone's screen, top to bottom.
    const text = document.body.textContent;
    const phoneOrder = watchOrder.slice().sort((x, y) => text.indexOf(x) - text.indexOf(y));
    expect(phoneOrder).toEqual(watchOrder);
  });
});
