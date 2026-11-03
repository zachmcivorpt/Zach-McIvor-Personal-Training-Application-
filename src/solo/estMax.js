import { e1rm } from "./trainingRecap";

// Estimated max per lift over time (#150), for Progress. Pure, tested.
// Each session's point is the best estimated 1-rep max (Epley, the same
// `e1rm` the recap and share card use) from that session's sets of the
// lift. Bodyweight-only sets (no weight) don't count. Every point comes
// from their own logs.

const NON_LIFT = new Set(["Warm-up", "Cool-down", "Cardio", "Mobility", "Stretch"]);

export function estMaxSeries(logs = [], exercisesById = {}) {
  const byLift = {};
  for (const log of logs) {
    const at = Number(new Date(log?.date));
    if (!at) continue;
    for (const entry of log.entries || []) {
      const ex = exercisesById[entry.exerciseId];
      if (!ex || NON_LIFT.has(ex.category)) continue;
      const best = Math.max(0, ...(entry.sets || []).map((s) => e1rm(s.weight, s.reps)));
      if (!best) continue;
      const lift = (byLift[entry.exerciseId] = byLift[entry.exerciseId] || { exerciseId: entry.exerciseId, name: ex.name, points: {} });
      // One point per session (a log), the best of any entries of the lift.
      lift.points[log.id || at] = { date: at, value: Math.max(lift.points[log.id || at]?.value || 0, best) };
    }
  }
  return Object.values(byLift)
    .map((l) => {
      const points = Object.values(l.points)
        .sort((a, b) => a.date - b.date)
        .map((p) => ({ date: p.date, value: Math.round(p.value * 10) / 10 }));
      const first = points[0].value;
      const latest = points[points.length - 1].value;
      const best = Math.max(...points.map((p) => p.value));
      return { exerciseId: l.exerciseId, name: l.name, points, first, latest, best, change: Math.round((latest - first) * 10) / 10 };
    })
    // A chart needs two sessions. Their heaviest lifts first (squat,
    // deadlift…), so it opens on a big lift, not the most-logged accessory.
    .filter((l) => l.points.length >= 2)
    .sort((a, b) => b.best - a.best || b.points.length - a.points.length || a.name.localeCompare(b.name));
}
