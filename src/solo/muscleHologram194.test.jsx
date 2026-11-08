// @vitest-environment jsdom
// #194: the 3D muscle map on Progress.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { REGION_KEYS, MODEL_URL, webglAvailable } from "./MuscleHologram";
import { MUSCLES } from "./muscleMap";
import { SoloMuscleMapCard } from "./SoloMuscleMap";

afterEach(cleanup);

describe("3D muscle map (#194)", () => {
  it("maps every body-scan region to a tracked muscle or none", () => {
    expect(REGION_KEYS).toHaveLength(17);
    for (const k of REGION_KEYS) if (k !== null) expect(MUSCLES).toContain(k);
    // Every muscle the map tracks can be tapped on the body.
    for (const m of MUSCLES) expect(REGION_KEYS).toContain(m);
  });

  it("ships the anatomy model with its body-scan regions", () => {
    const file = path.resolve(__dirname, "../../public", MODEL_URL.slice(1));
    const buf = fs.readFileSync(file);
    expect(buf.subarray(0, 4).toString()).toBe("glTF");
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
    const prims = json.meshes.flatMap((m) => m.primitives);
    const muscles = json.meshes.filter((m) => m.name !== "skin");
    expect(muscles.length).toBeGreaterThan(30);
    expect(prims.filter((p) => p.attributes._REGION).length).toBe(prims.length);
    expect(buf.length).toBeLessThan(8 * 1024 * 1024);
  });

  it("without WebGL the card keeps the 2D body (and every test of it)", () => {
    expect(webglAvailable()).toBe(false);
    render(<SoloMuscleMapCard logs={[]} exercisesById={{}} dark />);
    expect(document.querySelector("[data-testid=muscle-hologram]")).toBe(null);
    expect(document.querySelector('[data-muscle="chest"]')).not.toBe(null);
  });
});

describe("3D map detail card (#195)", () => {
  it("muscleDetail: 7-day sets (helpers half), last trained, best est. max and exercises — own logs only", async () => {
    const { muscleDetail } = await import("./muscleMap");
    const now = Date.UTC(2026, 10, 8, 12);
    const ex = { bp: { id: "bp", name: "Bench Press", category: "Chest" }, ib: { id: "ib", name: "Incline Dumbbell Press", category: "Chest" } };
    const logs = [
      { date: now - 18 * 3600e3, entries: [{ exerciseId: "bp", sets: [{ weight: 92.5, reps: 6 }, { weight: 90, reps: 6 }, { weight: 60, reps: 0 }] }] },
      { date: now - 3 * 86400e3, entries: [{ exerciseId: "ib", sets: [{ weight: 32, reps: 10 }] }] },
      { date: now - 10 * 86400e3, entries: [{ exerciseId: "bp", sets: [{ weight: 100, reps: 5 }] }] },
    ];
    const d = muscleDetail("chest", logs, ex, { now });
    expect(d.sets7).toBe(3); // the 0-rep set and the 10-day-old one don't count
    expect(d.last).toBe(now - 18 * 3600e3);
    expect(d.bestKg).toBe(116.5); // 100 × (1 + 5/30) = 116.67 → nearest 0.5, any age
    expect(d.exercises).toEqual(["Bench Press", "Incline Dumbbell Press"]);
    expect(muscleDetail("triceps", logs, ex, { now }).sets7).toBe(1.5); // bench helpers: half sets
    expect(muscleDetail("quads", logs, ex, { now })).toEqual({ sets7: 0, last: null, bestKg: null, exercises: [] });
  });
});
