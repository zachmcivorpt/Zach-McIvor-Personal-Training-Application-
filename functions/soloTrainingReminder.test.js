// #245: one reminder at their training time, on training days, only if they
// haven't trained yet.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tr = require("./soloTrainingReminder.js");

// Mon 16 Nov 2026, 6pm Sydney (07:00 UTC).
const MON_6PM = Date.UTC(2026, 10, 16, 7, 0, 0);
const base = { trainingTime: "18:00", tz: "Australia/Sydney", onboarding: { answers: { trainingDays: [1, 3, 5] } } };

describe("trainingReminderDue", () => {
  it("due at their hour on a chosen training day", () => {
    expect(tr.trainingReminderDue({ profile: base, logs: [], nowMs: MON_6PM })).toEqual({ today: "2026-11-16" });
  });
  it("not at another hour, not on a rest day, not once they've trained, not when off", () => {
    expect(tr.trainingReminderDue({ profile: base, logs: [], nowMs: MON_6PM + 3600000 })).toBe(null);
    expect(tr.trainingReminderDue({ profile: base, logs: [], nowMs: MON_6PM + 86400000 })).toBe(null); // Tuesday
    expect(tr.trainingReminderDue({ profile: base, logs: [{ date: MON_6PM - 4 * 3600000 }], nowMs: MON_6PM })).toBe(null);
    expect(tr.trainingReminderDue({ profile: { ...base, trainingTime: null }, logs: [], nowMs: MON_6PM })).toBe(null);
  });
  it("without chosen days: a planned session today, else weekdays they've trained twice in 4 weeks", () => {
    const noDays = { trainingTime: "18:00", tz: "Australia/Sydney" };
    expect(tr.trainingReminderDue({ profile: { ...noDays, plannedSessions: { p: { date: "2026-11-16" } } }, logs: [], nowMs: MON_6PM })).toEqual({ today: "2026-11-16" });
    const mondays = [7, 14].map((d) => ({ date: MON_6PM - d * 86400000 }));
    expect(tr.trainingReminderDue({ profile: noDays, logs: mondays, nowMs: MON_6PM })).toEqual({ today: "2026-11-16" });
    expect(tr.trainingReminderDue({ profile: noDays, logs: mondays.slice(0, 1), nowMs: MON_6PM })).toBe(null);
  });
});

describe("sendTrainingReminders", () => {
  it("sends once a day however often the job runs", async () => {
    const claimed = new Set();
    const db = {
      collection: (name) => ({
        where: (f) =>
          f === "trainingTime"
            ? { get: async () => ({ docs: [{ id: "a", data: () => ({ ...base, name: "Sam Lee", fcmTokens: ["t"] }), ref: { update: async () => {} } }] }) }
            : { get: async () => ({ docs: [] }) },
        doc: (id) => ({
          create: async () => {
            if (claimed.has(id)) throw new Error("exists");
            claimed.add(id);
          },
        }),
      }),
    };
    const sent = [];
    const messaging = { sendEachForMulticast: async (m) => (sent.push(m), { responses: m.tokens.map(() => ({ success: true })) }) };
    await tr.sendTrainingReminders(db, messaging, MON_6PM);
    await tr.sendTrainingReminders(db, messaging, MON_6PM + 60000);
    expect(sent).toHaveLength(1);
    expect(sent[0].notification).toEqual({ title: "Training time, Sam", body: "Today's session is ready when you are." });
  });
});
