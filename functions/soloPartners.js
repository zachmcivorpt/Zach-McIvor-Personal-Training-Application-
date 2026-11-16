// Train Solo training partners: the Team week streak and "your move"
// pushes (#234). Keep the pure week/streak maths in step with
// src/solo/partners.js (soloPartners.test.js checks both agree).
//
// Data:
//   soloPartnerCodes/{code}      a member's invite code (they create it)
//   soloPartners/{a_b}           one pair, uids sorted, created by the friend who joins
//   soloPartnerActivity/{uid}    written ONLY here, from the member's own logs:
//                                first name, sessions done / target per week,
//                                the last session's name, and their latest OWN
//                                session's exercises/sets/reps (#243, never a
//                                program's). Never weights, photos or
//                                bodyweight. Readable by the member's partners.
//   soloPartnerPushes/{id}       one doc per push already sent, so a repeated
//                                trigger never sends twice.

const MAX_PARTNERS = 4;
const DEFAULT_TZ = "Australia/Sydney";
const DEFAULT_TARGET = 3;
const WEEKS_KEPT = 12;
// An offline workout that syncs later than this isn't "just finished".
const FRESH_MS = 12 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

// Calendar day (YYYY-MM-DD) of a moment in the member's own time zone.
function dateKeyInTz(ms, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Monday (YYYY-MM-DD) of the week a day falls in.
function weekKey(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftWeek(key, weeks) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + weeks * 7));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Sessions a week the member aims for: their consultation answer, else
// the training days they picked, else 3.
function weeklyTarget(profile) {
  const a = profile?.onboarding?.answers || {};
  const n = Number(a.sessionsPerWeek) || (Array.isArray(a.trainingDays) ? a.trainingDays.length : 0) || DEFAULT_TARGET;
  return Math.min(7, Math.max(1, Math.round(n)));
}

// A week counts for the pair when both did at least their own target.
function weekMet(w) {
  return !!w && Number(w.done) >= Math.max(1, Number(w.target) || DEFAULT_TARGET);
}

// Consecutive Team weeks up to now, counting only weeks since they paired.
// This week counts once both have met it; until then the streak is the run
// that ended last week (still alive, not broken).
function teamStreak(weeksA, weeksB, currentWeek, sinceWeek) {
  const met = (k) => weekMet(weeksA?.[k]) && weekMet(weeksB?.[k]);
  let k = met(currentWeek) ? currentWeek : shiftWeek(currentWeek, -1);
  let n = 0;
  while (k >= (sinceWeek || currentWeek) && met(k)) {
    n += 1;
    k = shiftWeek(k, -1);
  }
  return n;
}

// "Train their session" (#243): the member's latest session they built or
// logged as they went (a "_custom" log, never a program's — programs are
// paid content) from the last 14 days, as exercises with sets and reps.
// Never weights. Their partners can train it as a one-off.
const SHARED_SESSION_DAYS = 14;
const MAX_SHARED_EXERCISES = 12;
function sharedSessionOf(logs, tz, nowMs) {
  const own = (logs || [])
    .filter((l) => typeof l.purchaseId === "string" && l.purchaseId.endsWith("_custom") && (Number(l.date) || 0) > nowMs - SHARED_SESSION_DAYS * 86400000)
    .filter((l) => (l.entries || []).some((e) => e.exerciseId && (e.sets || []).length))
    .sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0))[0];
  if (!own) return null;
  const exercises = (own.entries || [])
    .filter((e) => e.exerciseId && (e.sets || []).length)
    .slice(0, MAX_SHARED_EXERCISES)
    .map((e) => {
      const reps = (e.sets || []).map((x) => Number(x.reps) || 0).filter((r) => r > 0).sort((a, b) => a - b);
      return { exerciseId: e.exerciseId, sets: Math.min(10, e.sets.length), reps: reps.length ? reps[Math.floor(reps.length / 2)] : 10 };
    });
  return { title: String(own.dayLabel || "Their session").slice(0, 60), at: Number(own.date), dateKey: dateKeyInTz(Number(own.date), tz), exercises };
}

// The activity doc for one member, from their own logs. Past weeks keep
// the target they had then (changing your answer never rewrites history).
function buildActivity({ logs, profile, previous, nowMs }) {
  const tz = profile?.tz || DEFAULT_TZ;
  const target = weeklyTarget(profile);
  const currentWeek = weekKey(dateKeyInTz(nowMs, tz));
  const oldest = shiftWeek(currentWeek, -(WEEKS_KEPT - 1));
  const counts = {};
  const daysThisWeek = [];
  let last = null;
  for (const log of logs || []) {
    const at = Number(log.date) || 0;
    if (!at) continue;
    const day = dateKeyInTz(at, tz);
    const wk = weekKey(day);
    if (wk < oldest || wk > currentWeek) continue;
    counts[wk] = (counts[wk] || 0) + 1;
    if (wk === currentWeek && !daysThisWeek.includes(day)) daysThisWeek.push(day);
    if (!last || at > last.at) last = { at, dateKey: day, title: String(log.dayLabel || "a session").slice(0, 60) };
  }
  const weeks = {};
  for (let k = oldest; k <= currentWeek; k = shiftWeek(k, 1)) {
    const prevTarget = previous?.weeks?.[k]?.target;
    const t = k < currentWeek && prevTarget ? prevTarget : target;
    if (counts[k] || k === currentWeek || prevTarget) weeks[k] = { done: counts[k] || 0, target: t };
  }
  const firstName = String(profile?.name || "").trim().split(/\s+/)[0] || "Your partner";
  return { firstName, tz, target, weeks, daysThisWeek: daysThisWeek.sort(), lastSession: last, sharedSession: sharedSessionOf(logs, tz, nowMs), updatedAt: nowMs };
}

// What a partner is told when a member finishes a session.
function sessionPushText({ fromName, title, recipient, streakBefore, teamWeekJustMet, streakNow, comebackDays = 0 }) {
  if (comebackDays >= 4 && !teamWeekJustMet) {
    // #244: back after a break — partners hear it, which can bring a pair back too.
    return { title: `${fromName}'s back`, body: `First session in ${comebackDays} days: ${title}. Your move.` };
  }
  if (teamWeekJustMet) {
    return {
      title: "Team week done",
      body: `You and ${fromName} hit this week. ${streakNow} week${streakNow === 1 ? "" : "s"} in a row together.`,
    };
  }
  const recipientDoneThisWeek = weekMet(recipient);
  if (recipientDoneThisWeek) {
    return { title: `${fromName} just trained`, body: `${fromName} finished ${title}. Your week's done — it's on them now.` };
  }
  const left = Math.max(0, (Number(recipient?.target) || DEFAULT_TARGET) - (Number(recipient?.done) || 0));
  const stake = streakBefore > 0 ? ` Keep your ${streakBefore}-week streak alive.` : "";
  return {
    title: `${fromName} just finished ${title}`,
    body: `Your move — ${left} session${left === 1 ? "" : "s"} left this week.${stake}`,
  };
}

const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const otherMember = (pair, uid) => (pair.members || []).find((m) => m !== uid);

// ---- Firestore glue ----

async function partnersOf(db, uid) {
  const snap = await db.collection("soloPartners").where("members", "array-contains", uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function rebuildActivity(db, uid, nowMs = Date.now()) {
  const [profileSnap, logsSnap, prevSnap] = await Promise.all([
    db.collection("soloUsers").doc(uid).get(),
    db.collection("soloWorkoutLogs").where("soloUserId", "==", uid).get(),
    db.collection("soloPartnerActivity").doc(uid).get(),
  ]);
  if (!profileSnap.exists) return null;
  const activity = buildActivity({
    logs: logsSnap.docs.map((d) => d.data()),
    profile: profileSnap.data(),
    previous: prevSnap.exists ? prevSnap.data() : null,
    nowMs,
  });
  await db.collection("soloPartnerActivity").doc(uid).set(activity);
  return activity;
}

// Once per id, ever: create() fails if it was already sent.
async function claimPush(db, id) {
  try {
    await db.collection("soloPartnerPushes").doc(id).create({ at: Date.now() });
    return true;
  } catch {
    return false;
  }
}

async function pushTo(db, messaging, uid, { title, body }) {
  const snap = await db.collection("soloUsers").doc(uid).get();
  const data = snap.data() || {};
  if (data.notificationPrefs?.partners === false) return false;
  const tokens = data.fcmTokens || [];
  if (!tokens.length) return false;
  const res = await messaging.sendEachForMulticast({ tokens, notification: { title, body }, webpush: { fcmOptions: { link: "/solo/home" } } });
  const dead = tokens.filter((_, i) => !res.responses[i].success);
  if (dead.length) await snap.ref.update({ fcmTokens: tokens.filter((t) => !dead.includes(t)) });
  return true;
}

// A workout log was written. Rebuild the member's activity (only when they
// have a partner) and, for a brand-new log of a fresh session, tell each
// partner — once per log per partner.
async function onSoloLogWritten(db, messaging, { before, after, logId, nowMs = Date.now() }) {
  const uid = after?.soloUserId || before?.soloUserId;
  if (!uid) return;
  const pairs = await partnersOf(db, uid);
  if (!pairs.length) return;
  const prevActivity = (await db.collection("soloPartnerActivity").doc(uid).get()).data() || null;
  const activity = await rebuildActivity(db, uid, nowMs);
  if (!activity || before || !after) return;
  if (nowMs - (Number(after.date) || 0) > FRESH_MS) return;
  const wk = weekKey(dateKeyInTz(Number(after.date), activity.tz));
  for (const pair of pairs) {
    const partner = otherMember(pair, uid);
    if (!partner) continue;
    try {
      const pSnap = await db.collection("soloPartnerActivity").doc(partner).get();
      const pAct = pSnap.data() || {};
      const since = weekKey(dateKeyInTz(Number(pair.createdAt) || nowMs, activity.tz));
      const streakBefore = teamStreak(prevActivity?.weeks, pAct.weeks, wk, since);
      const teamWeekJustMet = !(weekMet(prevActivity?.weeks?.[wk]) && weekMet(pAct.weeks?.[wk])) && weekMet(activity.weeks[wk]) && weekMet(pAct.weeks?.[wk]);
      const streakNow = teamStreak(activity.weeks, pAct.weeks, wk, since);
      const prevAt = Number(prevActivity?.lastSession?.at) || 0;
      const comebackDays = prevAt ? Math.round((Number(after.date) - prevAt) / 86400000) : 0;
      const text = sessionPushText({
        fromName: activity.firstName,
        title: activity.lastSession?.title || "a session",
        recipient: pAct.weeks?.[wk],
        streakBefore,
        teamWeekJustMet,
        streakNow,
        comebackDays,
      });
      if (await claimPush(db, `${logId}_${partner}`)) await pushTo(db, messaging, partner, text);
      // The member who finished it hears about the Team week too.
      if (teamWeekJustMet && (await claimPush(db, `team_${pair.id}_${wk}`))) {
        await pushTo(db, messaging, uid, {
          title: "Team week done",
          body: `You and ${pAct.firstName || "your partner"} hit this week. ${streakNow} week${streakNow === 1 ? "" : "s"} in a row together.`,
        });
      }
    } catch (err) {
      console.error("partner push failed", uid, partner, err.message);
    }
  }
}

// A friend joined. Refuse a pair past the limit; otherwise fill in both
// members' activity and tell the inviter.
async function onPairCreated(db, messaging, snap, nowMs = Date.now()) {
  const pair = snap.data() || {};
  const members = pair.members || [];
  if (members.length !== 2) return snap.ref.delete();
  for (const uid of members) {
    const all = await partnersOf(db, uid);
    if (all.length > MAX_PARTNERS) {
      console.warn("Partner limit reached", uid, snap.id);
      return snap.ref.delete();
    }
  }
  const acts = await Promise.all(members.map((uid) => rebuildActivity(db, uid, nowMs)));
  const joiner = pair.joinedBy;
  const inviter = members.find((m) => m !== joiner);
  const joinerName = acts[members.indexOf(joiner)]?.firstName || "A friend";
  if (inviter && (await claimPush(db, `joined_${snap.id}`))) {
    await pushTo(db, messaging, inviter, { title: `${joinerName} is training with you`, body: "Team week starts now. Hit your sessions together." });
  }
}

// A Train Solo account was deleted: its pairs, code and activity go too.
async function onSoloUserDeleted(db, uid) {
  const pairs = await db.collection("soloPartners").where("members", "array-contains", uid).get();
  const codes = await db.collection("soloPartnerCodes").where("uid", "==", uid).get();
  const batch = db.batch();
  pairs.docs.forEach((d) => batch.delete(d.ref));
  codes.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection("soloPartnerActivity").doc(uid));
  await batch.commit();
}

module.exports = {
  MAX_PARTNERS,
  FRESH_MS,
  dateKeyInTz,
  weekKey,
  shiftWeek,
  weeklyTarget,
  weekMet,
  teamStreak,
  buildActivity,
  sessionPushText,
  pairId,
  onSoloLogWritten,
  onPairCreated,
  onSoloUserDeleted,
};
