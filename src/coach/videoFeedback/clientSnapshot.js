// The numbers the coach talks through while recording video feedback
// (#219): read-only summaries of a client's own logs. Every figure comes
// from their data; nothing is estimated. Date maths uses the `now` it's
// given, never the device clock behind its back.
import { localDateKey } from "../../lib/dateKey";
import { hasFoodLogged } from "../../lib/nutritionLog";
import { epley1RM } from "../../lib/trainingStats";

const DAY = 86400000;

const round1 = (n) => Math.round(n * 10) / 10;

export function weightSummary(weighIns, now = Date.now()) {
  const series = (weighIns || [])
    .filter((w) => Number.isFinite(Number(w.weight)) && Number(w.weight) > 0)
    .map((w) => ({ date: w.date, weight: Number(w.weight) }))
    .sort((a, b) => a.date - b.date);
  if (series.length === 0) return { series, latest: null };
  const latest = series[series.length - 1];
  const at = (daysAgo) => {
    const cutoff = now - daysAgo * DAY;
    const before = series.filter((p) => p.date <= cutoff);
    return before.length ? before[before.length - 1] : null;
  };
  const change = (p) => (p ? round1(latest.weight - p.weight) : null);
  const last7 = series.filter((p) => p.date > now - 7 * DAY);
  return {
    series,
    latest,
    start: series[0],
    change7: change(at(7)),
    change28: change(at(28)),
    changeAll: series.length > 1 ? round1(latest.weight - series[0].weight) : null,
    avg7: last7.length ? round1(last7.reduce((a, p) => a + p.weight, 0) / last7.length) : null,
  };
}

// The last `days` COMPLETED days (ending yesterday), same thresholds as the
// coach's Nutrition Adherence card: calories within 12%, protein >= 90%.
export function nutritionWeek(nutritionLogs, targets, now = Date.now(), days = 7) {
  const byDate = Object.fromEntries((nutritionLogs || []).map((n) => [n.date, n]));
  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const entry = byDate[key];
    const logged = hasFoodLogged(entry);
    out.push({
      dateKey: key,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      logged,
      calories: logged ? Math.round(entry.calories || 0) : null,
      protein: logged ? Math.round(entry.protein || 0) : null,
      carbs: logged ? Math.round(entry.carbs || 0) : null,
      fat: logged ? Math.round(entry.fat || 0) : null,
      calorieHit: logged && targets.calories > 0 && Math.abs((entry.calories || 0) - targets.calories) <= targets.calories * 0.12,
      proteinHit: logged && targets.protein > 0 && (entry.protein || 0) >= targets.protein * 0.9,
    });
  }
  const logged = out.filter((d) => d.logged);
  const avg = (k) => (logged.length ? Math.round(logged.reduce((a, d) => a + d[k], 0) / logged.length) : null);
  return {
    days: out,
    loggedCount: logged.length,
    calorieHits: out.filter((d) => d.calorieHit).length,
    proteinHits: out.filter((d) => d.proteinHit).length,
    avgCalories: avg("calories"),
    avgProtein: avg("protein"),
    avgCarbs: avg("carbs"),
    avgFat: avg("fat"),
  };
}

export function logVolume(log) {
  return Math.round(
    (log.entries || []).reduce((a, e) => a + (e.sets || []).reduce((b, s) => b + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0)
  );
}

export function logSetCount(log) {
  return (log.entries || []).reduce((a, e) => a + (e.sets || []).length, 0);
}

// This calendar week (Mon–Sun) of planned sessions, each marked done when a
// log exists for that day, plus the recent completed sessions.
export function trainingWeek(workoutLogs, scheduledWorkouts, now = Date.now()) {
  const today = new Date(now);
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return localDateKey(d);
  });
  const logs = (workoutLogs || []).slice().sort((a, b) => b.date - a.date);
  const loggedKeys = new Set(logs.map((l) => localDateKey(new Date(l.date))));
  const planned = (scheduledWorkouts || [])
    .filter((s) => weekKeys.includes(s.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ dateKey: s.date, label: s.dayLabel || s.label || s.name || "Session", done: loggedKeys.has(s.date) }));
  const last7 = logs.filter((l) => l.date > now - 7 * DAY);
  return {
    planned,
    plannedDone: planned.filter((p) => p.done).length,
    completed7: last7.length,
    volume7: last7.reduce((a, l) => a + logVolume(l), 0),
    recent: logs.slice(0, 12).map((l) => ({
      id: l.id,
      date: l.date,
      label: l.dayLabel || "Workout",
      sets: logSetCount(l),
      volume: logVolume(l),
      cardio: l.cardio || null,
      entries: l.entries || [],
    })),
  };
}

// The client's most-trained lifts over the last 8 weeks, each with its best
// set per session and the estimated max first -> latest.
export function liftProgress(workoutLogs, exercisesById, now = Date.now(), limit = 8) {
  const since = now - 56 * DAY;
  const byExercise = new Map();
  (workoutLogs || [])
    .filter((l) => l.date >= since)
    .sort((a, b) => a.date - b.date)
    .forEach((log) => {
      (log.entries || []).forEach((e) => {
        const sets = (e.sets || []).filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
        if (!e.exerciseId || sets.length === 0) return;
        let best = null;
        sets.forEach((s) => {
          const e1 = epley1RM(Number(s.weight), Number(s.reps));
          if (!best || e1 > best.e1rm) best = { weight: Number(s.weight), reps: Number(s.reps), e1rm: e1 };
        });
        const list = byExercise.get(e.exerciseId) || [];
        list.push({ date: log.date, ...best, sets: sets.map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) })) });
        byExercise.set(e.exerciseId, list);
      });
    });
  return [...byExercise.entries()]
    .map(([id, sessions]) => ({
      id,
      name: exercisesById?.[id]?.name || "Exercise",
      sessions,
      firstE1rm: Math.round(sessions[0].e1rm),
      latestE1rm: Math.round(sessions[sessions.length - 1].e1rm),
      change: Math.round(sessions[sessions.length - 1].e1rm - sessions[0].e1rm),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// First and latest value of every body measurement the client has logged.
export function measurementChanges(bodyMetrics, configs) {
  const days = (bodyMetrics || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return configs
    .map((cfg) => {
      const points = days.filter((d) => d[cfg.key] != null && d[cfg.key] !== "").map((d) => ({ date: d.date, value: Number(d[cfg.key]) }));
      if (points.length === 0) return null;
      const first = points[0];
      const latest = points[points.length - 1];
      return { key: cfg.key, label: cfg.label, unit: cfg.unit, first, latest, change: points.length > 1 ? round1(latest.value - first.value) : null };
    })
    .filter(Boolean);
}
