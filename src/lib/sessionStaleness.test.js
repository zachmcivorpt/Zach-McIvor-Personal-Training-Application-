import { describe, expect, it } from "vitest";
import { isPersistedSessionStale } from "./sessionStaleness";

describe("isPersistedSessionStale", () => {
  it("flags a persisted session whose runningSession.date is a different (older) day as stale", () => {
    const persisted = { runningSession: { date: "2026-10-04" }, activeLog: { "ex-1": [{ reps: 8, weight: 60, completed: true }] } };
    expect(isPersistedSessionStale(persisted, "2026-10-06")).toBe(true);
  });

  it("does not flag a persisted session for today as stale", () => {
    const persisted = { runningSession: { date: "2026-10-06" }, activeLog: {} };
    expect(isPersistedSessionStale(persisted, "2026-10-06")).toBe(false);
  });

  it("is not stale when there is no persisted session at all", () => {
    expect(isPersistedSessionStale(null, "2026-10-06")).toBe(false);
    expect(isPersistedSessionStale(undefined, "2026-10-06")).toBe(false);
  });

  it("is not stale when there's no runningSession (e.g. a persisted draft with no active workout)", () => {
    expect(isPersistedSessionStale({ activeLog: null }, "2026-10-06")).toBe(false);
  });
});

describe("#275 a workout running past midnight", () => {
  const now = new Date("2026-11-19T00:30:00").getTime();
  it("keeps one started yesterday and saved 40 minutes ago", () => {
    const persisted = { runningSession: { date: "2026-11-18" }, startedOn: "2026-11-18", savedAt: now - 40 * 60 * 1000 };
    expect(isPersistedSessionStale(persisted, "2026-11-19", now)).toBe(false);
  });
  it("still drops one left from yesterday and untouched for hours", () => {
    const persisted = { runningSession: { date: "2026-11-18" }, startedOn: "2026-11-18", savedAt: now - 7 * 60 * 60 * 1000 };
    expect(isPersistedSessionStale(persisted, "2026-11-19", now)).toBe(true);
  });
});
