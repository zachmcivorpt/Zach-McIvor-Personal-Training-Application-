// #236: main goal progress and training insights, checked by hand.
import { describe, it, expect } from "vitest";
import { suggestedGoals, startGoal, goalProgress, goalTitle, encouragement, milestoneCrossed, goalLiftExercises } from "./goals";
import { buildInsights, insightForToday, biggestLiftGain, weeksTrainedInARow, strengthGains, workoutHighlight, weeklyFocus, reviewHeadline } from "./insights";
import { reviewWeek } from "./trainingRecap";

const at = (key, h = 9) => new Date(`${key}T${String(h).padStart(2, "0")}:00:00`).getTime();
const log = (id, key, exerciseId, sets) => ({ id, date: at(key), entries: [{ exerciseId, sets: sets.map(([weight, reps, isPR]) => ({ weight, reps, isPR: !!isPR })) }] });
const lib = [
  { id: "bp", name: "Bench Press" },
  { id: "sq", name: "Back Squat" },
  { id: "dl", name: "Deadlift" },
  { id: "row", name: "Dumbbell Row" },
];
const byId = Object.fromEntries(lib.map((e) => [e.id, e]));
const TODAY = "2026-11-12"; // Thursday

describe("goal suggestions", () => {
  it("lead with what their questionnaire answer was about, with numbers they can change", () => {
    const lose = suggestedGoals({ answers: { primaryGoal: "lose_fat" }, exercises: lib });
    expect(lose.map((g) => g.type)).toEqual(["bodyweight", "steps", "workouts", "consistency", "lift"]);
    expect(goalTitle(lose[0])).toBe("Lose 5 kg");
    expect(goalTitle(lose[1])).toBe("10,000 steps a day for 30 days");
    const strong = suggestedGoals({ answers: { primaryGoal: "get_stronger", sessionsPerWeek: 4 }, exercises: lib });
    expect(goalTitle(strong[0])).toBe("Bench press 100 kg");
    expect(goalTitle(strong[1])).toBe("Build muscle: train 4× a week for 12 weeks");
  });
  it("a lift goal starts 10% above their best, to the next 5 kg", () => {
    const logs = [log("1", "2026-11-02", "bp", [[72.5, 5]])];
    const lift = suggestedGoals({ answers: { primaryGoal: "get_stronger" }, exercises: lib, logs })[0];
    expect(lift.target).toBe(80); // 72.5 × 1.1 = 79.75 → 80
  });
  it("finds the library's big lifts by name, never a variation", () => {
    expect(goalLiftExercises([...lib, { id: "dbp", name: "Dumbbell Bench Press" }, { id: "rdl", name: "Romanian Deadlift" }]).map((l) => l.exerciseId)).toEqual(["bp", "sq", "dl"]);
  });
});

describe("goal progress, from their own data", () => {
  it("workouts: logs since the goal was set", () => {
    const goal = { type: "workouts", target: 20, startKey: "2026-11-01" };
    const logs = [log("a", "2026-10-30", "row", [[20, 10]]), ...Array.from({ length: 11 }, (_, i) => log(`b${i}`, "2026-11-05", "row", [[20, 10]]))];
    const p = goalProgress(goal, { logs, todayKey: TODAY });
    expect(p).toMatchObject({ value: 11, of: 20, pct: 0.55, done: false, left: "9 workouts to go" });
    expect(encouragement(p)).toBe("Halfway there — 9 workouts to go.");
  });
  it("lift: from the best before the goal to the target", () => {
    const logs = [log("a", "2026-10-01", "bp", [[80, 5]]), log("b", "2026-11-10", "bp", [[90, 3], [95, 0]])];
    const goal = startGoal({ type: "lift", target: 100, exerciseId: "bp", liftLabel: "Bench press" }, { logs: logs.slice(0, 1), todayKey: "2026-10-02" });
    expect(goal.start).toBe(80);
    const p = goalProgress(goal, { logs, todayKey: TODAY });
    // 0 reps doesn't count: best 90 → (90 − 80) / (100 − 80) = 50%
    expect(p).toMatchObject({ value: 90, of: 100, pct: 0.5, left: "10 kg to go" });
  });
  it("bodyweight: from the weigh-in when it was set to the latest", () => {
    const weighIns = [{ weight: 84, date: at("2026-10-01") }];
    const goal = startGoal({ type: "bodyweight", target: 5, direction: "lose" }, { weighIns, todayKey: "2026-10-01" });
    expect(goal.start).toBe(84);
    const p = goalProgress(goal, { weighIns: [...weighIns, { weight: 81.6, date: at("2026-11-10") }], todayKey: TODAY });
    expect(p).toMatchObject({ value: 2.4, of: 5, left: "2.6 kg to go" });
    expect(p.pct).toBeCloseTo(0.48);
    expect(goalProgress({ type: "bodyweight", target: 5 }, { weighIns: [], todayKey: TODAY }).needsWeight).toBe(true);
  });
  it("consistency: weeks with enough sessions since the goal started", () => {
    const goal = { type: "consistency", target: 12, perWeek: 2, startKey: "2026-10-26" };
    const logs = [log("1", "2026-10-27", "row", [[1, 1]]), log("2", "2026-10-29", "row", [[1, 1]]), log("3", "2026-11-03", "row", [[1, 1]]), log("4", "2026-11-09", "row", [[1, 1]]), log("5", "2026-11-11", "row", [[1, 1]])];
    expect(goalProgress(goal, { logs, todayKey: TODAY })).toMatchObject({ value: 2, left: "10 weeks to go" });
  });
  it("steps: days at or over the target since it was set", () => {
    const goal = { type: "steps", target: 30, stepTarget: 10000, startKey: "2026-11-01" };
    const bodyMetrics = [
      { date: "2026-10-31", steps: 15000 },
      { date: "2026-11-02", steps: 10000 },
      { date: "2026-11-03", steps: 9999 },
      { date: "2026-11-04", steps: 12000 },
    ];
    expect(goalProgress(goal, { bodyMetrics, todayKey: TODAY })).toMatchObject({ value: 2, left: "28 days to go" });
  });
  it("tells the workout that crossed a milestone", () => {
    const goal = { type: "workouts", target: 4, startKey: "2026-11-01" };
    const logs = [log("1", "2026-11-02", "row", [[1, 1]]), log("2", "2026-11-03", "row", [[1, 1]])];
    expect(milestoneCrossed(goal, { logs, todayKey: TODAY }, "2")).toBe(0.5);
    expect(milestoneCrossed(goal, { logs: [...logs, log("3", "2026-11-04", "row", [[1, 1]])], todayKey: TODAY }, "3")).toBe(0.75);
    expect(milestoneCrossed(goal, { logs, todayKey: TODAY }, "nope")).toBe(null);
  });
});

describe("insights", () => {
  const logs = [
    log("1", "2026-09-22", "sq", [[100, 5]]),
    log("2", "2026-11-10", "sq", [[112.5, 5, true], [110, 5]]),
    log("3", "2026-11-03", "row", [[30, 10, true]]),
    log("4", "2026-11-05", "row", [[30, 10]]),
    log("5", "2026-11-11", "bp", [[70, 5, true]]),
  ];
  it("only says what the logs show, most important first", () => {
    const lines = buildInsights({ logs, exercisesById: byId, todayKey: TODAY }).map((i) => i.text);
    expect(lines).toEqual([
      "Your back squat is up 12.5 kg in 7 weeks.",
      "You've set three new personal records this month.",
      "You've completed 4 workouts this month.",
    ]);
    // Volume: 2,062.5 kg vs 500 kg would read +313%, but one session in the
    // four weeks before isn't a fair comparison, so it isn't said.
  });
  it("no data, no insight", () => {
    expect(buildInsights({ logs: [], todayKey: TODAY })).toEqual([]);
    expect(insightForToday([], TODAY)).toBe(null);
  });
  it("volume: up on the four weeks before, never a fall dressed up", () => {
    const up = [log("a", "2026-10-01", "row", [[100, 10]]), log("a2", "2026-10-02", "row", [[100, 10]]), log("b", "2026-11-01", "row", [[108, 10]]), log("b2", "2026-11-02", "row", [[108, 10]])];
    expect(buildInsights({ logs: up, todayKey: TODAY }).find((i) => i.id === "volume").text).toBe("Your training volume is up 8% on the four weeks before.");
    const down = [log("a", "2026-10-01", "row", [[108, 10]]), log("a2", "2026-10-02", "row", [[108, 10]]), log("b", "2026-11-01", "row", [[100, 10]]), log("b2", "2026-11-02", "row", [[100, 10]])];
    expect(buildInsights({ logs: down, todayKey: TODAY }).find((i) => i.id === "volume")).toBeUndefined();
  });
  it("ties into the goal without repeating it", () => {
    const goal = { type: "lift", exerciseId: "bp" };
    const progress = { pct: 0.6, left: "7.5 kg to go", done: false };
    const lifts = [log("x", "2026-10-20", "bp", [[70, 5]]), log("y", "2026-11-10", "bp", [[82.5, 5]]), log("z", "2026-10-20", "sq", [[100, 5]]), log("w", "2026-11-10", "sq", [[130, 5]])];
    const list = buildInsights({ logs: lifts, exercisesById: byId, goal, progress, todayKey: TODAY });
    // The goal's lift wins over a bigger gain elsewhere, with what's left.
    expect(list[0].text).toBe("Your bench press is up 12.5 kg in 3 weeks — 7.5 kg from your goal.");
    expect(list.some((i) => /to reach your goal/.test(i.text))).toBe(false);
    const w = buildInsights({ logs: lifts, exercisesById: byId, goal: { type: "workouts" }, progress: { pct: 0.2, left: "16 workouts to go" }, todayKey: TODAY });
    expect(w.find((i) => i.id === "month")).toBeUndefined(); // only 2 this month
  });
  it("rotates day by day without repeating on consecutive days", () => {
    const list = buildInsights({ logs, exercisesById: byId, todayKey: TODAY });
    const a = insightForToday(list, "2026-11-12").id;
    const b = insightForToday(list, "2026-11-13").id;
    expect(a).not.toBe(b);
  });
  it("weeks in a row counts this week once trained, else up to last week", () => {
    // Weeks of 2 and 9 Nov; nothing the week of 26 Oct.
    expect(weeksTrainedInARow(logs, TODAY)).toBe(2);
    expect(weeksTrainedInARow(logs.filter((l) => l.id !== "5" && l.id !== "2"), TODAY)).toBe(1);
  });
  it("strength gains are against the best before the week", () => {
    expect(strengthGains(logs, byId, "2026-11-09", "2026-11-16")).toEqual([{ exerciseId: "sq", name: "Back Squat", from: 116.7, to: 131.3, gain: 14.6 }]);
  });
  it("after a workout: a lift's best yet, else nothing", () => {
    expect(workoutHighlight({ logs, exercisesById: byId, logId: "2" })).toBe("Your best back squat yet — estimated max up 14.6 kg.");
    expect(workoutHighlight({ logs, exercisesById: byId, logId: "4" })).toBe(null);
    expect(workoutHighlight({ logs, logId: "4", milestone: 0.5 })).toBe("50% of the way to your goal.");
  });
  it("biggest lift gain needs two weeks and 2.5 kg", () => {
    expect(biggestLiftGain([log("x", "2026-11-10", "sq", [[100, 5]]), log("y", "2026-11-11", "sq", [[105, 5]])], byId, TODAY)).toBe(null);
  });
});

describe("weekly review", () => {
  it("covers the week ending on a Sunday, else the week just gone", () => {
    expect(reviewWeek("2026-11-15")).toMatchObject({ reviewMonday: "2026-11-09", nextMonday: "2026-11-16", sunday: true });
    expect(reviewWeek("2026-11-16")).toMatchObject({ reviewMonday: "2026-11-09", nextMonday: "2026-11-16", sunday: false });
  });
  it("headline and focus follow how the week went", () => {
    expect(reviewHeadline({ planned: 3, plannedDone: 3, prs: 0, sessionsDone: 3 })).toBe("Every planned session. Done.");
    expect(reviewHeadline({ planned: 0, plannedDone: 0, prs: 0, sessionsDone: 0 })).toBe("A quiet week. Next week is a fresh start.");
    expect(reviewHeadline({ planned: 0, plannedDone: 0, prs: 4, sessionsDone: 3 })).toBe("Four new personal records this week.");
    expect(weeklyFocus({ recap: { sessionsDone: 2, planned: 3, plannedDone: 2 }, nextPlanned: 3 })).toBe("Hit all 3 planned sessions. Missed one? Move it, don't skip it.");
    expect(weeklyFocus({ recap: { sessionsDone: 0 }, nextPlanned: 0 })).toBe("Plan two sessions for next week and do the first one early.");
  });
});
