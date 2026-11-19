// @vitest-environment jsdom
// #307: the Watch's home screen (today + this week, sent from the phone)
// and End workout from the Watch (Complete / Save for later / Cancel).
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { buildWatchHome, weekKeysFor } from "./watchHome";
import { sendWatchHome, WATCH_END_ACTIONS } from "./watchBridge";

const read = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("Watch home (#307)", () => {
  afterEach(() => {
    delete window.webkit;
  });

  it("weeks run Monday to Sunday from the given today", () => {
    // Thursday 19 Nov 2026
    expect(weekKeysFor("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(weekKeysFor("2026-11-16")[0]).toBe("2026-11-16");
    expect(weekKeysFor("2026-11-22")[0]).toBe("2026-11-16");
    expect(weekKeysFor("2026-03-01")[0]).toBe("2026-02-23");
  });

  it("counts this week's done days against scheduled days, by hand", () => {
    const done = new Set(["2026-11-16", "2026-11-18", "2026-11-09"]);
    const home = buildWatchHome({
      todayKey: "2026-11-19",
      todaySession: { label: "Upper A", exercises: [{ exerciseId: "a" }, { exerciseId: "b" }, { type: "rest" }] },
      completedToday: false,
      scheduledKeys: ["2026-11-16", "2026-11-18", "2026-11-19", "2026-11-21", "2026-11-23"],
      isDone: (k) => done.has(k),
    });
    expect(home.today).toEqual({ label: "Upper A", exercises: 2, done: false });
    expect(home.week).toEqual({ done: 2, target: 4 });
  });

  it("no session today → no today tile", () => {
    const home = buildWatchHome({ todayKey: "2026-11-19", todaySession: null, completedToday: false, scheduledKeys: [], isDone: () => false });
    expect(home.today).toBeNull();
    expect(home.week).toEqual({ done: 0, target: 0 });
  });

  it("posts the home to the iPhone app", () => {
    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { apexWatch: { postMessage } } };
    sendWatchHome({ v: 1, today: null, week: { done: 1, target: 3 } });
    sendWatchHome(null);
    expect(postMessage.mock.calls).toEqual([[{ action: "home", home: { v: 1, today: null, week: { done: 1, target: 3 } } }]]);
  });

  it("End workout runs the phone's own Complete / Save for later / Cancel", () => {
    expect(WATCH_END_ACTIONS).toEqual(["finishWorkout", "saveForLater", "discardWorkout"]);
    const src = read("src/client/ClientApp.jsx");
    expect(src).toMatch(/if \(type === "finishWorkout"\) handleFinish\(\);/);
    expect(src).toMatch(/else if \(type === "discardWorkout"\) onDiscard\?\.\(\);/);
    expect(src).toMatch(/else if \(type === "saveForLater"\) saveForLater\(\);/);
    expect(src).toMatch(/function saveForLater\(\) \{\s*onExit\?\.\(\);\s*clearWatchWorkout\("saved"\);/);
    expect(src).toMatch(/onDiscard=\{discardActiveSession\}/);
    expect(src).toMatch(/sendWatchHome\(JSON\.parse\(watchHomeJson\)\)/);
    expect(src).toMatch(/if \(!dbReady \|\| viewingAsClient \|\| !watchBridgeAvailable\(\)\) return null;/);
  });

  it("the Watch sends the same three actions, asks before Cancel, and carries the home", () => {
    const end = read("ios/ApexWatch/HomeAndEnd.swift");
    expect(end).toMatch(/store\.endWorkout\("finishWorkout"\)/);
    expect(end).toMatch(/store\.endWorkout\("saveForLater"\)/);
    expect(end).toMatch(/Button\("CANCEL WORKOUT"\) \{ confirmCancel = true \}/);
    expect(end).toMatch(/Button\("CANCEL WORKOUT"\) \{ store\.endWorkout\("discardWorkout"\) \}/);
    expect(end).not.toMatch(/kcal|calorie/i);
    expect(read("ios/ApexCoach/WatchBridge.swift")).toMatch(/context\["home"\] = home/);
    expect(read("ios/ApexWatch/WorkoutStore.swift")).toMatch(/WorkoutSessionManager\.shared\.end\(save: type != "discardWorkout"\)/);
  });
});
