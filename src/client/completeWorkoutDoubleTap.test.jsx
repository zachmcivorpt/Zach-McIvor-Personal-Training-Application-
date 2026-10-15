// @vitest-environment jsdom
//
// Regression coverage for a real production report: "Session freezes after
// pressing Save" — the coach completes a session and presses Save
// (Complete Workout), and the session freezes/hangs instead of completing.
//
// Root cause: the Complete Workout button's disabled-while-saving state
// is driven by `finishing`, a prop backed by useState in the parent. State
// updates only take effect on React's next render, so two click dispatches
// landing in the same task (a touchend/click double-fire for one physical
// tap) both read the stale "not finishing" render and both call onFinish
// (finishWorkout), firing two concurrent saves. For an unscheduled/ad-hoc
// workout this creates two separate completed-workout documents; more
// generally, two overlapping save attempts racing against the same
// session state is exactly the kind of thing that can leave the UI in an
// inconsistent "stuck" state depending on which one settles first or
// whether one fails partway through.
//
// Fixed the same way as the nutrition double-log bugs (addBusyRef/
// confirmingRef): a synchronous ref (finishingRef) gates the actual call,
// independent of whether the `finishing` prop has committed to a render
// yet. The ref resets whenever `finishing` goes back to false (a failed
// save), so a legitimate retry tap is never permanently blocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    date: "2026-10-15",
    label: "Push Day",
    instructions: "",
    exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 4, targetReps: 10, targetType: "reps", restSeconds: 90 }],
  };
}

// Mirrors how the real parent (ClientApp) wires finishing/onFinish: a
// stateful `finishing` flag that the save handler flips, so this harness
// exercises the actual prop-driven disabled-button interplay, not just a
// static prop.
function LiveSessionHarness({ onFinishImpl }) {
  const [activeLog, setActiveLog] = useState({});
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  const [finishing, setFinishing] = useState(false);
  async function handleFinish() {
    setFinishing(true);
    try {
      await onFinishImpl();
    } catch {
      // Mirrors the real finishWorkout's own contract: a failed save is
      // caught internally (shows a toast, re-enables the button) and
      // never rejects out to its caller.
    } finally {
      setFinishing(false);
    }
  }
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
      onFinish={handleFinish}
      finishing={finishing}
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

afterEach(() => cleanup());

describe("WorkoutSession Complete Workout — rapid double-tap", () => {
  it("calls onFinish exactly once when the button gets two click dispatches in the same tick", () => {
    const onFinishImpl = vi.fn(() => new Promise(() => {})); // never resolves — isolates the dispatch count
    render(<LiveSessionHarness onFinishImpl={onFinishImpl} />);
    const btn = screen.getByText("Complete Workout");

    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    expect(onFinishImpl).toHaveBeenCalledTimes(1);
  });

  it("repeated rapid taps while already saving still only ever trigger one save", () => {
    const onFinishImpl = vi.fn(() => new Promise(() => {}));
    render(<LiveSessionHarness onFinishImpl={onFinishImpl} />);
    const btn = screen.getByText("Complete Workout");

    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    expect(onFinishImpl).toHaveBeenCalledTimes(1);
  });
});

describe("WorkoutSession Complete Workout — failure recovery", () => {
  it("a failed save clears the loading state and allows a genuine retry tap", async () => {
    const onFinishImpl = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<LiveSessionHarness onFinishImpl={onFinishImpl} />);
    const btn = screen.getByText("Complete Workout");

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onFinishImpl).toHaveBeenCalledTimes(1);
    // Not permanently locked out after the failure.
    expect(screen.getByText("Complete Workout")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Complete Workout"));
    });
    expect(onFinishImpl).toHaveBeenCalledTimes(2);
  });
});
