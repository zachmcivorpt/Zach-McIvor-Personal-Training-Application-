import { describe, it, expect } from "vitest";
import { planSetTarget, isStalled, planExerciseTargets, targetReasonText } from "./soloProgression";

// Every expected number below was worked out by hand.
describe("Train Solo set targets", () => {
  it("adds weight when the target reps were hit (~2.5%, at least 2.5 kg, to 2.5 kg plates)", () => {
    expect(planSetTarget({ weight: 60, reps: 10 }, 10)).toEqual({ weight: 62.5, reps: 10, reason: "up" }); // 61.5 → +2.5 minimum
    expect(planSetTarget({ weight: 200, reps: 5 }, 5)).toEqual({ weight: 205, reps: 5, reason: "up" }); // 2.5% of 200 = 5
    expect(planSetTarget({ weight: 60, reps: 12 }, 10)).toEqual({ weight: 62.5, reps: 10, reason: "up" }); // beat it → still the target reps
  });

  it("keeps the weight when 1–2 reps short, and aims for the target", () => {
    expect(planSetTarget({ weight: 60, reps: 8 }, 10)).toEqual({ weight: 60, reps: 10, reason: "hold" });
    expect(planSetTarget({ weight: 60, reps: 9 }, 10)).toEqual({ weight: 60, reps: 10, reason: "hold" });
  });

  it("drops 10% when 3+ reps short (rounded to 2.5 kg)", () => {
    expect(planSetTarget({ weight: 60, reps: 6 }, 10)).toEqual({ weight: 55, reps: 10, reason: "back-off" }); // 54 → 55
    expect(planSetTarget({ weight: 100, reps: 2 }, 8)).toEqual({ weight: 90, reps: 8, reason: "back-off" });
  });

  it("resets 10% lighter on a plateau", () => {
    expect(planSetTarget({ weight: 80, reps: 8 }, 8, { stalled: true })).toEqual({ weight: 72.5, reps: 8, reason: "reset" }); // 72 → 72.5
  });

  it("handles AMRAP and bodyweight by adding a rep", () => {
    expect(planSetTarget({ weight: 50, reps: 12 }, "AMRAP")).toEqual({ weight: 50, reps: 13, reason: "more-reps" });
    expect(planSetTarget({ weight: 0, reps: 12 }, 10)).toEqual({ weight: 0, reps: 13, reason: "more-reps" });
    expect(planSetTarget({ weight: 0, reps: 6 }, 10)).toEqual({ weight: 0, reps: 7, reason: "build" });
  });

  it("never goes below 2.5 kg, and has nothing to say without a previous set", () => {
    expect(planSetTarget({ weight: 2.5, reps: 3 }, 10).weight).toBe(2.5);
    expect(planSetTarget(null, 10)).toBeNull();
    expect(planSetTarget({ weight: 40, reps: 0 }, 10)).toBeNull();
    expect(planSetTarget({ weight: 40, reps: "" }, 10)).toBeNull();
  });

  it("gives every row a target, using last time's final set for extra rows", () => {
    const t = planExerciseTargets([{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }], 10, 3);
    expect(t.map((x) => x.weight)).toEqual([62.5, 60, 60]);
    expect(planExerciseTargets([], 10, 2)).toEqual([null, null]);
  });

  it("explains the plan in one line", () => {
    expect(targetReasonText({ reason: "hold" }, 10)).toBe("Just short last time. Same weight, aim for 10 reps.");
    expect(targetReasonText(null, 10)).toBeNull();
  });
});

describe("plateau detection", () => {
  const log = (weight, reps, exerciseId = "e1") => ({ entries: [{ exerciseId, sets: [{ weight, reps }, { weight: weight - 10, reps: reps + 2 }] }] });

  it("is a plateau when the last 3 sessions' top set didn't move", () => {
    expect(isStalled([log(80, 8), log(80, 8), log(80, 8)], "e1")).toBe(true);
    expect(isStalled([log(80, 7), log(80, 8), log(80, 8)], "e1")).toBe(true); // reps fell
  });

  it("is not a plateau when reps or weight went up, or with fewer than 3 sessions", () => {
    expect(isStalled([log(80, 9), log(80, 8), log(80, 8)], "e1")).toBe(false);
    expect(isStalled([log(82.5, 8), log(80, 8), log(80, 8)], "e1")).toBe(false);
    expect(isStalled([log(80, 8), log(80, 8)], "e1")).toBe(false);
    expect(isStalled([log(80, 8), log(80, 8, "e2"), log(80, 8), log(80, 8)], "e1")).toBe(true); // other exercises skipped
    expect(isStalled([log(0, 10), log(0, 10), log(0, 10)], "e1")).toBe(false); // bodyweight
  });
});
