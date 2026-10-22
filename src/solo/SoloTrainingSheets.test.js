import { describe, it, expect } from "vitest";
import { sessionMuscles, programBenefits } from "./SoloTrainingSheets";

const exercisesById = {
  bench: { id: "bench", category: "Chest", primaryMuscles: ["Chest", "Triceps"] },
  ohp: { id: "ohp", category: "Shoulders", primaryMuscles: ["Shoulders", "triceps"] },
  fly: { id: "fly", category: "Chest", primaryMuscles: [] },
  warm: { id: "warm", category: "Warm-up", primaryMuscles: ["Full body"] },
  custom: { id: "custom", category: "Custom" },
};

describe("sessionMuscles", () => {
  it("uses the coach's own muscle groups for the day when set", () => {
    expect(sessionMuscles({ muscleGroups: ["Legs", "Glutes"], exercises: [{ exerciseId: "bench" }] }, exercisesById)).toEqual(["Legs", "Glutes"]);
  });

  it("otherwise ranks the exercises' primary muscles, falling back to category, skipping warm-ups and rest rows", () => {
    const day = {
      muscleGroups: [],
      exercises: [{ exerciseId: "bench" }, { exerciseId: "ohp" }, { exerciseId: "fly" }, { exerciseId: "warm" }, { exerciseId: "custom" }, { isRest: true }],
    };
    // Chest: bench + fly = 2, Triceps: bench + ohp = 2 (case-merged), Shoulders: 1
    expect(sessionMuscles(day, exercisesById)).toEqual(["Chest", "Triceps", "Shoulders"]);
  });

  it("is empty for an unknown or empty day", () => {
    expect(sessionMuscles({ exercises: [{ exerciseId: "missing" }] }, exercisesById)).toEqual([]);
    expect(sessionMuscles(null, exercisesById)).toEqual([]);
  });
});

describe("programBenefits", () => {
  it("lists goal benefits plus the program's real structure", () => {
    const phases = [
      { durationWeeks: 4, days: [{}, {}, {}] },
      { durationWeeks: 2, days: [{}, {}, {}] },
    ];
    const lines = programBenefits({ goals: ["get_stronger", "unknown_goal"] }, phases);
    expect(lines[0]).toBe("Get measurably stronger on the key lifts");
    expect(lines).toContain("3 planned sessions a week for 6 weeks — nothing to guess");
    expect(lines).toHaveLength(3);
  });
});
