// #148: the muscle map's anatomy — each movement checked against how a coach
// would describe it — and the counting.
import { describe, expect, it } from "vitest";
import { musclesFor, trainedMuscles, intensity, muscleSummary } from "./muscleMap";

const m = (name, extra = {}) => musclesFor({ name, ...extra });

describe("muscles by movement", () => {
  it.each([
    ["Barbell Bench Press", ["chest"], ["triceps", "shoulders"]],
    ["Push-Up", ["chest"], ["triceps", "shoulders"]],
    ["Incline Dumbbell Fly", ["chest"], ["shoulders"]], // #217: no elbow extension in a fly
    ["Overhead Press", ["shoulders"], ["triceps", "traps"]],
    ["Lateral Raise", ["shoulders"], ["traps"]],
    ["Face Pull", ["shoulders", "traps"], []],
    ["Lat Pulldown", ["lats"], ["biceps", "traps"]],
    ["Pull-Up", ["lats"], ["biceps", "traps"]],
    ["Seated Cable Row", ["lats", "traps"], ["biceps", "shoulders"]],
    ["Barbell Curl", ["biceps"], ["forearms"]],
    ["Hammer Curl", ["biceps"], ["forearms"]],
    ["Tricep Pushdown", ["triceps"], []],
    ["Skull Crusher", ["triceps"], []],
    ["Bench Dips", ["triceps", "chest"], ["shoulders"]],
    ["Back Squat", ["quads", "glutes"], ["hamstrings"]],
    ["Walking Lateral Lunge", ["quads", "glutes"], ["hamstrings"]],
    ["Leg Press", ["quads", "glutes"], ["hamstrings"]],
    ["Leg Extension", ["quads"], []],
    ["Lying Leg Curl", ["hamstrings"], ["calves"]],
    ["Romanian Deadlift", ["hamstrings", "glutes"], ["lowerBack"]],
    ["Deadlift", ["hamstrings", "glutes", "lowerBack"], ["traps", "forearms", "quads"]],
    ["Hip Thrust", ["glutes"], ["hamstrings"]],
    ["Standing Calf Raise", ["calves"], []],
    ["Plank", ["abs"], ["obliques"]],
    ["Russian Twist", ["obliques"], ["abs"]],
    ["Barbell Shrug", ["traps"], ["forearms"]],
    ["Fat-Grip Farmer's Carry", ["forearms", "traps"], ["abs"]], // #217
    ["Back Extension", ["lowerBack"], ["glutes", "hamstrings"]],
  ])("%s", (name, primary, secondary) => {
    expect(m(name)).toEqual({ primary, secondary });
  });

  it("leg curl is hamstrings, not biceps; a row is back, not a curl", () => {
    expect(m("Seated Leg Curl").primary).toEqual(["hamstrings"]);
    expect(m("Bent Over Row").primary).toEqual(["lats", "traps"]);
  });

  it("falls back to the listed muscles, then the category; warm-ups and cardio count for nothing", () => {
    expect(m("Coach Special", { primaryMuscles: ["Upper Back", "Shoulders"], secondaryMuscles: ["Core"] })).toEqual({ primary: ["traps", "shoulders"], secondary: ["abs"] });
    expect(m("Mystery Move", { category: "Chest" })).toEqual({ primary: ["chest"], secondary: [] });
    expect(m("Arm Circles", { category: "Warm-up" })).toEqual({ primary: [], secondary: [] });
    expect(m("Spin Bike Intervals", { category: "Cardio" })).toEqual({ primary: [], secondary: [] });
  });
});

describe("what's been trained", () => {
  const now = new Date("2026-11-03T18:00:00").getTime();
  const ex = { bp: { name: "Bench Press" }, sq: { name: "Back Squat" } };
  const set = (reps = 8) => ({ weight: 60, reps });
  it("counts primary sets fully and secondary as half, over the last 72 hours only", () => {
    const logs = [
      { date: now - 24 * 3600e3, entries: [{ exerciseId: "bp", sets: [set(), set(), set(), set({ reps: 0 }.reps)] }] }, // 3 real sets
      { date: now - 100 * 3600e3, entries: [{ exerciseId: "sq", sets: [set(), set()] }] }, // too old
    ];
    const t = trainedMuscles(logs, ex, { now });
    expect(t.chest.sets).toBe(3);
    expect(t.triceps.sets).toBe(1.5);
    expect(t.shoulders.sets).toBe(1.5);
    expect(t.quads.sets).toBe(0);
    expect(t.chest.last).toBe(now - 24 * 3600e3);
  });
  it("colours by sets; summary lists trained (most first) and ready", () => {
    expect([0, 1, 2, 5, 9].map(intensity)).toEqual([0, 0.45, 0.62, 0.8, 1]);
    const t = trainedMuscles([{ date: now - 3600e3, entries: [{ exerciseId: "bp", sets: [set(), set(), set(), set()] }] }], ex, { now });
    const s = muscleSummary(t);
    expect(s.worked).toEqual(["chest", "shoulders", "triceps"]);
    expect(s.ready).toContain("quads");
    expect(s.ready).not.toContain("chest");
  });
});
