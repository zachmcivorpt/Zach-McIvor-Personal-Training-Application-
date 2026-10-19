// Calendar-week progression for an owned program: everything is derived
// from the customer's chosen start date plus today's date, nothing is
// stored as "current week" — so it can never drift if the customer misses
// a login for a while, and changing the start date just re-derives
// everything from the new date on the next render.
import { localDateKey } from "../lib/dateKey";

export function totalWeeksForProgram(phases) {
  return (phases || []).reduce((sum, p) => sum + (p.durationWeeks || 0), 0);
}

// Whole weeks elapsed since the start date, floor()'d — the start date's
// own day is week 1, day 1, not week 0. Returns null until a start date is
// set (purchased but not yet scheduled).
export function weeksElapsedSince(startDateKey) {
  if (!startDateKey) return null;
  const start = new Date(`${startDateKey}T00:00:00`);
  const today = new Date(`${localDateKey()}T00:00:00`);
  const diffDays = Math.round((today - start) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7);
}

// 1-indexed current week number, clamped to the program's actual length —
// a program that finished doesn't report a "week 14 of 8", it just stays
// at the last week; one that hasn't started yet (a future start date)
// reports week 1 rather than a negative/zero week.
export function currentWeekNumber(startDateKey, totalWeeks) {
  const elapsed = weeksElapsedSince(startDateKey);
  if (elapsed == null || totalWeeks <= 0) return null;
  return Math.min(Math.max(elapsed + 1, 1), totalWeeks);
}

// Which phase (and which week within that phase) a given 1-indexed
// program-wide week number falls into — phases are consecutive blocks of
// durationWeeks each, in order.
export function phaseForWeekNumber(phases, weekNumber) {
  if (!weekNumber) return null;
  let cursor = 0;
  for (const phase of phases || []) {
    const weeks = phase.durationWeeks || 0;
    if (weekNumber <= cursor + weeks) {
      return { phase, weekInPhase: weekNumber - cursor };
    }
    cursor += weeks;
  }
  return null;
}
