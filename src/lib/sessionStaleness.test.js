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
