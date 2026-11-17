// The coach's Weekly Coach Review card (client Training tab), worked out
// from the client's own logs over ONE window: the last 7 full days, ending
// yesterday (#267). Today is still in progress, so it never counts against
// them. Every figure on the card uses this same window.
//
// Fixes (#267): the card said "last 7 days" but Sessions counted Monday →
// today; a cardio log counted as a completed scheduled session; a session
// finished late (its `scheduledDate`) counted as missed; a habit that had
// ended still counted on later days; today's unfinished habits pulled the
// figure down; a log without `entries` crashed the volume / PR sums.
import { localDateKey } from "../lib/dateKey";
import { hasFoodLogged } from "../lib/nutritionLog";
import { logVolume } from "./videoFeedback/clientSnapshot";
import { addDaysKey, isTrainingSession } from "./commandCentre";

const isStrength = (l) => l && !l.cardio;
const logDay = (l) => localDateKey(new Date(l.date));

function windowKeys(todayKey, fromDaysAgo, toDaysAgo) {
  const keys = [];
  for (let i = fromDaysAgo; i >= toDaysAgo; i--) keys.push(addDaysKey(todayKey, -i));
  return keys;
}

export function weeklyCoachReview({ workoutLogs, scheduledWorkouts, nutritionLogs, habits, habitLog, todayKey, exercisesById }) {
  const days = windowKeys(todayKey, 7, 1);
  const prevDays = windowKeys(todayKey, 14, 8);
  const inWeek = new Set(days);
  const inPrev = new Set(prevDays);
  const strength = (workoutLogs || []).filter(isStrength);
  const weekLogs = strength.filter((l) => inWeek.has(logDay(l)));
  const prevLogs = strength.filter((l) => inPrev.has(logDay(l)));

  // Scheduled sessions: each scheduled day once. A late finish counts for
  // the day it was FOR, not the day it was done (the client calendar's own
  // rule, ClientApp logFulfillsDate).
  const doneDays = new Set();
  strength.forEach((l) => doneDays.add(l.scheduledDate || logDay(l)));
  const plannedDays = [...new Set((scheduledWorkouts || []).filter((w) => w && inWeek.has(w.date) && isTrainingSession(w, exercisesById)).map((w) => w.date))];
  const sessions = {
    planned: plannedDays.length,
    done: plannedDays.filter((k) => doneDays.has(k)).length,
    logged: weekLogs.length,
  };

  const volume = weekLogs.reduce((a, l) => a + logVolume(l), 0);
  const prevVolume = prevLogs.reduce((a, l) => a + logVolume(l), 0);
  const volumeChangePct = prevVolume > 0 ? Math.round(((volume - prevVolume) / prevVolume) * 100) : null;

  const prs = weekLogs.reduce((a, l) => a + (l.entries || []).reduce((b, e) => b + (e.sets || []).filter((s) => s && s.isPR).length, 0), 0);

  // A habit counts on a day from the day it was set until the day it ends.
  let habitPossible = 0;
  let habitDone = 0;
  days.forEach((d) => {
    const doneIds = (habitLog || {})[d] || [];
    (habits || []).forEach((h) => {
      if (h.createdAt && d < localDateKey(new Date(h.createdAt))) return;
      if (h.endsAt && d > localDateKey(new Date(h.endsAt))) return;
      habitPossible += 1;
      if (doneIds.includes(h.id)) habitDone += 1;
    });
  });

  const byDate = Object.fromEntries((nutritionLogs || []).map((n) => [n.date, n]));
  const nutritionDays = days.filter((d) => hasFoodLogged(byDate[d])).length;

  return {
    from: days[0],
    to: days[days.length - 1],
    sessions,
    volume,
    volumeChangePct,
    prs,
    habits: { possible: habitPossible, done: habitDone, pct: habitPossible ? Math.round((habitDone / habitPossible) * 100) : null },
    nutrition: { daysLogged: nutritionDays, pct: Math.round((nutritionDays / 7) * 100) },
  };
}
