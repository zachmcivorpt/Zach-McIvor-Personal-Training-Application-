// #220: the video-feedback workspace's "This week" scorecard and the linked
// check-in comparison — figures checked by hand against fixed data.
import { describe, expect, it } from "vitest";
import { weekScorecard, bestLiftsThisWeek } from "./clientSnapshot";
import { checkinChanges, headlineChanges, higherIsWorse } from "../../lib/videoFeedback/checkinChanges";
import { localDateKey } from "../../lib/dateKey";

// Thursday 12 Nov 2026, 10:00 local. "This week" = Thu 5 … Wed 11 Nov.
const NOW = new Date(2026, 10, 12, 10, 0, 0).getTime();
const day = (d, h = 9) => new Date(2026, 10, d, h, 0, 0).getTime();
const key = (d) => localDateKey(new Date(2026, 10, d, 12));
const targets = { calories: 2000, protein: 150 };
const set = (weight, reps) => ({ weight, reps });

describe("This week scorecard (#220)", () => {
  const workoutLogs = [
    { id: "a", date: day(5), entries: [{ exerciseId: "sq", sets: [set(100, 5)] }] }, // planned Thu 5 → done
    { id: "b", date: day(9), entries: [{ exerciseId: "sq", sets: [set(110, 5)] }, { exerciseId: "bp", sets: [set(80, 5)] }] }, // planned Mon 9 → done
    { id: "c", date: day(10), entries: [{ exerciseId: "bp", sets: [set(70, 5)] }] }, // unplanned extra
    { id: "old", date: day(1), entries: [{ exerciseId: "sq", sets: [set(100, 5)] }, { exerciseId: "bp", sets: [set(80, 5)] }] }, // before the week
    { id: "today", date: day(12), entries: [{ exerciseId: "sq", sets: [set(200, 5)] }] }, // today: not counted
  ];
  const scheduledWorkouts = [{ date: key(5) }, { date: key(7) }, { date: key(9) }, { date: key(11) }];
  const nutritionLogs = [
    { date: key(5), calories: 2100, protein: 150, meals: { Breakfast: [{}] } }, // kcal within 12% ✓, protein ✓
    { date: key(6), calories: 2300, protein: 120, meals: { Breakfast: [{}] } }, // 15% over ✗, protein 80% ✗
    { date: key(7), calories: 1900, protein: 140, meals: { Breakfast: [{}] } }, // ✓, 93% ✓
    { date: key(8), water: 1 }, // water only → not logged
  ];
  const bodyMetrics = [
    { date: key(5), steps: 12000, sleepHours: 7 },
    { date: key(6), steps: 6000, sleepHours: 8 },
  ];
  const weighIns = [
    { date: day(6), weight: 80 },
    { date: day(10), weight: 79 }, // this week avg 79.5
    { date: day(1), weight: 81 }, // last week avg 81
  ];
  const w = weekScorecard({ workoutLogs, scheduledWorkouts, nutritionLogs, bodyMetrics, weighIns, targets, exercisesById: { sq: { name: "Squat" }, bp: { name: "Bench" } }, now: NOW });

  it("covers the 7 completed days before today", () => {
    expect(w.from).toBe(key(5));
    expect(w.to).toBe(key(11));
    expect(w.days).toHaveLength(7);
  });
  it("planned sessions: 2 of 4 done = 50%; the unplanned one counts as extra", () => {
    expect(w.sessions).toMatchObject({ planned: 4, done: 2, pct: 50, total: 3 });
    expect(w.days.find((d) => d.dateKey === key(10)).session).toBe("extra");
    expect(w.days.find((d) => d.dateKey === key(7)).session).toBe("missed");
  });
  it("nutrition: food-logged days only; calorie and protein hits by the coach card's rules", () => {
    expect(w.nutrition).toMatchObject({ logged: 3, calorieHits: 2, proteinHits: 2, avgCalories: 2100 });
  });
  it("steps, sleep, weight and kg lifted", () => {
    expect(w.steps).toMatchObject({ avg: 9000, pct: 90, days: 2 });
    expect(w.sleep.avg).toBe(7.5);
    expect(w.weight).toEqual({ avg: 79.5, change: -1.5 });
    // 500 + 550 + 400 + 350 = 1800 kg this week; last week 500 + 400 = 900 → +100%
    expect(w.lifted).toEqual({ kg: 1800, changePct: 100 });
  });
  it("no data shows as null, never 0", () => {
    const empty = weekScorecard({ targets, now: NOW });
    expect(empty.sessions.pct).toBeNull();
    expect(empty.steps.avg).toBeNull();
    expect(empty.weight.avg).toBeNull();
    expect(empty.lifted.kg).toBeNull();
    expect(empty.nutrition.avgCalories).toBeNull();
  });
  it("best lifts: this week's best set vs the last session before it; PR when it beats every earlier one", () => {
    const sq = w.bestLifts.find((l) => l.id === "sq");
    expect(sq.set).toEqual({ weight: 110, reps: 5, e1rm: expect.any(Number) });
    expect(sq.pr).toBe(true);
    expect(sq.change).toBe(12); // est. max 110×5 = 128.3 vs 100×5 = 116.7 → +11.7 → 12
    const bp = w.bestLifts.find((l) => l.id === "bp");
    expect(bp.pr).toBe(false);
    expect(bp.change).toBe(0);
    expect(w.bestLifts[0].id).toBe("sq"); // PRs first
  });
  it("a lift with no history before the week is not a PR and has no change", () => {
    const r = bestLiftsThisWeek([{ date: day(9), entries: [{ exerciseId: "x", sets: [set(50, 5)] }] }], new Set([key(9)]), {});
    expect(r[0]).toMatchObject({ pr: false, change: null });
  });
});

describe("Linked check-in changes (#220)", () => {
  const form = {
    id: "f",
    questions: [
      { id: "stress", type: "rating", label: "Stress levels" },
      { id: "sleep", type: "rating", label: "Sleep quality" },
      { id: "energy", type: "rating", label: "Energy" },
      { id: "hunger", type: "rating", label: "Hunger", higherIsWorse: false }, // coach override
      { id: "win", type: "text", label: "Biggest win" },
      { id: "bw", type: "number", label: "Bodyweight" },
    ],
  };
  const prev = { id: "r1", formId: "f", date: day(4), answers: { stress: 2, sleep: 4, energy: 3, hunger: 2, bw: 81 } };
  const other = { id: "rx", formId: "other", date: day(10), answers: { stress: 5 } };
  const now = { id: "r2", formId: "f", date: day(11), answers: { stress: 4, sleep: 3, energy: 4, hunger: 4, win: "Squat PR", bw: 80 } };
  const c = checkinChanges(form, now, [now, other, prev]);

  it("compares with the previous response of the same form", () => {
    expect(c.previous.id).toBe("r1");
  });
  it("stress up is worse, sleep down is worse, energy up is better; the coach's setting wins over the wording", () => {
    const by = Object.fromEntries(c.ratings.map((r) => [r.id, r]));
    expect(by.stress).toMatchObject({ prev: 2, now: 4, delta: 2, verdict: "worse" });
    expect(by.sleep).toMatchObject({ verdict: "worse" });
    expect(by.energy).toMatchObject({ verdict: "better" });
    expect(by.hunger).toMatchObject({ verdict: "better" });
    expect(higherIsWorse({ label: "Muscle soreness" })).toBe(true);
    expect(higherIsWorse({ label: "Mood" })).toBe(false);
  });
  it("key changes are the worse ones, biggest first; the client sees worse then better", () => {
    expect(c.keyChanges.map((k) => k.id)).toEqual(["stress", "sleep"]);
    expect(headlineChanges(c).map((k) => k.id)).toEqual(["stress", "sleep", "hunger"]);
  });
  it("other answers are listed, numbers with last time's value", () => {
    expect(c.answers).toEqual([
      { id: "win", label: "Biggest win", type: "text", value: "Squat PR", prev: null },
      { id: "bw", label: "Bodyweight", type: "number", value: 80, prev: 81 },
    ]);
  });
  it("a first check-in has nothing to compare (verdict new, no key changes)", () => {
    const first = checkinChanges(form, prev, [prev]);
    expect(first.previous).toBeNull();
    expect(first.keyChanges).toEqual([]);
    expect(first.ratings[0].verdict).toBe("new");
  });
});
