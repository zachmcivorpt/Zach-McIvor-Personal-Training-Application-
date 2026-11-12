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

// ---- This week (#220) -----------------------------------------------------
// The client's last 7 COMPLETED days (ending yesterday) on one card: planned
// sessions done, nutrition, steps, sleep, weight, kg lifted, best and stuck
// lifts. Every figure from their own logs; a figure with no data is null
// (shown as "–"), never 0.
export const DEFAULT_STEP_GOAL = 10000;

function dayKeys(now, days, offsetDays = 0) {
  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i - offsetDays);
    out.push({ key: localDateKey(d), weekday: d.toLocaleDateString(undefined, { weekday: "short" }), date: d });
  }
  return out;
}

function avg(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

export function weekScorecard({ workoutLogs, scheduledWorkouts, nutritionLogs, bodyMetrics, weighIns, targets, exercisesById, plateaus = [], now = Date.now(), stepGoal = DEFAULT_STEP_GOAL }) {
  const week = dayKeys(now, 7);
  const prevWeek = dayKeys(now, 7, 7);
  const keys = new Set(week.map((d) => d.key));
  const prevKeys = new Set(prevWeek.map((d) => d.key));
  const logs = (workoutLogs || []).slice();
  const logKey = (l) => localDateKey(new Date(l.date));
  const weekLogs = logs.filter((l) => keys.has(logKey(l)));
  const prevLogs = logs.filter((l) => prevKeys.has(logKey(l)));
  const trainedKeys = new Set(weekLogs.filter((l) => !l.cardio).map(logKey));
  const planned = new Set((scheduledWorkouts || []).filter((s) => keys.has(s.date)).map((s) => s.date));
  const nutritionByKey = Object.fromEntries((nutritionLogs || []).map((n) => [n.date, n]));
  const metricsByKey = Object.fromEntries((bodyMetrics || []).map((m) => [m.date, m]));

  const days = week.map(({ key, weekday }) => {
    const n = nutritionByKey[key];
    const logged = hasFoodLogged(n);
    const m = metricsByKey[key] || {};
    const steps = Number(m.steps) > 0 ? Number(m.steps) : null;
    const sleep = Number(m.sleepHours) > 0 ? Number(m.sleepHours) : null;
    let session = "rest";
    if (planned.has(key)) session = trainedKeys.has(key) ? "done" : "missed";
    else if (trainedKeys.has(key)) session = "extra";
    return {
      dateKey: key,
      weekday,
      session,
      logged,
      calorieHit: logged && targets.calories > 0 && Math.abs((n.calories || 0) - targets.calories) <= targets.calories * 0.12,
      proteinHit: logged && targets.protein > 0 && (n.protein || 0) >= targets.protein * 0.9,
      calories: logged ? Math.round(n.calories || 0) : null,
      steps,
      sleep,
    };
  });

  const plannedCount = days.filter((d) => d.session === "done" || d.session === "missed").length;
  const plannedDone = days.filter((d) => d.session === "done").length;
  const loggedDays = days.filter((d) => d.logged);
  const stepDays = days.filter((d) => d.steps !== null);
  const sleepDays = days.filter((d) => d.sleep !== null);
  const stepsAvg = stepDays.length ? Math.round(avg(stepDays.map((d) => d.steps))) : null;
  const weightIn = (set) => (weighIns || []).filter((w) => set.has(localDateKey(new Date(w.date))) && Number(w.weight) > 0).map((w) => Number(w.weight));
  const wNow = avg(weightIn(keys));
  const wPrev = avg(weightIn(prevKeys));
  const volume = (list) => list.reduce((a, l) => a + logVolume(l), 0);
  const lifted = volume(weekLogs);
  const liftedPrev = volume(prevLogs);

  return {
    from: week[0].key,
    to: week[6].key,
    days,
    sessions: { planned: plannedCount, done: plannedDone, total: trainedKeys.size, pct: plannedCount ? Math.round((plannedDone / plannedCount) * 100) : null },
    nutrition: {
      logged: loggedDays.length,
      calorieHits: days.filter((d) => d.calorieHit).length,
      proteinHits: days.filter((d) => d.proteinHit).length,
      avgCalories: loggedDays.length ? Math.round(avg(loggedDays.map((d) => d.calories))) : null,
    },
    steps: { avg: stepsAvg, goal: stepGoal, pct: stepsAvg === null ? null : Math.round((stepsAvg / stepGoal) * 100), days: stepDays.length },
    sleep: { avg: sleepDays.length ? Math.round(avg(sleepDays.map((d) => d.sleep)) * 10) / 10 : null },
    weight: { avg: wNow === null ? null : round1(wNow), change: wNow !== null && wPrev !== null ? round1(wNow - wPrev) : null },
    lifted: { kg: weekLogs.length ? lifted : null, changePct: weekLogs.length && liftedPrev > 0 ? Math.round(((lifted - liftedPrev) / liftedPrev) * 100) : null },
    bestLifts: bestLiftsThisWeek(logs, keys, exercisesById),
    stagnant: stagnantLifts(plateaus, logs, exercisesById),
  };
}

function bestSetOf(sets) {
  let best = null;
  (sets || []).forEach((s) => {
    const w = Number(s.weight);
    const r = Number(s.reps);
    if (!(w > 0 && r > 0)) return;
    const e1 = epley1RM(w, r);
    if (!best || e1 > best.e1rm) best = { weight: w, reps: r, e1rm: e1 };
  });
  return best;
}

// Each lift trained this week: its best set, est. max, change on the last
// session before this week, and PR when it beats every earlier session.
export function bestLiftsThisWeek(logs, weekKeySet, exercisesById, limit = 5) {
  const sorted = (logs || []).filter((l) => !l.cardio).sort((a, b) => a.date - b.date);
  const map = new Map();
  for (const log of sorted) {
    const inWeek = weekKeySet.has(localDateKey(new Date(log.date)));
    for (const e of log.entries || []) {
      const best = bestSetOf(e.sets);
      if (!e.exerciseId || !best) continue;
      const rec = map.get(e.exerciseId) || { before: [], week: null };
      if (inWeek) {
        if (!rec.week || best.e1rm > rec.week.e1rm) rec.week = best;
      } else if (!rec.week) rec.before.push(best);
      map.set(e.exerciseId, rec);
    }
  }
  return [...map.entries()]
    .filter(([, r]) => r.week)
    .map(([id, r]) => {
      const last = r.before[r.before.length - 1] || null;
      const allTime = r.before.reduce((m, b) => Math.max(m, b.e1rm), 0);
      return {
        id,
        name: exercisesById?.[id]?.name || "Exercise",
        set: r.week,
        e1rm: Math.round(r.week.e1rm),
        change: last ? Math.round(r.week.e1rm - last.e1rm) : null,
        pr: r.before.length > 0 && r.week.e1rm > allTime,
      };
    })
    .sort((a, b) => Number(b.pr) - Number(a.pr) || (b.change ?? -999) - (a.change ?? -999) || b.e1rm - a.e1rm)
    .slice(0, limit);
}

// computePlateaus' stuck lifts with their latest best set.
export function stagnantLifts(plateaus, logs, exercisesById) {
  return (plateaus || []).map((p) => {
    const latest = (logs || [])
      .filter((l) => (l.entries || []).some((e) => e.exerciseId === p.exerciseId))
      .sort((a, b) => b.date - a.date)[0];
    const best = latest ? bestSetOf(latest.entries.find((e) => e.exerciseId === p.exerciseId)?.sets) : null;
    return { id: p.exerciseId, name: exercisesById?.[p.exerciseId]?.name || p.exerciseName || "Exercise", sessions: p.sessions, set: best, e1rm: best ? Math.round(best.e1rm) : null };
  });
}
