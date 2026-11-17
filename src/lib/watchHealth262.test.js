// @vitest-environment jsdom
// #262: the Apple Watch records an Apple Health workout while a workout
// runs on the iPhone, saved after Finish and thrown away after Discard.
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { clearWatchWorkout } from "./watchBridge";

const read = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("Watch Apple Health workout (#262)", () => {
  afterEach(() => {
    delete window.webkit;
  });

  it("tells the Watch why the workout ended", () => {
    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { apexWatch: { postMessage } } };
    clearWatchWorkout("finished");
    clearWatchWorkout("discarded");
    clearWatchWorkout();
    clearWatchWorkout("bogus");
    expect(postMessage.mock.calls.map((c) => c[0])).toEqual([
      { action: "clear", reason: "finished" },
      { action: "clear", reason: "discarded" },
      { action: "clear" },
      { action: "clear" },
    ]);
  });

  it("Finish and Discard set the reason before the session clears", () => {
    const src = read("src/client/ClientApp.jsx");
    expect(src).toMatch(/clearWatchWorkout\(watchEndReasonRef\.current\)/);
    expect(src).toMatch(/watchEndReasonRef\.current = "finished";\s*setActiveLog\(null\)/);
    expect(src).toMatch(/function discardActiveSession\(\)[\s\S]{0,200}watchEndReasonRef\.current = "discarded";\s*setActiveLog\(null\)/);
  });

  it("the Watch app has HealthKit, the workout background mode and usage text", () => {
    const yml = read("ios/project-watch.yml");
    expect(yml).toMatch(/workout-processing/);
    expect(yml).toMatch(/NSHealthShareUsageDescription/);
    expect(yml).toMatch(/NSHealthUpdateUsageDescription/);
    expect(yml).toMatch(/CODE_SIGN_ENTITLEMENTS: ApexWatch\/ApexWatch\.entitlements/);
    expect(read("ios/ApexWatch/ApexWatch.entitlements")).toMatch(/com\.apple\.developer\.healthkit<\/key>\s*<true\/>/);
  });

  it("the Watch saves only when the phone didn't discard, and the phone sends the reason", () => {
    expect(read("ios/ApexWatch/WorkoutStore.swift")).toMatch(/end\(save: \(context\["ended"\] as\? String\) != "discarded"\)/);
    expect(read("ios/ApexWatch/WorkoutStore.swift")).toMatch(/WorkoutSessionManager\.shared\.start\(apexSessionId: next\.sessionId\)/);
    const bridge = read("ios/ApexCoach/WatchBridge.swift");
    expect(bridge).toMatch(/context\["ended"\] = ended/);
    expect(bridge).toMatch(/startWatchApp\(with: config\)/);
  });

  it("no calorie figure on the Watch; the iPhone's Health text no longer says it never writes", () => {
    expect(read("ios/ApexWatch/ApexWatchApp.swift")).not.toMatch(/kcal|activeEnergy/i);
    expect(read("ios/project.yml")).not.toMatch(/never writes/);
  });
});
