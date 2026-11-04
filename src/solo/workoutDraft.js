// A Train Solo workout in progress, kept on the phone (#157). The sets typed
// into SoloWorkoutSessionScreen used to live only in React state, so iOS
// dropping the page in the background (or a rebuilt web view, or a mis-tap
// on Cancel) lost the whole session. One draft per account, in localStorage
// (it has to survive a rebuilt web view — sessionStorage doesn't), cleared
// when the workout is completed or deliberately discarded.

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // an abandoned draft doesn't come back the next day

const storageKey = (uid) => `apexSoloWorkoutDraft:${uid}`;

// Which session a draft belongs to — the same purchase/day/week the finished
// log's id is built from (logSoloWorkout), so a draft only ever restores into
// the session it was typed in.
export function draftSessionKey(sessionInfo) {
  if (!sessionInfo) return null;
  return `${sessionInfo.purchaseId}_${sessionInfo.dayId}_w${sessionInfo.weekNumber}`;
}

// True when anything worth keeping has been entered: a weight or reps on any
// set, or an exercise added.
export function draftHasWork({ activeLog, extraExercises } = {}) {
  if ((extraExercises || []).length > 0) return true;
  return Object.values(activeLog || {}).some((sets) =>
    (sets || []).some((s) => (s?.weight !== "" && s?.weight != null) || (s?.reps !== "" && s?.reps != null))
  );
}

export function loadWorkoutDraft(uid, now = Date.now()) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.sessionInfo?.day || !draft.key || !(now - (draft.updatedAt || 0) < MAX_AGE_MS)) {
      localStorage.removeItem(storageKey(uid));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveWorkoutDraft(uid, { sessionInfo, activeLog, extraExercises, swaps, startedAt }, now = Date.now()) {
  if (!uid || !sessionInfo) return;
  try {
    localStorage.setItem(
      storageKey(uid),
      JSON.stringify({ key: draftSessionKey(sessionInfo), sessionInfo, activeLog, extraExercises, swaps, startedAt, updatedAt: now })
    );
  } catch {
    // Storage full or blocked: the session still works, it just can't be resumed.
  }
}

// Removes the draft — only the one for `sessionInfo` when given, so opening
// (and leaving) a different session never throws away an unfinished one.
export function clearWorkoutDraft(uid, sessionInfo = null) {
  if (!uid) return;
  try {
    if (sessionInfo) {
      const raw = localStorage.getItem(storageKey(uid));
      const draft = raw ? JSON.parse(raw) : null;
      if (draft && draft.key !== draftSessionKey(sessionInfo)) return;
    }
    localStorage.removeItem(storageKey(uid));
  } catch {
    // Nothing to clear.
  }
}
