// Coach Overview → Training and Nutrition command centre (#265).
//
// Pure functions (no hooks, no JSX) that turn the data the console already
// has loaded — db.nutritionLogs, db.workoutLogs, db.scheduledWorkouts,
// db.clientPhases and each client's own nutritionTargets — into one row per
// client for the two Overview sections. Nothing is stored or invented:
// every figure is read straight off the client's own logs. Date maths uses
// the `todayKey` / `now` it is given (#210), never the device clock behind
// its back.
import { localDateKey } from "../lib/dateKey";
import { hasFoodLogged } from "../lib/nutritionLog";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { daysBetweenKeys } from "./endingSoon";

const DAY = 86400000;

// ---- shared date helpers ---------------------------------------------------
function keyToNoon(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function addDaysKey(key, n) {
  const d = keyToNoon(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

// ---- Nutrition -------------------------------------------------------------
// A target counts as reached within these bands, so 2,190 / 2,200 reads as
// "Target reached" rather than "10 kcal under". The exact difference is
// always shown next to it either way.
export const CALORIE_TOLERANCE = 0.03; // ±3% (±66 kcal on 2,200)
export const PROTEIN_TOLERANCE = 0.03; // ±3% (±5 g on 160 g)
// Below this share of the calorie target with fewer than this many meals
// logged, the diary is still being filled in — reported as "Diary
// incomplete", never as a missed target.
export const INCOMPLETE_SHARE = 0.5;
export const INCOMPLETE_MEALS = 3;

// The coach set this client's targets (Nutrition Goal editor) — without it
// the client's app runs on the app default, which isn't the coach's target.
export function hasAssignedTargets(client) {
  return Number(client?.nutritionTargets?.calories) > 0;
}

// When an entry was logged. Every food logged from the Add Food page gets
// an id of `<food id>-<Date.now() in base 36><5 random chars>` (newEntryId
// in ClientApp.jsx, logIdRef in NutritionFeatures.jsx), so the time is in
// the id itself. Anything else (older entries, other id shapes) → null.
export function entryLoggedAt(entry, dateKey) {
  const id = typeof entry?.id === "string" ? entry.id : "";
  const tail = id.slice(id.lastIndexOf("-") + 1);
  if (tail.length < 13 || !/^[0-9a-z]+$/.test(tail)) return null;
  const ms = parseInt(tail.slice(0, -5), 36);
  if (!Number.isFinite(ms)) return null;
  // Plausibility: within the diary day it sits on (a day logged ahead or
  // late is allowed a day either side).
  if (dateKey) {
    const noon = keyToNoon(dateKey).getTime();
    if (Math.abs(ms - noon) > 1.5 * DAY) return null;
  }
  return ms;
}

// Compare one figure against its target. `inProgress` (today, not over
// yet) turns "under" into "to go" — a day still being eaten isn't a miss.
export function compareToTarget(actual, target, tolerance) {
  const a = Math.round(Number(actual) || 0);
  const t = Math.round(Number(target) || 0);
  if (!(t > 0)) return { actual: a, target: null, diff: null, state: "noTarget" };
  const diff = a - t;
  const band = Math.max(1, Math.round(t * tolerance));
  const state = Math.abs(diff) <= band ? "hit" : diff > 0 ? "over" : "under";
  return { actual: a, target: t, diff, state };
}

export const NUTRITION_STATUS = {
  completed: { label: "Goal completed", tone: "green", rank: 5 },
  over: { label: "Over target", tone: "red", rank: 1 },
  under: { label: "Finished under", tone: "red", rank: 2 },
  inProgress: { label: "Under so far", tone: "blue", rank: 4 },
  incomplete: { label: "Diary incomplete", tone: "muted", rank: 3 },
  notLogged: { label: "No meals logged", tone: "red", rank: 0 },
  noTarget: { label: "No assigned target", tone: "muted", rank: 6 },
};

// One client's nutrition for one diary day. `final` = the day is over
// (yesterday), so "under" is a real miss; today it is "to go".
export function nutritionDay(client, nutritionLogs, dateKey, { final = false } = {}) {
  const day = (nutritionLogs || []).find((n) => n.date === dateKey) || null;
  const logged = hasFoodLogged(day);
  const assigned = hasAssignedTargets(client);
  const targets = resolveNutritionTargets(client?.nutritionTargets);
  const meals = logged ? Object.values(day.meals).filter((items) => Array.isArray(items) && items.length > 0).length : 0;
  const items = logged ? Object.values(day.meals).flat().filter(Boolean) : [];
  const times = items.map((e) => entryLoggedAt(e, dateKey)).filter((t) => t !== null);
  const lastLoggedAt = times.length ? Math.max(...times) : null;
  const calories = compareToTarget(logged ? day.calories : 0, assigned ? targets.calories : 0, CALORIE_TOLERANCE);
  const protein = compareToTarget(logged ? day.protein : 0, assigned ? targets.protein : 0, PROTEIN_TOLERANCE);

  let status;
  if (!logged) status = "notLogged";
  else if (!assigned) status = "noTarget";
  else if (calories.state === "over") status = "over";
  else if (calories.state === "hit" && protein.state !== "under") status = "completed";
  else if (!final && meals < INCOMPLETE_MEALS && calories.actual < calories.target * INCOMPLETE_SHARE) status = "incomplete";
  else if (!final) status = "inProgress";
  else status = "under";

  return { client, dateKey, final, logged, assigned, meals, itemCount: items.length, lastLoggedAt, calories, protein, status };
}

// Last 7 completed days (ending the day before `todayKey`): how often the
// client logged and hit protein / calories. Feeds the message suggestions
// ("consistently short of protein") — never the headline, which is daily.
export function nutritionTrend(client, nutritionLogs, todayKey, days = 7) {
  const byKey = Object.fromEntries((nutritionLogs || []).map((n) => [n.date, n]));
  const assigned = hasAssignedTargets(client);
  const t = resolveNutritionTargets(client?.nutritionTargets);
  let logged = 0;
  let proteinShort = 0;
  let caloriesOver = 0;
  let proteinTotal = 0;
  for (let i = 1; i <= days; i++) {
    const n = byKey[addDaysKey(todayKey, -i)];
    if (!hasFoodLogged(n)) continue;
    logged += 1;
    proteinTotal += Number(n.protein) || 0;
    if (assigned && compareToTarget(n.protein, t.protein, PROTEIN_TOLERANCE).state === "under") proteinShort += 1;
    if (assigned && compareToTarget(n.calories, t.calories, CALORIE_TOLERANCE).state === "over") caloriesOver += 1;
  }
  return { days, logged, proteinShort, caloriesOver, avgProtein: logged ? Math.round(proteinTotal / logged) : null, proteinTarget: assigned ? t.protein : null };
}

export function nutritionNeedsAttention(row) {
  return row.status === "notLogged" || row.status === "over" || row.status === "under" || (row.final && row.protein.state === "under");
}

// ---- Training --------------------------------------------------------------
export const TRAINING_WINDOW_DAYS = 7; // "this week" = the last 7 days incl. today
export const CONSISTENT_WINDOW_DAYS = 28;
export const CONSISTENT_RATE = 0.8;
export const BEHIND_RATE = 0.6;

const isStrength = (l) => l && !l.cardio;

// Which scheduled dates a client's logs fulfil — a log's own scheduledDate
// (a missed day finished late) first, else the day it was completed, the
// same rule as the client's own calendar (ClientApp logFulfillsDate). We
// don't require the label to match: a client who trained that day is never
// shown as having missed it.
function fulfilledKeys(logs) {
  const set = new Set();
  (logs || []).filter(isStrength).forEach((l) => {
    if (l.scheduledDate) set.add(l.scheduledDate);
    set.add(localDateKey(new Date(l.date)));
  });
  return set;
}

export const TRAINING_STATUS = {
  doneToday: { label: "Done today", tone: "green", rank: 5 },
  dueToday: { label: "Due today", tone: "blue", rank: 3 },
  behind: { label: "Falling behind", tone: "red", rank: 0 },
  missed: { label: "Missed session", tone: "red", rank: 1 },
  onTrack: { label: "On track", tone: "green", rank: 4 },
  noSchedule: { label: "Nothing scheduled", tone: "muted", rank: 6 },
};

export function trainingSummary(client, { workoutLogs, scheduledWorkouts, phases }, todayKey) {
  const logs = (workoutLogs || []).filter(isStrength).slice().sort((a, b) => b.date - a.date);
  const scheduled = (scheduledWorkouts || []).filter((w) => w && w.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const done = fulfilledKeys(logs);
  const weekStart = addDaysKey(todayKey, -(TRAINING_WINDOW_DAYS - 1));
  const consistentStart = addDaysKey(todayKey, -(CONSISTENT_WINDOW_DAYS - 1));

  const todays = scheduled.filter((w) => w.date === todayKey);
  const today = todays.length ? { workout: todays[0], done: done.has(todayKey) } : null;

  // Past = before today; today's session isn't missed until the day ends.
  const inRange = (from, to) => scheduled.filter((w) => w.date >= from && w.date <= to);
  const uniqueDates = (list) => [...new Set(list.map((w) => w.date))];
  const weekDates = uniqueDates(inRange(weekStart, todayKey));
  const weekPast = weekDates.filter((k) => k < todayKey);
  const weekDone = weekDates.filter((k) => done.has(k));
  const missedDates = weekPast.filter((k) => !done.has(k)).sort().reverse();
  const longPast = uniqueDates(inRange(consistentStart, addDaysKey(todayKey, -1)));
  const longDone = longPast.filter((k) => done.has(k)).length;
  const rate = longPast.length ? longDone / longPast.length : null;

  const missed = missedDates.map((k) => scheduled.find((w) => w.date === k));
  const lastLog = logs[0] || null;
  const next = scheduled.find((w) => (w.date > todayKey || (w.date === todayKey && !done.has(todayKey))));

  // Current program phase and how far into it they are.
  const phaseList = (phases || []).filter((p) => p.startDate).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const phase = phaseList.find((p) => p.startDate <= todayKey && (!p.endDate || p.endDate >= todayKey)) || null;
  let program = null;
  if (phase) {
    const dayIn = daysBetweenKeys(phase.startDate, todayKey);
    const totalDays = phase.endDate ? daysBetweenKeys(phase.startDate, phase.endDate) + 1 : null;
    const phasePast = uniqueDates(scheduled.filter((w) => w.date >= phase.startDate && w.date <= todayKey && (!phase.endDate || w.date <= phase.endDate)));
    const phaseAll = phase.endDate ? uniqueDates(scheduled.filter((w) => w.date >= phase.startDate && w.date <= phase.endDate)) : null;
    program = {
      name: phase.name || "Current phase",
      week: Math.floor(dayIn / 7) + 1,
      weeks: totalDays ? Math.ceil(totalDays / 7) : null,
      pct: totalDays ? Math.min(100, Math.round(((dayIn + 1) / totalDays) * 100)) : null,
      sessionsDone: phasePast.filter((k) => done.has(k)).length,
      sessionsTotal: phaseAll ? phaseAll.length : null,
    };
  }

  const hasSchedule = longPast.length > 0 || weekDates.length > 0 || !!next;
  let status;
  if (!hasSchedule) status = "noSchedule";
  else if (missed.length >= 2 || (rate !== null && longPast.length >= 4 && rate < BEHIND_RATE)) status = "behind";
  else if (missed.length === 1) status = "missed";
  else if (today && today.done) status = "doneToday";
  else if (today) status = "dueToday";
  else status = "onTrack";

  const consistent = rate !== null && longPast.length >= 4 && rate >= CONSISTENT_RATE;
  const daysSinceLast = lastLog ? daysBetweenKeys(localDateKey(new Date(lastLog.date)), todayKey) : null;

  return {
    client,
    status,
    today,
    week: { assigned: weekDates.length, done: weekDone.length, due: weekDates.filter((k) => k >= todayKey && !done.has(k)).length },
    missed,
    rate: rate === null ? null : Math.round(rate * 100),
    ratePlanned: longPast.length,
    consistent,
    lastLog,
    daysSinceLast,
    next: next || null,
    program,
  };
}

export function trainingNeedsAttention(row) {
  return row.status === "behind" || row.status === "missed";
}

// ---- Sorting ---------------------------------------------------------------
// Priority: who needs the coach first, then by name.
export function sortRows(rows, sort, statusTable) {
  const list = rows.slice();
  const byName = (a, b) => (a.client.name || "").localeCompare(b.client.name || "");
  if (sort === "name") return list.sort(byName);
  return list.sort((a, b) => statusTable[a.status].rank - statusTable[b.status].rank || byName(a, b));
}

// ---- Message suggestions ---------------------------------------------------
// Ready-to-edit messages for the coach, written from the client's own
// figures. Each one only appears when the data behind it is true.
const firstName = (c) => (c?.name || "").trim().split(/\s+/)[0] || "mate";

export function nutritionSuggestions(row, trend) {
  const n = firstName(row.client);
  const out = [];
  const p = row.protein;
  const c = row.calories;
  if (row.status === "notLogged") {
    out.push(`Hey ${n}, I haven't seen any meals logged ${row.final ? "yesterday" : "today"}. Even a rough log helps me coach you better — can you get ${row.final ? "today's" : "them"} in when you get a chance?`);
  }
  if (trend && trend.proteinTarget && trend.logged >= 3 && trend.proteinShort >= Math.ceil(trend.logged / 2)) {
    out.push(
      `Hey ${n}, noticed you've been falling short of your protein target on ${trend.proteinShort} of the last ${trend.logged} days you logged (averaging ${trend.avgProtein}g against ${trend.proteinTarget}g). Let's look at some easier high-protein meal options.`
    );
  }
  if (p.target && p.state === "under" && row.logged) {
    out.push(
      row.final
        ? `Hey ${n}, you finished yesterday on ${p.actual}g of protein — ${Math.abs(p.diff)}g under your ${p.target}g target. Want me to suggest a couple of easy protein additions?`
        : `Hey ${n}, you're on ${p.actual}g of protein so far today — ${Math.abs(p.diff)}g to go to hit ${p.target}g. A shake or some Greek yoghurt would close that gap nicely.`
    );
  }
  if (c.target && c.state === "over") {
    out.push(`Hey ${n}, you're at ${c.actual.toLocaleString()} kcal ${row.final ? "for yesterday" : "today"}, ${c.diff.toLocaleString()} over your ${c.target.toLocaleString()} target. No stress — let's chat about what's making it tricky.`);
  }
  if (row.status === "completed") {
    out.push(`Great work ${n} — ${c.actual.toLocaleString()} kcal and ${p.actual}g of protein, right on target ${row.final ? "yesterday" : "today"}. Keep it rolling!`);
  }
  if (row.status === "noTarget" && row.logged) {
    out.push(`Hey ${n}, thanks for logging your food. I'm going to set your calorie and protein targets so you know exactly what to aim for — I'll let you know once they're in.`);
  }
  if (!out.length) out.push(`Hey ${n}, how's your nutrition feeling this week? Anything I can help make easier?`);
  return [...new Set(out)];
}

export function trainingSuggestions(row) {
  const n = firstName(row.client);
  const out = [];
  if (row.missed.length >= 2) {
    out.push(`Hey ${n}, noticed you've missed ${row.missed.length} scheduled sessions this week. Everything going alright? Let's get your routine back on track.`);
  } else if (row.missed.length === 1) {
    const label = row.missed[0]?.label;
    out.push(`Hey ${n}, I saw ${label ? `${label}` : "your last session"} didn't get logged. All good? If the week got busy we can move it.`);
  }
  if (row.status === "behind" && row.rate !== null && row.missed.length < 2) {
    out.push(`Hey ${n}, you've completed ${row.rate}% of your sessions over the last four weeks. Let's chat about what would make your schedule easier to stick to.`);
  }
  if (row.today && !row.today.done) {
    out.push(`Hey ${n}, ${row.today.workout.label || "your session"} is on for today — let me know how it goes!`);
  }
  if (row.today && row.today.done) {
    out.push(`Nice work getting ${row.today.workout.label || "today's session"} done, ${n}! How did it feel?`);
  }
  if (row.consistent) {
    out.push(`Hey ${n}, you've hit ${row.rate}% of your sessions over the last four weeks — that consistency is exactly what gets results. Proud of the work!`);
  }
  if (row.status === "noSchedule") {
    out.push(`Hey ${n}, I'm putting your next block of training together now — I'll let you know as soon as it's on your calendar.`);
  }
  if (!out.length) out.push(`Hey ${n}, how's training feeling this week? Anything you want me to adjust?`);
  return [...new Set(out)];
}
