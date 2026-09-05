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

// Simple double-progression suggestion: if the client hit (or beat) the
// target reps last time, the weight goes up (~2.5% of the previous
// weight, rounded to the nearest plate-friendly 2.5); otherwise the
// weight stays put and the target is just to add one more rep. This is
// what "auto fill" now suggests, instead of literally repeating last
// session's numbers.
export function suggestNextSet(prevSet, targetReps) {
  if (!prevSet || !prevSet.weight) return null;
  const prevWeight = Number(prevSet.weight);
  const prevReps = Number(prevSet.reps) || 0;
  const target = Number(targetReps) || prevReps || 1;
  if (prevReps >= target) {
    const raw = prevWeight * 1.025;
    const bumped = Math.max(prevWeight + 2.5, Math.round(raw / 2.5) * 2.5);
    return { weight: bumped, reps: target };
  }
  return { weight: prevWeight, reps: prevReps + 1 };
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
  { label: "Barbell Back Squat", match: (n) => n.includes("squat") && !n.includes("front") && !n.includes("split") },
  { label: "Deadlift", match: (n) => n.includes("deadlift") },
  { label: "Pull-ups", match: (n) => n.includes("pull-up") || n.includes("pull up") || n.includes("pullup") },
  { label: "Overhead Press", match: (n) => n.includes("overhead press") || n.includes("shoulder press") },
];

// The three big compound lifts always show on the Strength Personal Bests
// card, even with nothing logged yet — a coach/client both expect to see
// these tracked from day one, updating in place the moment a set is
// logged, rather than the card looking empty until then.
const ALWAYS_SHOW_LIFTS = new Set(["Barbell Back Squat", "Deadlift", "Bench Press"]);

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
    if (!b) return ALWAYS_SHOW_LIFTS.has(k.label) ? { name: k.label, value: null } : null;
    return { name: k.label, value: b.weight > 0 ? `${b.weight} kg × ${b.reps}` : `${b.reps} Repetitions` };
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

// A single 30(ish)-day snapshot: session frequency, PRs, strength trend
// (average e1RM % change across whichever key lifts were actually logged
// both before and inside the window), and bodyweight change. Any figure
// without enough data to be meaningful comes back null rather than a
// misleading zero.
export function computePerformanceTimeline(logs, weighIns, exercisesById, days = 30) {
  const cutoff = Date.now() - days * DAY_MS;
  const sessionsCount = logs.filter((l) => l.date >= cutoff).length;
  const sessionsPerWeek = Math.round((sessionsCount / (days / 7)) * 10) / 10;
  const prCount = computePRsInLastNDays(logs, days);

  const exList = Object.values(exercisesById || {});
  const liftDeltas = [];
  KEY_LIFTS.forEach((lift) => {
    const ex = exList.find((e) => lift.match(e.name.toLowerCase()));
    if (!ex) return;
    let before = 0;
    let within = 0;
    logs.forEach((log) => {
      const entry = log.entries.find((e) => e.exerciseId === ex.id);
      if (!entry) return;
      entry.sets.forEach((s) => {
        const e1 = epley1RM(s.weight, s.reps);
        if (e1 <= 0) return;
        if (log.date < cutoff) {
          if (e1 > before) before = e1;
        } else if (e1 > within) {
          within = e1;
        }
      });
    });
    if (before > 0 && within > 0) liftDeltas.push(((within - before) / before) * 100);
  });
  const strengthChangePct = liftDeltas.length
    ? Math.round((liftDeltas.reduce((a, b) => a + b, 0) / liftDeltas.length) * 10) / 10
    : null;

  const sortedWeighIns = [...(weighIns || [])].sort((a, b) => a.date - b.date);
  const beforeWindow = sortedWeighIns.filter((w) => w.date < cutoff);
  const withinOrAfter = sortedWeighIns.filter((w) => w.date >= cutoff);
  const bodyweightChange =
    beforeWindow.length && withinOrAfter.length
      ? Math.round((withinOrAfter[withinOrAfter.length - 1].weight - beforeWindow[beforeWindow.length - 1].weight) * 10) / 10
      : null;

  return { days, sessionsCount, sessionsPerWeek, prCount, strengthChangePct, bodyweightChange };
}

// The weigh-in logged closest to a given timestamp — within 3 days either
// way, so a progress photo from long before any weigh-in existed doesn't
// get paired with a wildly unrelated number. Used to caption a progress
// photo with "what did they weigh around this time."
export function closestWeighIn(weighIns, ts, maxDays = 3) {
  if (!weighIns || weighIns.length === 0) return null;
  let best = null;
  let bestDiff = Infinity;
  weighIns.forEach((w) => {
    const diff = Math.abs(w.date - ts);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = w;
    }
  });
  if (bestDiff > maxDays * 86400000) return null;
  return best;
}

export function computeSessionsThisWeek(logs) {
  const cutoff = Date.now() - 7 * DAY_MS;
  return logs.filter((l) => l.date >= cutoff).length;
}

// This calendar week's (Monday-start) scheduled-vs-completed count — a
// concrete "2 of 4 sessions done (50%)" instead of a 30-day average that's
// hard to read at a glance. Comes back with pct: null (not 0%) when
// nothing's been scheduled for this week at all, so an unused calendar
// doesn't look like a missed week.
export function computeWeeklySessionCompletion(logs, scheduledWorkouts) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const weekDates = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    })
  );
  const scheduledThisWeek = (scheduledWorkouts || []).filter((w) => weekDates.has(w.date));
  if (scheduledThisWeek.length === 0) return { completed: 0, expected: 0, pct: null };
  const loggedDates = new Set((logs || []).map((l) => new Date(l.date).toISOString().slice(0, 10)));
  const completed = scheduledThisWeek.filter((w) => loggedDates.has(w.date)).length;
  return { completed, expected: scheduledThisWeek.length, pct: Math.round((completed / scheduledThisWeek.length) * 100) };
}

// Kg lifted so far this calendar month — sits on the Performance Timeline
// alongside Strength/Bodyweight/PRs so training volume gets equal billing
// without needing to dig into the full Weekly Training Volume chart.
export function computeMonthlyVolume(logs) {
  const now = new Date();
  const total = (logs || [])
    .filter((l) => {
      const d = new Date(l.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce(
      (a, log) => a + (log.entries || []).reduce((b, e) => b + (e.sets || []).reduce((c, s) => c + (s.weight || 0) * (s.reps || 0), 0), 0),
      0
    );
  return Math.round(total);
}

// Same idea as computeWeeklySessionCompletion but for the current calendar
// month — completed scheduled sessions / planned scheduled sessions * 100.
// Comes back with pct: null (not 0%) when nothing's scheduled this month.
export function computeMonthlyConsistency(logs, scheduledWorkouts) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const scheduledThisMonth = (scheduledWorkouts || []).filter((w) => w.date.startsWith(monthPrefix));
  if (scheduledThisMonth.length === 0) return { completed: 0, expected: 0, pct: null };
  const loggedDates = new Set((logs || []).map((l) => new Date(l.date).toISOString().slice(0, 10)));
  const completed = scheduledThisMonth.filter((w) => loggedDates.has(w.date)).length;
  return { completed, expected: scheduledThisMonth.length, pct: Math.round((completed / scheduledThisMonth.length) * 100) };
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

// Consecutive SCHEDULED workout days (most recent first, counting back from
// today) that were actually completed — resets to 0 the moment a scheduled
// day was missed, unlike computeWeeklyStreak which only cares that *some*
// workout happened that week. Today's own scheduled session doesn't break
// the streak while it simply hasn't been done yet — the day isn't over.
export function computeWorkoutStreak(logs, scheduledWorkouts) {
  if (!scheduledWorkouts || scheduledWorkouts.length === 0) return 0;
  const completedDates = new Set((logs || []).map((l) => new Date(l.date).toISOString().slice(0, 10)));
  const todayKey = new Date().toISOString().slice(0, 10);
  const pastScheduled = scheduledWorkouts
    .map((w) => w.date)
    .filter((d) => d <= todayKey)
    .sort()
    .reverse();
  let streak = 0;
  for (const d of pastScheduled) {
    if (completedDates.has(d)) streak++;
    else if (d !== todayKey) break;
  }
  return streak;
}

const PLATEAU_WINDOW_MS = 21 * DAY_MS;
const PLATEAU_MIN_SESSIONS = 3;

// Exercises trained at least PLATEAU_MIN_SESSIONS times in the last 3 weeks
// whose best e1RM in that window hasn't beaten whatever they were already
// hitting before it (a couple percent of noise allowed) — i.e. genuinely
// stuck, not just "haven't trained it enough to tell." An exercise with no
// sessions before the window (brand new to the program) can't plateau yet,
// so it's skipped rather than flagged on zero data.
export function computePlateaus(logs, exercisesById) {
  const now = Date.now();
  const windowStart = now - PLATEAU_WINDOW_MS;
  const byExercise = {};
  (logs || []).forEach((log) => {
    if (log.cardio) return;
    (log.entries || []).forEach((entry) => {
      let best = 0;
      (entry.sets || []).forEach((s) => {
        const e1 = epley1RM(s.weight, s.reps);
        if (e1 > best) best = e1;
      });
      if (best <= 0) return;
      if (!byExercise[entry.exerciseId]) byExercise[entry.exerciseId] = [];
      byExercise[entry.exerciseId].push({ date: log.date, e1rm: best });
    });
  });

  const plateaus = [];
  Object.entries(byExercise).forEach(([exerciseId, entries]) => {
    const inWindow = entries.filter((e) => e.date >= windowStart);
    const before = entries.filter((e) => e.date < windowStart);
    if (inWindow.length < PLATEAU_MIN_SESSIONS || before.length === 0) return;
    const bestInWindow = Math.max(...inWindow.map((e) => e.e1rm));
    const bestBefore = Math.max(...before.map((e) => e.e1rm));
    if (bestInWindow <= bestBefore * 1.02) {
      plateaus.push({
        exerciseId,
        exerciseName: exercisesById[exerciseId]?.name || "Exercise",
        sessions: inWindow.length,
        currentBest: Math.round(bestInWindow),
      });
    }
  });
  return plateaus.sort((a, b) => b.sessions - a.sessions);
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
