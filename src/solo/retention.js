// Train Solo retention (#245). Pure; every figure from the member's own logs.
//  - weeklyStreak: weeks in a row on their weekly target (replaces the old
//    "Day Streak", which reset on every planned rest day). One missed week
//    is forgiven for every 6 on target (a "spare week", at most 1 banked).
//  - restDayInfo: what's recovering and what's next, for a rest day.
//  - programFinish: the date a program's last week ends.
//  - monthStory: the month in numbers, for the 1st-of-the-month page.
//  - training time: the times a member can pick for their reminder.
import { localDateKey } from "../lib/dateKey";
import { addDays, mondayOf } from "./soloCalendar";
import { trainedMuscles, MUSCLE_LABELS } from "./muscleMap";
import { e1rm } from "./trainingRecap";

export const SPARE_EVERY = 6;
const dateOf = (log) => (typeof log?.date === "string" ? log.date.slice(0, 10) : log?.date != null ? localDateKey(new Date(log.date)) : null);

// Weeks in a row on target, oldest first so spare weeks are earned before
// they're used. This week counts once it's met; until then it can't break
// the run. Returns { weeks, spare, sparedWeeks: [mondayKey…] }.
export function weeklyStreak(logs = [], target = 3, todayKey = localDateKey()) {
  const counts = {};
  for (const l of logs) {
    const d = dateOf(l);
    if (d && d <= todayKey) counts[mondayOf(d)] = (counts[mondayOf(d)] || 0) + 1;
  }
  const weeksWithLogs = Object.keys(counts).sort();
  if (!weeksWithLogs.length) return { weeks: 0, spare: 0, sparedWeeks: [] };
  const thisMonday = mondayOf(todayKey);
  let run = 0;
  let spare = 0;
  let metInRun = 0;
  let spared = [];
  for (let k = weeksWithLogs[0]; k <= thisMonday; k = addDays(k, 7)) {
    const met = (counts[k] || 0) >= target;
    if (k === thisMonday && !met) break; // still in progress
    if (met) {
      run += 1;
      metInRun += 1;
      if (metInRun % SPARE_EVERY === 0) spare = Math.min(1, spare + 1);
    } else if (spare > 0) {
      spare -= 1;
      spared.push(k);
    } else {
      run = 0;
      metInRun = 0;
      spared = [];
    }
  }
  return { weeks: run, spare, sparedWeeks: spared };
}

// A rest day's card: muscles still recovering (most recent first, with
// hours until recovered at 48 h), else none.
export function restDayInfo(logs = [], exercisesById = {}, { now = Date.now() } = {}) {
  const trained = trainedMuscles(logs, exercisesById, { now, hours: 48 });
  const recovering = Object.entries(trained)
    .filter(([, v]) => v.sets > 0 && v.last)
    .sort((a, b) => b[1].last - a[1].last)
    .map(([m, v]) => ({ muscle: m, label: MUSCLE_LABELS[m] || m, hoursLeft: Math.max(1, Math.ceil(48 - (now - v.last) / 3600000)) }));
  return { recovering };
}

// The last day of a program's final week.
export function programFinish(startDate, totalWeeks) {
  if (!startDate || !(Number(totalWeeks) > 0)) return null;
  return addDays(startDate, Number(totalWeeks) * 7 - 1);
}

export function finishLabel(dateKey) {
  if (!dateKey) return "";
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// The month before `todayKey` (shown 1st–3rd), or a given month "YYYY-MM".
export function storyMonth(todayKey = localDateKey()) {
  const [y, m] = todayKey.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStoryWindow(todayKey = localDateKey()) {
  return Number(todayKey.slice(8, 10)) <= 3;
}

// The month in numbers. `month` is "YYYY-MM". Lift gains compare each lift's
// best estimated max in the month with its best before the month.
export function monthStory({ logs = [], exercisesById = {}, photos = [], month, target = 3 }) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = new Date(y, m, 1);
  const to = localDateKey(next);
  const inMonth = logs.filter((l) => {
    const d = dateOf(l);
    return d && d >= from && d < to;
  });
  const sets = (l) => (l.entries || []).flatMap((e) => (e.sets || []).map((s) => ({ ...s, exerciseId: e.exerciseId })));
  const volume = Math.round(inMonth.reduce((a, l) => a + sets(l).reduce((b, s) => b + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0));
  const prs = inMonth.reduce((a, l) => a + sets(l).filter((s) => s.isPR).length, 0);
  const minutes = inMonth.reduce((a, l) => a + (Number(l.durationMin) || 0), 0);
  // Weeks of the month (Mon starts inside it) on target.
  let weeksOnTarget = 0;
  let weeksInMonth = 0;
  for (let k = mondayOf(from) < from ? addDays(mondayOf(from), 7) : mondayOf(from); k < to; k = addDays(k, 7)) {
    weeksInMonth += 1;
    const end = addDays(k, 7);
    const n = logs.filter((l) => {
      const d = dateOf(l);
      return d && d >= k && d < end;
    }).length;
    if (n >= target) weeksOnTarget += 1;
  }
  const before = {};
  const during = {};
  for (const l of logs) {
    const d = dateOf(l);
    if (!d || d >= to) continue;
    const bucket = d < from ? before : during;
    for (const s of sets(l)) bucket[s.exerciseId] = Math.max(bucket[s.exerciseId] || 0, e1rm(s.weight, s.reps));
  }
  const gains = Object.entries(during)
    .filter(([id, v]) => before[id] > 0 && v - before[id] >= 1 && exercisesById[id]?.name)
    .map(([id, v]) => ({ exerciseId: id, name: exercisesById[id].name, from: Math.round(before[id]), to: Math.round(v), gain: Math.round(v - before[id]) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  const monthPhotos = photos
    .filter((p) => p?.url && dateOf(p) >= from && dateOf(p) < to)
    .sort((a, b) => Number(new Date(a.date)) - Number(new Date(b.date)));
  const photoPair = monthPhotos.length >= 2 && dateOf(monthPhotos[0]) !== dateOf(monthPhotos[monthPhotos.length - 1]) ? { before: monthPhotos[0], after: monthPhotos[monthPhotos.length - 1] } : null;
  const name = new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long" });
  const headline =
    inMonth.length === 0
      ? `A quiet ${name}. A new month starts today.`
      : weeksInMonth > 0 && weeksOnTarget === weeksInMonth
      ? `Every week on target in ${name}.`
      : prs > 0
      ? `${name}: ${prs} new personal record${prs === 1 ? "" : "s"}.`
      : `${inMonth.length} session${inMonth.length === 1 ? "" : "s"} in ${name}.`;
  return { month, name, sessions: inMonth.length, minutes, volume, prs, weeksOnTarget, weeksInMonth, gains, photoPair, headline };
}

// Training reminder times: 5am to 9pm on the hour, "HH:00".
export const TRAINING_TIMES = Array.from({ length: 17 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`);
export function timeLabel(hhmm) {
  if (!hhmm) return "Off";
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

