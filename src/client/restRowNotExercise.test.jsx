// @vitest-environment jsdom
//
// Regression coverage for a real production bug: a Rest row (WorkoutEditor
// .jsx's emptyRest() — { isRest: true, restSeconds }, no exerciseId at
// all) was being rendered in the client app as if it were a real,
// loggable exercise. exercisesById lookup failed for its (missing)
// exerciseId, which — since the "deleted exercise falls back instead of
// vanishing" fix — now shows a visible "Unknown exercise" card with no
// sets/reps, instead of the old silent (and, for Rest rows specifically,
// correct) vanish. A client reported seeing exactly this in a real
// session: an empty "Unknown exercise" card in both the warm-up and main
// session sections, each a Rest row the coach had placed between real
// exercises. The fix filters isRest rows out before they're ever handed
// to the exercise-rendering path, in both the workout preview and the
// live logging session.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkoutPreviewSheet, WorkoutSession } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { workoutComments: {} },
    currentUser: { id: "client-a" },
    addWorkoutComment: vi.fn(),
    moveScheduledWorkout: vi.fn(),
  }),
  getPreviousSets: () => [],
  estimate1RM: () => 0,
  getBestEverStats: () => ({}),
  getCurrentPhase: () => null,
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn() }));

afterEach(() => cleanup());

const BENCH_PRESS = { id: "ex-bench", name: "Bench Press", videoUrl: "" };

function scheduledSessionWithRestRow() {
  return {
    id: "sched-1",
    date: "2026-10-06",
    label: "Push Day",
    instructions: "",
    exercises: [
      { exerciseId: "ex-bench", section: "main", targetSets: 4, targetReps: 10, targetType: "reps", restSeconds: 90 },
      // A Rest row — exactly WorkoutEditor.jsx's emptyRest() shape.
      { isRest: true, section: "main", restSeconds: 90 },
    ],
  };
}

describe("WorkoutPreviewSheet", () => {
  it("does not render a Rest row as an 'Unknown exercise' card", () => {
    render(
      <WorkoutPreviewSheet
        session={scheduledSessionWithRestRow()}
        exercisesById={{ "ex-bench": BENCH_PRESS }}
        logsForClient={[]}
        canStart
        onStart={() => {}}
        onContinue={() => {}}
        onClose={() => {}}
        showToast={() => {}}
      />
    );

    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.queryByText("Unknown exercise")).toBeNull();
  });
});

function LiveSessionHarness() {
  const [activeLog, setActiveLog] = useState({});
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  return (
    <WorkoutSession
      session={scheduledSessionWithRestRow()}
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
      onLiveUpdate={() => {}}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

describe("WorkoutSession (live logging screen)", () => {
  it("does not render a Rest row as an 'Unknown exercise' card to log sets against", () => {
    render(<LiveSessionHarness />);
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.queryByText("Unknown exercise")).toBeNull();
  });
});
