// Shared helpers for reading a day's `exercises` array — used by every
// screen that shows "N exercises" or "est. X minutes" for a workout
// (coach program/library/client views, and the client's own training
// screens). Centralized so a rest marker row (`{ isRest: true,
// restSeconds }`, added from the coach's workout editor) is excluded
// consistently everywhere instead of needing the same filter re-derived
// in every file that touches a day's exercises.

export function countExercises(exercises) {
  return (exercises || []).filter((e) => !e.isRest).length;
}

export function estimateWorkoutMinutes(exercises) {
  return Math.max(
    5,
    Math.round(
      (exercises || []).reduce((a, e) => a + (e.isRest ? (e.restSeconds ?? 0) : e.targetSets * (45 + (e.restSeconds ?? 90))), 0) / 60
    )
  );
}

export function countWorkoutSets(exercises) {
  return (exercises || []).reduce((a, e) => a + (e.isRest ? 0 : e.targetSets || 0), 0);
}
