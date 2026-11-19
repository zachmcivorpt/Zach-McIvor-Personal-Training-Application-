// The Apple Watch home screen's figures (#307): today's session and this
// week's sessions, from the client's own schedule and logs — the same "done"
// test Home's week strip uses. Heart rate comes from the Watch itself.
// Plain JSON for the Watch (WatchHome in ios/ApexWatch/WorkoutStore.swift).

function keyToDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dateToKey(dt) {
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// Monday → Sunday of the week holding `todayKey` (the "today" it is given,
// never the device clock).
export function weekKeysFor(todayKey) {
  const day = keyToDate(todayKey);
  const fromMonday = (day.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() - fromMonday + i);
    return dateToKey(d);
  });
}

export function buildWatchHome({ todayKey, todaySession, completedToday, scheduledKeys, isDone }) {
  const week = weekKeysFor(todayKey);
  const scheduled = new Set(scheduledKeys || []);
  const exercises = (todaySession?.exercises || []).filter((e) => e && e.exerciseId).length;
  return {
    v: 1,
    today: todaySession && todaySession.label ? { label: String(todaySession.label), exercises, done: !!completedToday } : null,
    week: {
      done: week.filter((k) => k <= todayKey && isDone(k)).length,
      target: week.filter((k) => scheduled.has(k)).length,
    },
  };
}
