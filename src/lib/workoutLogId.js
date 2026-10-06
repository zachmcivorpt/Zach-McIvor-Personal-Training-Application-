// logWorkout (AppContext.jsx) used to mint a brand-new random doc id on
// every call, with no check against what already existed. A client
// signed in on two devices at once (phone + tablet, same account —
// common enough in a gym where someone starts on their phone and
// finishes on a propped-up tablet) finishing the SAME scheduled workout
// around the same moment created two separate completed-workout log
// docs instead of one, double-counting it in history, PRs and stats.
//
// A deterministic id, scoped to the one thing that actually identifies
// "this scheduled workout, this client, this day" — clientId +
// scheduledDate + dayLabel — makes a second finish of the exact same
// scheduled workout overwrite the first via setDoc instead of creating a
// duplicate. Deliberately NOT applied to unscheduled logs (ad-hoc cardio,
// anything with no scheduledDate) — those have no such natural key and
// legitimately repeat multiple times a day (a morning run and an evening
// walk are two real, distinct sessions, not a duplicate).
function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function scheduledWorkoutLogId(clientId, scheduledDate, dayLabel) {
  return `wlog_${clientId}__${scheduledDate}__${stableHash(dayLabel || "")}`;
}

// The actual decision logWorkout (AppContext.jsx) makes — pulled out as
// its own pure function (with the random-id generator injected rather
// than imported) so the branch itself is testable without a live
// Firestore instance, not just the hash above in isolation.
export function workoutLogDocId(clientId, entry, makeRandomId) {
  return entry.scheduledDate ? scheduledWorkoutLogId(clientId, entry.scheduledDate, entry.dayLabel) : makeRandomId();
}
