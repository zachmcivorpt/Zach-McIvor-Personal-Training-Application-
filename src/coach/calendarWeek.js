// #317 (owner, 2026-11-22): the coach's client Calendar on PHONES opens on a
// vertical Week view (Month / Week / Day). Pure helpers only: every figure is
// worked out from the SAME day items the month grid already uses
// (CalendarPanel's itemsForDate) — no new data, nothing stored.

import { isTrainingSession } from "./commandCentre";

const DAY_MS = 86400000;

// Date keys ("YYYY-MM-DD") are UTC-anchored day counters, like the month
// grid's dKey (CoachClientDetail.jsx).
export const keyToDate = (key) => new Date(`${key}T00:00:00Z`);
export const dateToKey = (d) => d.toISOString().slice(0, 10);
export const addDays = (key, n) => dateToKey(new Date(keyToDate(key).getTime() + n * DAY_MS));

// Monday of the week that holds `key`.
export function mondayOf(key) {
  const d = keyToDate(key);
  return addDays(key, -((d.getUTCDay() + 6) % 7));
}

// The 7 day keys, Monday first.
export function weekKeys(key) {
  const mon = mondayOf(key);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

// "Mon 24 – Sun 30 Nov" (or "Mon 30 Nov – Sun 6 Dec" across a month).
export function weekRangeLabel(key) {
  const [mon, , , , , , sun] = weekKeys(key);
  const fmt = (k, withMonth) =>
    keyToDate(k).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" });
  const sameMonth = mon.slice(0, 7) === sun.slice(0, 7);
  return `${fmt(mon, !sameMonth)} – ${fmt(sun, true)}`.replace(/,/g, "");
}

// "Saturday 29 November"
export function dayLabel(key) {
  return keyToDate(key).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(/,/g, "");
}

// "7:12am" from a log's timestamp, in the coach's own time zone.
export function timeLabel(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

// One day's items (from itemsForDate) split the way the Week view shows them.
// Workouts = strength sessions (scheduled or logged); cardio = logs with a
// `cardio` block (never a workout); habits = that day's assigned habits.
//
// Audit 2026-11-22: a scheduled entry that isn't TRAINING (all Cardio /
// Warm-up / Cool-down, #269's `isTrainingSession`) still shows as a card but
// is `training: false`, so the week's Workouts total never counts it — the
// same rule as the Overview command centre and Weekly Coach Review.
export function splitDay(items, dateKey, todayKey, exercisesById = {}) {
  const list = items || [];
  const workouts = list
    .filter((it) => it.type === "workout" && it.category !== "cardio")
    .map((it) => ({
      ...it,
      training: it.done || !it.entry || isTrainingSession(it.entry, exercisesById),
      status: it.done ? "done" : dateKey < todayKey ? "missed" : "planned",
      time: it.done ? timeLabel(it.log?.date) : "",
    }));
  const cardioItems = list.filter((it) => it.type === "workout" && it.category === "cardio");
  const cardioMinutes = cardioItems.reduce((sum, it) => sum + (Number(it.log?.cardio?.durationMin) || 0), 0);
  const habits = list.filter((it) => it.type === "habits");
  const other = list.filter((it) => it.type === "bodystats" || it.type === "form");
  const nutrition = list.find((it) => it.type === "nutrition") || null;
  return { workouts, cardio: { sessions: cardioItems.length, minutes: cardioMinutes, items: cardioItems }, habits, other, nutrition };
}

// The week's totals for the summary row. Workouts: scheduled sessions done
// out of scheduled (a session logged without one being scheduled adds to
// both, so it never reads as more than 100%). Habits: ticks out of habits due
// on days up to today (future days aren't due yet). Cardio: sessions + minutes.
export function weekSummary(days, todayKey) {
  let workoutsDone = 0;
  let workoutsTotal = 0;
  let habitsDone = 0;
  let habitsDue = 0;
  let cardioSessions = 0;
  let cardioMinutes = 0;
  for (const d of days) {
    for (const w of d.split.workouts) {
      if (w.training === false) continue;
      workoutsTotal += 1;
      if (w.status === "done") workoutsDone += 1;
    }
    if (d.key <= todayKey) {
      habitsDue += d.split.habits.length;
      habitsDone += d.split.habits.filter((h) => h.done).length;
    }
    cardioSessions += d.split.cardio.sessions;
    cardioMinutes += d.split.cardio.minutes;
  }
  return { workoutsDone, workoutsTotal, habitsDone, habitsDue, cardioSessions, cardioMinutes };
}
