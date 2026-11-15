// Train Solo training insights (#236): short lines from the member's own
// logs. An insight only exists when the data supports it — every figure is
// counted from soloWorkoutLogs (and the goal's own progress). Pure.
import { localDateKey } from "../lib/dateKey";
import { addDays, mondayOf } from "./soloCalendar";
import { e1rm } from "./trainingRecap";

const dateOf = (log) => (typeof log?.date === "string" ? log.date.slice(0, 10) : log?.date != null ? localDateKey(new Date(log.date)) : null);
const volumeOf = (logs) => logs.reduce((sum, l) => sum + (l.entries || []).reduce((a, e) => a + (e.sets || []).reduce((b, s) => b + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0), 0);
const prsOf = (logs) => logs.reduce((n, l) => n + (l.entries || []).reduce((a, e) => a + (e.sets || []).filter((s) => s.isPR).length, 0), 0);
const kg = (n) => `${Math.round(n * 10) / 10} kg`;
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n) => (n < 10 ? words[n] : String(n));

function between(logs, from, to) {
  return logs.filter((l) => {
    const d = dateOf(l);
    return d && d >= from && d < to;
  });
}

// The lift whose top set has gone up most over the last 8 weeks (first
// week it was done in that window vs its latest week). Needs 2+ weeks and
// at least 2.5 kg.
export function biggestLiftGain(logs = [], exercisesById = {}, todayKey = localDateKey(), onlyExerciseId = null) {
  const from = addDays(mondayOf(todayKey), -7 * 7);
  const byEx = {};
  for (const log of between(logs, from, addDays(todayKey, 1))) {
    const wk = mondayOf(dateOf(log));
    for (const e of log.entries || []) {
      const top = Math.max(0, ...(e.sets || []).filter((s) => Number(s.reps) >= 1).map((s) => Number(s.weight) || 0));
      if (!top) continue;
      const x = (byEx[e.exerciseId] = byEx[e.exerciseId] || {});
      x[wk] = Math.max(x[wk] || 0, top);
    }
  }
  let best = null;
  for (const [id, weeks] of Object.entries(byEx)) {
    if (onlyExerciseId && id !== onlyExerciseId) continue;
    const ks = Object.keys(weeks).sort();
    if (ks.length < 2) continue;
    const gain = weeks[ks[ks.length - 1]] - weeks[ks[0]];
    const span = Math.max(1, Math.round((Date.parse(ks[ks.length - 1]) - Date.parse(ks[0])) / (7 * 86400000)));
    if (gain >= 2.5 && (!best || gain > best.gain)) best = { exerciseId: id, name: exercisesById[id]?.name, gain, weeks: span };
  }
  return best && best.name ? best : null;
}

// Consecutive weeks with at least one session, counting this week once
// they've trained in it.
export function weeksTrainedInARow(logs = [], todayKey = localDateKey()) {
  const trained = new Set(logs.map((l) => dateOf(l)).filter(Boolean).map((d) => mondayOf(d)));
  let k = mondayOf(todayKey);
  if (!trained.has(k)) k = addDays(k, -7);
  let n = 0;
  while (trained.has(k)) {
    n += 1;
    k = addDays(k, -7);
  }
  return n;
}

// Lifts whose best estimated max in [from, to) beat everything before
// `from`, biggest gains first.
export function strengthGains(logs = [], exercisesById = {}, from, to) {
  const before = {};
  const during = {};
  for (const log of logs) {
    const d = dateOf(log);
    if (!d || d >= to) continue;
    const bucket = d < from ? before : during;
    for (const e of log.entries || []) for (const s of e.sets || []) bucket[e.exerciseId] = Math.max(bucket[e.exerciseId] || 0, e1rm(s.weight, s.reps));
  }
  return Object.entries(during)
    .filter(([id, v]) => before[id] > 0 && v - before[id] >= 1)
    .map(([id, v]) => ({ exerciseId: id, name: exercisesById[id]?.name || "Lift", from: Math.round(before[id] * 10) / 10, to: Math.round(v * 10) / 10, gain: Math.round((v - before[id]) * 10) / 10 }))
    .sort((a, b) => b.gain - a.gain);
}

// Every insight their data supports right now, most important first.
// `goal` + `progress` (goals.js) tie the goal in.
export function buildInsights({ logs = [], exercisesById = {}, goal = null, progress = null, todayKey = localDateKey() } = {}) {
  const out = [];
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const tomorrow = addDays(todayKey, 1);
  const month = between(logs, monthStart, tomorrow);

  // The goal itself is always on screen beside an insight, so insights
  // never repeat it; they tie into it instead (the goal's lift first, and
  // how far is left).
  const toGo = goal && progress && !progress.done && progress.left && !progress.needsWeight ? progress.left.replace(/ to go$/, "") : null;
  const goalLift = goal?.type === "lift" ? biggestLiftGain(logs, exercisesById, todayKey, goal.exerciseId) : null;
  const lift = goalLift || biggestLiftGain(logs, exercisesById, todayKey);
  if (lift) {
    const tie = goalLift && toGo ? ` — ${toGo} from your goal` : "";
    out.push({ id: `lift:${lift.exerciseId}`, priority: goalLift ? 85 : 80, text: `Your ${lift.name.toLowerCase()} is up ${kg(lift.gain)} in ${lift.weeks} week${lift.weeks === 1 ? "" : "s"}${tie}.` });
  }
  const prs = prsOf(month);
  if (prs >= 2) out.push({ id: "prs", priority: 70, text: `You've set ${count(prs)} new personal records this month.` });
  if (month.length >= 3) {
    const tie = goal?.type === "workouts" && toGo ? ` — ${toGo} to your goal` : "";
    out.push({ id: "month", priority: goal?.type === "workouts" ? 75 : 60, text: `You've completed ${month.length} workouts this month${tie}.` });
  }
  // Volume only compares like with like: 2+ sessions in both four-week spans
  // (one session before would make any month look like a huge jump).
  const recentLogs = between(logs, addDays(todayKey, -27), tomorrow);
  const priorLogs = between(logs, addDays(todayKey, -55), addDays(todayKey, -27));
  const recent = volumeOf(recentLogs);
  const prior = volumeOf(priorLogs);
  if (recentLogs.length >= 2 && priorLogs.length >= 2 && prior > 0 && recent > prior) {
    const pct = Math.round(((recent - prior) / prior) * 100);
    if (pct >= 5) out.push({ id: "volume", priority: 50, text: `Your training volume is up ${pct}% on the four weeks before.` });
  }
  const streak = weeksTrainedInARow(logs, todayKey);
  if (streak >= 3) out.push({ id: "streak", priority: 40, text: `You've trained every week for ${streak} weeks.` });
  return out.sort((a, b) => b.priority - a.priority);
}

// The one for today: the strongest few take turns day by day, so the same
// line isn't there every time they open the app.
export function insightForToday(insights = [], todayKey = localDateKey()) {
  if (!insights.length) return null;
  const pool = insights.slice(0, Math.min(4, insights.length));
  const day = Math.floor(Date.parse(`${todayKey}T00:00:00Z`) / 86400000);
  return pool[day % pool.length];
}

// After a workout: one achievement worth saying, or nothing. A goal
// milestone first, then a lift that beat its best, then a round number of
// workouts. `logId` is the workout just saved.
export function workoutHighlight({ logs = [], exercisesById = {}, logId, milestone = null }) {
  if (milestone) {
    return milestone >= 1 ? "Goal reached. That's what consistency does." : `${Math.round(milestone * 100)}% of the way to your goal.`;
  }
  const log = logs.find((l) => l.id === logId);
  if (!log) return null;
  const others = logs.filter((l) => l.id !== logId);
  let best = null;
  for (const e of log.entries || []) {
    const now = Math.max(0, ...(e.sets || []).map((s) => e1rm(s.weight, s.reps)));
    const prev = Math.max(0, ...others.flatMap((l) => (l.entries || []).filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => (x.sets || []).map((s) => e1rm(s.weight, s.reps)))));
    const gain = Math.round((now - prev) * 10) / 10;
    if (prev > 0 && gain >= 1 && exercisesById[e.exerciseId]?.name && (!best || gain > best.gain)) best = { name: exercisesById[e.exerciseId].name, gain };
  }
  if (best) return `Your best ${best.name.toLowerCase()} yet — estimated max up ${kg(best.gain)}.`;
  const n = logs.length;
  if ([10, 25, 50, 75, 100, 150, 200, 250, 300].includes(n)) return `That's ${n} workouts logged.`;
  return null;
}

// The review's opening line: what the week was, in a sentence.
export function reviewHeadline(recap) {
  if (!recap) return "";
  if (recap.planned > 0 && recap.plannedDone >= recap.planned) return "Every planned session. Done.";
  if (recap.prs > 0) {
    if (recap.prs === 1) return "A new personal record this week.";
    const n = count(recap.prs);
    return `${n[0].toUpperCase()}${n.slice(1)} new personal records this week.`;
  }
  if (recap.sessionsDone >= 3) return "A solid week of training.";
  if (recap.sessionsDone > 0) return "You showed up. That's how it starts.";
  return "A quiet week. Next week is a fresh start.";
}

// One thing to aim for next week, from how this one went.
export function weeklyFocus({ recap, goal = null, progress = null, nextPlanned = 0 }) {
  if (!recap) return null;
  if (recap.sessionsDone === 0) {
    return nextPlanned > 0 ? `Get your first session of the week done early — ${nextPlanned} planned.` : "Plan two sessions for next week and do the first one early.";
  }
  if (recap.planned > 0 && recap.plannedDone < recap.planned) {
    return `Hit all ${nextPlanned || recap.planned} planned sessions. Missed one? Move it, don't skip it.`;
  }
  if (goal && progress && !progress.done && progress.left && !progress.needsWeight) {
    // An action, not the distance again (the goal is right above it).
    if (goal.type === "lift") return `Add 2.5 kg to your ${String(goal.liftLabel || "lift").toLowerCase()} top set.`;
    if (goal.type === "bodyweight") return "Weigh in twice next week, same time of day.";
    if (goal.type === "steps") return "Get your steps in early on your busiest days.";
    return "Same number of sessions again — every one moves your goal.";
  }
  if (recap.volumeChangePct != null && recap.volumeChangePct < -10) return "Bring your training volume back up to where it was.";
  return "Same again, and add 2.5 kg where your last set felt easy.";
}
