// Real, computed training stats — everything here is derived from the
// client's own logged workouts (and weigh-ins), never illustrative/demo
// data. Replaces the old mock wearable-style metrics.

const DAY_MS = 86400000;

function epley1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function isoWeekKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Total volume (kg lifted) per week, most recent `weeks` weeks that have data.
export function computeWeeklyVolume(logs, weeks = 8) {
  const buckets = {};
  logs.forEach((log) => {
    const key = isoWeekKey(log.date);
    const vol = log.entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.weight || 0) * (s.reps || 0), 0), 0);
    buckets[key] = (buckets[key] || 0) + vol;
  });
  const keys = Object.keys(buckets).sort().slice(-weeks);
  return keys.map((k) => ({ week: fmtDate(k), volume: Math.round(buckets[k]) }));
}

// Cumulative workout count per week — a real "training consistency over time" line.
export function computeWorkoutsSeries(logs, weeks = 12) {
  const buckets = {};
  logs.forEach((l) => {
    const k = isoWeekKey(l.date);
    buckets[k] = (buckets[k] || 0) + 1;
  });
  const keys = Object.keys(buckets).sort();
  const recent = keys.slice(-weeks);
  let cum = keys.slice(0, keys.length - recent.length).reduce((a, k) => a + buckets[k], 0);
  return recent.map((k) => {
    cum += buckets[k];
    return { date: fmtDate(k), value: cum };
  });
}

// e1RM progression for one exercise — one point per session it was logged,
// using the best set of that session.
export function computeE1RMHistory(logs, exerciseId) {
  const sorted = [...logs].sort((a, b) => a.date - b.date);
  const points = [];
  sorted.forEach((log) => {
    const entry = log.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry || !entry.sets.length) return;
    let best = 0;
    entry.sets.forEach((s) => {
      const e1 = epley1RM(s.weight, s.reps);
      if (e1 > best) best = e1;
    });
    if (best > 0) points.push({ date: fmtDate(log.date), value: best });
  });
  return points;
}

const KEY_LIFTS = [
  { label: "Bench Press", match: (n) => n.includes("bench press") },
  { label: "Back Squat", match: (n) => n.includes("squat") && !n.includes("front") && !n.includes("split") },
  { label: "Deadlift", match: (n) => n.includes("deadlift") },
  { label: "Pull-ups", match: (n) => n.includes("pull-up") || n.includes("pull up") || n.includes("pullup") },
  { label: "Overhead Press", match: (n) => n.includes("overhead press") || n.includes("shoulder press") },
];

export function findExerciseByKeyword(exercises, label) {
  const lift = KEY_LIFTS.find((k) => k.label === label);
  if (!lift) return null;
  return exercises.find((e) => lift.match(e.name.toLowerCase())) || null;
}

// Best-ever set for a curated list of "main lift" exercises — only lifts
// the client has actually logged show up.
export function computePersonalBests(logs, exercisesById) {
  const best = {};
  logs.forEach((log) => {
    log.entries.forEach((entry) => {
      const ex = exercisesById[entry.exerciseId];
      if (!ex) return;
      const nameLower = ex.name.toLowerCase();
      const lift = KEY_LIFTS.find((k) => k.match(nameLower));
      if (!lift) return;
      entry.sets.forEach((s) => {
        if (!s.reps) return;
        const score = s.weight > 0 ? epley1RM(s.weight, s.reps) : s.reps;
        const cur = best[lift.label];
        if (!cur || score > cur.score) best[lift.label] = { weight: s.weight, reps: s.reps, score };
      });
    });
  });
  return KEY_LIFTS.map((k) => {
    const b = best[k.label];
    if (!b) return null;
    return { name: k.label, value: b.weight > 0 ? `${b.weight} kg × ${b.reps}` : `${b.reps} reps` };
  }).filter(Boolean);
}

export function computePRsInLastNDays(logs, days = 30) {
  const cutoff = Date.now() - days * DAY_MS;
  let count = 0;
  logs.forEach((l) => {
    if (l.date < cutoff) return;
    l.entries.forEach((e) => e.sets.forEach((s) => s.isPR && count++));
  });
  return count;
}

export function computeSessionsThisWeek(logs) {
  const cutoff = Date.now() - 7 * DAY_MS;
  return logs.filter((l) => l.date >= cutoff).length;
}

// Consecutive weeks (most recent first) with at least one logged workout.
// A week that's still in progress (this week) doesn't break the streak if
// it simply has no logs yet.
export function computeWeeklyStreak(logs) {
  if (!logs.length) return 0;
  const weeksWithLogs = new Set(logs.map((l) => isoWeekKey(l.date)));
  let cursor = Date.now();
  let key = isoWeekKey(cursor);
  if (!weeksWithLogs.has(key)) {
    cursor -= 7 * DAY_MS;
    key = isoWeekKey(cursor);
  }
  let streak = 0;
  while (weeksWithLogs.has(key)) {
    streak++;
    cursor -= 7 * DAY_MS;
    key = isoWeekKey(cursor);
  }
  return streak;
}

// Milestone badges — only ones actually earned show up.
export function computeAchievements(logs) {
  const badges = [];
  const total = logs.length;
  const milestone = [100, 50, 25, 10, 5, 1].find((m) => total >= m);
  if (milestone) badges.push({ id: `w${milestone}`, icon: "🏆", label: `${milestone}+ workouts completed` });

  const prsThisWeek = computePRsInLastNDays(logs, 7);
  if (prsThisWeek > 0) badges.push({ id: "pr-week", icon: "💪", label: "New PR this week" });

  const streak = computeWeeklyStreak(logs);
  if (streak >= 2) badges.push({ id: `streak${streak}`, icon: "🔥", label: `${streak}-week training streak` });

  return badges;
}
