// #231: "Swap in training phase" (coach in View as Client).
import { describe, expect, it } from "vitest";
import { planPhaseSwap, phaseForDate } from "./phaseSwap";

const day = (label, ids) => ({ id: label, label, exercises: ids.map((id) => ({ exerciseId: id, targetSets: 3, targetReps: 8 })) });
const phases = [
  { id: "old", startDate: "2026-09-01", endDate: "2026-10-31", weeks: [{ id: "w1", days: [day("Pull", ["row", "curl"])] }] },
  { id: "cur", startDate: "2026-11-01", endDate: "2026-12-31", weeks: [{ id: "w1", label: "Week 1", days: [day("Pull", ["row", "curl"]), day("Push", ["bench", "row"])] }] },
];
const sched = (date, label, ids) => ({ id: `c1__${date}`, clientId: "c1", date, label, exercises: day(label, ids).exercises });
const scheduled = [
  sched("2026-11-10", "Pull", ["row", "curl"]), // before this session: history, untouched
  sched("2026-11-14", "Pull", ["row", "curl"]), // this session's day
  sched("2026-11-21", "Pull", ["row", "curl"]),
  sched("2026-11-22", "Push", ["bench", "row"]), // other day: untouched
  sched("2027-01-05", "Pull", ["row", "curl"]), // after the phase: untouched
];

describe("planPhaseSwap (#231)", () => {
  it("swaps the exercise in this day of the current phase and its days from today to the phase end", () => {
    const plan = planPhaseSwap({ phases, scheduled, dateKey: "2026-11-14", label: "Pull", fromId: "row", toId: "dbrow" });
    expect(plan.phaseId).toBe("cur");
    const days = plan.weeks[0].days;
    expect(days[0].exercises.map((e) => e.exerciseId)).toEqual(["dbrow", "curl"]);
    expect(days[0].exercises[0]).toMatchObject({ targetSets: 3, targetReps: 8 }); // sets/reps kept
    expect(days[1].exercises.map((e) => e.exerciseId)).toEqual(["bench", "row"]); // Push untouched
    expect(plan.weeks[0]).toMatchObject({ id: "w1", label: "Week 1" });
    expect(plan.scheduled.map((w) => w.date)).toEqual(["2026-11-14", "2026-11-21"]);
    expect(plan.scheduled[0].exercises.map((e) => e.exerciseId)).toEqual(["dbrow", "curl"]);
  });

  it("does nothing when the exercise isn't in the phase, or nothing changes", () => {
    expect(planPhaseSwap({ phases, scheduled, dateKey: "2026-11-14", label: "Pull", fromId: "squat", toId: "x" })).toBeNull();
    expect(planPhaseSwap({ phases, scheduled, dateKey: "2026-11-14", label: "Pull", fromId: "row", toId: "row" })).toBeNull();
    expect(planPhaseSwap({ phases: [], scheduled, dateKey: "2026-11-14", label: "Pull", fromId: "row", toId: "x" })).toBeNull();
  });

  it("picks the phase covering the day", () => {
    expect(phaseForDate(phases, "2026-10-05").id).toBe("old");
    expect(phaseForDate(phases, "2026-11-14").id).toBe("cur");
    expect(phaseForDate(phases, "2027-02-01")).toBeNull();
  });
});
