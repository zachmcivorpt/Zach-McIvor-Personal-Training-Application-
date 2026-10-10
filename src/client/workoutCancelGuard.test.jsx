// @vitest-environment jsdom
//
// Regression coverage for a real production report: "Complete Workout"
// showed "Saving…" for a while on a slow connection (expected — it's a
// real Firestore write), but the header's "Cancel" button had no guard at
// all against being tapped while that save was still in flight. A client
// could tap Complete Workout, then tap Cancel a moment later (it looked
// like nothing was happening yet), exit the screen, and have the original
// save land anyway once it finally went through — risking exactly the
// duplicate-entry confusion this app has already had to fix elsewhere
// (FoodQuantitySheet, bug #35): the client, having "cancelled," has no
// reason to think the workout got logged, and might log it again.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkoutSession } from "./ClientApp";

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

const BENCH_PRESS = { id: "ex-bench", name: "Bench Press", videoUrl: "" };

function scheduledSession() {
  return {
    id: "sched-1",
    date: "2026-10-10",
    label: "Push Day",
    instructions: "",
    exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 4, targetReps: 10, targetType: "reps", restSeconds: 90 }],
  };
}

function LiveSessionHarness({ finishing, onExit }) {
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
      finishing={finishing}
      onExit={onExit}
      onSaveNote={() => {}}
      clientId="client-a"
      onLiveUpdate={() => {}}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

afterEach(() => cleanup());

describe("WorkoutSession Cancel button", () => {
  it("is disabled and does not call onExit while a save (finishing) is in flight", () => {
    const onExit = vi.fn();
    render(<LiveSessionHarness finishing={true} onExit={onExit} />);
    const cancelButton = screen.getByText("Cancel").closest("button");
    expect(cancelButton.disabled).toBe(true);
    fireEvent.click(cancelButton);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("still works normally (enabled, calls onExit) when nothing is saving", () => {
    const onExit = vi.fn();
    render(<LiveSessionHarness finishing={false} onExit={onExit} />);
    const cancelButton = screen.getByText("Cancel").closest("button");
    expect(cancelButton.disabled).toBe(false);
    fireEvent.click(cancelButton);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
