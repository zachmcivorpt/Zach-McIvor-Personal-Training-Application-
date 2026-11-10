// #149: every exercise's muscles follow its movement, for the coach console
// and Train Solo alike.
import { describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "./seed";
import { canonicalMuscleFields, muscleCorrections, movementMuscles } from "./exerciseMuscles";

describe("every library exercise has specific muscles", () => {
  it("no exercise in the library is left without a primary muscle", () => {
    const blank = SEED_EXERCISES.filter((ex) => !canonicalMuscleFields(ex).primaryMuscles.length).map((ex) => ex.name);
    expect(blank).toEqual([]);
  });

  it("stores only the 14 specific muscle labels (no 'Full Body', 'Spine', 'Hips')", () => {
    const allowed = new Set(["Chest", "Shoulders", "Biceps", "Triceps", "Forearms", "Abs", "Obliques", "Quads", "Hamstrings", "Glutes", "Calves", "Lats", "Upper Back", "Lower Back"]);
    for (const ex of SEED_EXERCISES) {
      const { primaryMuscles, secondaryMuscles } = canonicalMuscleFields(ex);
      for (const m of [...primaryMuscles, ...secondaryMuscles]) expect(allowed.has(m), `${ex.name}: ${m}`).toBe(true);
      // A muscle is never both primary and secondary.
      expect(primaryMuscles.filter((m) => secondaryMuscles.includes(m))).toEqual([]);
    }
  });

  it.each([
    ["Back Squat", "Legs", ["Quads", "Glutes"], ["Hamstrings"]],
    ["Cyclist Squat", "Legs", ["Quads"], ["Glutes"]], // #217
    ["Bicycle Crunch", "Core", ["Abs"], ["Obliques"]],
    ["Low Row Machine", "Back", ["Lats", "Upper Back"], ["Biceps", "Shoulders"]],
    ["Rowing Machine", "Cardio", ["Lats", "Quads"], ["Hamstrings", "Biceps", "Abs"]],
    ["Walking Lunge", "Legs", ["Quads", "Glutes"], ["Hamstrings"]],
    ["Farmer's Walk", "Full Body", ["Forearms", "Upper Back"], ["Abs"]], // #217
    ["Incline Dumbbell Press", "Chest", ["Chest"], ["Triceps", "Shoulders"]],
    ["Seated Dumbbell Press", "Shoulders", ["Shoulders"], ["Triceps", "Upper Back"]],
    ["Tate Press", "Triceps", ["Triceps"], ["Chest"]],
    ["Overhead Triceps Stretch", "Cool-down", ["Triceps"], []],
    ["Doorway Chest Stretch", "Cool-down", ["Chest"], ["Shoulders"]],
    ["Burpee", "Full Body", ["Chest", "Quads"], ["Shoulders", "Triceps", "Abs"]],
    ["Dumbbell Clean and Press", "Full Body", ["Shoulders", "Quads", "Glutes"], ["Triceps", "Upper Back", "Hamstrings"]],
  ])("%s → primary %j, secondary %j", (name, category, primary, secondary) => {
    expect(canonicalMuscleFields({ name, category })).toEqual({ primaryMuscles: primary, secondaryMuscles: secondary });
  });

  it("a name the rules don't know keeps its listed muscles, tidied to the labels", () => {
    expect(movementMuscles("Coach's Special")).toBe(null);
    expect(canonicalMuscleFields({ name: "Coach's Special", primaryMuscles: ["upper back", "Delts"], secondaryMuscles: ["Core"] })).toEqual({ primaryMuscles: ["Upper Back", "Shoulders"], secondaryMuscles: ["Abs"] });
  });
});

describe("the one-time library correction", () => {
  it("lists only exercises whose stored muscles differ; nothing when already right", () => {
    const list = [
      { id: "a", name: "Bench Press", category: "Chest", primaryMuscles: ["Pecs"], secondaryMuscles: [] },
      { id: "b", name: "Back Squat", category: "Legs", primaryMuscles: ["Quads", "Glutes"], secondaryMuscles: ["Hamstrings"] },
      { id: "c", name: "Mystery", category: "Custom", primaryMuscles: [], secondaryMuscles: [] },
    ];
    expect(muscleCorrections(list)).toEqual([{ id: "a", fields: { primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps", "Shoulders"] } }]);
    expect(muscleCorrections([list[1]])).toEqual([]);
  });
});
