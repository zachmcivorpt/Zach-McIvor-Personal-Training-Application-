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
import { localDateKey } from "../lib/dateKey";
import { phaseForWeekNumber } from "./weekProgress";

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

  for (const purchase of purchases) {
    const program = programsById[purchase.programId];
    const phases = contentByProgramId[purchase.programId]?.phases;
    if (!program || !purchase.startDate || !Array.isArray(phases)) continue;
    const totalWeeks = phases.reduce((sum, p) => sum + (p.durationWeeks || 0), 0);
    for (let week = 1; week <= totalWeeks; week++) {
      const days = phaseForWeekNumber(phases, week)?.phase?.days || [];
      const offsets = sessionOffsets(days.length);
      const weekStart = addDays(purchase.startDate, (week - 1) * 7);
      days.forEach((day, i) => {
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
