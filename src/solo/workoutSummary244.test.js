// #244: the workout summary's peak and next-time targets, and comeback.
import { describe, it, expect } from "vitest";
import { sessionEntries, summaryPeak, nextTimeTargets, comebackGap, comebackSession, daysSinceLastSession, comebacksIn, weeklyTargetOf } from "./workoutSummary";

const at = (key) => new Date(`${key}T09:00:00`).getTime();
const log = (id, key, exerciseId, sets, label = "Upper") => ({ id, date: at(key), dayLabel: label, entries: [{ exerciseId, sets: sets.map(([weight, reps]) => ({ weight, reps })) }] });
const lib = { bp: { id: "bp", name: "Bench Press" }, sq: { id: "sq", name: "Back Squat" }, pu: { id: "pu", name: "Pull-Up" }, row: { id: "row", name: "Seated Row" } };
const TODAY = "2026-11-16";
const set = (weight, reps, isPR = false) => ({ weight, reps, completed: true, isPR });

describe("sessionEntries", () => {
  it("keeps only completed sets with reps", () => {
    expect(sessionEntries({ bp: [set(80, 5), { weight: 80, reps: 5, completed: false }, set(80, 0)], sq: [] })).toEqual([{ exerciseId: "bp", sets: [{ weight: 80, reps: 5, isPR: false }] }]);
  });
});

describe("summaryPeak", () => {
  const prev = [log("p1", "2026-11-14", "bp", [[80, 5]]), log("p2", "2026-11-13", "sq", [[110, 5]])];
  it("a new PR leads, with how much more than last time", () => {
    const entries = sessionEntries({ bp: [set(82.5, 5, true), set(80, 6)] });
    expect(summaryPeak({ entries, previousLogs: prev, exercisesById: lib, todayKey: TODAY })).toMatchObject({ kind: "pr", eyebrow: "New personal best", title: "Bench Press 82.5 kg × 5", detail: "+2.5 kg on last time" });
  });
  it("no PR: the lift that beat last time, in reps or kg", () => {
    const reps = summaryPeak({ entries: sessionEntries({ sq: [set(110, 7)] }), previousLogs: prev, exercisesById: lib, todayKey: TODAY });
    expect(reps).toMatchObject({ kind: "beat", title: "Back Squat 110 kg × 7", detail: "2 reps more than last time" });
  });
  it("nothing beaten: every set done", () => {
    expect(summaryPeak({ entries: sessionEntries({ bp: [set(70, 5)] }), previousLogs: prev, exercisesById: lib, todayKey: TODAY })).toMatchObject({ kind: "done", title: "Every set done." });
  });
  it("back after 4+ days: the comeback leads", () => {
    const old = [log("p1", "2026-11-10", "bp", [[80, 5]])];
    expect(summaryPeak({ entries: sessionEntries({ bp: [set(85, 5, true)] }), previousLogs: old, exercisesById: lib, todayKey: TODAY })).toMatchObject({ kind: "comeback", title: "You're back.", detail: "First session in 6 days. That's the one that counts." });
    expect(comebackGap([log("p", "2026-11-13", "bp", [[1, 1]])], TODAY)).toBe(null);
  });
});

describe("nextTimeTargets", () => {
  const day = { exercises: [{ exerciseId: "bp", targetReps: 5 }, { exerciseId: "sq", targetReps: 8 }] };
  const entries = sessionEntries({ bp: [set(80, 5), set(80, 5)], sq: [set(100, 6)], pu: [set(0, 8)], row: [set(10, 10)] });
  it("Free: +2.5 kg at the top of the reps, else +1 rep; bodyweight +1 rep; up to 3 lifts by volume", () => {
    const n = nextTimeTargets({ entries, day, exercisesById: lib });
    expect(n.map((x) => [x.name, x.text])).toEqual([
      ["Bench Press", "82.5 kg × 5"],
      ["Back Squat", "100 kg × 7"],
      ["Seated Row", "12.5 kg × 10"],
    ]);
  });
  it("Plus: the suggested-weights rule (short by 2 → same weight, aim for the target)", () => {
    const n = nextTimeTargets({ entries, day, exercisesById: lib, smart: true });
    expect(n.find((x) => x.name === "Back Squat").text).toBe("100 kg × 8");
  });
});

describe("comeback", () => {
  const logs = [log("a", "2026-11-05", "bp", [[80, 5], [80, 5], [80, 6]], "Upper"), log("b", "2026-11-11", "sq", [[100, 5], [100, 5]], "Lower")];
  it("days since the last session", () => {
    expect(daysSinceLastSession(logs, TODAY)).toBe(5);
    expect(daysSinceLastSession([], TODAY)).toBe(null);
  });
  it("a short version of their latest session: up to 3 exercises, 2 sets, typical reps", () => {
    const s = comebackSession([...logs, { id: "c", date: at("2026-11-12"), dayLabel: "Full", entries: [{ exerciseId: "bp", sets: [{ weight: 1, reps: 6 }, { weight: 1, reps: 8 }, { weight: 1, reps: 10 }] }, { exerciseId: "row", sets: [{ weight: 1, reps: 12 }] }, { exerciseId: "gone", sets: [{ weight: 1, reps: 1 }] }] }], lib);
    expect(s.name).toBe("Comeback: Full");
    expect(s.exercises.map((e) => [e.exerciseId, e.targetSets, e.targetReps])).toEqual([
      ["bp", 2, 8],
      ["row", 2, 12],
    ]);
  });
  it("never nests the name", () => {
    expect(comebackSession([{ ...logs[1], dayLabel: "Comeback: Lower" }], lib).name).toBe("Comeback: Lower");
  });
  it("comebacks in a week, for the review", () => {
    expect(comebacksIn(logs, "2026-11-09", "2026-11-16")).toEqual([{ dateKey: "2026-11-11", gap: 6 }]);
  });
  it("weekly target follows the questionnaire", () => {
    expect(weeklyTargetOf({ onboarding: { answers: { sessionsPerWeek: 4 } } })).toBe(4);
    expect(weeklyTargetOf({})).toBe(3);
  });
});
