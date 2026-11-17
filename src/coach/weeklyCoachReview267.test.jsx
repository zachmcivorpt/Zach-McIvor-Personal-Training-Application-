// @vitest-environment jsdom
// #267 (owner): "ENSURE the weekly coach review is accurate". Every figure
// now uses one window — the last 7 full days, ending yesterday — and each
// case below was a real miscount in the old card. Figures worked out by hand.
import { afterEach, describe, expect, it, vi } from "vitest";
import { weeklyCoachReview } from "./weeklyCoachReview";

const TODAY = "2026-11-17"; // Tue → window Tue 10 – Mon 16 Nov, previous week 3–9 Nov
const at = (key, h = 7) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, h).getTime();
};
const set = (weight, reps, isPR = false) => ({ weight, reps, isPR });
const log = (key, label, sets, extra = {}) => ({ id: label + key, date: at(key), dayLabel: label, entries: [{ exerciseId: "bp", sets }], ...extra });
const sched = (date, label) => ({ id: "s" + date, date, label });

afterEach(() => vi.useRealTimers());

describe("Weekly Coach Review maths (#267)", () => {
  const scheduledWorkouts = [
    sched("2026-11-10", "Upper A"), // done
    sched("2026-11-12", "Lower A"), // finished late on the 14th (scheduledDate)
    sched("2026-11-14", "Upper B"), // only a run that day → missed
    sched("2026-11-16", "Lower B"), // done
    sched(TODAY, "Upper A"), // today: not in the window
    sched("2026-11-08", "Old"), // last week: not in the window
  ];
  const workoutLogs = [
    log("2026-11-10", "Upper A", [set(100, 5), set(100, 5, true)]), // 1,000 kg, 1 PR
    log("2026-11-14", "Lower A", [set(140, 3)], { scheduledDate: "2026-11-12" }), // 420
    { id: "run", date: at("2026-11-14", 18), dayLabel: "Run", cardio: { activityLabel: "Run", durationMin: 30 } }, // no entries
    log("2026-11-16", "Lower B", [set(60, 10, true)]), // 600, 1 PR
    log(TODAY, "Upper A", [set(200, 10, true)]), // today — not counted
    log("2026-11-05", "Old", [set(100, 10)]), // previous week: 1,000
  ];
  const habits = [
    { id: "h1", createdAt: at("2026-11-01"), endsAt: null },
    { id: "h2", createdAt: at("2026-11-13"), endsAt: null }, // starts on the 13th: 4 days
    { id: "h3", createdAt: at("2026-10-01"), endsAt: at("2026-11-11", 20) }, // ended on the 11th: 2 days
  ];
  const habitLog = { "2026-11-10": ["h1", "h3"], "2026-11-13": ["h1", "h2"], "2026-11-16": ["h1", "h2"], [TODAY]: [] };
  const nutritionLogs = [
    { date: "2026-11-10", calories: 2000, meals: { Breakfast: [{ id: "x" }] } },
    { date: "2026-11-11", calories: 0, water: 1, meals: { Breakfast: [] } }, // water only
    { date: "2026-11-15", calories: 1800, meals: { Lunch: [{ id: "y" }] } },
  ];
  const r = weeklyCoachReview({ workoutLogs, scheduledWorkouts, nutritionLogs, habits, habitLog, todayKey: TODAY });

  it("uses the last 7 full days, ending yesterday", () => {
    expect([r.from, r.to]).toEqual(["2026-11-10", "2026-11-16"]);
  });
  it("sessions: late finish counts for its day, cardio doesn't, today and last week are out", () => {
    expect(r.sessions).toEqual({ planned: 4, done: 3, logged: 3 });
  });
  it("volume, change and PRs come only from the window's strength logs", () => {
    expect(r.volume).toBe(1000 + 420 + 600);
    expect(r.volumeChangePct).toBe(102); // 2,020 vs 1,000
    expect(r.prs).toBe(2);
  });
  it("habits count only the days each habit was live", () => {
    // h1: 7 days, 3 done; h2: 13–16 = 4 days, 2 done; h3: 10–11 = 2 days, 1 done
    expect(r.habits).toEqual({ possible: 13, done: 6, pct: 46 });
  });
  it("nutrition counts days with food, not water-only days", () => {
    expect(r.nutrition).toEqual({ daysLogged: 2, pct: 29 });
  });
  it("nothing logged → zeros and no habit figure, never a crash", () => {
    const empty = weeklyCoachReview({ todayKey: TODAY });
    expect(empty.sessions).toEqual({ planned: 0, done: 0, logged: 0 });
    expect(empty.volumeChangePct).toBeNull();
    expect(empty.habits.pct).toBeNull();
  });
});
