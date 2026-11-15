// @vitest-environment jsdom
//
// #236: the goal screen (first time and from My Training), the goal card
// and insight on My Training, and the after-workout highlight.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SOLO_THEMES } from "./SoloThemeContext";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("./SoloThemeContext", async (orig) => ({ ...(await orig()), useSoloTheme: () => ({ dark: true }) }));
const saveSoloGoal = vi.fn(() => Promise.resolve());
const markGoalPromptSeen = vi.fn();
vi.mock("./goalStore", () => ({ saveSoloGoal: (...a) => saveSoloGoal(...a), markGoalPromptSeen: (...a) => markGoalPromptSeen(...a), goalPromptSeen: () => false }));
vi.mock("../client/ClientApp", () => ({ estimateCalories: () => 100 }));

const { default: SoloGoalScreen } = await import("./SoloGoalScreen");
const { default: SoloGoalCard, SoloInsightLine } = await import("./SoloGoalCard");
const { default: SoloWorkoutSummaryScreen } = await import("./SoloWorkoutSummaryScreen");

const lib = [
  { id: "bp", name: "Bench Press" },
  { id: "sq", name: "Back Squat" },
];
const at = (key) => new Date(`${key}T09:00:00`).getTime();
const log = (id, key, exerciseId, weight, reps, isPR = false) => ({ id, date: at(key), entries: [{ exerciseId, sets: [{ weight, reps, isPR }] }] });

beforeEach(() => {
  saveSoloGoal.mockClear();
  markGoalPromptSeen.mockClear();
  ctx = {
    soloCurrentUser: { id: "u1", name: "Sam Lee", onboarding: { answers: { primaryGoal: "get_stronger", sessionsPerWeek: 3 } } },
    soloExercises: lib,
    soloWorkoutLogs: [log("1", "2026-11-02", "bp", 72.5, 5)],
    soloWeighIns: [],
    soloBodyMetrics: [],
    logSoloWeight: vi.fn(() => Promise.resolve()),
  };
});
afterEach(cleanup);

describe("goal screen", () => {
  it("first time: suggestions led by their answer, marked seen as it shows, saved with its starting point", async () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <SoloGoalScreen firstTime onDone={onDone} />
      </MemoryRouter>
    );
    expect(markGoalPromptSeen).toHaveBeenCalledWith("u1");
    expect(screen.getByText("What are you training for?")).toBeTruthy();
    const rows = screen.getByTestId("goal-options").querySelectorAll("li");
    expect(rows[0].textContent).toMatch(/^Bench press 100 kgYour best so far: 72.5 kg\.$/);
    fireEvent.click(screen.getByText("Bench press 100 kg"));
    fireEvent.click(screen.getByRole("button", { name: "More kg" }));
    expect(screen.getByText("Bench press 102.5 kg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set my goal" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [uid, goal] = saveSoloGoal.mock.calls[0];
    expect(uid).toBe("u1");
    expect(goal).toMatchObject({ type: "lift", target: 102.5, exerciseId: "bp", start: 72.5 });
    expect(goal.startKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("first time: Skip for now saves nothing", () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <SoloGoalScreen firstTime onDone={onDone} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onDone).toHaveBeenCalled();
    expect(saveSoloGoal).not.toHaveBeenCalled();
  });

  it("changing an existing goal keeps its start; it can be removed", async () => {
    ctx.soloCurrentUser.goal = { type: "workouts", target: 20, startKey: "2026-10-01", setAt: 1 };
    render(
      <MemoryRouter initialEntries={["/solo/goal"]}>
        <Routes>
          <Route path="/solo/goal" element={<SoloGoalScreen />} />
          <Route path="/solo/home" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Change your goal")).toBeTruthy();
    expect(markGoalPromptSeen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "More workouts" }));
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }));
    await screen.findByText("home");
    expect(saveSoloGoal.mock.calls[0][1]).toMatchObject({ type: "workouts", target: 25, startKey: "2026-10-01" });
  });
});

describe("their own goal (#237)", () => {
  it("reads what they write into a goal it can track, and saves their words with it", async () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <SoloGoalScreen firstTime onDone={onDone} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Your own goal"));
    const input = screen.getByLabelText("Your own goal");
    fireEvent.change(input, { target: { value: "run a marathon" } });
    expect(screen.getByTestId("goal-own-hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set my goal" }).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "squat 140" } });
    expect(screen.getByTestId("goal-own-reading").textContent).toMatch(/We'll track this asBack Squat 140 kg/);
    // Still adjustable, and the field keeps focus-free typing working.
    fireEvent.click(screen.getByRole("button", { name: "More kg" }));
    expect(screen.getByTestId("goal-own-reading").textContent).toMatch(/Back Squat 142.5 kg/);
    fireEvent.click(screen.getByRole("button", { name: "Set my goal" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(saveSoloGoal.mock.calls[0][1]).toMatchObject({ type: "lift", exerciseId: "sq", target: 142.5, ownText: "squat 140" });
  });
});

describe("goal card (Progress) and insight (My Training)", () => {
  const t = SOLO_THEMES.dark;
  it("shows the goal's progress from their logs; the insight is its own line", () => {
    const goal = { type: "workouts", target: 4, startKey: "2026-11-01" };
    const logs = [log("1", "2026-11-02", "sq", 100, 5, true), log("2", "2026-11-04", "sq", 105, 5, true), log("3", "2026-11-10", "bp", 70, 5)];
    render(
      <MemoryRouter>
        <SoloGoalCard profile={{ id: "u1", goal }} logs={logs} weighIns={[]} bodyMetrics={[]} todayKey="2026-11-12" t={t} />
        <SoloInsightLine profile={{ id: "u1", goal }} logs={logs} weighIns={[]} bodyMetrics={[]} exercises={lib} todayKey="2026-11-12" t={t} />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 2, name: "Your Goal" })).toBeTruthy();
    expect(screen.getByTestId("goal-value").textContent).toBe("3");
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("Three quarters there — 1 workout to go.")).toBeTruthy();
    expect(screen.getByTestId("solo-insight").textContent.length).toBeGreaterThan(10);
  });

  it("no goal: offers to set one; no data: no insight", () => {
    render(
      <MemoryRouter>
        <SoloGoalCard profile={{ id: "u1" }} logs={[]} weighIns={[]} bodyMetrics={[]} todayKey="2026-11-12" t={t} />
        <SoloInsightLine profile={{ id: "u1" }} logs={[]} weighIns={[]} bodyMetrics={[]} exercises={lib} todayKey="2026-11-12" t={t} />
      </MemoryRouter>
    );
    expect(screen.getByText("Set your main goal")).toBeTruthy();
    expect(screen.queryByTestId("solo-insight")).toBe(null);
  });
});

describe("after a workout", () => {
  function renderSummary(logId) {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/s", state: { daySession: { label: "Upper" }, activeLog: {}, durationMin: 40, logId } }]}>
        <Routes>
          <Route path="/s" element={<SoloWorkoutSummaryScreen />} />
        </Routes>
      </MemoryRouter>
    );
  }
  it("says when the workout passed a goal milestone", () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    ctx.soloCurrentUser.goal = { type: "workouts", target: 2, startKey: key };
    ctx.soloWorkoutLogs = [log("a", key, "bp", 50, 5), log("b", key, "bp", 50, 5)];
    renderSummary("b");
    expect(screen.getByTestId("workout-highlight").textContent).toBe("Goal reached. That's what consistency does.");
  });
  it("says nothing when there's nothing worth saying", () => {
    ctx.soloWorkoutLogs = [log("a", "2026-11-02", "bp", 72.5, 5), log("b", "2026-11-09", "bp", 60, 5)];
    renderSummary("b");
    expect(screen.queryByTestId("workout-highlight")).toBe(null);
  });
});
