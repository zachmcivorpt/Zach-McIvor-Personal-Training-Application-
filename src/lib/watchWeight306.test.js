// #306: a 50 kg set logged on the Watch was saved as 49.9963 on the phone
// (the Crown's value lands just off its 2.5 kg step).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyWatchSet } from "./watchBridge";

describe("Watch set weight is rounded (#306)", () => {
  it("saves 50, not 49.9963", () => {
    expect(applyWatchSet({}, "e1", 0, { reps: 8, weight: 49.99634 }).log.e1[0].weight).toBe("50");
    expect(applyWatchSet({}, "e1", 0, { reps: 8, weight: 82.50001 }).log.e1[0].weight).toBe("82.5");
    expect(applyWatchSet({}, "e1", 0, { reps: 8, weight: 31.25 }).log.e1[0].weight).toBe("31.25");
  });
  it("the Watch snaps the Crown's weight to 0.25 kg before sending", () => {
    const swift = readFileSync(`${process.cwd()}/ios/ApexWatch/WorkoutStore.swift`, "utf8");
    expect(swift).toMatch(/let weight = \(rawWeight \* 4\)\.rounded\(\) \/ 4/);
  });
});
