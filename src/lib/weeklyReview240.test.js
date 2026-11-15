// #240: the coached client's weekly review, checked by hand.
import { describe, it, expect } from "vitest";
import { coachedWeekReview, latestReviewMonday, reviewIsFresh, reviewWeeks, reviewSummary } from "./weeklyReview";

const at = (key, h = 9) => new Date(`${key}T${String(h).padStart(2, "0")}:00:00`).getTime();
const MON = "2026-11-09"; // week of Mon 9 – Sun 15 Nov 2026
const ex = { sq: { id: "sq", name: "Back Squat" }, bp: { id: "bp", name: "Bench Press" } };
const log = (key, sets, extra = {}) => ({ id: key + (extra.id || ""), clientId: "c1", date: at(key), durationMin: 50, entries: sets.map(([exerciseId, weight, reps, isPR]) => ({ exerciseId, sets: [{ weight, reps, isPR: !!isPR }] })), ...extra });
const day = (key, calories, protein) => ({ date: key, calories, protein, meals: { lunch: [{ id: key, name: "Food", calories, protein }] } });

function data(over = {}) {
  return {
    workoutLogs: [
      log("2026-11-02", [["sq", 100, 5], ["bp", 80, 5]]),
      log("2026-11-09", [["sq", 105, 5, true]]),
      log("2026-11-11", [["bp", 82.5, 5]]),
      log("2026-11-13", [["sq", 100, 5]]),
      log("2026-11-12", [], { cardio: { activityLabel: "Run", durationMin: 30 }, id: "run" }),
    ],
    scheduledWorkouts: [{ date: "2026-11-09" }, { date: "2026-11-11" }, { date: "2026-11-13" }, { date: "2026-11-15" }],
    nutritionLogs: [
      day("2026-11-09", 2150, 165),
      day("2026-11-10", 2100, 170),
      day("2026-11-11", 2600, 150), // 21% over: miss; protein 150 < 144? 150 ≥ 144 hit
      day("2026-11-12", 2200, 120), // protein miss
      day("2026-11-13", 2050, 160),
      day("2026-11-14", 2700, 165), // calories miss
      day("2026-11-15", 2150, 162),
    ],
    bodyMetrics: [{ date: "2026-11-10", steps: 9000, sleepHours: 7 }, { date: "2026-11-12", steps: 11000, sleepHours: 7.5 }],
    weighIns: [{ date: at("2026-11-04"), weight: 82.4 }, { date: at("2026-11-10"), weight: 82 }, { date: at("2026-11-14"), weight: 81.8 }],
    targets: { calories: 2150, protein: 160 },
    exercisesById: ex,
    phases: [{ id: "p", name: "Hypertrophy Block 2", startDate: "2026-10-26", endDate: "2026-12-06" }],
    ...over,
  };
}

describe("coachedWeekReview", () => {
  const r = coachedWeekReview({ ...data(), monday: MON });
  it("sessions against the plan; cardio isn't a session", () => {
    expect(r.sessions).toMatchObject({ planned: 4, done: 3, total: 3 });
    expect(r.days.map((d) => d.trained)).toEqual([true, false, true, false, true, false, false]);
    expect(r.minutes).toBe(150);
    expect(r.prs).toBe(1);
    expect(r.headline).toBe("A new personal record this week.");
  });
  it("nutrition: calories within 12%, protein at 90% or more", () => {
    // Calories miss Wed (2600) and Sat (2700); protein 160 × 0.9 = 144, so only Thu (120) misses.
    expect(r.nutrition).toMatchObject({ logged: 7, calorieHits: 5, proteinHits: 6, calorieTarget: 2150, proteinTarget: 160 });
  });
  it("body: this week's average weight against last week's, steps and sleep averages", () => {
    // (82 + 81.8) / 2 = 81.9 vs 82.4 → −0.5
    expect(r.weight).toEqual({ avg: 81.9, change: -0.5 });
    expect(r.steps.avg).toBe(10000);
    expect(r.sleep.avg).toBe(7.3);
  });
  it("stronger: lifts whose est. max beat their last session before the week", () => {
    // Squat 100×5 → 116.7 before; 105×5 → 122.5 this week: +6 (rounded figures)
    expect(r.stronger.map((g) => [g.name, g.change])).toEqual([
      ["Back Squat", 6],
      ["Bench Press", 3],
    ]);
  });
  it("phase week and consistency", () => {
    expect(r.phase).toMatchObject({ name: "Hypertrophy Block 2", week: 3, total: 6, pct: 0.5 });
    expect(r.streak).toBe(2);
  });
  it("next week's focus is the biggest slip: a missed planned session first", () => {
    expect(r.focus).toBe("Hit all your planned sessions — 3 of 4 this week. Missed one? Move it, don't skip it.");
    const allDone = coachedWeekReview({ ...data({ scheduledWorkouts: [{ date: "2026-11-09" }] }), monday: MON });
    expect(allDone.headline).toBe("Every planned session. Done.");
    expect(allDone.focus).toBe("Hit calories on Wednesday and Saturday too — the two misses this week.");
  });
  it("the Progress list line", () => {
    expect(reviewSummary(r)).toBe("3 of 4 sessions · 1 PR · −0.5 kg");
  });
  it("a week with nothing logged has no review", () => {
    expect(coachedWeekReview({ ...data(), monday: "2026-08-03" }).hasData).toBe(false);
  });
});

describe("which week, and when it's new", () => {
  it("this week's review from Sunday 6pm, last week's before", () => {
    expect(latestReviewMonday(new Date(2026, 10, 15, 17, 59).getTime())).toBe("2026-11-02");
    expect(latestReviewMonday(new Date(2026, 10, 15, 18, 0).getTime())).toBe("2026-11-09");
    expect(latestReviewMonday(new Date(2026, 10, 17, 9, 0).getTime())).toBe("2026-11-09");
  });
  it("new from Sunday 6pm to the end of Tuesday", () => {
    expect(reviewIsFresh(MON, new Date(2026, 10, 15, 18, 0).getTime())).toBe(true);
    expect(reviewIsFresh(MON, new Date(2026, 10, 17, 23, 59).getTime())).toBe(true);
    expect(reviewIsFresh(MON, new Date(2026, 10, 18, 0, 0).getTime())).toBe(false);
    expect(reviewIsFresh(MON, new Date(2026, 10, 15, 17, 0).getTime())).toBe(false);
  });
  it("the list keeps only weeks with something logged, newest first", () => {
    const weeks = reviewWeeks(data(), { nowMs: new Date(2026, 10, 15, 19).getTime() });
    expect(weeks.map((w) => w.monday)).toEqual(["2026-11-09", "2026-11-02"]);
  });
});
