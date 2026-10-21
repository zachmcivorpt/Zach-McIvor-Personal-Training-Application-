// @vitest-environment jsdom
//
// Regression coverage for two real production reports on the same timer:
//
// 1. The rest timer "freezes" when a client leaves the app (switches apps
//    / locks the screen) and comes back — the number doesn't reflect the
//    real time that passed while they were away, though it does resume
//    ticking down normally again once it catches up on its own.
//
//    Root cause: the catch-up handler only listened for `visibilitychange`.
//    On the native iOS App Store build (a bare WKWebView wrapper), that
//    event doesn't reliably fire when the WHOLE APP is backgrounded/
//    foregrounded — there's no browser tab being hidden, just the native
//    window losing and regaining focus — so the instant-catch-up logic
//    silently never ran there. Fixed by also listening for window focus.
//
// 2. "The coach pauses the timer [backgrounds the app while resting]. While
//    paused, the displayed time randomly changes" — once caught up on
//    return, the number could jump to a value with no relation to the real
//    rest period. Root cause: the deadline (restEndAtRef) and every
//    catch-up calculation were computed from Date.now(), the system wall
//    clock. Phones routinely resync that clock (NTP, timezone/DST) —
//    commonly right as a backgrounded app wakes back up, exactly the
//    moment this got re-read. A resync landing in that window produced an
//    unrelated, seemingly random number with no actual bug in the
//    countdown math — just the wrong clock source. Fixed by switching to
//    performance.now(), which is monotonic and immune to the system clock
//    being adjusted.
//
// Vitest's fake timers intentionally don't move performance.now() via
// vi.setSystemTime() (it jumps Date only, mirroring real browser
// semantics where performance.now() is immune to wall-clock adjustment) —
// so these tests mock performance.now() directly to control it, which
// also gives precise control for proving the clock-jump-immunity case.
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

let perfNow;

beforeEach(() => {
  vi.useFakeTimers();
  perfNow = 1_000_000; // arbitrary non-zero origin
  vi.spyOn(performance, "now").mockImplementation(() => perfNow);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WorkoutSession rest timer — background catch-up", () => {
  it("catches up on window focus alone, without a visibilitychange event (the native-app case)", () => {
    render(<LiveSessionHarness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(screen.getByText("1:30")).toBeTruthy(); // 90s rest, just started

    // Simulate the OS suspending JS timers while the app is backgrounded:
    // real elapsed time passes but no interval ticks fire during it.
    perfNow += 70_000;
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

    perfNow += 70_000;
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText("0:20")).toBeTruthy();
  });
});

describe("WorkoutSession rest timer — immune to system clock jumps while backgrounded", () => {
  it("is unaffected by a Date/system-clock jump (NTP resync, timezone/DST change) with no real time passing", () => {
    render(<LiveSessionHarness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(screen.getByText("1:30")).toBeTruthy();

    // The system wall clock jumps forward an hour (e.g. a timezone/NTP
    // resync) — but performance.now() (real elapsed time) hasn't moved at
    // all: no real time has actually passed.
    act(() => {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    });
    act(() => {
      fireEvent(window, new Event("focus"));
    });

    // Must still read 1:30 — a wall-clock jump alone must never change
    // the displayed rest time.
    expect(screen.getByText("1:30")).toBeTruthy();
  });

  it("correctly reflects real elapsed time even when a clock jump happens in the same window", () => {
    render(<LiveSessionHarness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));

    // 20 real seconds pass...
    perfNow += 20_000;
    // ...and, independently, the wall clock also jumps (unrelated system
    // event) — this must have zero effect on the result.
    act(() => {
      vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000);
    });
    act(() => {
      fireEvent(window, new Event("focus"));
    });

    expect(screen.getByText("1:10")).toBeTruthy(); // 90 - 20, not affected by the clock jump
  });
});

describe("WorkoutSession rest timer — single interval, no leaks across rest periods", () => {
  it("only ever runs one interval even across start → skip → start again", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    render(<LiveSessionHarness />);

    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByText("SKIP"));
    });
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(setIntervalSpy).toHaveBeenCalledTimes(2); // one fresh interval for the new rest period, not a second one layered on top

    // Advancing one second should decrement by exactly 1, never 2 — proof
    // there's only ever one interval driving the display.
    perfNow += 1_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("1:29")).toBeTruthy();
  });
});
