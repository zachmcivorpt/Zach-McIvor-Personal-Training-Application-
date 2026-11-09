// One program at a time (owner request 2026-11-03, REGRESSION_TESTS.md #140).
//
// Whatever a customer trains from — a program bought on its own, one run
// through All Access, or one they built (Plus) — exactly ONE is their
// current program: the only one on the calendar and in "Your program".
// Every other one is archived, with everything logged kept:
//   - archived after it started: its calendar shows it up to the day it
//     was archived (its history), nothing after; resuming carries on from
//     the week it was archived at (the start date moves so today is that
//     week — workout logs are keyed on week numbers, so none is
//     overwritten).
//   - never started (bought or built for later, or the one just replaced
//     before its start date): nothing on the calendar; starting it asks
//     for a start date like any new program.
//
// Stored on the customer's own profile (soloUsers/{uid}):
//   currentProgramId   the programId of the current program (a catalogue
//                      id, or `cp_{id}` for their own), null for none
//   archivedPrograms   { [programId]: { archivedAt: "YYYY-MM-DD" | null,
//                        archivedAtWeek: number | null } }
// All Access enrolments keep their own status in step (active/paused), so
// the existing enrolment rules still hold. Profiles from before this have
// no currentProgramId: resolveCurrentProgramId picks one, and
// legacyMigration writes it once.
import { currentWeekNumber } from "./weekProgress";
import { enrolmentId, resumeStartDate } from "./enrolments";

// Before any date: a calendar `untilDate` that hides the whole program.
export const NEVER = "0000-01-01";

// The current program's id. `saved` is the profile's currentProgramId:
// undefined = an older profile (pick one), null = deliberately none, else
// that program if it's still there and unlocked.
export function resolveCurrentProgramId(rows = [], saved) {
  const usable = rows.filter((r) => !r.locked);
  if (saved !== undefined) return usable.some((r) => r.programId === saved) ? saved : null;
  const activeAllAccess = usable.find((r) => r.source === "all_access" && r.status !== "paused");
  if (activeAllAccess) return activeAllAccess.programId;
  const started = usable.filter((r) => r.startDate).sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
  if (started.length) return started[0].programId;
  return usable.length === 1 ? usable[0].programId : null;
}

// The training rows with one current program and the rest archived.
// `current: true` marks the current one; archived ones are status "paused"
// with an untilDate (and pausedAtWeek when they had started).
export function applyCurrentProgram(rows = [], { currentProgramId = null, archived = {}, todayKey } = {}) {
  return rows.map((r) => {
    if (r.locked) return { ...r, current: false };
    if (r.programId === currentProgramId) return { ...r, status: "active", untilDate: null, pausedAt: null, pausedAtWeek: null, current: true };
    const rec = archived[r.programId];
    const fromEnrolment = r.source === "all_access" && r.status === "paused" ? { archivedAt: r.pausedAt || null, archivedAtWeek: r.pausedAtWeek || null } : null;
    const info = rec || fromEnrolment;
    // An older profile's extra programs (no record yet): history up to
    // today until legacyMigration has written their record.
    const archivedAt = info ? info.archivedAt || null : r.startDate ? todayKey || null : null;
    const archivedAtWeek = info ? info.archivedAtWeek || null : null;
    return {
      ...r,
      status: "paused",
      untilDate: archivedAt || NEVER,
      pausedAt: archivedAt,
      pausedAtWeek: archivedAtWeek,
      started: !!(archivedAt && archivedAtWeek),
      current: false,
    };
  });
}

// The week a running program is in today (1 before it starts).
export function weekInProgram(row, totalWeeks, todayKey) {
  if (!row?.startDate || row.startDate > todayKey) return 1;
  // Counted to the todayKey given (#210), not the device clock: archive
  // weeks were off by one once a test or caller's "today" differed.
  return currentWeekNumber(row.startDate, totalWeeks || 0, todayKey) || 1;
}

// Everything to write to make `target` the current program.
//   target: { programId, source: "owned" | "all_access" | "custom", id,
//             customProgramId?, startDate?, exists? } — a training row, or
//             for an All Access program never started, just programId +
//             source.
//   current: the current row (or null) — archived at the week it's in.
//   startDate: the chosen Week 1 date for a program that hasn't started.
// Returns { profile, enrolments: [{ id, fields, create }], purchases:
// [{ id, startDate }], customPrograms: [{ id, startDate }], resumed,
// startDate }.
export function planSwitch({ uid, target, current = null, rows = [], archived = {}, startDate, todayKey, totalWeeksFor = () => 0 }) {
  const nextArchived = { ...archived };
  const enrolments = [];
  const purchases = [];
  const customPrograms = [];

  if (current && current.programId !== target.programId) {
    const hasStarted = !!current.startDate && current.startDate <= todayKey;
    const record = hasStarted
      ? { archivedAt: todayKey, archivedAtWeek: weekInProgram(current, totalWeeksFor(current.programId), todayKey) }
      : { archivedAt: null, archivedAtWeek: null };
    nextArchived[current.programId] = record;
    if (current.source === "all_access") {
      enrolments.push({ id: current.id, fields: { status: "paused", pausedAt: record.archivedAt || todayKey, pausedAtWeek: record.archivedAtWeek || 1 } });
    }
  }
  // Any other All Access enrolment still marked active is paused too, so
  // the enrolments never disagree with the one current program.
  for (const r of rows) {
    if (r.source !== "all_access" || r.programId === target.programId || r.programId === current?.programId) continue;
    if (r.enrolmentStatus === "active") enrolments.push({ id: r.id, fields: { status: "paused", pausedAt: todayKey, pausedAtWeek: weekInProgram(r, totalWeeksFor(r.programId), todayKey) } });
  }

  const rec = archived[target.programId] || (target.source === "all_access" && target.enrolmentStatus === "paused" ? { archivedAt: target.pausedAt || null, archivedAtWeek: target.pausedAtWeek || null } : null);
  const resumed = !!(rec && rec.archivedAtWeek && target.startDate);
  const newStart = resumed ? resumeStartDate(rec.archivedAtWeek, todayKey) : startDate || todayKey;
  delete nextArchived[target.programId];

  if (target.source === "all_access") {
    const id = target.id || enrolmentId(uid, target.programId);
    const fields = { status: "active", startDate: newStart, pausedAt: null, pausedAtWeek: null };
    if (target.exists) enrolments.push({ id, fields: resumed ? { ...fields, resumedAt: Date.now() } : fields });
    else enrolments.push({ id, create: true, fields: { ...fields, id, soloUserId: uid, programId: target.programId, startedAt: Date.now() } });
  } else if (target.source === "custom") {
    customPrograms.push({ id: target.customProgramId, startDate: newStart });
  } else {
    purchases.push({ id: target.id, startDate: newStart });
  }

  return {
    profile: { currentProgramId: target.programId, archivedPrograms: nextArchived },
    enrolments,
    purchases,
    customPrograms,
    resumed,
    startDate: newStart,
  };
}

// Archive the current program without starting another (a program built
// "for later" is saved with this too: it goes straight to archived).
export function planArchiveForLater(archived = {}, programId) {
  return { ...archived, [programId]: { archivedAt: null, archivedAtWeek: null } };
}

// Older profiles (no currentProgramId) with more than one program on the
// calendar: the one-time write that keeps the current one and archives the
// rest as of today. null when nothing needs writing.
export function legacyMigration({ rows = [], savedCurrentId, archived = {}, todayKey, totalWeeksFor = () => 0 }) {
  if (savedCurrentId !== undefined) return null;
  const usable = rows.filter((r) => !r.locked);
  const scheduled = usable.filter((r) => r.startDate);
  if (scheduled.length <= 1 && usable.length <= 1) return null;
  const currentProgramId = resolveCurrentProgramId(rows, undefined);
  const nextArchived = { ...archived };
  const enrolments = [];
  for (const r of usable) {
    if (r.programId === currentProgramId || nextArchived[r.programId]) continue;
    if (r.source === "all_access" && r.status === "paused") {
      nextArchived[r.programId] = { archivedAt: r.pausedAt || null, archivedAtWeek: r.pausedAtWeek || null };
      continue;
    }
    const started = r.startDate && r.startDate <= todayKey;
    const week = started ? weekInProgram(r, totalWeeksFor(r.programId), todayKey) : null;
    nextArchived[r.programId] = started ? { archivedAt: todayKey, archivedAtWeek: week } : { archivedAt: null, archivedAtWeek: null };
    if (r.source === "all_access") enrolments.push({ id: r.id, fields: { status: "paused", pausedAt: todayKey, pausedAtWeek: week || 1 } });
  }
  return { profile: { currentProgramId, archivedPrograms: nextArchived }, enrolments };
}


// Deleting an archived program (#168, swipe on My Training → Archived).
// Removes everything that belongs to the program, never what the member
// did: their logged sessions stay (Progress, PRs, history) but are
// detached from it, so starting it again begins fresh instead of showing
// old sessions as done (All Access enrolment ids are fixed per program).
//   own built program (custom)  → its soloCustomPrograms doc is deleted
//   All Access program          → its enrolment is deleted (still in the
//                                 catalogue to start again)
//   bought program (owned)      → still owned (it was paid for; the server
//                                 never lets a purchase be deleted): its
//                                 start date is cleared and it's hidden
//                                 from Archived until started again
// Plus, for all: its archived record, schedule (sessionPlan) and swaps.
// Returns { profile, deletes: [[collection, id]], updates: [[collection,
// id, fields]] }, or null for the current program (never deleted here).
export function planRemoveProgram(row, logs = [], now = Date.now()) {
  if (!row || row.current) return null;
  const profile = {
    [`archivedPrograms.${row.programId}`]: null,
    [`sessionPlan.${row.id}`]: null,
    [`programSwaps.${row.id}`]: null,
  };
  const deletes = [];
  const updates = [];
  if (row.source === "custom") deletes.push(["soloCustomPrograms", row.customProgramId]);
  else if (row.source === "all_access") deletes.push(["soloEnrolments", row.id]);
  else {
    updates.push(["soloPurchases", row.id, { startDate: null }]);
    profile[`hiddenPrograms.${row.programId}`] = true;
  }
  for (const log of logs) {
    if (log.purchaseId !== row.id) continue;
    updates.push(["soloWorkoutLogs", log.id, { purchaseId: `${row.id}_removed_${now}`, removedFromProgram: row.programId }]);
  }
  return { profile, deletes, updates };
}
