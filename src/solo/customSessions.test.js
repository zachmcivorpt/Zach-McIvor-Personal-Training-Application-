import { describe, it, expect } from "vitest";
import { customSessionState, isCustomSessionLog, sessionProblem, newSessionExercise, customPurchaseId } from "./customSessions";
import { swapCandidates } from "./exerciseSwap";
import { buildSoloCalendar } from "./soloCalendar";

describe("free Train Solo sessions", () => {
  it("logs under the customer's own _custom id, a fresh run each time", () => {
    const a = customSessionState("u1", { id: "s1", name: " Upper ", exercises: [newSessionExercise("e1")] }, 1000);
    const b = customSessionState("u1", { id: "s1", name: "Upper", exercises: [] }, 2000);
    expect(a.purchaseId).toBe("u1_custom");
    expect(a.day.label).toBe("Upper");
    expect(a.weekNumber).not.toBe(b.weekNumber);
    expect(isCustomSessionLog(a)).toBe(true);
    expect(isCustomSessionLog({ purchaseId: "u1_recovery" })).toBe(false);
    expect(isCustomSessionLog({ purchaseId: "pur_123" })).toBe(false);
    expect(customSessionState("u1", null, 5).day).toEqual({ label: "Quick session", exercises: [] });
  });

  it("checks a session before saving", () => {
    const ok = { name: "Legs", exercises: [newSessionExercise("e1")] };
    expect(sessionProblem(ok)).toBeNull();
    expect(sessionProblem({ ...ok, name: "  " })).toBe("Give your session a name.");
    expect(sessionProblem({ ...ok, exercises: [] })).toBe("Add at least one exercise.");
    expect(sessionProblem({ ...ok, exercises: [{ ...newSessionExercise("e1"), targetSets: 0 }] })).toBe("Each exercise needs 1–10 sets.");
    expect(sessionProblem({ ...ok, exercises: [{ ...newSessionExercise("e1"), targetReps: 0 }] })).toBe("Reps must be between 1 and 100.");
    expect(sessionProblem({ ...ok, exercises: [{ ...newSessionExercise("e1"), targetReps: "AMRAP" }] })).toBeNull();
  });

  it("shows on the calendar as done, without ticking off a program day", () => {
    const noon = new Date(2026, 9, 28, 12).getTime();
    const byDate = buildSoloCalendar({
      purchases: [], programsById: {}, contentByProgramId: {}, weighIns: [], bodyMetrics: [], progressPhotos: [],
      workoutLogs: [{ id: "log1", purchaseId: customPurchaseId("u1"), dayId: "s1", weekNumber: "2026-10-28-1", dayLabel: "Upper", date: noon, entries: [] }],
      accountCreatedAt: noon, fromKey: "2026-10-26", toKey: "2026-11-01",
    });
    const custom = (byDate["2026-10-28"] || []).find((i) => i.type === "custom");
    expect(custom).toMatchObject({ title: "Upper", done: true, logId: "log1" });
  });
});

describe("Train Solo exercise swap", () => {
  const all = [
    { id: "bench", name: "Barbell Bench Press", category: "Chest", equipment: "Barbell" },
    { id: "db", name: "Dumbbell Bench Press", category: "Chest", equipment: "Dumbbell" },
    { id: "incline", name: "Incline Barbell Press", category: "Chest", equipment: "Barbell" },
    { id: "row", name: "Barbell Row", category: "Back", equipment: "Barbell" },
  ];
  const bench = all[0];

  it("offers the same muscle group by default, never the exercise itself", () => {
    expect(swapCandidates(bench, all).map((e) => e.id)).toEqual(["db", "incline"]);
  });
  it("can also match equipment, search, skip exercises already in the session, or widen to everything", () => {
    expect(swapCandidates(bench, all, { sameEquipment: true }).map((e) => e.id)).toEqual(["incline"]);
    expect(swapCandidates(bench, all, { search: "dumbbell" }).map((e) => e.id)).toEqual(["db"]);
    expect(swapCandidates(bench, all, { excludeIds: new Set(["db"]) }).map((e) => e.id)).toEqual(["incline"]);
    expect(swapCandidates(bench, all, { sameMuscle: false }).map((e) => e.id)).toEqual(["db", "incline", "row"]);
  });
});
