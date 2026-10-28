// All Access programs on a customer's calendar (ROADMAP.txt step 2).
//
// A program BOUGHT on its own (soloPurchases) is the customer's forever and
// works exactly as before, whatever their tier. A program run through All
// Access is an ENROLMENT (soloEnrolments/{uid}_{programId}): the same id a
// purchase of it would have, so workout logs, the calendar and My Training
// treat both the same way. The rules for enrolments:
//
//  - One active All Access program at a time, so the calendar never fills
//    up with programs started on a whim. Owned programs keep their own
//    schedules alongside it, as they always have.
//  - Starting another pauses the active one at the week it's in. Its
//    sessions stay on the calendar up to the day it was paused (that's its
//    history); nothing after.
//  - Resuming continues from that week: the start date is moved so that
//    today is the paused week, and the week numbers — which is what the
//    workout logs are keyed on — carry on unchanged, so no log is ever
//    overwritten.
//  - Without All Access (cancelled, payment failed, expired) enrolled
//    programs are locked: off the calendar, shown in My Training as
//    "Included with All Access", their history kept. Renewing unlocks them
//    where they were.
//
// Enrolment docs are the customer's own (firestore.rules): they schedule,
// they don't grant anything. The program content itself is only readable
// with an active All Access entitlement, checked by the rules on the
// server-written soloEntitlements doc.
import { addDays } from "./soloCalendar";
import { currentWeekNumber } from "./weekProgress";

export const enrolmentId = (uid, programId) => `${uid}_${programId}`;

// Everything the customer trains from, shaped like a purchase:
// { id, programId, startDate, source: "owned" | "all_access", status,
//   untilDate, locked }. `untilDate` (exclusive) ends a paused program's
// calendar at the day it was paused. `locked` ones never reach the calendar.
export function trainingPrograms({ purchases = [], enrolments = [], allAccess = false }) {
  const owned = new Set(purchases.map((p) => p.programId));
  const rows = purchases.map((p) => ({ ...p, source: "owned", status: "active", untilDate: null, locked: false }));
  for (const e of enrolments) {
    if (owned.has(e.programId)) continue; // bought it too: the purchase wins
    const paused = e.status === "paused";
    rows.push({
      ...e,
      source: "all_access",
      status: paused ? "paused" : "active",
      untilDate: paused ? e.pausedAt || null : null,
      locked: !allAccess,
    });
  }
  return rows;
}

export function activeEnrolment(enrolments = []) {
  return enrolments.find((e) => e.status === "active") || null;
}

// The writes for starting `programId` through All Access on `startDate`:
// the currently active enrolment (if it's a different program) is paused
// at the week it's in; the new one becomes active. Returns
// { pause: {id, fields} | null, start: {id, fields} }.
export function planStart({ uid, programId, startDate, enrolments = [], totalWeeksByProgramId = {}, todayKey }) {
  const current = activeEnrolment(enrolments);
  let pause = null;
  if (current && current.programId !== programId) {
    const week = currentWeekNumber(current.startDate, totalWeeksByProgramId[current.programId] || 0) || 1;
    pause = { id: current.id, fields: { status: "paused", pausedAt: todayKey, pausedAtWeek: week } };
  }
  const existing = enrolments.find((e) => e.programId === programId);
  const id = enrolmentId(uid, programId);
  const fields =
    existing && existing.status === "paused"
      ? { status: "active", startDate: resumeStartDate(existing.pausedAtWeek, todayKey), pausedAt: null, pausedAtWeek: null, resumedAt: Date.now() }
      : { id, soloUserId: uid, programId, status: "active", startDate, startedAt: existing?.startedAt || Date.now(), pausedAt: null, pausedAtWeek: null };
  return { pause, start: { id, fields, resumed: existing?.status === "paused" } };
}

// The start date that makes `todayKey` fall in week `week`.
export function resumeStartDate(week, todayKey) {
  const w = Math.max(1, Number(week) || 1);
  return addDays(todayKey, -(w - 1) * 7);
}
