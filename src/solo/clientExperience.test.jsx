// @vitest-environment jsdom
//
// #141 on real screens: program complete, the Monday recap, the day-one
// session, missed sessions in My Training, smarter/remembered swaps, and the
// warm-up & plates helper.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("../client/ClientApp", () => ({
  useClientDark: () => false,
  formatTargetReps: (r) => String(r.targetReps),
  ClientThemeContext: React.createContext(false),
  AddExerciseSheet: () => null,
  ExerciseDetailSheet: () => null,
  getPreviousSets: () => [],
  getBestEverStats: () => ({ bestScore: 0, bestSet: null, maxWeight: 0 }),
  estimate1RM: (w, r) => w * (1 + r / 30),
  sectionedExercises: (list) => [{ key: "main", label: "Main", showHeader: false, items: list.map((exMeta, i) => ({ exMeta, i })) }],
  SessionIntelligenceCard: () => null,
  estimateCalories: () => 100,
}));

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => key(new Date(Date.now() - n * 86400000));
const exercises = [
  { id: "sq", name: "Back Squat", equipment: "Barbell", category: "Legs" },
  { id: "gs", name: "Goblet Squat", equipment: "Dumbbell", category: "Legs" },
  { id: "dp", name: "Dumbbell Bench Press", equipment: "Dumbbell", category: "Chest" },
  { id: "dr", name: "Dumbbell Row", equipment: "Dumbbell", category: "Back" },
  { id: "gb", name: "Glute Bridge", equipment: "Bodyweight", category: "Legs" },
  { id: "pl", name: "Plank", equipment: "Bodyweight", category: "Core" },
];
const program = { id: "p1", name: "Strength Foundation", status: "published", categoryIds: ["c1"], goals: ["strength"], weekOnePreview: { totalWeeks: 2 } };
const nextProgram = { id: "p2", name: "Hypertrophy Block", status: "published", categoryIds: ["c1"], goals: ["strength"], weekOnePreview: { totalWeeks: 8 } };

function baseCtx(over = {}) {
  return {
    soloCurrentUser: { id: "u1", name: "Tylah Earl", programsGuideSeenAt: 1, onboarding: { answers: { availableEquipment: ["dumbbells"], primaryGoal: "strength" } } },
    soloExercises: exercises,
    soloPrograms: [program, nextProgram],
    soloProgramCategories: [{ id: "c1", name: "Strength" }],
    soloProgramsById: { p1: program, p2: nextProgram },
    soloContentById: {},
    soloWorkoutLogs: [],
    soloTrainingPrograms: [],
    soloAccess: { tier: "plus", live: true },
    soloEntitlement: null,
    soloTier: "plus",
    soloGatesLive: true,
    soloAuthUser: { uid: "u1" },
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({})),
    setSoloProgramSwap: vi.fn(() => Promise.resolve()),
    setSoloSessionPlan: vi.fn(() => Promise.resolve()),
    logSoloWorkout: vi.fn(() => Promise.resolve({})),
    ...over,
  };
}
beforeEach(() => {
  ctx = baseCtx();
});
afterEach(cleanup);

async function renderAt(path, element, routePath, state) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <Routes>
            <Route path={routePath} element={element} />
            <Route path="/solo/home" element={<p>home-page</p>} />
            <Route path="/solo/workout" element={<p>workout-page</p>} />
            <Route path="/solo/program/:id" element={<p>program-page</p>} />
          </Routes>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("program complete", () => {
  it("shows the program's numbers and strength gained, then the next program", async () => {
    ctx = baseCtx({
      soloWorkoutLogs: [
        { id: "1", purchaseId: "u1_p1", weekNumber: 1, dayId: "a", durationMin: 60, entries: [{ exerciseId: "sq", sets: [{ weight: 100, reps: 5 }] }] },
        { id: "2", purchaseId: "u1_p1", weekNumber: 2, dayId: "a", durationMin: 60, entries: [{ exerciseId: "sq", sets: [{ weight: 110, reps: 5, isPR: true }] }] },
      ],
    });
    const { SoloProgramCompleteScreen } = await import("./SoloRecapScreens");
    await renderAt("/solo/program-complete", <SoloProgramCompleteScreen />, "/solo/program-complete", { purchaseId: "u1_p1", programId: "p1" });
    expect(screen.getByText("Program complete")).toBeTruthy();
    expect(screen.getByText("Strength Foundation")).toBeTruthy();
    const figures = screen.getByTestId("program-complete-figures").textContent;
    expect(figures).toContain("2Sessions");
    expect(figures).toContain("2 hTraining time");
    expect(figures).toContain("1,050 kgTotal lifted");
    expect(figures).toContain("1Personal records");
    expect(screen.getByText("Back Squat")).toBeTruthy();
    expect(screen.getByText("+10%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start your next program" }));
    await screen.findByText("program-page");
  });
});

describe("Monday recap", () => {
  it("shows last week's sessions, minutes and PRs, and this week", async () => {
    const lastMonday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
      return d;
    })();
    const at = (offset) => new Date(lastMonday.getTime() + offset * 86400000 + 9 * 3600000).getTime();
    ctx = baseCtx({
      soloWorkoutLogs: [
        { id: "1", purchaseId: "u1_custom", weekNumber: "x", dayId: "q", durationMin: 45, date: at(0), entries: [{ exerciseId: "gs", sets: [{ weight: 20, reps: 10, isPR: true }] }] },
        { id: "2", purchaseId: "u1_custom", weekNumber: "y", dayId: "q", durationMin: 30, date: at(3), entries: [{ exerciseId: "gs", sets: [{ weight: 20, reps: 10 }] }] },
      ],
    });
    const { SoloWeekRecapScreen } = await import("./SoloRecapScreens");
    await renderAt("/solo/week", <SoloWeekRecapScreen />, "/solo/week");
    expect(screen.getByTestId("week-headline").textContent).toBe("2");
    expect(screen.getByText("75")).toBeTruthy();
    expect(screen.getByText(/Nothing planned/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log this week's check-in" }));
    await screen.findByText("home-page");
  });
});

describe("day one", () => {
  it("offers a first session from their equipment and starts it", async () => {
    const { default: SoloFirstSessionScreen } = await import("./SoloFirstSessionScreen");
    await renderAt("/solo/first-session", <SoloFirstSessionScreen />, "/solo/first-session");
    expect(screen.getByText(/Tylah, let's get your first session done today/)).toBeTruthy();
    const list = screen.getByTestId("first-session-exercises").textContent;
    expect(list).toContain("Goblet Squat");
    expect(list).not.toContain("Back Squat"); // no barbell for this member
    fireEvent.click(screen.getByRole("button", { name: /Start your first session/ }));
    await screen.findByText("workout-page");
  });
});

describe("swaps and the plates helper", () => {
  it("the swap sheet keeps a swap for the rest of the program by default, and can go back to the plan", async () => {
    const { default: SoloSwapSheet } = await import("./SoloSwapSheet");
    const onPick = vi.fn();
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    render(
      <MemoryRouter>
        <SoloThemeProvider>
          <SoloSwapSheet exercise={exercises[2]} allExercises={exercises} excludeIds={new Set()} onClose={() => {}} onPick={onPick} canRemember originalExercise={exercises[0]} />
        </SoloThemeProvider>
      </MemoryRouter>
    );
    const toggle = screen.getByLabelText("Keep this swap for the rest of the program");
    expect(toggle.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Back to Back Squat/ }));
    expect(onPick).toHaveBeenLastCalledWith(exercises[0], false);
  });

  it("a barbell lift shows plates per side and warm-up sets", async () => {
    const { default: SoloExerciseBlock } = await import("./SoloExerciseBlock");
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    const { platesPerSide, warmupSets } = await import("./liftHelpers");
    render(
      <MemoryRouter>
        <SoloThemeProvider>
          <SoloExerciseBlock
            exMeta={{ exerciseId: "sq", targetSets: 3, targetReps: 5, section: "main" }}
            exercise={exercises[0]}
            rows={[{ weight: "", reps: "", completed: false }]}
            liftHelp={{ work: 100, plates: platesPerSide(100), warmup: warmupSets(100) }}
            onSwap={() => {}}
            onChangeField={() => {}}
            onBlurKg={() => {}}
            onAddSet={() => {}}
            onStartRest={() => {}}
            onOpenDetail={() => {}}
          />
        </SoloThemeProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Warm-up & plates for 100 kg/ }));
    expect(screen.getByText("25 + 15")).toBeTruthy();
    expect(screen.getByText("Bar × 10")).toBeTruthy();
    expect(screen.getByText("80 kg × 2")).toBeTruthy();
  });
});
