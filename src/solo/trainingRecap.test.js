// #141: program-complete numbers, the Monday recap, the day-one session,
// smarter swaps and missed sessions — all checked by hand.
import { describe, expect, it } from "vitest";
import { e1rm, programStats, programFinished, plannedSessionCount, weekRecap } from "./trainingRecap";
import { starterSession, equipmentFor } from "./firstSession";
import { swapCandidates, swapScore } from "./exerciseSwap";
import { buildSoloCalendar, missedSessions, sessionPlanKey, calendarItemTarget, addDays } from "./soloCalendar";

const log = (purchaseId, weekNumber, dayId, sets, extra = {}) => ({ id: `${purchaseId}_${dayId}_w${weekNumber}`, purchaseId, weekNumber, dayId, durationMin: 50, entries: [{ exerciseId: "squat", sets }], ...extra });

describe("program complete", () => {
  it("e1rm: 100 kg × 5 ≈ 116.7; a single is itself", () => {
    expect(Math.round(e1rm(100, 5) * 10) / 10).toBe(116.7);
    expect(e1rm(140, 1)).toBe(140);
    expect(e1rm(0, 10)).toBe(0);
  });

  it("knows when every planned session is logged (2 weeks × 2 days = 4)", () => {
    const phases = [{ durationWeeks: 2, days: [{ id: "a" }, { id: "b" }] }];
    expect(plannedSessionCount(phases)).toBe(4);
    const logs = [log("p", 1, "a", []), log("p", 1, "b", []), log("p", 2, "a", [])];
    expect(programFinished(logs, "p", phases)).toBe(false);
    expect(programFinished(logs, "p", phases, { weekNumber: 2, dayId: "b" })).toBe(true);
    // another program's logs don't count
    expect(programFinished([...logs, log("other", 2, "b", [])], "p", phases)).toBe(false);
  });

  it("adds up sessions, minutes, volume and PRs, and strength gained week 1 → last week", () => {
    const logs = [
      log("p", 1, "a", [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }]), // 1000 kg
      log("p", 8, "a", [{ weight: 120, reps: 5, isPR: true }]), // 600 kg
      log("other", 8, "a", [{ weight: 200, reps: 5 }]),
    ];
    const s = programStats(logs, "p");
    expect(s).toMatchObject({ sessions: 2, minutes: 100, volume: 1600, prs: 1 });
    // 100×5 → 116.7, 120×5 → 140: +20%
    expect(s.strength).toEqual([{ exerciseId: "squat", from: 116.7, to: 140, pct: 20 }]);
  });
});

describe("Monday recap", () => {
  const today = "2026-11-03"; // Tuesday; this week from Mon 2 Nov, last week 26 Oct – 1 Nov
  it("counts last week's sessions against plan, volume vs the week before, PRs, and this week's plan", () => {
    const logs = [
      { ...log("p", 2, "a", [{ weight: 50, reps: 10, isPR: true }]), date: "2026-10-27T08:00:00" }, // 500
      { ...log("p", 2, "b", [{ weight: 50, reps: 10 }]), date: "2026-10-30T08:00:00" }, // 500
      { ...log("p", 1, "a", [{ weight: 40, reps: 10 }]), date: "2026-10-21T08:00:00" }, // 400 (week before)
    ];
    const byDate = {
      "2026-10-27": [{ type: "workout", id: "w1", title: "A", done: true, dateKey: "2026-10-27" }],
      "2026-10-30": [{ type: "workout", id: "w2", title: "B", done: true, dateKey: "2026-10-30" }],
      "2026-11-01": [{ type: "workout", id: "w3", title: "C", done: false, dateKey: "2026-11-01" }],
      "2026-11-04": [{ type: "workout", id: "w4", title: "A", done: false, dateKey: "2026-11-04" }],
      "2026-11-02": [{ type: "workout", id: "w5", title: "Skipped", done: false, skipped: true, dateKey: "2026-11-02" }],
    };
    const r = weekRecap({ logs, byDate, todayKey: today });
    expect(r).toMatchObject({ lastMonday: "2026-10-26", sessionsDone: 2, planned: 3, plannedDone: 2, volume: 1000, volumeChangePct: 150, prs: 1, minutes: 100 });
    expect(r.thisWeek.map((w) => w.title)).toEqual(["A"]);
  });
});

describe("first session", () => {
  const lib = [
    { id: "bs", name: "Back Squat", equipment: "Barbell" },
    { id: "gs", name: "Goblet Squat", equipment: "Dumbbell" },
    { id: "pu", name: "Push-Up", equipment: "Bodyweight" },
    { id: "dp", name: "Dumbbell Bench Press", equipment: "Dumbbell" },
    { id: "dr", name: "Dumbbell Row", equipment: "Dumbbell" },
    { id: "gb", name: "Glute Bridge", equipment: "Bodyweight" },
    { id: "pl", name: "Plank", equipment: "Bodyweight" },
    { id: "wu", name: "Arm Circles", equipment: "Bodyweight", category: "Warm-up" },
  ];
  it("one exercise per movement, simpler kit first, only what they have", () => {
    const s = starterSession(lib, { availableEquipment: ["dumbbells", "barbell"] });
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(["gs", "dp", "dr", "gb", "pl"]);
    expect(s.exercises.find((e) => e.exerciseId === "pl")).toMatchObject({ targetType: "time", targetReps: 30 });
    // Bodyweight only: no dumbbell moves
    const bw = starterSession(lib, { availableEquipment: ["bodyweight"] });
    expect(bw.exercises.map((e) => e.exerciseId)).toEqual(["pu", "gb", "pl"]);
    expect(equipmentFor({ trainingEnvironment: "commercial_gym" }).has("Machine")).toBe(true);
  });
});

describe("smarter swaps", () => {
  const lib = [
    { id: "a", name: "Seated Cable Row", equipment: "Cable", category: "Back" },
    { id: "b", name: "Lat Pulldown", equipment: "Cable", category: "Back" },
    { id: "c", name: "Dumbbell Row", equipment: "Dumbbell", category: "Back" },
    { id: "d", name: "Barbell Shrug", equipment: "Barbell", category: "Back" },
  ];
  it("puts the same movement first, then the same equipment", () => {
    const machineRow = { id: "m", name: "Low Row Machine", equipment: "Machine", category: "Back" };
    expect(swapScore(machineRow, lib[2])).toBeGreaterThan(swapScore(machineRow, lib[3]));
    expect(swapCandidates(machineRow, lib).map((e) => e.id).slice(0, 2).sort()).toEqual(["a", "c"]); // both rows, ahead of the pulldown and shrug
    const cableRow = { id: "x", name: "Single Arm Cable Row", equipment: "Cable", category: "Back" };
    expect(swapCandidates(cableRow, lib)[0].id).toBe("a");
  });
});

describe("missed sessions", () => {
  const today = "2026-11-03";
  const purchase = { id: "u1_p", programId: "p", startDate: "2026-10-26", status: "active", current: true };
  const phases = [{ durationWeeks: 4, days: [{ id: "a", label: "Lower" }, { id: "b", label: "Upper" }] }];
  const base = { purchases: [purchase], programsById: { p: { id: "p", name: "P" } }, contentByProgramId: { p: { phases } }, trainingDays: ["mon", "thu"], fromKey: addDays(today, -7), toKey: today };

  it("finds last week's planned-but-not-done sessions; move-to-today and skip take them off the list", () => {
    const byDate = buildSoloCalendar({ ...base, workoutLogs: [] });
    const missed = missedSessions(byDate, today, 7);
    expect(missed.map((m) => m.title)).toEqual(expect.arrayContaining(["Lower"]));
    const first = missed[0];
    const key = sessionPlanKey(first.weekNumber, first.day.id);
    const moved = buildSoloCalendar({ ...base, workoutLogs: [], sessionPlan: { u1_p: { [key]: { moveTo: today } } } });
    expect(missedSessions(moved, today, 7).some((m) => m.id === first.id)).toBe(false);
    const onToday = (moved[today] || []).find((i) => i.id === first.id);
    expect(onToday).toMatchObject({ movedFrom: first.dateKey });
    expect(calendarItemTarget(onToday, { todayKey: today, soloUid: "u1", contentByProgramId: base.contentByProgramId })?.path).toBe("/solo/workout");
    const skipped = buildSoloCalendar({ ...base, workoutLogs: [], sessionPlan: { u1_p: { [key]: { skipped: true } } } });
    expect(missedSessions(skipped, today, 7).some((m) => m.id === first.id)).toBe(false);
    const skippedItem = Object.values(skipped).flat().find((i) => i.id === first.id);
    expect(skippedItem.skipped).toBe(true);
    expect(calendarItemTarget(skippedItem, { todayKey: today, soloUid: "u1", contentByProgramId: base.contentByProgramId })).toBe(null);
  });

  it("an archived program's sessions are never offered", () => {
    const byDate = buildSoloCalendar({ ...base, purchases: [{ ...purchase, current: false }], workoutLogs: [] });
    expect(missedSessions(byDate, today, 7)).toEqual([]);
  });
});
