// @vitest-environment jsdom
// #229 (owner): "stop putting old things in Needs attention" — nothing in it
// is about something older than two weeks — and the Overview must not pan
// sideways under a finger on iPhone (the APEX mark stuck out 20px).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { mealPlanAlert, NEEDS_ATTENTION_MAX_AGE_DAYS } from "./endingSoon";
import { computeApexInsights } from "../lib/apexInsights";
import { localDateKey } from "../lib/dateKey";

const DAY = 86400000;
const now = Date.now();
const keyAgo = (n) => localDateKey(new Date(now - n * DAY));
const meals = { breakfast: [{ name: "Oats" }] };

describe("old things stay out of Needs attention (#229)", () => {
  it("a meal guide that ended over two weeks ago is not flagged", () => {
    expect(NEEDS_ATTENTION_MAX_AGE_DAYS).toBe(14);
    const plan = (start, weeks) => ({ startDate: start, days: Array.from({ length: weeks * 7 }, (_, i) => ({ weekIndex: Math.floor(i / 7) })) });
    expect(mealPlanAlert({ id: "c" }, plan("2026-10-01", 2), "2026-11-12")).toBeNull(); // ended 14 Oct
    expect(mealPlanAlert({ id: "c" }, plan("2026-10-20", 2), "2026-11-12")).toMatchObject({ title: "Meal guide ended" });
  });
  it("a bodyweight trend built on weigh-ins that stopped weeks ago is not an insight", () => {
    const client = { id: "w" };
    const db = (offset) => ({ weighIns: { w: [{ date: now - (offset + 25) * DAY, weight: 90 }, { date: now - offset * DAY, weight: 86 }] }, nutritionLogs: { w: Array.from({ length: 26 }, (_, i) => ({ date: keyAgo(offset + i), meals })) }, workoutLogs: {}, formResponses: {}, forms: [], exercises: [], clientContext: {}, clientNotes: {} });
    const trend = (d) => computeApexInsights(client, d).filter((i) => /weight/i.test(i.title || "") || /weight/i.test(i.id || ""));
    expect(trend(db(40))).toHaveLength(0);
    expect(trend(db(1)).length).toBeGreaterThan(0);
  });
});

// ---- the real Overview ----
const coach = { id: "coach", role: "coach", name: "Zachary McIvor" };
const mk = (id) => ({ id, role: "client", status: "active", name: id, createdAt: now - 200 * DAY, lastActiveAt: now - 100 * DAY });
const clients = ["oldFood", "newFood", "oldQuiet", "newQuiet", "oldWeight", "newWeight"].map(mk);
const db = {
  users: [coach, ...clients],
  challenges: [], clientPhases: {}, errorLogs: [], exercises: [], formResponses: {}, forms: [], mealPlans: {}, messages: {},
  nutritionLogs: {
    oldFood: [{ date: keyAgo(60), meals }],
    newFood: [{ date: keyAgo(5), meals }],
    oldQuiet: [{ date: keyAgo(0), meals }], newQuiet: [{ date: keyAgo(0), meals }], oldWeight: [{ date: keyAgo(0), meals }], newWeight: [{ date: keyAgo(0), meals }],
  },
  workoutLogs: {
    oldQuiet: [{ id: "l1", clientId: "oldQuiet", date: now - 90 * DAY, entries: [] }],
    newQuiet: [{ id: "l2", clientId: "newQuiet", date: now - 8 * DAY, entries: [] }],
  },
  weighIns: {
    oldWeight: [{ date: now - 80 * DAY, weight: 90 }, { date: now - 60 * DAY, weight: 87 }],
    newWeight: [{ date: now - 20 * DAY, weight: 90 }, { date: now - 2 * DAY, weight: 88 }],
  },
  scheduledWorkouts: {}, bodyMetrics: {}, clientContext: {}, clientNotes: {}, notifications: [],
};
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db, currentUser: coach, dbReady: true, usersReady: true, sendMessage: vi.fn(), markFormResponseRead: vi.fn(), updateUser: vi.fn(), broadcastWorkout: vi.fn(), phraseApexSuggestion: vi.fn(), dismissErrorLog: vi.fn() }),
}));
vi.mock("./CoachClientDetail", () => ({ WorkoutLogCard: () => null }));
vi.mock("./WorkoutEditor", () => ({ default: () => null }));
afterEach(() => cleanup());

describe("Overview Needs attention keeps only recent things (#229)", () => {
  it("flags a client who stopped recently, never one who stopped months ago", async () => {
    const { default: CoachDashboard } = await import("./CoachDashboard");
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    const text = (kind) => screen.queryAllByTestId(`attention-${kind}`).map((r) => r.textContent).join(" | ");
    expect(text("nutrition")).toMatch(/newFood/);
    expect(text("nutrition")).not.toMatch(/oldFood/);
    expect(text("quiet")).toMatch(/newQuiet/);
    expect(text("quiet")).not.toMatch(/oldQuiet/);
    expect(text("insight")).toMatch(/newWeight/);
    expect(text("insight")).not.toMatch(/oldWeight/);
  });
  it("the APEX mark never sticks out past the page edge (no sideways pan on iPhone)", async () => {
    const { default: CoachDashboard } = await import("./CoachDashboard");
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByTestId("overview-hero").className).toMatch(/overflow-x-clip/);
    expect(screen.getByTestId("overview-mark").className).not.toMatch(/-right-/);
  });
  it("the console's page scroller never scrolls sideways", () => {
    const shell = readFileSync("src/coach/CoachShell.jsx", "utf8");
    expect(shell).toMatch(/overflow-y-auto overflow-x-hidden overscroll-contain \[-webkit-overflow-scrolling:touch\]/);
  });
});
