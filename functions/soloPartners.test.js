// #234: Team week activity docs and "your move" pushes.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as client from "../src/solo/partners.js";

const require = createRequire(import.meta.url);
const sp = require("./soloPartners.js");

// A tiny in-memory Firestore: enough for the partner triggers.
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (col, id) => ({
    id,
    path: `${col}/${id}`,
    async get() {
      const v = store.get(`${col}/${id}`);
      return { id, exists: v !== undefined, data: () => v, ref: ref(col, id) };
    },
    async set(v) {
      store.set(`${col}/${id}`, v);
    },
    async update(v) {
      store.set(`${col}/${id}`, { ...(store.get(`${col}/${id}`) || {}), ...v });
    },
    async create(v) {
      if (store.has(`${col}/${id}`)) throw new Error("exists");
      store.set(`${col}/${id}`, v);
    },
    async delete() {
      store.delete(`${col}/${id}`);
    },
  });
  const collection = (col) => {
    const docsWhere = (filter) => ({
      async get() {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(`${col}/`))
          .map(([k, v]) => ({ id: k.slice(col.length + 1), data: () => v, ref: ref(col, k.slice(col.length + 1)) }))
          .filter((d) => filter(d.data()));
        return { docs, empty: docs.length === 0 };
      },
    });
    return {
      doc: (id) => ref(col, id),
      where: (field, op, value) => docsWhere((d) => (op === "array-contains" ? (d[field] || []).includes(value) : d[field] === value)),
    };
  };
  const batch = () => {
    const ops = [];
    return { delete: (r) => ops.push(() => r.delete()), commit: async () => Promise.all(ops.map((f) => f())) };
  };
  return { store, collection, batch };
}

function fakeMessaging() {
  const sent = [];
  return {
    sent,
    async sendEachForMulticast(msg) {
      sent.push(msg);
      return { responses: msg.tokens.map(() => ({ success: true })) };
    },
  };
}

const TZ = "Australia/Sydney";
// Thu 12 Nov 2026, 9am Sydney.
const NOW = Date.UTC(2026, 10, 11, 22, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const profile = (name, extra = {}) => ({ name, tz: TZ, fcmTokens: [`tok-${name}`], onboarding: { answers: { sessionsPerWeek: 3 } }, ...extra });
const log = (uid, at, dayLabel = "Push Day") => ({ soloUserId: uid, date: at, dayLabel, entries: [{ sets: [{ weight: 100, reps: 5 }] }] });

describe("pure maths agrees with the app (src/solo/partners.js)", () => {
  it("weekKey, shiftWeek and teamStreak match", () => {
    for (const d of ["2026-11-15", "2026-11-09", "2026-01-01", "2024-02-29"]) expect(sp.weekKey(d)).toBe(client.weekKey(d));
    const met = { done: 3, target: 3 };
    const a = { "2026-10-26": met, "2026-11-02": met, "2026-11-09": { done: 1, target: 3 } };
    const b = { "2026-10-26": met, "2026-11-02": met, "2026-11-09": met };
    expect(sp.teamStreak(a, b, "2026-11-09", "2026-10-01")).toBe(client.teamStreak(a, b, "2026-11-09", "2026-10-01"));
    expect(sp.teamStreak(a, b, "2026-11-09", "2026-10-01")).toBe(2);
    expect(sp.MAX_PARTNERS).toBe(client.MAX_PARTNERS);
  });
});

describe("buildActivity", () => {
  it("counts sessions per week on the member's own calendar days", () => {
    // 11pm Sunday 8 Nov in Sydney is still last week there (it's Sunday 12pm UTC).
    const sundayNightSydney = Date.UTC(2026, 10, 8, 12, 0, 0);
    const act = sp.buildActivity({ logs: [log("u", sundayNightSydney), log("u", NOW - 60_000, "Legs")], profile: profile("Sam Smith"), previous: null, nowMs: NOW });
    expect(act.firstName).toBe("Sam");
    expect(act.weeks["2026-11-02"]).toEqual({ done: 1, target: 3 });
    expect(act.weeks["2026-11-09"]).toEqual({ done: 1, target: 3 });
    expect(act.lastSession).toMatchObject({ title: "Legs", dateKey: "2026-11-12" });
    expect(act.daysThisWeek).toEqual(["2026-11-12"]);
  });
  it("past weeks keep the target they had; this week uses today's", () => {
    const act = sp.buildActivity({
      logs: [log("u", NOW - 7 * DAY)],
      profile: profile("Sam", { onboarding: { answers: { sessionsPerWeek: 5 } } }),
      previous: { weeks: { "2026-11-02": { done: 1, target: 2 } } },
      nowMs: NOW,
    });
    expect(act.weeks["2026-11-02"].target).toBe(2);
    expect(act.weeks["2026-11-09"].target).toBe(5);
  });
  it("never carries weights, bodyweight or photos", () => {
    const own = { ...log("u", NOW - 3600_000, "Push"), purchaseId: "u_custom" };
    const act = sp.buildActivity({ logs: [log("u", NOW), own], profile: profile("Sam"), previous: null, nowMs: NOW });
    expect(JSON.stringify(act)).not.toMatch(/weight|entries|photo/i);
  });
  it("shares their latest OWN session's exercises, sets and reps — never a program's (#243)", () => {
    const own = (at, label, sets) => ({ soloUserId: "u", purchaseId: "u_custom", date: at, dayLabel: label, entries: [{ exerciseId: "bp", sets }, { exerciseId: "row", sets: [{ weight: 60, reps: 12 }] }] });
    const programLog = { ...log("u", NOW - 60_000, "Paid Program Day 3"), purchaseId: "u_prog1" };
    const act = sp.buildActivity({
      logs: [own(NOW - 3 * DAY, "Old Push", [{ weight: 50, reps: 8 }]), own(NOW - DAY, "Upper", [{ weight: 80, reps: 5 }, { weight: 80, reps: 6 }, { weight: 75, reps: 8 }]), programLog],
      profile: profile("Sam"),
      previous: null,
      nowMs: NOW,
    });
    expect(act.sharedSession).toMatchObject({ title: "Upper", exercises: [{ exerciseId: "bp", sets: 3, reps: 6 }, { exerciseId: "row", sets: 1, reps: 12 }] });
    expect(act.sharedSession.exercises.every((e) => Object.keys(e).join() === "exerciseId,sets,reps")).toBe(true); // no weights
    // Only from the last 14 days, and never from a program.
    expect(sp.buildActivity({ logs: [own(NOW - 15 * DAY, "Upper", [{ weight: 1, reps: 1 }]), programLog], profile: profile("Sam"), previous: null, nowMs: NOW }).sharedSession).toBe(null);
  });
  it("target falls back to training days, then 3", () => {
    expect(sp.weeklyTarget({ onboarding: { answers: { trainingDays: [1, 3] } } })).toBe(2);
    expect(sp.weeklyTarget({})).toBe(3);
  });
});

describe("sessionPushText", () => {
  it("tells the partner it's their move, with sessions left and the streak at stake", () => {
    const m = sp.sessionPushText({ fromName: "Sam", title: "Push Day", recipient: { done: 1, target: 3 }, streakBefore: 4, teamWeekJustMet: false, streakNow: 4 });
    expect(m.title).toBe("Sam just finished Push Day");
    expect(m.body).toBe("Your move — 2 sessions left this week. Keep your 4-week streak alive.");
  });
  it("celebrates the Team week when this session completes it", () => {
    const m = sp.sessionPushText({ fromName: "Sam", title: "Legs", recipient: { done: 3, target: 3 }, streakBefore: 2, teamWeekJustMet: true, streakNow: 3 });
    expect(m).toEqual({ title: "Team week done", body: "You and Sam hit this week. 3 weeks in a row together." });
  });
});

describe("onSoloLogWritten", () => {
  function setup() {
    const db = fakeDb({
      "soloUsers/a": profile("Alex"),
      "soloUsers/b": profile("Blair"),
      "soloPartners/a_b": { members: ["a", "b"], joinedBy: "b", createdAt: NOW - 10 * DAY },
      "soloWorkoutLogs/b1": log("b", NOW - 2 * DAY),
    });
    return { db, messaging: fakeMessaging() };
  }

  it("a new, fresh log tells the partner once — a repeated trigger sends nothing", async () => {
    const { db, messaging } = setup();
    const after = log("a", NOW - 5 * 60_000);
    db.store.set("soloWorkoutLogs/a1", after);
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "a1", nowMs: NOW });
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "a1", nowMs: NOW });
    expect(messaging.sent).toHaveLength(1);
    expect(messaging.sent[0].tokens).toEqual(["tok-Blair"]);
    expect(messaging.sent[0].notification.title).toBe("Alex just finished Push Day");
    expect(db.store.get("soloPartnerActivity/a").weeks["2026-11-09"].done).toBe(1);
  });

  it("an edit of an existing log updates the counts but sends nothing", async () => {
    const { db, messaging } = setup();
    const after = log("a", NOW - 5 * 60_000);
    db.store.set("soloWorkoutLogs/a1", after);
    await sp.onSoloLogWritten(db, messaging, { before: after, after, logId: "a1", nowMs: NOW });
    expect(messaging.sent).toHaveLength(0);
    expect(db.store.get("soloPartnerActivity/a")).toBeTruthy();
  });

  it("a workout that synced long after it was done isn't 'just finished'", async () => {
    const { db, messaging } = setup();
    const after = log("a", NOW - 2 * DAY);
    db.store.set("soloWorkoutLogs/a1", after);
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "a1", nowMs: NOW });
    expect(messaging.sent).toHaveLength(0);
  });

  it("respects the partner's alert switch", async () => {
    const { db, messaging } = setup();
    db.store.set("soloUsers/b", profile("Blair", { notificationPrefs: { partners: false } }));
    const after = log("a", NOW - 60_000);
    db.store.set("soloWorkoutLogs/a1", after);
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "a1", nowMs: NOW });
    expect(messaging.sent).toHaveLength(0);
  });

  it("a member with no partner costs nothing: no activity doc, no push", async () => {
    const db = fakeDb({ "soloUsers/c": profile("Cal") });
    const messaging = fakeMessaging();
    const after = log("c", NOW);
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "c1", nowMs: NOW });
    expect(db.store.has("soloPartnerActivity/c")).toBe(false);
    expect(messaging.sent).toHaveLength(0);
  });

  it("the session that completes the Team week tells both", async () => {
    const { db, messaging } = setup();
    // Blair already did 3 this week; Alex has 2 and logs the 3rd.
    for (let i = 0; i < 3; i++) db.store.set(`soloWorkoutLogs/bw${i}`, log("b", NOW - i * 3600_000 - 1000));
    db.store.delete("soloWorkoutLogs/b1");
    db.store.set("soloWorkoutLogs/a0", log("a", NOW - 7200_000));
    db.store.set("soloWorkoutLogs/a1", log("a", NOW - 3600_000));
    await sp.onPairCreated(db, fakeMessaging(), { data: () => db.store.get("soloPartners/a_b"), ref: db.collection("soloPartners").doc("a_b"), id: "a_b" }, NOW);
    const after = log("a", NOW - 60_000, "Legs");
    db.store.set("soloWorkoutLogs/a2", after);
    await sp.onSoloLogWritten(db, messaging, { before: null, after, logId: "a2", nowMs: NOW });
    const titles = messaging.sent.map((m) => `${m.tokens[0]}:${m.notification.title}`);
    expect(titles).toEqual(["tok-Blair:Team week done", "tok-Alex:Team week done"]);
    expect(messaging.sent[0].notification.body).toBe("You and Alex hit this week. 1 week in a row together.");
  });
});

describe("onPairCreated", () => {
  it("fills in both members' activity and tells the inviter", async () => {
    const db = fakeDb({
      "soloUsers/a": profile("Alex"),
      "soloUsers/b": profile("Blair"),
      "soloPartners/a_b": { members: ["a", "b"], joinedBy: "b", createdAt: NOW },
    });
    const messaging = fakeMessaging();
    const ref = db.collection("soloPartners").doc("a_b");
    await sp.onPairCreated(db, messaging, { data: () => db.store.get("soloPartners/a_b"), ref, id: "a_b" }, NOW);
    expect(db.store.has("soloPartnerActivity/a")).toBe(true);
    expect(db.store.has("soloPartnerActivity/b")).toBe(true);
    expect(messaging.sent).toHaveLength(1);
    expect(messaging.sent[0].tokens).toEqual(["tok-Alex"]);
    expect(messaging.sent[0].notification.title).toBe("Blair is training with you");
  });

  it("refuses a 5th partner", async () => {
    const seed = { "soloUsers/a": profile("Alex") };
    for (const p of ["b", "c", "d", "e", "f"]) {
      seed[`soloUsers/${p}`] = profile(p);
      seed[`soloPartners/a_${p}`] = { members: ["a", p], joinedBy: p, createdAt: NOW };
    }
    const db = fakeDb(seed);
    const ref = db.collection("soloPartners").doc("a_f");
    await sp.onPairCreated(db, fakeMessaging(), { data: () => db.store.get("soloPartners/a_f"), ref, id: "a_f" }, NOW);
    expect(db.store.has("soloPartners/a_f")).toBe(false);
  });
});

describe("onSoloUserDeleted", () => {
  it("removes their pairs, code and activity", async () => {
    const db = fakeDb({
      "soloPartners/a_b": { members: ["a", "b"] },
      "soloPartners/b_c": { members: ["b", "c"] },
      "soloPartnerCodes/ABC234": { uid: "a" },
      "soloPartnerActivity/a": { weeks: {} },
    });
    await sp.onSoloUserDeleted(db, "a");
    expect([...db.store.keys()]).toEqual(["soloPartners/b_c"]);
  });
});
