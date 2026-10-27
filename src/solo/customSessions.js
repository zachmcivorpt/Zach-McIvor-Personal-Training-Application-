// Free Train Solo training: sessions a customer builds themselves from the
// exercise library (saved in soloCustomSessions/{id}), or a quick empty
// session. Logged into soloWorkoutLogs like any other workout, so Progress,
// PRs and history count them — under the purchaseId `${uid}_custom`, which
// no program purchase can ever have, so they never tick off a program day.
import { localDateKey } from "../lib/dateKey";

const CUSTOM_SUFFIX = "_custom";

export const customPurchaseId = (uid) => `${uid}${CUSTOM_SUFFIX}`;

export function isCustomSessionLog(logOrState) {
  return typeof logOrState?.purchaseId === "string" && logOrState.purchaseId.endsWith(CUSTOM_SUFFIX);
}

export const MAX_SESSION_EXERCISES = 30;
export const REST_OPTIONS = [0, 30, 60, 90, 120, 180, 240];

export function newSessionExercise(exerciseId) {
  return { exerciseId, targetSets: 3, targetReps: 10, targetType: "reps", targetRIR: 2, restSeconds: 90, section: "main" };
}

// The navigation state for SoloWorkoutSessionScreen. Each run gets its own
// weekNumber (date + time), so doing the same session twice in a day logs
// twice instead of overwriting the first.
export function customSessionState(uid, session = null, now = Date.now()) {
  return {
    purchaseId: customPurchaseId(uid),
    programId: null,
    dayId: session?.id || "quick",
    weekNumber: `${localDateKey(new Date(now))}-${now}`,
    day: { label: session?.name?.trim() || "Quick session", exercises: session?.exercises || [] },
  };
}

// What's wrong with a session before it can be saved, or null if it's fine.
export function sessionProblem(session) {
  const name = (session?.name || "").trim();
  if (!name) return "Give your session a name.";
  if (name.length > 60) return "Keep the name under 60 characters.";
  const exercises = session?.exercises || [];
  if (exercises.length === 0) return "Add at least one exercise.";
  if (exercises.length > MAX_SESSION_EXERCISES) return `A session can have up to ${MAX_SESSION_EXERCISES} exercises.`;
  for (const e of exercises) {
    const sets = Number(e.targetSets);
    if (!Number.isInteger(sets) || sets < 1 || sets > 10) return "Each exercise needs 1–10 sets.";
    if (e.targetReps !== "AMRAP") {
      const reps = Number(e.targetReps);
      if (!Number.isInteger(reps) || reps < 1 || reps > 100) return "Reps must be between 1 and 100.";
    }
  }
  return null;
}
