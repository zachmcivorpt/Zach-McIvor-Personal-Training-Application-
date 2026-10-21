// @vitest-environment jsdom
//
// Weekly QA audit finding (2026-10-11): handleBlurKg's PR check
// (getBestEverStats) only ever reads SAVED logs — it has no idea about
// sets already completed earlier in this same, still-unsaved session.
// Real bug: logging progressively heavier sets of one exercise (85kg,
// 90kg, 95kg) each individually beat the stale saved record, so every
// one got flagged a PR instead of just the session's actual best set —
// inflating the in-session trophy count, the finished-workout PR tally,
// and (since isPR is saved verbatim on finish) the 30-day PR count on
// the Performance Timeline permanently.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

afterEach(() => cleanup());

// Enters reps+weight for set `rowIndex` and blurs the weight field, same
// sequence a client does tapping through the set rows — reps input then
// weight input, in DOM order, one pair per row. WorkoutSession renders via
// FullScreenOverlay's portal straight to document.body, not into the
// local render container, so these query the document globally.
function enterSet(rowIndex, reps, weight) {
  const repsInputs = document.querySelectorAll('input[type="number"][inputmode="numeric"]');
  const weightInputs = document.querySelectorAll('input[type="number"][inputmode="decimal"]');
  fireEvent.change(repsInputs[rowIndex], { target: { value: String(reps) } });
  fireEvent.change(weightInputs[rowIndex], { target: { value: String(weight) } });
  fireEvent.blur(weightInputs[rowIndex]);
}

describe("Workout session PR detection — in-session sets, not just saved history", () => {
  it("only flags the first of several identical working sets as a PR, not all three", () => {
    // Three sets at the exact same weight/reps — a completely normal
    // "3x5 at 85kg" session. Only the first genuinely sets a new best;
    // repeating it twice more isn't three separate PRs. Before this fix,
    // getBestEverStats's mocked `bestSet: null` (empty history) made the
    // old code's `!bestSet` check unconditionally true for every set,
    // regardless of order — this is exactly the class of case that hid.
    const onLiveUpdate = vi.fn();
    render(<LiveSessionHarness onLiveUpdate={onLiveUpdate} />);

    enterSet(0, 5, 85);
    enterSet(1, 5, 85);
    enterSet(2, 5, 85);

    const finalSets = onLiveUpdate.mock.calls.at(-1)[1].activeLog["ex-bench"];
    expect(finalSets.map((s) => s.isPR)).toEqual([true, false, false]);
  });

  it("still flags the very first set ever logged for an exercise as a PR (no history, no session sets yet)", () => {
    const onLiveUpdate = vi.fn();
    render(<LiveSessionHarness onLiveUpdate={onLiveUpdate} />);

    enterSet(0, 5, 85);

    const finalSets = onLiveUpdate.mock.calls.at(-1)[1].activeLog["ex-bench"];
    expect(finalSets[0].isPR).toBe(true);
  });

  it("does not flag a lighter/equal set that comes after a heavier one in the same session", () => {
    const onLiveUpdate = vi.fn();
    render(<LiveSessionHarness onLiveUpdate={onLiveUpdate} />);

    enterSet(0, 5, 95); // best of the session
    enterSet(1, 5, 90); // lighter — not a PR
    enterSet(2, 5, 85); // lighter still — not a PR

    const finalSets = onLiveUpdate.mock.calls.at(-1)[1].activeLog["ex-bench"];
    expect(finalSets.map((s) => s.isPR)).toEqual([true, false, false]);
  });
});
