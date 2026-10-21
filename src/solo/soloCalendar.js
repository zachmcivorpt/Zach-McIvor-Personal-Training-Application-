// Builds a Train Solo customer's calendar from data they already have — no
// separate "scheduled" collection. Three kinds of entry:
//
//  - Program workouts: every owned program with a start date lays its
//    weeks out from that date. A program day has no fixed weekday of its
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
//  - Active Recovery: every other rest day inside a started program's
//    span. Done once any Active Recovery session is logged that day.
import { localDateKey } from "../lib/dateKey";
import { phaseForWeekNumber } from "./weekProgress";
import { isRecoveryLog } from "./activeRecovery";

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

  for (const purchase of purchases) {
    const program = programsById[purchase.programId];
    const phases = contentByProgramId[purchase.programId]?.phases;
    if (!program || !purchase.startDate || !Array.isArray(phases)) continue;
    const totalWeeks = phases.reduce((sum, p) => sum + (p.durationWeeks || 0), 0);
    if (totalWeeks > 0) programSpans.push({ start: purchase.startDate, totalWeeks });
    for (let week = 1; week <= totalWeeks; week++) {
      const days = phaseForWeekNumber(phases, week)?.phase?.days || [];
      const offsets = sessionOffsets(days.length);
      const weekStart = addDays(purchase.startDate, (week - 1) * 7);
      days.forEach((day, i) => {
        workoutDays.add(addDays(weekStart, offsets[i]));
        push(addDays(weekStart, offsets[i]), {
          type: "workout",
          id: `${purchase.id}:${week}:${day.id}`,
          title: day.label || "Workout",
          subtitle: `${program.name} · Week ${week}`,
          done: doneSessions.has(`${purchase.id}:${week}:${day.id}`),
          purchase,
          programId: program.id,
          day,
          weekNumber: week,
        });
      });
    }
  }

  const addonPhases = Array.isArray(recoveryAddon?.recoveryPhases) ? recoveryAddon.recoveryPhases : null;
  const restFilled = new Set();
  for (const { start, totalWeeks } of programSpans) {
    for (let week = 1; week <= totalWeeks; week++) {
      const weekStart = addDays(start, (week - 1) * 7);
      const restDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((k) => !workoutDays.has(k) && !restFilled.has(k));
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
        if (placed.has(key)) continue;
        push(key, { type: "recovery", id: `recovery:${key}`, title: "Active Recovery", subtitle: "Rest day — light cardio or mobility.", done: recoveryDays.has(key) });
      }
    }
  }

  const statsWeeks = new Set([...weighIns.map((w) => keyOf(w.date)), ...bodyMetrics.map((m) => keyOf(m.date))].filter(Boolean).map(mondayOf));
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

export function rangeKeys(daysBack, daysForward, today = localDateKey()) {
  return { fromKey: addDays(today, -daysBack), toKey: addDays(today, daysForward) };
}

export { addDays, DAY_MS };
