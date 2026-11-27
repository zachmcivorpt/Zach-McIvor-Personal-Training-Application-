// @vitest-environment jsdom
// #328 (owner, 2026-11-27): one small glass rest timer for both apps, and
// every button works — on the REAL coached WorkoutSession: start rest shows
// the ring, +15s adds 15 seconds (and re-schedules the lock-screen alert),
// Skip closes it (and cancels the alert). Train Solo's ring is the same.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkoutSession } from "./ClientApp";
import { RestRing } from "../components/RestRing";

vi.setConfig({ testTimeout: 30000 });
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { workoutComments: {} }, currentUser: { id: "client-a" }, addWorkoutComment: vi.fn(), moveScheduledWorkout: vi.fn() }),
  getPreviousSets: () => [],
  estimate1RM: () => 0,
  getBestEverStats: () => ({}),
  getCurrentPhase: () => null,
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));

afterEach(() => {
  cleanup();
  delete window.webkit;
});

const BENCH = { id: "ex-bench", name: "Bench Press", videoUrl: "" };
function Harness() {
  const [activeLog, setActiveLog] = useState({});
  const [n, setN] = useState({});
  const [sw, setSw] = useState({});
  const [ex, setEx] = useState([]);
  return (
    <WorkoutSession
      session={{ id: "s1", date: "2026-11-27", label: "Push Day", exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 3, targetReps: 10, targetType: "reps", restSeconds: 90 }] }}
      activeLog={activeLog} setActiveLog={setActiveLog} logsForClient={[]} exercisesById={{ "ex-bench": BENCH }}
      exerciseNotes={n} setExerciseNotes={setN} allExercises={[BENCH]} exerciseSwaps={sw} setExerciseSwaps={setSw}
      extraExercises={ex} setExtraExercises={setEx} onFinish={() => {}} finishing={false} onExit={() => {}} onSaveNote={() => {}}
      clientId="client-a" onLiveUpdate={() => {}} sessionNote="" onChangeSessionNote={() => {}} onSaveSessionNote={() => {}} thread={[]} onSendFormCheck={() => {}}
    />
  );
}

describe("glass rest timer (#328)", () => {
  it("coached workout: start shows the ring; +15s adds 15 s; Skip closes it", () => {
    const posted = [];
    window.webkit = { messageHandlers: { apexRest: { postMessage: (m) => posted.push(m) } } };
    render(<Harness />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    const ring = screen.getByTestId("rest-ring");
    expect(within(ring).getByTestId("rest-time").textContent).toBe("1:30");
    fireEvent.click(within(ring).getByRole("button", { name: "Add 15 seconds" }));
    expect(within(ring).getByTestId("rest-time").textContent).toBe("1:45");
    expect(posted.at(-1)).toMatchObject({ action: "schedule", title: "Rest's up" });
    expect(Math.round(posted.at(-1).seconds)).toBe(105);
    fireEvent.click(within(ring).getByRole("button", { name: "Skip rest" }));
    expect(screen.queryByTestId("rest-ring")).toBeNull();
    expect(posted.at(-1)).toEqual({ action: "cancel" });
  });

  it("is small see-through glass in light and dark", () => {
    for (const dark of [false, true]) {
      const { unmount } = render(<RestRing dark={dark} restTime={60} restTotal={90} onSkip={() => {}} onAdd15={() => {}} />);
      const glass = screen.getByTestId("rest-ring-glass");
      expect(glass.style.backdropFilter || glass.style.webkitBackdropFilter).toContain("blur(36px)");
      expect(glass.style.backgroundColor).toMatch(/rgba\(.*0\.1[68]\)/);
      unmount();
    }
  });

  it("Train Solo's ring is the same component with working buttons", async () => {
    const { SoloRestRing } = await import("../solo/SoloWorkoutSessionScreen");
    const onSkip = vi.fn();
    const onAdd15 = vi.fn();
    render(<SoloRestRing restTime={45} restTotal={90} onSkip={onSkip} onAdd15={onAdd15} />);
    const ring = screen.getByTestId("solo-rest-ring");
    expect(within(ring).getByTestId("rest-ring-glass")).toBeTruthy();
    fireEvent.click(within(ring).getByRole("button", { name: "Add 15 seconds" }));
    fireEvent.click(within(ring).getByRole("button", { name: "Skip rest" }));
    expect(onAdd15).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
