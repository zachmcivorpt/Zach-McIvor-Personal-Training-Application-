// Numbers for the program-complete moment and the Monday recap (#141).
// Pure — everything comes from the customer's own soloWorkoutLogs (and the
// calendar for what was planned), never invented.
import { addDays, mondayOf } from "./soloCalendar";
import { localDateKey } from "../lib/dateKey";

// Estimated one-rep max (Epley) — the usual way to compare a set of 5 with
// a set of 8.
export function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

const setsOf = (log) => (log?.entries || []).flatMap((e) => (e.sets || []).map((s) => ({ ...s, exerciseId: e.exerciseId })));
const volumeOf = (logs) => Math.round(logs.reduce((sum, l) => sum + setsOf(l).reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0));
const prsOf = (logs) => logs.reduce((n, l) => n + setsOf(l).filter((s) => s.isPR).length, 0);
const dateOf = (log) => (typeof log?.date === "string" ? log.date.slice(0, 10) : log?.date != null ? localDateKey(new Date(log.date)) : null);

// The total sessions a program plans (every week's days).
export function plannedSessionCount(phases = []) {
  return (phases || []).reduce((n, p) => n + (Number(p.durationWeeks) || 0) * ((p.days || []).length || 0), 0);
}

// Is this program finished once `justLogged` ({ weekNumber, dayId }) is in?
export function programFinished(logs = [], purchaseId, phases = [], justLogged = null) {
  const total = plannedSessionCount(phases);
  if (!total) return false;
  const done = new Set(logs.filter((l) => l.purchaseId === purchaseId).map((l) => `${l.weekNumber}:${l.dayId}`));
  if (justLogged) done.add(`${justLogged.weekNumber}:${justLogged.dayId}`);
  return done.size >= total;
}

// A finished program's story: sessions, minutes, volume, PRs, and how much
// stronger on each lift done in more than one week (best estimated max in
// its first week vs its last week), biggest gains first.
export function programStats(logs = [], purchaseId) {
  const mine = logs.filter((l) => l.purchaseId === purchaseId);
  const byExercise = {};
  for (const log of mine) {
    const week = Number(log.weekNumber) || 0;
    for (const s of setsOf(log)) {
      const est = e1rm(s.weight, s.reps);
      if (!est) continue;
      const ex = (byExercise[s.exerciseId] = byExercise[s.exerciseId] || {});
      ex[week] = Math.max(ex[week] || 0, est);
    }
  }
  const strength = Object.entries(byExercise)
    .map(([exerciseId, weeks]) => {
      const ws = Object.keys(weeks).map(Number).sort((a, b) => a - b);
      if (ws.length < 2) return null;
      const first = weeks[ws[0]];
      const last = weeks[ws[ws.length - 1]];
      return { exerciseId, from: Math.round(first * 10) / 10, to: Math.round(last * 10) / 10, pct: Math.round(((last - first) / first) * 100) };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);
  return {
    sessions: mine.length,
    minutes: mine.reduce((n, l) => n + (Number(l.durationMin) || 0), 0),
    volume: volumeOf(mine),
    prs: prsOf(mine),
    strength,
  };
}

// Last week (Mon–Sun before this one) and this week, from the logs and the
// calendar (`byDate` from buildSoloCalendar covering both weeks).
export function weekRecap({ logs = [], byDate = {}, todayKey = localDateKey() }) {
  const thisMonday = mondayOf(todayKey);
  const lastMonday = addDays(thisMonday, -7);
  const priorMonday = addDays(thisMonday, -14);
  const inRange = (from, to) => logs.filter((l) => {
    const d = dateOf(l);
    return d && d >= from && d < to;
  });
  const lastWeekLogs = inRange(lastMonday, thisMonday);
  const priorWeekLogs = inRange(priorMonday, lastMonday);
  const workoutsIn = (from) => Array.from({ length: 7 }, (_, i) => byDate[addDays(from, i)] || []).flat().filter((i) => (i.type === "workout" || i.type === "planned") && !i.skipped);
  const plannedLast = workoutsIn(lastMonday);
  const plannedThis = workoutsIn(thisMonday);
  const volume = volumeOf(lastWeekLogs);
  const priorVolume = volumeOf(priorWeekLogs);
  return {
    lastMonday,
    thisMonday,
    sessionsDone: lastWeekLogs.length,
    planned: plannedLast.length,
    plannedDone: plannedLast.filter((i) => i.done).length,
    minutes: lastWeekLogs.reduce((n, l) => n + (Number(l.durationMin) || 0), 0),
    volume,
    volumeChangePct: priorVolume > 0 ? Math.round(((volume - priorVolume) / priorVolume) * 100) : null,
    prs: prsOf(lastWeekLogs),
    thisWeek: plannedThis.map((i) => ({ id: i.id, title: i.title, dateKey: i.dateKey })).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey))),
  };
}
