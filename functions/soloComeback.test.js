// #244: one comeback push per quiet gap.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cb = require("./soloComeback.js");
const sp = require("./soloPartners.js");

const TZ = "Australia/Sydney";
const NOW = Date.UTC(2026, 10, 16, 6, 0, 0); // Mon 16 Nov, 5pm Sydney
const day = (n) => NOW - n * 86400000;

describe("comebackDue", () => {
  it("4 to 30 quiet days: due, keyed on their last training day", () => {
    expect(cb.comebackDue({ logs: [{ date: day(10) }, { date: day(5) }], tz: TZ, nowMs: NOW })).toEqual({ lastKey: "2026-11-11", gap: 5 });
  });
  it("not before 4 days, not after 30, never with alerts off, never for someone who hasn't trained", () => {
    expect(cb.comebackDue({ logs: [{ date: day(3) }], tz: TZ, nowMs: NOW })).toBe(null);
    expect(cb.comebackDue({ logs: [{ date: day(31) }], tz: TZ, nowMs: NOW })).toBe(null);
    expect(cb.comebackDue({ logs: [{ date: day(5) }], tz: TZ, nowMs: NOW, prefs: { comeback: false } })).toBe(null);
    expect(cb.comebackDue({ logs: [], tz: TZ, nowMs: NOW })).toBe(null);
  });
  it("wording", () => {
    expect(cb.comebackPushText({ firstName: "Sam", gap: 5 })).toEqual({ title: "Pick up where you left off, Sam", body: "5 days since your last session. A 20-minute comeback session is ready — one tap to start." });
  });
});

describe("sendComebackPushes", () => {
  function fakeDb(users, logs) {
    const claimed = new Set();
    return {
      claimed,
      collection: (name) => ({
        get: async () => ({ docs: users.map((u) => ({ id: u.id, data: () => u, ref: { update: async () => {} } })) }),
        where: (f, op, uid) => ({ get: async () => ({ docs: (logs[uid] || []).map((l) => ({ data: () => l })) }) }),
        doc: (id) => ({
          create: async () => {
            if (name !== "soloComebackPushes") throw new Error("unexpected");
            if (claimed.has(id)) throw new Error("exists");
            claimed.add(id);
          },
        }),
      }),
    };
  }
  const messaging = () => {
    const sent = [];
    return { sent, sendEachForMulticast: async (m) => (sent.push(m), { responses: m.tokens.map(() => ({ success: true })) }) };
  };
  it("sends once per gap, however many times the job runs", async () => {
    const db = fakeDb([{ id: "a", name: "Sam Lee", tz: TZ, fcmTokens: ["t"] }, { id: "b", name: "Jo", tz: TZ, fcmTokens: ["u"] }], { a: [{ date: day(5) }], b: [{ date: day(1) }] });
    const m = messaging();
    await cb.sendComebackPushes(db, m, NOW);
    await cb.sendComebackPushes(db, m, NOW + 86400000);
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].tokens).toEqual(["t"]);
  });
});

describe("partners hear a comeback", () => {
  it("'Sam's back' replaces 'your move' after 4+ days off", () => {
    expect(sp.sessionPushText({ fromName: "Sam", title: "Upper", recipient: { done: 1, target: 3 }, streakBefore: 0, teamWeekJustMet: false, streakNow: 0, comebackDays: 6 })).toEqual({ title: "Sam's back", body: "First session in 6 days: Upper. Your move." });
    expect(sp.sessionPushText({ fromName: "Sam", title: "Upper", recipient: { done: 1, target: 3 }, streakBefore: 0, teamWeekJustMet: false, streakNow: 0, comebackDays: 2 }).title).toBe("Sam just finished Upper");
  });
});
