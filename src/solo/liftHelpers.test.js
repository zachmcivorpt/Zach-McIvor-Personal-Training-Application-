// #141: warm-up sets and plate loading — checked by hand.
import { describe, expect, it } from "vitest";
import { platesPerSide, warmupSets, workingWeight, isBarbell, formatPlates } from "./liftHelpers";

describe("plates per side (20 kg bar)", () => {
  it("makes common weights from the heaviest plates down", () => {
    // 100 kg: (100 - 20) / 2 = 40 a side = 25 + 15
    expect(platesPerSide(100)).toEqual({ perSide: [25, 15], exact: true });
    // 62.5 kg: 21.25 a side = 20 + 1.25
    expect(platesPerSide(62.5)).toEqual({ perSide: [20, 1.25], exact: true });
    // 140 kg: 60 a side = 25 + 25 + 10
    expect(platesPerSide(140)).toEqual({ perSide: [25, 25, 10], exact: true });
    expect(platesPerSide(20)).toEqual({ perSide: [], exact: true });
  });
  it("says when a weight can't be made exactly", () => {
    // 61 kg: 20.5 a side — 20 leaves 0.5, no plate that small
    expect(platesPerSide(61)).toEqual({ perSide: [20], exact: false });
    expect(platesPerSide(15).exact).toBe(false);
  });
  it("reads plainly", () => {
    expect(formatPlates([25, 25, 10])).toBe("2 × 25 + 10");
    expect(formatPlates([])).toBe("Empty bar");
  });
});

describe("warm-up sets", () => {
  it("ramps bar, ~40%, ~60%, ~80% to the nearest 2.5 kg, lighter reps as it gets heavier", () => {
    // 100 kg: 20×10, 40×5, 60×3, 80×2
    expect(warmupSets(100)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
    // 62.5 kg: 40% = 25, 60% = 37.5, 80% = 50
    expect(warmupSets(62.5)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 25, reps: 5 },
      { weight: 37.5, reps: 3 },
      { weight: 50, reps: 2 },
    ]);
  });
  it("drops repeats and never reaches the working weight; nothing under 40 kg", () => {
    // 45 kg: 40% = 17.5 → bar (20, already there), 60% = 27.5, 80% = 35
    expect(warmupSets(45)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 27.5, reps: 3 },
      { weight: 35, reps: 2 },
    ]);
    expect(warmupSets(35)).toEqual([]);
    expect(warmupSets(0)).toEqual([]);
  });
});

describe("working weight and barbell detection", () => {
  it("uses the suggested weight, else today's heaviest, else last time's", () => {
    expect(workingWeight({ targets: [{ weight: 82.5 }], rows: [{ weight: "60" }], previousSets: [{ weight: 80 }] })).toBe(82.5);
    expect(workingWeight({ targets: [], rows: [{ weight: "60" }, { weight: "" }], previousSets: [{ weight: 80 }] })).toBe(60);
    expect(workingWeight({ previousSets: [{ weight: 80 }, { weight: 85 }] })).toBe(85);
    expect(workingWeight({})).toBe(0);
  });
  it("knows a barbell lift", () => {
    expect(isBarbell({ name: "Back Squat", equipment: "Barbell" })).toBe(true);
    expect(isBarbell({ name: "Barbell Row", equipment: "" })).toBe(true);
    expect(isBarbell({ name: "Dumbbell Press", equipment: "Dumbbell" })).toBe(false);
  });
});
