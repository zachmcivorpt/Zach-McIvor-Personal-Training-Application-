// Builds a Train Solo customer's calendar from data they already have — no
// separate "scheduled" collection. Three kinds of entry:
//
//  - Program workouts: every owned program with a start date lays its
//    weeks out from that date. All Access programs come in the same way
//    (src/solo/enrolments.js): a paused one stops at the day it was paused
//    (`untilDate`), a locked one (no All Access) isn't laid out at all. A program day has no fixed weekday of its
//    own, so a week's N sessions are spread evenly across its 7 days
//    (3/week → days 1, 3, 5 of that week). A session is done when a
//    soloWorkoutLogs doc exists for that purchase + week + day, the same
//    rule My Training uses.
//  - Body stats check-in: every Monday from the week the account was
//    created. Done once any weigh-in or body metric is logged that
//    Monday–Sunday week.
//  - Progress photos: same Mondays, done once a progress photo is added
//    that week.
//  - Recovery add-on: when the customer has one (a free kind:"recovery"
//    product), its week-N sessions go onto week N's rest days of each
//    started program, spread evenly. Done once that session is logged for
//    that date.
//  - Active Recovery (the built-in sessions): every rest day inside a
//    started program's span — only for a customer with NO add-on. Once
//    they choose an add-on, it replaces these on their calendar entirely.
//    Done once any Active Recovery session is logged that day.
import { localDateKey } from "../lib/dateKey";
import { phaseForWeekNumber, currentWeekNumber } from "./weekProgress";
import { isRecoveryLog } from "./activeRecovery";
import { isCustomSessionLog, customSessionState } from "./customSessions";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseKey(key) {
  return new Date(`${key}T00:00:00`);
}

function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

// The Monday on or before `key`.
export function mondayOf(key) {
  const d = parseKey(key);
  const dow = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return localDateKey(d);
}

// Day offsets (0-6) within a week for `n` sessions, spread evenly.
export function sessionOffsets(n) {
  if (n <= 0) return [];
  if (n >= 7) return Array.from({ length: n }, (_, i) => Math.min(i, 6));
  return Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n));
}

// The scheduled date (YYYY-MM-DD) of each of a program week's `count`
// sessions — the same placement the calendar uses, so My Training's
// "This week" list and the calendar always agree. `trainingDays` are the
// weekdays (0 = Sunday) the customer chose in their consultation: when
// there are at least as many as the week's sessions, the sessions go on
// those weekdays, in order, within the week; otherwise they're spread
// evenly across the week.
// A program the customer built can carry its own weekday for each session
// (`weekdays`, 0 = Sunday, one per session, #142): those win, each session
// on its weekday within the program week.
export function validWeekdays(weekdays, count) {
  if (!Array.isArray(weekdays) || weekdays.length !== count || count === 0) return false;
  const nums = weekdays.map(Number);
  return nums.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(nums).size === nums.length;
}

export function sessionDateKeys(startDate, weekNumber, count, trainingDays = [], weekdays = null) {
  if (!startDate || !weekNumber) return [];
  const weekStart = addDays(startDate, (weekNumber - 1) * 7);
  if (validWeekdays(weekdays, count)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return weekdays.map((wd) => week.find((k) => parseKey(k).getDay() === Number(wd)));
  }
  const chosen = new Set((trainingDays || []).map(Number));
  if (count > 0 && chosen.size >= count) {
    const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((k) => chosen.has(parseKey(k).getDay()));
    return keys.slice(0, count);
  }
  return sessionOffsets(count).map((offset) => addDays(weekStart, offset));
}

// "Today" / "Tomorrow" / "Yesterday", else e.g. "Wed 21 Oct".
export function sessionDayLabel(key, today = localDateKey()) {
  if (!key) return "";
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function keyOf(value) {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return localDateKey(new Date(value));
}

export function buildSoloCalendar({
  purchases = [],
  programsById = {},
  contentByProgramId = {},
  workoutLogs = [],
  weighIns = [],
  bodyMetrics = [],
  progressPhotos = [],
  recoveryAddon = null,
  accountCreatedAt,
  trainingDays = [],
  // Missed sessions moved or skipped (#141): { [purchaseId]: { [`${week}_${dayId}`]: { moveTo } | { skipped: true } } }.
  sessionPlan = {},
  // The customer's own saved sessions put on a day (#142):
  // plannedSessions { [planId]: { sessionId, date } }, customSessions [{ id, name, exercises }].
  plannedSessions = {},
  customSessions = [],
  fromKey,
  toKey,
}) {
  const byDate = {};
  const push = (dateKey, item) => {
    if (dateKey < fromKey || dateKey > toKey) return;
    (byDate[dateKey] = byDate[dateKey] || []).push(item);
  };

  const doneSessions = new Set(workoutLogs.map((l) => `${l.purchaseId}:${l.weekNumber}:${l.dayId}`));
  const recoveryDays = new Set(workoutLogs.filter(isRecoveryLog).map((l) => keyOf(l.date)));
  const addonDone = new Set(workoutLogs.filter(isRecoveryLog).map((l) => `${l.dayId}|${l.weekNumber}`));
  const workoutDays = new Set();
  const programSpans = [];

  // Free sessions the customer built or started themselves, shown on the
  // day they were done (customSessions.js).
  for (const log of workoutLogs) {
    if (!isCustomSessionLog(log)) continue;
    push(keyOf(log.date), { type: "custom", id: `custom:${log.id}`, logId: log.id, title: log.dayLabel || "Your session", subtitle: "Your own session", done: true });
  }

  // Own sessions planned on a day: startable on (or after) their day,
  // done once a session of theirs is logged that day.
  const sessionsById = Object.fromEntries((customSessions || []).map((c) => [c.id, c]));
  const customDoneOn = new Set(workoutLogs.filter(isCustomSessionLog).map((l) => `${l.dayId}|${keyOf(l.date)}`));
  for (const [planId, plan] of Object.entries(plannedSessions || {})) {
    const session = plan && sessionsById[plan.sessionId];
    if (!session || !plan.date) continue;
    push(plan.date, {
      type: "planned",
      id: `planned:${planId}`,
      planId,
      title: session.name || "Your session",
      subtitle: "Your own session",
      done: customDoneOn.has(`${session.id}|${plan.date}`),
      session,
      dateKey: plan.date,
    });
  }

  for (const purchase of purchases) {
    const program = programsById[purchase.programId];
    const phases = contentByProgramId[purchase.programId]?.phases;
    if (!program || !purchase.startDate || !Array.isArray(phases) || purchase.locked) continue;
    const until = purchase.untilDate || null;
    const totalWeeks = phases.reduce((sum, p) => sum + (p.durationWeeks || 0), 0);
    if (totalWeeks > 0) programSpans.push({ start: purchase.startDate, totalWeeks, until });
    for (let week = 1; week <= totalWeeks; week++) {
      const days = phaseForWeekNumber(phases, week)?.phase?.days || [];
      const dates = sessionDateKeys(purchase.startDate, week, days.length, trainingDays, purchase.weekdays);
      days.forEach((day, i) => {
        if (until && dates[i] >= until) return;
        const done = doneSessions.has(`${purchase.id}:${week}:${day.id}`);
        // An archived program's history is what was actually done (#169):
        // its sessions never done showed as still "to do" on days before it
        // was archived — a dot on Monday for a program switched away from.
        if (until && !done) return;
        const planned = sessionPlan?.[purchase.id]?.[sessionPlanKey(week, day.id)] || null;
        const dateKey = planned?.moveTo || dates[i];
        workoutDays.add(dateKey);
        push(dateKey, {
          type: "workout",
          id: `${purchase.id}:${week}:${day.id}`,
          title: day.label || "Workout",
          subtitle: `${program.name} · Week ${week}`,
          done,
          skipped: !!planned?.skipped,
          movedFrom: planned?.moveTo ? dates[i] : null,
          dateKey,
          purchase,
          source: purchase.source || "owned",
          programId: program.id,
          day,
          weekNumber: week,
        });
      });
    }
  }

  const addonPhases = Array.isArray(recoveryAddon?.recoveryPhases) ? recoveryAddon.recoveryPhases : null;
  const restFilled = new Set();
  for (const { start, totalWeeks, until } of programSpans) {
    for (let week = 1; week <= totalWeeks; week++) {
      const weekStart = addDays(start, (week - 1) * 7);
      const restDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((k) => !workoutDays.has(k) && !restFilled.has(k) && !(until && k >= until));
      const addonDays = addonPhases ? phaseForWeekNumber(addonPhases, week)?.phase?.days || [] : [];
      const placed = new Set();
      addonDays.slice(0, restDays.length).forEach((day, i) => {
        const key = restDays[Math.floor((i * restDays.length) / Math.min(addonDays.length, restDays.length))];
        placed.add(key);
        const sessionId = `${recoveryAddon.id}:${day.id}`;
        push(key, {
          type: "addon",
          id: `addon:${key}:${day.id}`,
          title: day.label || "Recovery session",
          subtitle: `${recoveryAddon.name} · Week ${week}`,
          done: addonDone.has(`${sessionId}|${key}`),
          addonId: recoveryAddon.id,
          sessionId,
          day,
          weekNumber: week,
          dateKey: key,
        });
      });
      for (const key of restDays) {
        restFilled.add(key);
        if (placed.has(key) || addonPhases) continue;
        push(key, { type: "recovery", id: `recovery:${key}`, title: "Active Recovery", subtitle: "Rest day — light cardio or mobility.", done: recoveryDays.has(key) });
      }
    }
  }

  // A day whose only values were synced from Apple Health (marked in its
  // `appleHealth` map — see src/lib/appleHealth.js) isn't a check-in;
  // steps sync in every day on their own.
  const handLogged = (m) => Object.keys(m).some((k) => !["id", "soloUserId", "date", "appleHealth"].includes(k) && !m.appleHealth?.[k]);
  const statsWeeks = new Set([...weighIns.map((w) => keyOf(w.date)), ...bodyMetrics.filter(handLogged).map((m) => keyOf(m.date))].filter(Boolean).map(mondayOf));
  const photoWeeks = new Set(progressPhotos.map((p) => keyOf(p.date)).filter(Boolean).map(mondayOf));
  const firstMonday = mondayOf(keyOf(accountCreatedAt) || fromKey);
  let monday = firstMonday < mondayOf(fromKey) ? mondayOf(fromKey) : firstMonday;
  while (monday <= toKey) {
    push(monday, { type: "bodystats", id: `bodystats:${monday}`, title: "Body Stats Check-in", subtitle: "Log your weight and body stats.", done: statsWeeks.has(monday) });
    push(monday, { type: "photos", id: `photos:${monday}`, title: "Progress Photos", subtitle: "Take this week's progress photos.", done: photoWeeks.has(monday) });
    monday = addDays(monday, 7);
  }

  return byDate;
}

// Where tapping a calendar entry goes — shared by the Calendar and My
// Training's day view so both behave the same. Returns { path, state } or
// null when the entry isn't actionable (done, or a future week/day that's
// still locked).
export function calendarItemTarget(item, { todayKey, soloUid, contentByProgramId }) {
  if (item.type === "recovery") return { path: "/solo/recovery" };
  if (item.type === "addon") {
    if (item.done || item.dateKey > todayKey) return null; // a future day's add-on session waits for its day
    return {
      path: "/solo/workout",
      state: { purchaseId: `${soloUid}_recovery`, programId: item.addonId, dayId: item.sessionId, weekNumber: item.dateKey, day: item.day },
    };
  }
  if (item.type === "bodystats" || item.type === "photos") return { path: "/solo/home", state: { soloTab: "progress" } };
  if (item.type === "planned") {
    if (item.done || item.dateKey > todayKey) return null; // waits for its day
    return { path: "/solo/workout", state: customSessionState(soloUid, item.session) };
  }
  if (item.type === "workout" && !item.done) {
    if (item.purchase.status === "paused" || item.purchase.locked) return null; // history only until it's resumed
    if (item.skipped) return null;
    const totalWeeks = (contentByProgramId[item.programId]?.phases || []).reduce((s, p) => s + (p.durationWeeks || 0), 0);
    const current = currentWeekNumber(item.purchase.startDate, totalWeeks);
    if (current == null || item.weekNumber > current) return null; // a future week — locked, same as My Training
    return {
      path: "/solo/workout",
      state: { purchaseId: item.purchase.id, programId: item.programId, dayId: item.day.id, weekNumber: item.weekNumber, day: item.day },
    };
  }
  return null;
}

export const sessionPlanKey = (week, dayId) => `${week}_${dayId}`;

// Planned program sessions from the last `daysBack` days (before today)
// that weren't done, skipped or already moved (#141) — what My Training
// offers to move to today or skip. Current program only.
export function missedSessions(byDate, todayKey, daysBack = 7) {
  const out = [];
  for (let i = daysBack; i >= 1; i--) {
    const key = addDays(todayKey, -i);
    for (const item of byDate[key] || []) {
      if (item.type !== "workout" || item.done || item.skipped || item.movedFrom) continue;
      if (!item.purchase?.current) continue;
      out.push({ ...item, dateKey: key });
    }
  }
  return out;
}

export function rangeKeys(daysBack, daysForward, today = localDateKey()) {
  return { fromKey: addDays(today, -daysBack), toKey: addDays(today, daysForward) };
}

export { addDays, DAY_MS };

// Moving a session to another day on the Calendar tab (#171, hold + drag).
// Only what's still to do, today or later: a program session of a running
// program (not done, not skipped) or one of their own planned sessions.
// Never history, check-ins or recovery (placed for them).
export function canMoveItem(item, todayKey) {
  if (!item || item.done || !item.dateKey || item.dateKey < todayKey) return false;
  if (item.type === "planned") return true;
  if (item.type !== "workout" || item.skipped) return false;
  return !item.purchase?.locked && item.purchase?.status !== "paused";
}

// The one write that puts `item` on `toKey` — the same records the missed-
// session move (#141, sessionPlan.moveTo) and the Plan sheet (#142,
// plannedSessions) use, so logs are never touched. Back on its own day
// clears the move. null when nothing should change.
export function planMove(item, toKey, todayKey) {
  if (!canMoveItem(item, todayKey) || !toKey || toKey < todayKey || toKey === item.dateKey) return null;
  if (item.type === "planned") return { kind: "planned", planId: item.planId, sessionId: item.session.id, date: toKey };
  const original = item.movedFrom || item.dateKey;
  return {
    kind: "session",
    purchaseId: item.purchase.id,
    key: sessionPlanKey(item.weekNumber, item.day.id),
    value: toKey === original ? null : { moveTo: toKey, at: Date.now() },
  };
}
