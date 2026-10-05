// Regression coverage for the coach dashboard's "Recent Activity" feed.
// A client logging a body stats check-in (weigh-in) previously produced
// NO entry in this feed at all — every other client action (workouts,
// messages, form check-ins, nutrition goal hits) surfaced to the coach,
// but a weigh-in silently did not.
import { describe, expect, it } from "vitest";
import { buildRecentActivity } from "./recentActivity";
import { resolveNutritionTargets } from "./nutritionTargets";

function baseDb(overrides = {}) {
  return {
    workoutLogs: {},
    messages: {},
    weighIns: {},
    formResponses: {},
    forms: [],
    nutritionLogs: {},
    ...overrides,
  };
}

const CLIENT = { id: "client-a", name: "Jordan", avatarUrl: null };

describe("buildRecentActivity", () => {
  it("includes a logged body stats check-in (weigh-in) in the feed", () => {
    const db = baseDb({
      weighIns: { "client-a": [{ id: "w1", clientId: "client-a", weight: 82.4, date: Date.now() }] },
    });
    const activity = buildRecentActivity([CLIENT], db, resolveNutritionTargets);
    const entry = activity.find((a) => a.type === "weighin");
    expect(entry).toBeTruthy();
    expect(entry.clientName).toBe("Jordan");
    expect(entry.suffix).toContain("82.4kg");
  });

  it("surfaces multiple recent weigh-ins, most recent first, alongside other activity types", () => {
    const now = Date.now();
    const db = baseDb({
      weighIns: {
        "client-a": [
          { id: "w1", clientId: "client-a", weight: 80, date: now - 2 * 86400000 },
          { id: "w2", clientId: "client-a", weight: 79.5, date: now - 86400000 },
        ],
      },
      workoutLogs: {
        "client-a": [{ date: now, dayLabel: "Push Day", entries: [{ sets: [{ isPR: false }] }] }],
      },
    });
    const activity = buildRecentActivity([CLIENT], db, resolveNutritionTargets);
    const weighinEntries = activity.filter((a) => a.type === "weighin");
    expect(weighinEntries).toHaveLength(2);
    // Sorted newest-first overall, so the workout (today) comes before
    // either weigh-in (yesterday / two days ago).
    expect(activity[0].type).toBe("workout");
    expect(weighinEntries[0].date).toBeGreaterThan(weighinEntries[1].date);
  });

  it("still includes every other activity type (no regression from the extraction)", () => {
    const now = Date.now();
    const db = baseDb({
      workoutLogs: { "client-a": [{ date: now, dayLabel: "Leg Day", entries: [{ sets: [{ isPR: true }] }] }] },
      messages: { "client-a": [{ from: "client", text: "hey coach", date: now }] },
      formResponses: { "client-a": [{ formId: "f1", date: now }] },
      forms: [{ id: "f1", name: "Weekly Check-in" }],
      nutritionLogs: { "client-a": [{ date: "2026-10-04", calories: 2500, protein: 200 }] },
    });
    CLIENT.nutritionTargets = { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 };
    const activity = buildRecentActivity([CLIENT], db, resolveNutritionTargets);
    const types = activity.map((a) => a.type);
    expect(types).toContain("workout");
    expect(types).toContain("checkin");
    expect(types).toContain("nutrition_calories");
    expect(types).toContain("nutrition_protein");
    expect(activity.some((a) => a.verb === "sent a message")).toBe(true);
    delete CLIENT.nutritionTargets;
  });

  it("caps the feed at 12 entries even with far more activity across clients", () => {
    const now = Date.now();
    const clients = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` }));
    const weighIns = {};
    clients.forEach((c) => {
      weighIns[c.id] = Array.from({ length: 5 }, (_, j) => ({ id: `${c.id}-${j}`, clientId: c.id, weight: 70 + j, date: now - j * 86400000 }));
    });
    const db = baseDb({ weighIns });
    const activity = buildRecentActivity(clients, db, resolveNutritionTargets);
    expect(activity.length).toBeLessThanOrEqual(12);
  });
});
