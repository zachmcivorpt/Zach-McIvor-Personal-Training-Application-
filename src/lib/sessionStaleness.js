// A persisted in-progress workout session (ClientApp.jsx's
// clientActiveSession_${uid} localStorage snapshot) used to be restored
// unconditionally on every app load, with no check against which
// calendar day it actually belonged to. Once a new day began, a client
// reopening the app inherited yesterday's (or older) leftover sets/swaps
// on today's fresh, never-started session.
//
// #274: staleness is decided by the day the workout was STARTED
// (`startedOn`, written with every snapshot), never by the day it was
// scheduled for. Judging by `runningSession.date` threw away — on any
// reload — a workout started today for another day (a missed session
// caught up from the calendar or Home's week strip) and every workout
// started from the Program tab's phase list (those have no date at all):
// the client was dropped out of their session and lost the sets.
export function isPersistedSessionStale(persisted, todayDateKey) {
  if (!persisted?.runningSession) return false;
  if (persisted.startedOn) return persisted.startedOn !== todayDateKey;
  // Snapshots written before #274 have no startedOn: keep an undated one
  // (it can only be today's — it's re-stamped on the next save); a dated one
  // keeps the old rule.
  return !!persisted.runningSession.date && persisted.runningSession.date !== todayDateKey;
}
