// @vitest-environment jsdom
// #265 (owner): Coach Overview's Training and Nutrition command centre —
// daily nutrition vs the client's own targets (exact differences), training
// completion from the schedule and logs, and working actions (open profile /
// diary / history, message suggestions that are edited then sent through
// the normal chat, filters, sorting).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { nutritionDay, trainingSummary, entryLoggedAt, compareToTarget, nutritionSuggestions, nutritionTrend, trainingSuggestions, addDaysKey } from "./commandCentre";

const TODAY = "2026-11-17"; // a Tuesday
const at = (key, h, m = 0) => {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};
const entryId = (ms) => `food1-${ms.toString(36)}abcde`;
// 2,200 kcal at 29% protein → 160 g (resolveNutritionTargets)
const targeted = { id: "a", name: "Alex Hart", nutritionTargets: { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 } };
const day = (date, calories, protein, mealCount = 3, ms = at(date, 12, 40)) => ({
  date,
  calories,
  protein,
  meals: Object.fromEntries(["Breakfast", "Lunch", "Dinner", "Snacks"].slice(0, mealCount).map((k, i) => [k, [{ id: entryId(ms - i * 3600000), name: "Food" }]])),
});

describe("nutrition maths (#265)", () => {
  it("shows actual vs target and the exact gap", () => {
    expect(compareToTarget(160, 160, 0.03)).toEqual({ actual: 160, target: 160, diff: 0, state: "hit" });
    expect(compareToTarget(115, 160, 0.03)).toMatchObject({ diff: -45, state: "under" });
    expect(compareToTarget(175, 160, 0.03)).toMatchObject({ diff: 15, state: "over" });
    expect(compareToTarget(1850, 2200, 0.03)).toMatchObject({ diff: -350, state: "under" });
    expect(compareToTarget(2450, 2200, 0.03)).toMatchObject({ diff: 250, state: "over" });
    // within ±3% counts as reached, the exact diff is still reported
    expect(compareToTarget(2150, 2200, 0.03)).toMatchObject({ diff: -50, state: "hit" });
  });

  it("classifies the day: completed, over, under so far (today) vs finished under (yesterday)", () => {
    expect(nutritionDay(targeted, [day(TODAY, 2200, 160)], TODAY).status).toBe("completed");
    expect(nutritionDay(targeted, [day(TODAY, 2450, 170)], TODAY).status).toBe("over");
    // today, under: not a failure — "under so far"
    expect(nutritionDay(targeted, [day(TODAY, 1850, 115)], TODAY).status).toBe("inProgress");
    // the finished day, under: a real miss
    expect(nutritionDay(targeted, [day(TODAY, 1850, 115)], TODAY, { final: true }).status).toBe("under");
    // one meal, a fraction of the day logged → the diary is incomplete, not failed
    expect(nutritionDay(targeted, [day(TODAY, 500, 40, 1)], TODAY).status).toBe("incomplete");
    expect(nutritionDay(targeted, [], TODAY).status).toBe("notLogged");
    // water only (doc exists, no food) is not logged
    expect(nutritionDay(targeted, [{ date: TODAY, water: 1, meals: { Breakfast: [] } }], TODAY).status).toBe("notLogged");
    // no coach-assigned target
    const r = nutritionDay({ id: "b", name: "Bo" }, [day(TODAY, 1800, 120)], TODAY);
    expect(r.status).toBe("noTarget");
    expect(r.calories.target).toBeNull();
  });

  it("counts meals logged and reads the time of the latest entry from its id", () => {
    const r = nutritionDay(targeted, [day(TODAY, 1500, 100, 3, at(TODAY, 18, 5))], TODAY);
    expect(r.meals).toBe(3);
    expect(r.lastLoggedAt).toBe(at(TODAY, 18, 5));
    expect(entryLoggedAt({ id: "fuel-iq-pick" }, TODAY)).toBeNull();
    expect(entryLoggedAt({ id: entryId(at("2026-01-01", 9)) }, TODAY)).toBeNull(); // not this diary day
  });

  it("suggestions quote the client's own figures", () => {
    const logs = [1, 2, 3, 4].map((i) => day(addDaysKey(TODAY, -i), 2000, 110));
    const trend = nutritionTrend(targeted, logs, TODAY);
    expect(trend).toMatchObject({ logged: 4, proteinShort: 4, avgProtein: 110, proteinTarget: 160 });
    const s = nutritionSuggestions(nutritionDay(targeted, [day(TODAY, 1850, 115)], TODAY), trend);
    expect(s.some((x) => /falling short of your protein target on 4 of the last 4 days/.test(x) && /110g against 160g/.test(x))).toBe(true);
    expect(s.some((x) => /115g of protein so far today — 45g to go/.test(x))).toBe(true);
  });
});

describe("training maths (#265)", () => {
  const sched = (date, label) => ({ id: date, date, label });
  const log = (key, label, extra = {}) => ({ id: "l" + key, date: at(key, 7), dayLabel: label, entries: [], ...extra });

  it("done / due / missed come from the schedule and logs, never from an empty schedule", () => {
    const base = { name: "Sam" };
    const scheduledWorkouts = [sched("2026-11-12", "Upper A"), sched("2026-11-14", "Lower A"), sched("2026-11-16", "Upper B"), sched(TODAY, "Lower B"), sched("2026-11-19", "Upper A")];
    const r = trainingSummary(base, { workoutLogs: [log("2026-11-12", "Upper A"), log("2026-11-16", "Upper B")], scheduledWorkouts }, TODAY);
    expect(r.week).toEqual({ assigned: 4, done: 2, due: 1 });
    expect(r.missed.map((m) => m.label)).toEqual(["Lower A"]);
    expect(r.status).toBe("missed");
    expect(r.today).toMatchObject({ done: false });
    expect(r.next.label).toBe("Lower B"); // today's, not done yet
    expect(r.lastLog.dayLabel).toBe("Upper B");

    // Nothing scheduled → never "missed"
    const none = trainingSummary(base, { workoutLogs: [log("2026-11-16", "Own")], scheduledWorkouts: [] }, TODAY);
    expect(none.status).toBe("noSchedule");
    expect(none.missed).toEqual([]);
  });

  it("a missed day finished late (scheduledDate) counts as done; cardio doesn't count", () => {
    const scheduledWorkouts = [sched("2026-11-14", "Lower A"), sched("2026-11-15", "Upper A")];
    const logs = [log("2026-11-16", "Lower A", { scheduledDate: "2026-11-14" }), log("2026-11-15", "Run", { cardio: { activityLabel: "Run" } })];
    const r = trainingSummary({ name: "Sam" }, { workoutLogs: logs, scheduledWorkouts }, TODAY);
    expect(r.missed.map((m) => m.label)).toEqual(["Upper A"]);
    // the late finish doesn't also fill the day it was done on (#267)
    const r2 = trainingSummary({ name: "Sam" }, { workoutLogs: [log("2026-11-16", "Lower A", { scheduledDate: "2026-11-14" })], scheduledWorkouts: [sched("2026-11-14", "Lower A"), sched("2026-11-16", "Upper A")] }, TODAY);
    expect(r2.missed.map((m) => m.label)).toEqual(["Upper A"]);
  });

  it("two misses this week = falling behind; done today; program week and progress", () => {
    const scheduledWorkouts = [sched("2026-11-13", "A"), sched("2026-11-15", "B"), sched(TODAY, "C")];
    const phases = [{ name: "Hypertrophy", startDate: "2026-11-03", endDate: "2026-11-30" }];
    const behind = trainingSummary({ name: "Sam" }, { workoutLogs: [], scheduledWorkouts, phases }, TODAY);
    expect(behind.status).toBe("behind");
    expect(trainingSuggestions(behind)[0]).toMatch(/missed 2 scheduled sessions this week/);
    // 3 Nov → 17 Nov is day 15 of 28 → week 3 of 4, 54%
    expect(behind.program).toMatchObject({ name: "Hypertrophy", week: 3, weeks: 4, pct: 54, sessionsDone: 0, sessionsTotal: 3 });
    const done = trainingSummary({ name: "Sam" }, { workoutLogs: [log("2026-11-13", "A"), log("2026-11-15", "B"), log(TODAY, "C")], scheduledWorkouts, phases }, TODAY);
    expect(done.status).toBe("doneToday");
    expect(done.week).toEqual({ assigned: 3, done: 3, due: 0 });
  });
});

// ---- the real Overview -----------------------------------------------------
const sendMessage = vi.fn();
const now = new Date();
const key = (n) => {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const coach = { id: "coach", role: "coach", name: "Zach McIvor" };
const mk = (id, name, extra = {}) => ({ id, name, role: "client", status: "active", createdAt: Date.now() - 60 * 86400000, lastActiveAt: Date.now(), nutritionTargets: { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 }, ...extra });
const clients = [mk("p1", "Pat Under"), mk("p2", "Quinn Done"), mk("p3", "Riley None")];
const foodDay = (date, calories, protein) => ({ id: date, date, calories, protein, meals: { Breakfast: [{ id: "x" }], Lunch: [{ id: "y" }], Dinner: [{ id: "z" }] } });
const db = {
  users: [coach, ...clients],
  challenges: [], errorLogs: [], exercises: [], formResponses: {}, forms: [], mealPlans: {}, messages: {}, weighIns: {}, bodyMetrics: {}, clientContext: {}, clientNotes: {}, notifications: [], clientPhases: {},
  nutritionLogs: { p1: [foodDay(key(0), 1850, 115)], p2: [foodDay(key(0), 2200, 160)] },
  scheduledWorkouts: { p1: [{ id: "s1", date: key(-2), label: "Upper A" }, { id: "s2", date: key(-1), label: "Lower A" }], p2: [{ id: "s3", date: key(0), label: "Push" }] },
  workoutLogs: { p2: [{ id: "w1", date: Date.now(), dayLabel: "Push", entries: [] }] },
};
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db, currentUser: coach, dbReady: true, usersReady: true, sendMessage, markFormResponseRead: vi.fn(), updateUser: vi.fn(), broadcastWorkout: vi.fn(), phraseApexSuggestion: vi.fn(() => new Promise(() => {})), dismissErrorLog: vi.fn() }),
}));
vi.mock("./CoachClientDetail", () => ({ WorkoutLogCard: () => null }));
vi.mock("./WorkoutEditor", () => ({ default: () => null }));
afterEach(() => cleanup());

async function renderOverview() {
  const { default: CoachDashboard } = await import("./CoachDashboard");
  const onOpenClient = vi.fn();
  const showToast = vi.fn();
  render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={onOpenClient} showToast={showToast} />);
  return { onOpenClient, showToast };
}

describe("Overview command centre (#265)", () => {
  it("shows both sections with real figures and statuses", async () => {
    await renderOverview();
    const nut = screen.getByTestId("cc-nutrition");
    const pat = within(nut).getByTestId("cc-nutrition-row-p1");
    expect(within(pat).getByText("Under so far")).toBeTruthy();
    expect(pat.textContent).toMatch(/115\/160g P · 1,850\/2,200 kcal/);
    expect(within(nut).getByTestId("cc-nutrition-row-p2").textContent).toMatch(/Goal completed/);
    expect(within(nut).getByTestId("cc-nutrition-row-p3").textContent).toMatch(/No meals logged/);

    const tr = screen.getByTestId("cc-training");
    expect(within(tr).getByTestId("cc-training-row-p1").textContent).toMatch(/Falling behind/);
    expect(within(tr).getByTestId("cc-training-row-p2").textContent).toMatch(/Done today/);
    expect(within(tr).getByTestId("cc-training-row-p3").textContent).toMatch(/Nothing scheduled/);
  });

  it("a row opens the client sheet with exact gaps; its actions open the right place", async () => {
    const { onOpenClient } = await renderOverview();
    fireEvent.click(screen.getByTestId("cc-nutrition-row-p1"));
    let sheet = await screen.findByTestId("cc-client-sheet");
    expect(sheet.textContent).toMatch(/45g to go/);
    expect(sheet.textContent).toMatch(/350 kcal to go/);
    fireEvent.click(within(sheet).getByTestId("cc-action-diary"));
    expect(onOpenClient).toHaveBeenLastCalledWith("p1", { tab: "nutrition" });

    fireEvent.click(screen.getByTestId("cc-training-row-p1"));
    sheet = await screen.findByTestId("cc-client-sheet");
    expect(sheet.textContent).toMatch(/2 missed/);
    fireEvent.click(within(sheet).getByTestId("cc-action-history"));
    expect(onOpenClient).toHaveBeenLastCalledWith("p1", { tab: "program" });

    fireEvent.click(screen.getByTestId("cc-training-row-p2"));
    fireEvent.click(within(await screen.findByTestId("cc-client-sheet")).getByTestId("cc-action-profile"));
    expect(onOpenClient).toHaveBeenLastCalledWith("p2", undefined);
  });

  it("no boxed figures, today only, most in need first, below Coach's notes and Needs attention", async () => {
    await renderOverview();
    const nut = screen.getByTestId("cc-nutrition");
    expect(within(nut).queryByTestId(/cc-nutrition-stat-/)).toBeNull();
    const order = () => within(nut).getAllByTestId(/cc-nutrition-row-/).map((r) => r.dataset.testid);
    expect(order()[0]).toBe("cc-nutrition-row-p3"); // no meals logged first
    expect(within(nut).queryByText("Yesterday")).toBeNull();
    const notes = screen.getByTestId("coach-notes");
    const cc = screen.getByTestId("command-centre");
    expect(notes.compareDocumentPosition(cc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Needs attention").compareDocumentPosition(cc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the greeting lines up with the sections on iPad (no extra side padding from sm)", async () => {
    await renderOverview();
    const hero = screen.getByTestId("overview-hero");
    expect(hero.className).toMatch(/\bmd:px-0\b/);
    expect(hero.className).not.toMatch(/sm:px-7/);
  });

  it("the row's message button opens the composer in one tap", async () => {
    await renderOverview();
    fireEvent.click(within(screen.getByTestId("cc-nutrition-row-p1")).getByTestId("cc-row-message"));
    const sheet = await screen.findByTestId("cc-message-sheet");
    expect(within(sheet).getAllByTestId("cc-suggestion")[0].textContent).toMatch(/Hey Pat/);
  });

  it("Message: suggestion from real data → edit → send through the chat", async () => {
    sendMessage.mockClear();
    const { showToast } = await renderOverview();
    fireEvent.click(screen.getByTestId("cc-training-row-p1"));
    fireEvent.click(within(await screen.findByTestId("cc-client-sheet")).getByTestId("cc-action-message"));
    const sheet = await screen.findByTestId("cc-message-sheet");
    const send = within(sheet).getByTestId("cc-message-send");
    const suggestion = within(sheet).getAllByTestId("cc-suggestion")[0];
    // opens with the first suggestion already in the box
    expect(within(sheet).getByTestId("cc-message-text").value).toBe(suggestion.textContent);
    fireEvent.change(within(sheet).getByTestId("cc-message-text"), { target: { value: "" } });
    expect(send.disabled).toBe(true);
    expect(suggestion.textContent).toMatch(/Hey Pat, noticed you've missed 2 scheduled sessions this week/);
    fireEvent.click(suggestion);
    const box = within(sheet).getByTestId("cc-message-text");
    expect(box.value).toBe(suggestion.textContent);
    fireEvent.change(box, { target: { value: box.value + " Call me tonight?" } });
    fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledWith("p1", "coach", expect.stringMatching(/missed 2 scheduled sessions.*Call me tonight\?$/));
    expect(showToast).toHaveBeenCalledWith("Message sent to Pat");
  });
});
