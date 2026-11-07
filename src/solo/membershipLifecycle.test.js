// #158: a member's whole membership + program lifecycle through the real
// logic, end to end, checking the stored records at every step:
//   server (functions/soloSubscriptions.js: Stripe/Apple → entitlement doc)
//   → app tier (soloAccess.js) → which programs train and which are locked
//   (enrolments.js) → one current program (currentProgram.js: start,
//   switch, lapse, renew, resume) → the calendar (soloCalendar.js) → the
//   workout logs, which must never move or be overwritten.
// Only the Firestore/Stripe network calls are left out; every decision the
// app and server make is the real code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { tierFromEntitlement, canUse, gatesLive } from "./soloAccess";
import { trainingPrograms } from "./enrolments";
import { resolveCurrentProgramId, applyCurrentProgram, planSwitch } from "./currentProgram";
import { buildSoloCalendar, addDays } from "./soloCalendar";

const require = createRequire(import.meta.url);
const server = require("../../functions/soloSubscriptions.js");

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-02T09:00:00"); // a Monday
const key = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const UID = "u1";
const programs = { pA: { id: "pA", name: "Strength", status: "published" }, pB: { id: "pB", name: "Hypertrophy", status: "published" } };
const content = (weeks) => ({ phases: [{ id: "ph", name: "Block", durationWeeks: weeks, days: [{ id: "d1", label: "Day 1" }, { id: "d2", label: "Day 2" }] }] });
const contentById = { pA: content(8), pB: content(6) };
const totalWeeksFor = (id) => contentById[id].phases[0].durationWeeks;

// Stripe subscription → the entitlement doc the server writes.
function entitlementFromStripe(subs, now) {
  const source = server.stripeSourceFromSubscriptions(subs, now);
  const sources = source ? { stripe: source } : {};
  return { sources, ...server.deriveEntitlement(sources, now) };
}
const stripeSub = (plan, status, endMs, extra = {}) => ({
  id: `sub_${plan}`,
  status,
  current_period_end: Math.floor(endMs / 1000),
  items: { data: [{ price: { lookup_key: server.lookupKey(plan) } }] },
  metadata: { soloUserId: UID, plan },
  created: 1,
  ...extra,
});

// The app's view from stored records (what SoloAppContext derives).
function appState({ entitlement, enrolments, purchases = [], profile, now, logs = [] }) {
  const live = gatesLive({ live: true }, UID);
  const tier = tierFromEntitlement(entitlement, now);
  const allAccess = live && tier === "all_access";
  const raw = trainingPrograms({ purchases, enrolments, allAccess });
  const currentId = resolveCurrentProgramId(raw, profile.currentProgramId);
  const rows = applyCurrentProgram(raw, { currentProgramId: currentId, archived: profile.archivedPrograms || {}, todayKey: key(now) });
  const calendar = buildSoloCalendar({
    purchases: rows,
    programsById: programs,
    contentByProgramId: allAccess ? contentById : {}, // the rules refuse content without All Access
    workoutLogs: logs,
    fromKey: key(now - 60 * DAY),
    toKey: key(now + 60 * DAY),
  });
  const workoutsOn = Object.values(calendar).flat().filter((i) => i.type === "workout");
  return { tier, access: { tier, live }, rows, current: rows.find((r) => r.current) || null, workoutsOn };
}

// Applying a planSwitch result to the stored records, as SoloAppContext's batch does.
function applySwitch(state, plan) {
  const enrolments = [...state.enrolments];
  for (const e of plan.enrolments) {
    const i = enrolments.findIndex((x) => x.id === e.id);
    if (i >= 0) enrolments[i] = { ...enrolments[i], ...e.fields };
    else enrolments.push(e.fields);
  }
  return { ...state, enrolments, profile: { ...state.profile, ...plan.profile } };
}

// The week a program is in comes from the device clock, so the clock moves with each step.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("a member's membership and program lifecycle (#158)", () => {
  it("Free → All Access → start → switch → lapse → renew → resume, history intact throughout", () => {
    let now = T0;
    let st = { entitlement: {}, enrolments: [], profile: {}, logs: [] };

    // 1. Free: nothing paid, no catalogue program can be run.
    let app = appState({ ...st, now });
    expect(app.tier).toBe("free");
    expect(canUse("catalogue", app.access)).toBe(false);
    expect(canUse("programBuilder", app.access)).toBe(false);

    // 2. Subscribes to All Access yearly with the trial (website).
    st.entitlement = entitlementFromStripe([stripeSub("all_access_yearly", "trialing", now + 7 * DAY, { trial_end: Math.floor((now + 7 * DAY) / 1000) })], now);
    expect(st.entitlement.allAccessUntil).toBe(now + 7 * DAY); // what the rules check before serving content
    app = appState({ ...st, now });
    expect(app.tier).toBe("all_access");
    expect(canUse("programBuilder", app.access)).toBe(true); // everything in Plus too

    // 3. Starts program A next Monday.
    const startA = key(now + 7 * DAY);
    let plan = planSwitch({ uid: UID, target: { programId: "pA", source: "all_access" }, current: null, rows: app.rows, archived: {}, startDate: startA, todayKey: key(now), totalWeeksFor });
    expect(plan.enrolments).toEqual([{ id: "u1_pA", create: true, fields: expect.objectContaining({ status: "active", startDate: startA, soloUserId: UID, programId: "pA" }) }]);
    st = applySwitch(st, plan);
    app = appState({ ...st, now });
    expect(app.current.programId).toBe("pA");
    expect(app.workoutsOn.every((w) => w.dateKey >= startA)).toBe(true);
    expect(app.workoutsOn.length).toBe(16); // 8 weeks × 2 days, nothing before the start

    // 4. Trial converts; three weeks in, logs weeks 1–3.
    now = T0 + 28 * DAY;
    vi.setSystemTime(now);
    st.entitlement = entitlementFromStripe([stripeSub("all_access_yearly", "active", T0 + 372 * DAY)], now);
    st.logs = [1, 2, 3].flatMap((w) => ["d1", "d2"].map((d) => ({ id: `u1_pA_${d}_w${w}`, purchaseId: "u1_pA", dayId: d, weekNumber: w, date: now - (4 - w) * 7 * DAY })));
    app = appState({ ...st, now });
    expect(app.workoutsOn.filter((w) => w.done).length).toBe(6);

    // 5. Switches to program B today: A archived at the week it's in.
    plan = planSwitch({ uid: UID, target: { programId: "pB", source: "all_access" }, current: app.current, rows: app.rows, archived: st.profile.archivedPrograms || {}, startDate: key(now), todayKey: key(now), totalWeeksFor });
    expect(plan.profile.archivedPrograms.pA).toEqual({ archivedAt: key(now), archivedAtWeek: 4 });
    st = applySwitch(st, plan);
    app = appState({ ...st, now });
    expect(app.current.programId).toBe("pB");
    expect(st.enrolments.find((e) => e.id === "u1_pA")).toMatchObject({ status: "paused", pausedAtWeek: 4 });
    // A's past stays on the calendar (done), nothing of A after today.
    const aItems = app.workoutsOn.filter((w) => w.programId === "pA");
    expect(aItems.every((w) => w.dateKey < key(now))).toBe(true);
    expect(aItems.filter((w) => w.done).length).toBe(6);

    // 6. Payment fails at renewal → Free at once: both programs locked, off the calendar, logs untouched.
    now = T0 + 373 * DAY;
    vi.setSystemTime(now);
    st.entitlement = entitlementFromStripe([stripeSub("all_access_yearly", "past_due", T0 + 372 * DAY)], now);
    expect(st.entitlement.allAccessUntil).toBe(0);
    app = appState({ ...st, now });
    expect(app.tier).toBe("free");
    expect(app.rows.every((r) => r.locked)).toBe(true);
    expect(app.current).toBe(null);
    expect(app.workoutsOn).toEqual([]);
    expect(st.logs).toHaveLength(6);
    // Nothing about the lapse is written to the profile: the current program is kept for when they come back.
    expect(st.profile.currentProgramId).toBe("pB");

    // 7. Pays → renewed: B is current again where it was, no re-setup.
    st.entitlement = entitlementFromStripe([stripeSub("all_access_yearly", "active", T0 + 737 * DAY)], now);
    app = appState({ ...st, now });
    expect(app.tier).toBe("all_access");
    expect(app.current.programId).toBe("pB");

    // 8. Resumes A: picks up at week 4, start moved so today is week 4 — the
    //    week numbers the logs are keyed on carry on, so none is overwritten.
    plan = planSwitch({ uid: UID, target: app.rows.find((r) => r.programId === "pA"), current: app.current, rows: app.rows, archived: st.profile.archivedPrograms, todayKey: key(now), totalWeeksFor });
    expect(plan.resumed).toBe(true);
    expect(plan.startDate).toBe(addDays(key(now), -21));
    st = applySwitch(st, plan);
    app = appState({ ...st, now });
    expect(app.current.programId).toBe("pA");
    const resumedWeek4 = app.workoutsOn.filter((w) => w.programId === "pA" && w.weekNumber === 4);
    expect(resumedWeek4.every((w) => w.dateKey >= key(now) && !w.done)).toBe(true);
    expect(app.workoutsOn.filter((w) => w.programId === "pA" && w.done).map((w) => w.weekNumber).sort()).toEqual([1, 1, 2, 2, 3, 3]);
    expect(new Set(st.logs.map((l) => l.id)).size).toBe(6);
  });

  it("downgrading All Access → Plus keeps Plus features and locks catalogue programs; cancelling keeps Plus to the period's end (#187)", () => {
    const now = T0;
    let ent = entitlementFromStripe([stripeSub("plus_monthly", "active", now + 30 * DAY)], now);
    expect(ent).toMatchObject({ tier: "plus", allAccessUntil: 0, plusUntil: now + 30 * DAY });
    const app = appState({ entitlement: ent, enrolments: [{ id: "u1_pA", soloUserId: UID, programId: "pA", status: "active", startDate: key(now) }], profile: { currentProgramId: "pA" }, now });
    expect(canUse("programBuilder", app.access)).toBe(true);
    expect(canUse("catalogue", app.access)).toBe(false);
    expect(app.rows[0].locked).toBe(true);
    expect(app.workoutsOn).toEqual([]);

    ent = entitlementFromStripe([stripeSub("plus_monthly", "active", now + 30 * DAY, { cancel_at_period_end: true })], now);
    expect(ent).toMatchObject({ tier: "plus", plusUntil: now + 30 * DAY });
    expect(tierFromEntitlement(ent, now)).toBe("plus");
    // …and Free once that period is over.
    expect(tierFromEntitlement(ent, now + 30 * DAY + 1)).toBe("free");
  });

  it("a program bought on its own stays the member's whatever their plan", () => {
    const now = T0;
    const purchases = [{ id: "u1_pA", programId: "pA", startDate: key(now), refunded: false }];
    const app = appState({ entitlement: {}, enrolments: [], purchases, profile: { currentProgramId: "pA" }, now });
    expect(app.tier).toBe("free");
    expect(app.current.programId).toBe("pA");
    expect(app.rows[0].locked).toBe(false);
  });

  it("the server and the app agree on the tier in every store state", () => {
    const now = T0;
    const cases = [
      [[stripeSub("plus_yearly", "active", now + DAY)], "plus"],
      [[stripeSub("plus_yearly", "trialing", now + DAY)], "plus"],
      [[stripeSub("all_access_monthly", "past_due", now + DAY)], "free"],
      [[stripeSub("all_access_monthly", "unpaid", now + DAY)], "free"],
      [[stripeSub("all_access_monthly", "canceled", now + DAY)], "free"],
      [[stripeSub("all_access_monthly", "active", now - 1)], "free"],
      // Cancelled, still inside the paid period (#187): kept until it ends.
      [[stripeSub("all_access_monthly", "active", now + DAY, { cancel_at: Math.floor((now + DAY) / 1000) })], "all_access"],
      [[stripeSub("all_access_monthly", "active", now + DAY, { cancel_at_period_end: true })], "all_access"],
      [[stripeSub("plus_monthly", "active", now + DAY), stripeSub("all_access_monthly", "active", now + DAY, { id: "sub_2", created: 2 })], "all_access"],
    ];
    for (const [subs, expected] of cases) {
      const ent = entitlementFromStripe(subs, now);
      expect([ent.tier, tierFromEntitlement(ent, now)]).toEqual([expected, expected]);
    }
    const apple = (sub, ents = {}) => ({ subscriptions: { apex_solo_all_access_yearly: sub }, entitlements: ents });
    const appleCases = [
      [apple({ expires_date: new Date(now + DAY).toISOString() }, { all_access: { product_identifier: "apex_solo_all_access_yearly", expires_date: new Date(now + DAY).toISOString() } }), "all_access"],
      [apple({ expires_date: new Date(now + DAY).toISOString(), unsubscribe_detected_at: new Date(now - DAY).toISOString() }), "all_access"],
      [apple({ expires_date: new Date(now - 1).toISOString(), unsubscribe_detected_at: new Date(now - DAY).toISOString() }), "free"],
      [apple({ expires_date: new Date(now + DAY).toISOString(), refunded_at: new Date(now - DAY).toISOString() }), "free"],
      [apple({ expires_date: new Date(now - DAY).toISOString(), billing_issues_detected_at: new Date(now - DAY).toISOString() }), "free"],
    ];
    for (const [subscriber, expected] of appleCases) {
      const source = server.appleSourceFromSubscriber(subscriber, now);
      const sources = { apple: source };
      const ent = { sources, ...server.deriveEntitlement(sources, now) };
      expect([ent.tier, tierFromEntitlement(ent, now)]).toEqual([expected, expected]);
    }
  });

  it("website checkout never double-sells: an Apple member is sent to Apple, a Stripe member is changed in place", () => {
    const now = T0;
    const appleAll = { sources: { apple: { tier: "all_access", status: "active", expiresAt: now + DAY } } };
    expect(server.checkoutDecision(appleAll, "plus_monthly", now)).toEqual({ action: "already", store: "apple" });
    const applePlus = { sources: { apple: { tier: "plus", status: "active", expiresAt: now + DAY } } };
    expect(server.checkoutDecision(applePlus, "all_access_monthly", now)).toEqual({ action: "apple" });
    const stripePlus = { sources: { stripe: { tier: "plus", plan: "plus_monthly", status: "active", expiresAt: now + DAY, subscriptionId: "sub_1" } } };
    expect(server.checkoutDecision(stripePlus, "all_access_monthly", now)).toEqual({ action: "change", subscriptionId: "sub_1" });
    expect(server.checkoutDecision(stripePlus, "plus_monthly", now)).toEqual({ action: "already", store: "stripe" });
    // A lapsed member re-subscribing gets no second free trial.
    expect(server.checkoutDecision({ trialUsed: true, sources: {} }, "all_access_yearly", now)).toEqual({ action: "checkout", trialDays: 0 });
  });
});
