// @vitest-environment jsdom
// #228 (owner): Needs attention flags a program phase or meal guide 4 days
// out (and once ended with nothing after it), every row opens something,
// old missed sessions drop off, all alerts can be shown, and Recent
// activity is a short list on phones.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { phaseAlert, mealPlanAlert, recentMissedSession, ENDING_SOON_DAYS } from "./endingSoon";
import { localDateKey } from "../lib/dateKey";

const TODAY = "2026-11-12";
const c = { id: "c1", name: "Sam Carter" };

describe("phase and meal guide alerts (#228)", () => {
  it("a phase ending within 4 days is flagged; 5 days out is not", () => {
    expect(ENDING_SOON_DAYS).toBe(4);
    const a = phaseAlert(c, [{ name: "Cut 2", startDate: "2026-10-01", endDate: "2026-11-16" }], TODAY);
    expect(a).toMatchObject({ kind: "phase", tab: "training", title: "Program phase ending" });
    expect(a.detail).toMatch(/Cut 2 ends in 4 days/);
    expect(phaseAlert(c, [{ startDate: "2026-10-01", endDate: "2026-11-17" }], TODAY)).toBeNull();
    expect(phaseAlert(c, [{ startDate: "2026-10-01", endDate: TODAY }], TODAY).detail).toMatch(/ends today/);
  });
  it("not flagged when the next phase is already set up", () => {
    expect(phaseAlert(c, [{ startDate: "2026-10-01", endDate: "2026-11-14" }, { startDate: "2026-11-15", endDate: "2026-12-20" }], TODAY)).toBeNull();
  });
  it("an ended phase with nothing after it is flagged for two weeks", () => {
    expect(phaseAlert(c, [{ startDate: "2026-09-01", endDate: "2026-11-05" }], TODAY)).toMatchObject({ title: "Program phase ended" });
    expect(phaseAlert(c, [{ startDate: "2026-08-01", endDate: "2026-10-20" }], TODAY)).toBeNull();
  });
  it("a meal guide ending within 4 days is flagged (was 2); ended is flagged", () => {
    const plan = (start, weeks) => ({ startDate: start, days: Array.from({ length: weeks * 7 }, (_, i) => ({ weekIndex: Math.floor(i / 7) })) });
    // starts 3 Nov, 2 weeks → last day 16 Nov = 4 days out
    expect(mealPlanAlert(c, plan("2026-11-03", 2), TODAY)).toMatchObject({ kind: "mealPlan", tab: "nutrition", title: "Meal guide ending" });
    expect(mealPlanAlert(c, plan("2026-11-04", 2), TODAY)).toBeNull(); // 5 days out
    expect(mealPlanAlert(c, plan("2026-10-20", 2), TODAY)).toMatchObject({ title: "Meal guide ended" }); // ended 2 Nov (#229: ≤14 days)
  });
  it("only misses from the last week count", () => {
    const logged = new Set(["2026-11-10"]);
    const sched = [{ date: "2026-08-01", label: "Old" }, { date: "2026-11-08", label: "Lower" }, { date: "2026-11-10", label: "Upper" }];
    expect(recentMissedSession(sched, logged, TODAY).label).toBe("Lower");
    expect(recentMissedSession([{ date: "2026-08-01" }], new Set(), TODAY)).toBeNull();
  });
});

// ---- the real Overview ----
const now = Date.now();
const today = localDateKey();
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateKey(d);
};
const coach = { id: "coach", role: "coach", name: "Zachary McIvor" };
const clients = Array.from({ length: 10 }, (_, i) => ({ id: "c" + i, role: "client", status: "active", name: "Client " + i, createdAt: now - 40 * 86400000, lastActiveAt: now }));
const db = {
  users: [coach, ...clients],
  challenges: [],
  clientPhases: Object.fromEntries(clients.map((cl) => [cl.id, [{ name: "Phase A", startDate: addDays(-30), endDate: addDays(3) }]])),
  errorLogs: [], exercises: [], formResponses: {}, forms: [], mealPlans: {}, messages: {}, nutritionLogs: {},
  scheduledWorkouts: { c0: [{ date: addDays(-90), label: "Ancient" }] },
  weighIns: {}, workoutLogs: {}, bodyMetrics: {}, clientContext: {}, clientNotes: {}, notifications: [],
};
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db, currentUser: coach, dbReady: true, usersReady: true, sendMessage: vi.fn(), markFormResponseRead: vi.fn(), updateUser: vi.fn(), broadcastWorkout: vi.fn(), phraseApexSuggestion: vi.fn(), dismissErrorLog: vi.fn() }),
}));
vi.mock("./CoachClientDetail", () => ({ WorkoutLogCard: () => null }));
vi.mock("./WorkoutEditor", () => ({ default: () => null }));
afterEach(() => cleanup());

describe("Overview Needs attention (#228)", () => {
  it("shows phases ending in 3 days, opens the client's Training tab on tap, and can show every alert", async () => {
    const { default: CoachDashboard } = await import("./CoachDashboard");
    const onOpenClient = vi.fn();
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={onOpenClient} showToast={vi.fn()} />);
    const rows = () => screen.getAllByTestId("attention-phase");
    expect(rows().length).toBe(8);
    fireEvent.click(screen.getByTestId("attention-more"));
    expect(rows().length).toBe(10);
    fireEvent.click(rows()[0]);
    expect(onOpenClient).toHaveBeenCalledWith(expect.stringMatching(/^c\d$/), { tab: "training" });
    expect(screen.queryByText(/Ancient/)).toBeNull(); // a 90-day-old miss isn't flagged
    expect(today).toBeTruthy();
  });
});
