// @vitest-environment jsdom
//
// Regression coverage for a real production report: the rest timer
// "freezes" when a client leaves the app (switches apps / locks the
// screen) and comes back — the number doesn't reflect the real time that
// passed while they were away, though it does resume ticking down
// normally again once it catches up on its own.
//
// Root cause: the catch-up handler only listened for `visibilitychange`.
// On the native iOS App Store build (a bare WKWebView wrapper), that event
// doesn't reliably fire when the WHOLE APP is backgrounded/foregrounded —
// there's no browser tab being hidden, just the native window losing and
// regaining focus — so the instant-catch-up logic silently never ran
// there. The display only ever corrected once the throttled setInterval
// eventually ticked again on its own, which looked exactly like freezing
// until it "caught up." Fixed by also listening for window focus, the
// same combination already used (and already working) for this app's
// session-duration tracker elsewhere in this file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    date: "2026-10-06",
    label: "Push Day",
    instructions: "",
    exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 4, targetReps: 10, targetType: "reps", restSeconds: 90 }],
  };
}

function LiveSessionHarness() {
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
      onLiveUpdate={() => {}}
      sessionNote=""
      onChangeSessionNote={() => {}}
      onSaveSessionNote={() => {}}
    />
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkoutSession rest timer background catch-up", () => {
  it("catches up on window focus alone, without a visibilitychange event (the native-app case)", () => {
    render(<LiveSessionHarness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(screen.getByText("1:30")).toBeTruthy(); // 90s rest, just started

    // Simulate the OS suspending JS timers while the app is backgrounded:
    // real time passes but no interval ticks fire during it.
    act(() => {
      vi.setSystemTime(Date.now() + 70_000);
    });
    // The native app: window regains focus, but WKWebView never fires
    // visibilitychange for an app-level background/foreground transition.
    act(() => {
      fireEvent(window, new Event("focus"));
    });

    // Should already reflect the real 70s that passed (90 - 70 = 20),
    // not the stale pre-background 1:30.
    expect(screen.getByText("0:20")).toBeTruthy();
  });

  it("still catches up via visibilitychange alone (the regular browser/PWA case)", () => {
    render(<LiveSessionHarness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(screen.getByText("1:30")).toBeTruthy();

    act(() => {
      vi.setSystemTime(Date.now() + 70_000);
    });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText("0:20")).toBeTruthy();
  });
});
