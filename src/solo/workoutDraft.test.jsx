// @vitest-environment jsdom
// #157: a Train Solo workout in progress is kept on the phone, restored after
// the page is rebuilt, and Cancel with sets entered asks before throwing them
// away. Before this, the sets lived only in React state.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const ctx = {};
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("./SoloPaywall", () => ({ useSoloPaywall: () => ({ openPaywall: () => {} }) }));
vi.mock("./SoloThemeContext", async (orig) => ({ ...(await orig()), useSoloTheme: () => ({ dark: false }) }));
vi.mock("../lib/restNotification", () => ({ scheduleRestNotification: () => {}, cancelRestNotification: () => {} }));
vi.mock("./timerAudio", () => ({ playTimerDing: () => {}, armRestTimerAudio: () => {}, unlockTimerAudio: () => {} }));
vi.mock("../lib/AppContext", () => ({ getBestEverStats: () => ({}), estimate1RM: (w, r) => w * r, getPreviousSets: () => [] }));
vi.mock("../client/ClientApp", async () => {
  const React = await import("react");
  return {
    ClientThemeContext: React.createContext(false),
    RestBar: () => null,
    ExerciseDetailSheet: () => null,
    AddExerciseSheet: () => null,
    sectionedExercises: (list) => [{ key: "main", showHeader: false, items: list.map((exMeta, i) => ({ exMeta, i })) }],
  };
});
vi.mock("../components/ui", () => ({
  FullScreenOverlay: ({ children }) => children,
  SessionIntelligenceCard: () => null,
  PrimaryButton: ({ children, dark: _dark, ...p }) => <button {...p}>{children}</button>,
  BottomSheet: ({ open, title, children }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}));
vi.mock("./SoloSwapSheet", () => ({ default: () => null }));
// One reps box per set, enough to drive the screen's own state.
vi.mock("./SoloExerciseBlock", () => ({
  default: ({ exercise, rows, onChangeField }) => (
    <div>
      {rows.map((r, i) => (
        <input key={i} aria-label={`${exercise.name} set ${i + 1} reps`} value={r.reps} onChange={(e) => onChangeField(i, "reps", e.target.value)} />
      ))}
    </div>
  ),
}));

import SoloWorkoutSessionScreen from "./SoloWorkoutSessionScreen";
import { loadWorkoutDraft, saveWorkoutDraft, clearWorkoutDraft, draftHasWork, draftSessionKey } from "./workoutDraft";

const UID = "u1";
const session = {
  purchaseId: "u1_p1",
  programId: "p1",
  dayId: "d1",
  weekNumber: 2,
  day: { label: "Upper A", exercises: [{ exerciseId: "bench", targetSets: 2, targetReps: 8, section: "main" }] },
};

function renderAt(state, { history = true } = {}) {
  // With `history`, the workout is pushed on top of My Training (Cancel goes back).
  const entries = history ? ["/solo/home", { pathname: "/solo/workout", state }] : [{ pathname: "/solo/workout", state }];
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/solo/workout" element={<SoloWorkoutSessionScreen />} />
        <Route path="/solo/home" element={<p>My Training</p>} />
        <Route path="/solo/workout-summary" element={<p>Summary</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(ctx, {
    soloCurrentUser: { id: UID },
    soloExercises: [{ id: "bench", name: "Bench Press" }],
    soloWorkoutLogs: [],
    soloAccess: { tier: "free", live: false },
    soloContentById: {},
    setSoloProgramSwap: vi.fn(() => Promise.resolve()),
    logSoloWorkout: vi.fn(() => Promise.resolve({})),
  });
});
afterEach(cleanup);

describe("workoutDraft helpers", () => {
  it("keys a draft to the same purchase/day/week as the finished log id", () => {
    expect(draftSessionKey(session)).toBe("u1_p1_d1_w2");
  });
  it("only counts real entries as work", () => {
    expect(draftHasWork({ activeLog: { bench: [{ weight: "", reps: "" }] } })).toBe(false);
    expect(draftHasWork({ activeLog: { bench: [{ weight: "", reps: "8" }] } })).toBe(true);
    expect(draftHasWork({ activeLog: {}, extraExercises: [{ exerciseId: "x" }] })).toBe(true);
  });
  it("drops a draft older than 12 hours", () => {
    saveWorkoutDraft(UID, { sessionInfo: session, activeLog: { bench: [{ reps: "8" }] } }, 1000);
    expect(loadWorkoutDraft(UID, 1000 + 60 * 1000)).not.toBeNull();
    expect(loadWorkoutDraft(UID, 1000 + 13 * 60 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem(`apexSoloWorkoutDraft:${UID}`)).toBeNull();
  });
  it("clearing for one session never removes another session's draft", () => {
    saveWorkoutDraft(UID, { sessionInfo: session, activeLog: { bench: [{ reps: "8" }] } });
    clearWorkoutDraft(UID, { ...session, dayId: "other" });
    expect(loadWorkoutDraft(UID)).not.toBeNull();
    clearWorkoutDraft(UID, session);
    expect(loadWorkoutDraft(UID)).toBeNull();
  });
});

describe("SoloWorkoutSessionScreen keeps the workout on the phone", () => {
  it("saves sets as they're typed", () => {
    renderAt(session);
    fireEvent.change(screen.getByLabelText("Bench Press set 1 reps"), { target: { value: "8" } });
    const draft = loadWorkoutDraft(UID);
    expect(draft.key).toBe("u1_p1_d1_w2");
    expect(draft.activeLog.bench[0].reps).toBe("8");
  });

  it("restores the sets when the page reopens with no session (rebuilt page)", () => {
    saveWorkoutDraft(UID, { sessionInfo: session, activeLog: { bench: [{ setNumber: 1, weight: "60", reps: "8", completed: false }] }, startedAt: Date.now() });
    renderAt(null, { history: false });
    expect(screen.getByText("Upper A")).toBeTruthy();
    expect(screen.getByLabelText("Bench Press set 1 reps").value).toBe("8");
  });

  it("starting a different session leaves the unfinished one alone until something is typed", () => {
    saveWorkoutDraft(UID, { sessionInfo: session, activeLog: { bench: [{ reps: "8" }] } });
    renderAt({ ...session, dayId: "d2", day: { ...session.day, label: "Lower A" } });
    expect(screen.getByLabelText("Bench Press set 1 reps").value).toBe("");
    expect(loadWorkoutDraft(UID).key).toBe("u1_p1_d1_w2");
  });

  it("Cancel with sets entered asks first; Resume later keeps them", () => {
    renderAt(session);
    fireEvent.change(screen.getByLabelText("Bench Press set 1 reps"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByRole("dialog", { name: "Leave this workout?" })).toBeTruthy();
    fireEvent.click(screen.getByText("Resume later"));
    expect(screen.getByText("My Training")).toBeTruthy();
    expect(loadWorkoutDraft(UID)).not.toBeNull();
  });

  it("Discard workout throws the draft away", () => {
    renderAt(session);
    fireEvent.change(screen.getByLabelText("Bench Press set 1 reps"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Discard workout"));
    expect(screen.getByText("My Training")).toBeTruthy();
    expect(loadWorkoutDraft(UID)).toBeNull();
  });

  it("Cancel with nothing entered just leaves", () => {
    renderAt(session);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("My Training")).toBeTruthy();
  });

  it("completing the workout clears the draft", async () => {
    renderAt(session);
    fireEvent.change(screen.getByLabelText("Bench Press set 1 reps"), { target: { value: "8" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Complete Workout"));
    });
    expect(ctx.logSoloWorkout).toHaveBeenCalledTimes(1);
    expect(ctx.logSoloWorkout.mock.calls[0][1].entries[0].sets[0].reps).toBe(8);
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(loadWorkoutDraft(UID)).toBeNull();
  });

  it("a failed save keeps the draft", async () => {
    ctx.logSoloWorkout = vi.fn(() => Promise.reject(new Error("permission-denied")));
    renderAt(session);
    fireEvent.change(screen.getByLabelText("Bench Press set 1 reps"), { target: { value: "8" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Complete Workout"));
    });
    expect(screen.getByText(/Couldn't save this workout/)).toBeTruthy();
    expect(loadWorkoutDraft(UID)).not.toBeNull();
  });
});
