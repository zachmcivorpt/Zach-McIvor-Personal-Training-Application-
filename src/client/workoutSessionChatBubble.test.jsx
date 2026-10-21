// @vitest-environment jsdom
//
// Session live chat — WorkoutSession is a full-screen opaque overlay
// (z-[90]) that previously sat on top of the app-level CoachChatBubble
// (z-[55]), completely hiding it (not just visually dimming it) for the
// whole active workout. Fix: WorkoutSession now mounts its own copy of
// the same CoachChatBubble inside its own root, so it's actually visible
// during a session; ClientApp suppresses its own top-level copy while a
// session is open so there's never two mounted at once. These tests cover
// the bubble's presence/absence/behaviour inside WorkoutSession itself —
// not the top-level suppression, which isn't practically unit-testable in
// isolation from the full ClientApp tree.
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
  estimate1RM: (weight, reps) => Math.round(weight * (1 + reps / 30) * 10) / 10,
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

function LiveSessionHarness({ coachUser, unreadCount, onOpenMessages }) {
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
      coachUser={coachUser}
      unreadCount={unreadCount}
      onOpenMessages={onOpenMessages}
    />
  );
}

afterEach(() => cleanup());

function enterSet(rowIndex, reps, weight) {
  const repsInputs = document.querySelectorAll('input[type="number"][inputmode="numeric"]');
  const weightInputs = document.querySelectorAll('input[type="number"][inputmode="decimal"]');
  fireEvent.change(repsInputs[rowIndex], { target: { value: String(reps) } });
  fireEvent.change(weightInputs[rowIndex], { target: { value: String(weight) } });
  fireEvent.blur(weightInputs[rowIndex]);
}

describe("WorkoutSession coach chat bubble", () => {
  it("renders the coach's avatar inside the session when a coach is assigned", () => {
    render(<LiveSessionHarness coachUser={{ name: "Coach Dan", avatarUrl: "https://example.com/dan.jpg" }} unreadCount={0} onOpenMessages={() => {}} />);
    const bubble = screen.getByLabelText("Message Coach Dan");
    expect(bubble.querySelector("img").src).toContain("dan.jpg");
  });

  it("falls back to the APEX mark when the coach has no avatar set", () => {
    render(<LiveSessionHarness coachUser={{ name: "Coach Dan", avatarUrl: null }} unreadCount={0} onOpenMessages={() => {}} />);
    const bubble = screen.getByLabelText("Message Coach Dan");
    expect(bubble.querySelector("img").src).toContain("mark-white.png");
  });

  it("does not render a chat bubble at all when there is no assigned coach yet", () => {
    render(<LiveSessionHarness coachUser={null} unreadCount={0} onOpenMessages={() => {}} />);
    expect(screen.queryByLabelText(/^Message /)).toBeNull();
  });

  it("shows the unread badge with the current count", () => {
    render(<LiveSessionHarness coachUser={{ name: "Coach Dan", avatarUrl: null }} unreadCount={3} onOpenMessages={() => {}} />);
    const bubble = screen.getByLabelText("Message Coach Dan");
    expect(bubble.querySelector("span").textContent).toBe("3");
  });

  it("calls onOpenMessages (the same handler used everywhere else) when tapped", () => {
    const onOpenMessages = vi.fn();
    render(<LiveSessionHarness coachUser={{ name: "Coach Dan", avatarUrl: null }} unreadCount={0} onOpenMessages={onOpenMessages} />);
    fireEvent.click(screen.getByLabelText("Message Coach Dan"));
    expect(onOpenMessages).toHaveBeenCalledTimes(1);
  });

  it("opening messages does not reset logged sets or unmount the session", () => {
    const onOpenMessages = vi.fn();
    render(<LiveSessionHarness coachUser={{ name: "Coach Dan", avatarUrl: null }} unreadCount={0} onOpenMessages={onOpenMessages} />);

    enterSet(0, 5, 85);
    const weightInputs = document.querySelectorAll('input[type="number"][inputmode="decimal"]');
    expect(weightInputs[0].value).toBe("85");

    fireEvent.click(screen.getByLabelText("Message Coach Dan"));

    // onOpenMessages is a prop call up to the parent (which owns the
    // MessagesSheet/portal) — WorkoutSession itself never unmounts or
    // clears any of its own state in response, so the logged set is
    // still exactly where it was.
    const weightInputsAfter = document.querySelectorAll('input[type="number"][inputmode="decimal"]');
    expect(weightInputsAfter[0].value).toBe("85");
  });
});
