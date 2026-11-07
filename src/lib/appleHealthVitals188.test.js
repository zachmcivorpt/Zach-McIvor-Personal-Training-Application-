// #188: heart rate, blood pressure, HRV, blood oxygen, respiratory rate and
// VO2 max from Apple Health — the sync's rules, and the iPhone side that
// reads them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planAppleHealthSync, APPLE_HEALTH_FIELDS } from "./appleHealth";

const day = { date: "2026-11-06", heartRate: 71.6, heartRateVariability: 44.2, bloodPressureSystolic: 121.4, bloodPressureDiastolic: 79.6, bloodOxygen: 97.6, respiratoryRate: 14.26, vo2Max: 42.47 };

describe("syncing the new Apple Health measures (#188)", () => {
  it("each new measure is saved to the day's body metrics, rounded sensibly", () => {
    const { metrics } = planAppleHealthSync([day]);
    expect(metrics).toEqual([
      { date: "2026-11-06", field: "heartRate", value: 72 },
      { date: "2026-11-06", field: "heartRateVariability", value: 44 },
      { date: "2026-11-06", field: "bloodPressureSystolic", value: 121 },
      { date: "2026-11-06", field: "bloodPressureDiastolic", value: 80 },
      { date: "2026-11-06", field: "bloodOxygen", value: 98 },
      { date: "2026-11-06", field: "respiratoryRate", value: 14.3 },
      { date: "2026-11-06", field: "vo2Max", value: 42.5 },
    ]);
    for (const f of ["heartRate", "bloodPressureSystolic", "bloodPressureDiastolic", "heartRateVariability", "bloodOxygen", "respiratoryRate", "vo2Max"]) {
      expect(APPLE_HEALTH_FIELDS).toContain(f);
    }
  });
  it("a value typed in by hand is never overwritten; one Apple Health itself wrote is updated", () => {
    const bodyMetrics = [{ date: "2026-11-06", bloodPressureSystolic: 130, heartRate: 60, appleHealth: { heartRate: true } }];
    const { metrics } = planAppleHealthSync([day], { bodyMetrics });
    expect(metrics.find((m) => m.field === "bloodPressureSystolic")).toBeUndefined();
    expect(metrics.find((m) => m.field === "heartRate")).toEqual({ date: "2026-11-06", field: "heartRate", value: 72 });
  });
  it("impossible readings (a glitch or a unit mix-up) are never saved", () => {
    const { metrics } = planAppleHealthSync([
      { date: "2026-11-06", bloodOxygen: 0.97, bloodPressureSystolic: 400, heartRate: 5, respiratoryRate: 200, vo2Max: 300, heartRateVariability: -3 },
    ]);
    expect(metrics).toEqual([]);
  });
  it("the existing steps / sleep / resting heart rate sync is unchanged", () => {
    const { metrics } = planAppleHealthSync([{ date: "2026-11-06", steps: 8432.6, sleepHours: 7.46, restingHeartRate: 57.4 }]);
    expect(metrics).toEqual([
      { date: "2026-11-06", field: "steps", value: 8433 },
      { date: "2026-11-06", field: "sleepHours", value: 7.5 },
      { date: "2026-11-06", field: "restingHeartRate", value: 57 },
    ]);
  });
});

describe("the iPhone side (HealthBridge.swift, #188)", () => {
  const swift = () => readFileSync("ios/ApexCoach/HealthBridge.swift", "utf8");
  it("asks Apple Health for each new measure and reads it as a daily average", () => {
    const s = swift();
    for (const [id, field] of [
      ["heartRate", "heartRate"],
      ["heartRateVariabilitySDNN", "heartRateVariability"],
      ["bloodPressureSystolic", "bloodPressureSystolic"],
      ["bloodPressureDiastolic", "bloodPressureDiastolic"],
      ["oxygenSaturation", "bloodOxygen"],
      ["respiratoryRate", "respiratoryRate"],
      ["vo2Max", "vo2Max"],
    ]) {
      expect(s, id).toMatch(new RegExp(`\\(\\.${id}, "${field}", `));
    }
    expect(s).toMatch(/for \(id, _, _, _\) in HealthBridge\.averagedReads \{\s*\n\s*if let t = HKObjectType\.quantityType\(forIdentifier: id\) \{ types\.insert\(t\) \}/);
    expect(s).toMatch(/daily\(id, \.discreteAverage, unit\)/);
    // Blood oxygen: Apple's 0–1 fraction becomes a percentage.
    expect(s).toMatch(/\(\.oxygenSaturation, "bloodOxygen", HKUnit\.percent\(\), 100\)/);
    expect(s).toMatch(/for \(field, byDay\) in averaged \{ if let v = byDay\[key\] \{ day\[field\] = v \} \}/);
  });
  it("someone connected before asks iOS once for just the new measures, then syncs", () => {
    const read = swift().match(/case "read":[\s\S]*?default:/)[0];
    expect(read).toMatch(/getRequestStatusForAuthorization\(toShare: \[\], read: readTypes\)/);
    expect(read).toMatch(/status == \.shouldRequest[\s\S]*requestAuthorization\(toShare: nil, read: self\.readTypes\)[\s\S]*read\(\)/);
  });
  it("the permission text Apple shows names the new measures", () => {
    const yml = readFileSync("ios/project.yml", "utf8");
    expect(yml).toMatch(/NSHealthShareUsageDescription: "[^"]*blood pressure[^"]*blood oxygen[^"]*respiratory rate[^"]*VO2 max/);
  });
});
