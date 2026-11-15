// Coached client weekly review (#240). The week (Mon–Sun) from the client's
// own logs, built on the coach's video-feedback week scorecard
// (weekScorecard, #220) so both say the same numbers. Nothing is stored:
// past weeks are worked out from the same logs. Pure; date maths uses the
// `nowMs` / week it's given.
import { localDateKey } from "./dateKey";
import { weekScorecard, bestLiftsThisWeek } from "../coach/videoFeedback/clientSnapshot";

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const REVIEW_HOUR = 18; // Sunday 6pm, when the push goes

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function addDaysKey(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
export function mondayKey(key) {
  const d = parseKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return keyOf(d);
}

// The newest week with a review: this week from Sunday 6pm, else last week.
export function latestReviewMonday(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const monday = mondayKey(localDateKey(now));
  return now.getDay() === 0 && now.getHours() >= REVIEW_HOUR ? monday : addDaysKey(monday, -7);
}

// Is `monday`'s review new right now (Sunday 6pm to the end of Tuesday)?
export function reviewIsFresh(monday, nowMs = Date.now()) {
  const opens = parseKey(addDaysKey(monday, 6));
  opens.setHours(REVIEW_HOUR, 0, 0, 0);
  const closes = parseKey(addDaysKey(monday, 9));
  closes.setHours(0, 0, 0, 0);
  return nowMs >= opens.getTime() && nowMs < closes.getTime();
}

const strength = (l) => !l.cardio;
const logKey = (l) => localDateKey(new Date(l.date));

function weeksInARow(logs, monday) {
  const trained = new Set(logs.filter(strength).map((l) => mondayKey(logKey(l))));
  let k = monday;
  let n = 0;
  while (trained.has(k)) {
    n += 1;
    k = addDaysKey(k, -7);
  }
  return n;
}

function liftGain8Weeks(logs, exercisesById, monday) {
  const from = addDaysKey(monday, -7 * 7);
  const to = addDaysKey(monday, 7);
  const byEx = {};
  for (const log of logs.filter(strength)) {
    const k = logKey(log);
    if (k < from || k >= to) continue;
    const wk = mondayKey(k);
    for (const e of log.entries || []) {
      const top = Math.max(0, ...(e.sets || []).filter((s) => Number(s.reps) >= 1).map((s) => Number(s.weight) || 0));
      if (!top || !e.exerciseId) continue;
      const x = (byEx[e.exerciseId] = byEx[e.exerciseId] || {});
      x[wk] = Math.max(x[wk] || 0, top);
    }
  }
  let best = null;
  for (const [id, weeks] of Object.entries(byEx)) {
    const ks = Object.keys(weeks).sort();
    if (ks.length < 2 || !exercisesById?.[id]?.name) continue;
    const gain = weeks[ks[ks.length - 1]] - weeks[ks[0]];
    const span = Math.max(1, Math.round((parseKey(ks[ks.length - 1]) - parseKey(ks[0])) / (7 * DAY)));
    if (gain >= 2.5 && (!best || gain > best.gain)) best = { name: exercisesById[id].name, gain: Math.round(gain * 10) / 10, weeks: span };
  }
  return best;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const listDays = (keys) => {
  const names = keys.map((k) => WEEKDAY[parseKey(k).getDay()]);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

// The whole review for the week starting `monday`.
export function coachedWeekReview({ monday, workoutLogs = [], scheduledWorkouts = [], nutritionLogs = [], bodyMetrics = [], weighIns = [], targets = {}, exercisesById = {}, phases = [] }) {
  const end = addDaysKey(monday, 7);
  const sc = weekScorecard({ workoutLogs, scheduledWorkouts, nutritionLogs, bodyMetrics, weighIns, targets, exercisesById, now: parseKey(end).getTime() });
  const weekKeys = new Set(sc.days.map((d) => d.dateKey));
  const weekLogs = workoutLogs.filter((l) => strength(l) && weekKeys.has(logKey(l)));
  const prs = weekLogs.reduce((n, l) => n + (l.entries || []).reduce((a, e) => a + (e.sets || []).filter((s) => s.isPR).length, 0), 0);
  const minutes = weekLogs.reduce((n, l) => n + (Number(l.durationMin) || 0), 0);
  const stronger = bestLiftsThisWeek(workoutLogs, weekKeys, exercisesById, 20)
    .filter((b) => b.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 3)
    .map((b) => ({ id: b.id, name: b.name, from: b.e1rm - b.change, to: b.e1rm, change: b.change }));
  const streak = weeksInARow(workoutLogs, monday);

  // Their phase on the Sunday: which week of how many.
  const sunday = addDaysKey(monday, 6);
  const phase = [...phases].filter((p) => p?.startDate && p.startDate <= sunday && (!p.endDate || p.endDate >= sunday)).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || null;
  let phaseInfo = null;
  if (phase) {
    const week = Math.floor((parseKey(sunday) - parseKey(phase.startDate)) / (7 * DAY)) + 1;
    const total = phase.endDate ? Math.max(week, Math.ceil((parseKey(phase.endDate) - parseKey(phase.startDate) + DAY) / (7 * DAY))) : null;
    phaseInfo = { name: phase.name || phase.title || "Your phase", week, total, pct: total ? Math.min(1, week / total) : null };
  }

  const s = sc.sessions;
  const nut = sc.nutrition;
  const headline =
    s.planned > 0 && s.done >= s.planned
      ? "Every planned session. Done."
      : prs > 1
      ? `${cap(prs < 10 ? words[prs] : String(prs))} new personal records this week.`
      : prs === 1
      ? "A new personal record this week."
      : s.total >= 3
      ? "A solid week of training."
      : s.total > 0
      ? "You showed up. That's how it starts."
      : "A quiet week. Next week is a fresh start.";

  // Insights: only what the data shows; never what's already a figure here.
  const insights = [];
  const lift = liftGain8Weeks(workoutLogs, exercisesById, monday);
  if (lift) insights.push(`Your ${lift.name.toLowerCase()} is up ${lift.gain} kg in ${lift.weeks} week${lift.weeks === 1 ? "" : "s"}.`);
  let proteinRun = 0;
  for (const d of [...sc.days].reverse()) {
    if (!d.proteinHit) break;
    proteinRun += 1;
  }
  if (proteinRun >= 3) insights.push(`You've hit protein ${proteinRun} days in a row.`);
  if (streak >= 4) insights.push(`You've trained every week for ${streak} weeks.`);

  // One thing for next week, from where this one slipped.
  let focus;
  const missedCal = sc.days.filter((d) => d.logged && !d.calorieHit).map((d) => d.dateKey);
  const unlogged = sc.days.filter((d) => !d.logged).length;
  if (s.planned > 0 && s.done < s.planned) focus = `Hit all your planned sessions — ${s.done} of ${s.planned} this week. Missed one? Move it, don't skip it.`;
  else if (targets.calories > 0 && nut.logged > 0 && missedCal.length > 0 && missedCal.length <= 3) focus = `Hit calories on ${listDays(missedCal)} too — ${missedCal.length === 1 ? "the one miss" : `the ${words[missedCal.length]} misses`} this week.`;
  else if (targets.calories > 0 && unlogged >= 3) focus = `Log your food every day — ${7 - unlogged} of 7 days logged this week.`;
  else if (targets.protein > 0 && nut.logged > 0 && nut.proteinHits < 5) focus = `Get your protein in every day — ${nut.proteinHits} of 7 this week.`;
  else if (sc.steps.avg !== null && sc.steps.avg < sc.steps.goal * 0.8) focus = `Add a daily walk — steps averaged ${sc.steps.avg.toLocaleString("en-AU")}.`;
  else if (s.total === 0) focus = "Get your first session done early in the week.";
  else focus = "Same again — and add 2.5 kg where your last set felt easy.";

  const hasData = s.total > 0 || nut.logged > 0 || sc.weight.avg !== null || sc.steps.avg !== null;
  return {
    monday,
    sunday,
    hasData,
    headline,
    sessions: s,
    days: sc.days.map((d) => ({ dateKey: d.dateKey, trained: d.session === "done" || d.session === "extra", planned: d.session === "done" || d.session === "missed" })),
    minutes: weekLogs.length ? minutes : null,
    lifted: sc.lifted,
    prs,
    streak,
    nutrition: targets.calories > 0 || targets.protein > 0 ? { ...nut, calorieTarget: targets.calories || null, proteinTarget: targets.protein || null } : null,
    weight: sc.weight,
    steps: sc.steps,
    sleep: sc.sleep,
    stronger,
    phase: phaseInfo,
    insights: insights.slice(0, 2),
    focus,
  };
}

// The weeks with a review, newest first: from the latest back `count`
// weeks, only weeks they logged something in.
export function reviewWeeks(data, { nowMs = Date.now(), count = 12 } = {}) {
  const out = [];
  let monday = latestReviewMonday(nowMs);
  for (let i = 0; i < count; i++) {
    const r = coachedWeekReview({ ...data, monday });
    if (r.hasData) out.push(r);
    monday = addDaysKey(monday, -7);
  }
  return out;
}

// The line under each review in the Progress list.
export function reviewSummary(r) {
  const parts = [];
  parts.push(r.sessions.planned > 0 ? `${r.sessions.done} of ${r.sessions.planned} sessions` : `${r.sessions.total} session${r.sessions.total === 1 ? "" : "s"}`);
  parts.push(`${r.prs} PR${r.prs === 1 ? "" : "s"}`);
  if (r.weight.change !== null) parts.push(`${r.weight.change > 0 ? "+" : r.weight.change < 0 ? "−" : "±"}${Math.abs(r.weight.change)} kg`);
  return parts.join(" · ");
}

