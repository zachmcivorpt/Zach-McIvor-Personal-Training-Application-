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
//
// #275: a workout running past midnight (started 11pm, reloaded 12:30am)
// was still dropped. A snapshot saved in the last 6 hours
// (`savedAt`, written with every save) is always kept.
export const ACTIVE_SESSION_GRACE_MS = 6 * 60 * 60 * 1000;
export function isPersistedSessionStale(persisted, todayDateKey, now = Date.now()) {
  if (!persisted?.runningSession) return false;
  // #276 (owner): a client is NEVER taken out of a workout. One that's open
  // or has any set entered is kept, whatever day it was started or for,
  // until the client Completes or Discards it.
  if (persisted.sessionOpen || hasEnteredSet(persisted.activeLog)) return false;
  const savedAt = Number(persisted.savedAt);
  if (Number.isFinite(savedAt) && savedAt > 0 && now - savedAt < ACTIVE_SESSION_GRACE_MS) return false;
  if (persisted.startedOn) return persisted.startedOn !== todayDateKey;
  // Snapshots written before #274 have no startedOn: keep an undated one
  // (it can only be today's — it's re-stamped on the next save); a dated one
  // keeps the old rule.
  return !!persisted.runningSession.date && persisted.runningSession.date !== todayDateKey;
}

function hasEnteredSet(activeLog) {
  if (!activeLog || typeof activeLog !== "object") return false;
  return Object.values(activeLog).some(
    (sets) => Array.isArray(sets) && sets.some((x) => x && (x.completed || (x.reps !== "" && x.reps != null) || (x.weight !== "" && x.weight != null)))
  );
}
