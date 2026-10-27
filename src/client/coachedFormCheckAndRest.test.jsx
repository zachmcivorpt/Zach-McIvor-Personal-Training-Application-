// @vitest-environment jsdom
//
// Coached live workout: a form-check video sent from an exercise goes to
// the coach tagged with that exercise and set, the coach's reply shows
// above that exercise, and starting/skipping rest schedules/cancels the
// iPhone app's lock-screen "Rest's up" alert.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkoutSession } from "./ClientApp";

vi.setConfig({ testTimeout: 30000 });
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { workoutComments: {} }, currentUser: { id: "client-a" }, addWorkoutComment: vi.fn(), moveScheduledWorkout: vi.fn() }),
  getPreviousSets: () => [],
  estimate1RM: () => 0,
  getBestEverStats: () => ({}),
  getCurrentPhase: () => null,
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock("../lib/storage", () => ({
  uploadMessageVideo: vi.fn(async () => ({ url: "https://x/form.mp4", type: "video", name: "form.mp4" })),
  uploadMessagePdf: vi.fn(),
  uploadMessageImage: vi.fn(),
  uploadMessageAudio: vi.fn(),
}));

afterEach(() => {
  cleanup();
  delete window.webkit;
});

const BENCH_PRESS = { id: "ex-bench", name: "Bench Press", videoUrl: "" };
const session = () => ({ id: "s1", date: "2026-10-28", label: "Push Day", exercises: [{ exerciseId: "ex-bench", section: "main", targetSets: 3, targetReps: 10, targetType: "reps", restSeconds: 90 }] });

function LiveSessionHarness({ thread = [], onSendFormCheck }) {
  const [activeLog, setActiveLog] = useState({});
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [exerciseSwaps, setExerciseSwaps] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  return (
    <WorkoutSession
      session={session()}
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
      thread={thread}
      onSendFormCheck={onSendFormCheck}
    />
  );
}

describe("coached workout: form checks and the lock-screen rest alert", () => {
  it("sends a form-check video tagged with the exercise and set", async () => {
    const onSendFormCheck = vi.fn();
    render(<LiveSessionHarness onSendFormCheck={onSendFormCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Send a form-check video of Bench Press" }));
    const input = document.querySelector('input[type="file"][accept="video/*"]'); // the session renders in a portal
    fireEvent.change(input, { target: { files: [new File(["v"], "form.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(onSendFormCheck).toHaveBeenCalled());
    const [text, attachment] = onSendFormCheck.mock.calls[0];
    expect(text).toBe("Form check: Bench Press · Set 1");
    expect(attachment).toMatchObject({ type: "video", url: "https://x/form.mp4", formCheck: { exerciseId: "ex-bench", exerciseName: "Bench Press", setNumber: 1 } });
    expect(await screen.findByText("Form check sent to your coach.")).toBeTruthy();
  });

  it("shows the coach's latest form feedback above that exercise", () => {
    const thread = [{ id: "r1", from: "coach", text: "Brace harder before the descent", date: new Date(2026, 9, 27).getTime(), replyTo: { exerciseId: "ex-bench", exerciseName: "Bench Press" } }];
    render(<LiveSessionHarness thread={thread} onSendFormCheck={vi.fn()} />);
    expect(screen.getByText(/COACH'S FORM FEEDBACK/)).toBeTruthy();
    expect(screen.getByText("Brace harder before the descent")).toBeTruthy();
  });

  it("schedules the lock-screen rest alert on start and cancels it on skip", () => {
    const posted = [];
    window.webkit = { messageHandlers: { apexRest: { postMessage: (m) => posted.push(m) } } };
    render(<LiveSessionHarness onSendFormCheck={vi.fn()} />);
    fireEvent.click(screen.getByText("Tap to start rest timer"));
    expect(posted.at(-1)).toEqual({ action: "schedule", seconds: 90, title: "Rest's up", body: "Time for your next set of Bench Press." });
    fireEvent.click(screen.getByText("SKIP"));
    expect(posted.at(-1)).toEqual({ action: "cancel" });
  });
});
