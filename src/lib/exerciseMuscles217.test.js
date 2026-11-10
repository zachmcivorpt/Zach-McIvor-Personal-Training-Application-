// #217: full library audit of primary / secondary muscles.
import { describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "./seed";
import { exerciseMuscleKeys } from "./exerciseMuscles";

const byName = (n) => {
  const e = SEED_EXERCISES.find((x) => x.name === n);
  if (!e) throw new Error(`missing ${n}`);
  return exerciseMuscleKeys(e);
};
const cases = {
  "Rear Delt Fly": [["shoulders", "traps"], []],
  "Reverse Pec Deck": [["shoulders", "traps"], []],
  "Cable Fly": [["chest"], ["shoulders"]],
  "Pec Deck Machine": [["chest"], ["shoulders"]],
  "Diamond Push-Up": [["triceps"], ["chest", "shoulders"]],
  "Close-Grip Bench Press": [["triceps"], ["chest", "shoulders"]],
  "Handstand Push-Up": [["shoulders"], ["triceps", "traps"]],
  "Machine Seated Parallel Grip Press": [["chest"], ["triceps", "shoulders"]],
  "Wide-Grip Barbell Curl": [["biceps"], ["forearms"]],
  "Barbell Close Grip Preacher Curl": [["biceps"], ["forearms"]],
  "Single-Arm Cable Kickback": [["triceps"], []],
  "Standing Band Kickback": [["glutes"], ["hamstrings"]],
  "Glute Medius Kickback": [["glutes"], ["hamstrings"]],
  "Dumbbell Pullover": [["lats", "chest"], ["triceps"]],
  "Straight-Arm Pulldown": [["lats"], ["triceps", "shoulders"]],
  "Suitcase Carry": [["obliques"], ["forearms", "abs"]],
  "Barbell Wrist Curl": [["forearms"], []],
  "Lying Knee-to-Chest Stretch": [["lowerBack", "glutes"], []],
  "Reverse Sled Drag": [["quads"], ["calves", "glutes"]],
  "Atlas Stone Lift": [["glutes", "hamstrings", "lowerBack"], ["traps", "biceps", "quads"]],
  "Pool Jogging": [["quads", "hamstrings", "calves"], ["glutes"]],
  "Static Hip Flexor Stretch": [["quads"], []],
};

describe("exercise muscle audit (#217)", () => {
  for (const [name, [primary, secondary]] of Object.entries(cases)) {
    it(name, () => expect(byName(name)).toEqual({ primary, secondary }));
  }
  it("every library exercise still has a primary muscle, none repeated as secondary", () => {
    for (const e of SEED_EXERCISES) {
      const k = exerciseMuscleKeys(e);
      expect(k.primary.length, e.name).toBeGreaterThan(0);
      expect(k.secondary.some((m) => k.primary.includes(m)), e.name).toBe(false);
    }
  });
});
