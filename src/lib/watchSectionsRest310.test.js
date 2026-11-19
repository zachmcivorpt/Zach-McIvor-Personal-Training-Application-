// #310: section headings (Warm-up / Main Session / Cool-down) and a
// full-screen rest ring with +15s on the Watch.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildWatchWorkout } from "./watchBridge";

const read = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("Watch sections and rest (#310)", () => {
  it("sends each exercise's section; anything unknown is Main", () => {
    const w = buildWatchWorkout({
      sessionId: "s",
      label: "Upper A",
      exercises: [
        { id: "a", name: "Band Pull-apart", section: "warmup", rows: [] },
        { id: "b", name: "Bench", section: "main", rows: [] },
        { id: "c", name: "Stretch", section: "cooldown", rows: [] },
        { id: "d", name: "Row", rows: [] },
        { id: "e", name: "Odd", section: "finisher", rows: [] },
      ],
    });
    expect(w.exercises.map((e) => e.section)).toEqual(["warmup", "main", "cooldown", "main", "main"]);
  });

  it("the phone passes the section and applies the Watch's +15s like its own button", () => {
    const src = read("src/client/ClientApp.jsx");
    expect(src).toMatch(/section: exMeta\.section \|\| "main",/);
    expect(src).toMatch(/action\.type === "extendRest"\) \{\s*if \(resting && restEndAtRef\.current\) addRest15\(\);/);
    expect(src).toMatch(/onAdd15=\{addRest15\}/);
  });

  it("the Watch groups by section with headings only for more than one, and shows the rest ring", () => {
    const app = read("ios/ApexWatch/ApexWatchApp.swift");
    expect(app).toMatch(/\("warmup", "WARM-UP"\), \("main", "MAIN SESSION"\), \("cooldown", "COOL-DOWN"\)/);
    expect(app).toMatch(/if groups\.count > 1 \{/);
    expect(app).toMatch(/\.fullScreenCover\(isPresented: \$store\.showRest\)/);
    expect(app).toMatch(/Button\("\+15s"\) \{ store\.extendRest\(\) \}/);
    const store = read("ios/ApexWatch/WorkoutStore.swift");
    expect(store).toMatch(/send\(\["type": "extendRest", "seconds": 15\]\)/);
  });
});
