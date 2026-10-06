// A persisted in-progress workout session (ClientApp.jsx's
// clientActiveSession_${uid} localStorage snapshot) used to be restored
// unconditionally on every app load, with no check against which
// calendar day it actually belonged to. Once a new day began, a client
// reopening the app inherited yesterday's (or older) leftover sets/swaps
// on today's fresh, never-started session — showing "RESUME WORKOUT"
// with a stray set count on a workout they genuinely never touched
// today, or (since sessionOpen was restored too) dropping them straight
// into that old day's live logging screen.
export function isPersistedSessionStale(persisted, todayDateKey) {
  return !!persisted?.runningSession && persisted.runningSession.date !== todayDateKey;
}
