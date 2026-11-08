import { exerciseMuscleKeys, MUSCLE_KEYS } from "../lib/exerciseMuscles";
import { e1rm } from "./trainingRecap";

// Which muscles a Train Solo member has trained recently (#148), for the
// muscle map. Pure, tested.
//
// The exercise library's own muscle fields are patchy (coach-added
// exercises have none; many say "Spine", "Full Body"), so an exercise's
// muscles come from its MOVEMENT first — the same textbook pattern a coach
// would give (bench press → chest, with triceps and front shoulders
// helping) — and only fall back to the listed muscles, then the category,
// when the name doesn't say.
//
// A primary muscle counts each set fully; a secondary one counts half.

export const MUSCLES = MUSCLE_KEYS;

export const MUSCLE_LABELS = {
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  lats: "Lats",
  traps: "Upper back",
  lowerBack: "Lower back",
};

// An exercise's muscles come from the shared movement rules
// (src/lib/exerciseMuscles.js, #149) — the same ones that keep the
// library's Primary / Secondary Muscles correct.
export function musclesFor(exercise) {
  if (!exercise) return { primary: [], secondary: [] };
  // Warm-ups, cool-downs and cardio aren't strength work for the map.
  if (["Warm-up", "Cool-down", "Cardio"].includes(exercise.category)) return { primary: [], secondary: [] };
  return exerciseMuscleKeys(exercise);
}

const HOURS = 3600 * 1000;

// Sets per muscle over the last `hours` (72 by default — about the time a
// trained muscle takes to recover), and when each was last trained.
// Only completed sets with reps count.
export function trainedMuscles(logs = [], exercisesById = {}, { now = Date.now(), hours = 72 } = {}) {
  const since = now - hours * HOURS;
  const out = Object.fromEntries(MUSCLES.map((m) => [m, { sets: 0, last: null }]));
  for (const log of logs) {
    const at = Number(new Date(log?.date));
    if (!at || at < since || at > now + HOURS) continue;
    for (const entry of log.entries || []) {
      const sets = (entry.sets || []).filter((s) => Number(s.reps) > 0).length;
      if (!sets) continue;
      const { primary, secondary } = musclesFor(exercisesById[entry.exerciseId]);
      for (const m of primary) {
        out[m].sets += sets;
        out[m].last = Math.max(out[m].last || 0, at);
      }
      for (const m of secondary) {
        out[m].sets += sets / 2;
        out[m].last = Math.max(out[m].last || 0, at);
      }
    }
  }
  return out;
}

// How strongly to colour a muscle: 0 untouched, else 0.45 → 1 by sets.
export function intensity(sets) {
  if (!sets) return 0;
  if (sets >= 9) return 1;
  if (sets >= 5) return 0.8;
  if (sets >= 2) return 0.62;
  return 0.45;
}

// Trained (most sets first) and ready (not trained in the window).
export function muscleSummary(trained) {
  const worked = MUSCLES.filter((m) => trained[m]?.sets > 0).sort((a, b) => trained[b].sets - trained[a].sets);
  const ready = MUSCLES.filter((m) => !(trained[m]?.sets > 0));
  return { worked, ready };
}

// One muscle's detail for the 3D map's card (#195): completed sets in the
// last 7 days (helpers half), when it was last trained (any age), the best
// estimated max (kg) of an exercise it leads, and those exercises' names
// (most recent first, up to 3). Only the member's own logs.
export function muscleDetail(muscle, logs = [], exercisesById = {}, { now = Date.now() } = {}) {
  const since = now - 7 * 24 * HOURS;
  let sets7 = 0, last = null, bestKg = 0;
  const names = [];
  const sorted = [...logs].sort((a, b) => Number(new Date(b?.date)) - Number(new Date(a?.date)));
  for (const log of sorted) {
    const at = Number(new Date(log?.date));
    if (!at || at > now + HOURS) continue;
    for (const entry of log.entries || []) {
      const ex = exercisesById[entry.exerciseId];
      const { primary, secondary } = musclesFor(ex);
      const isPrimary = primary.includes(muscle);
      if (!isPrimary && !secondary.includes(muscle)) continue;
      const done = (entry.sets || []).filter((s) => Number(s.reps) > 0);
      if (!done.length) continue;
      if (at >= since) sets7 += isPrimary ? done.length : done.length / 2;
      last = Math.max(last || 0, at);
      if (isPrimary) {
        for (const s of done) bestKg = Math.max(bestKg, e1rm(s.weight, s.reps));
        if (ex?.name && !names.includes(ex.name) && names.length < 3) names.push(ex.name);
      }
    }
  }
  return { sets7: Math.round(sets7 * 10) / 10, last, bestKg: bestKg ? Math.round(bestKg * 2) / 2 : null, exercises: names };
}
