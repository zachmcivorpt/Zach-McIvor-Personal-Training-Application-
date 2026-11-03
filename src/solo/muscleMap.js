import { exerciseMuscleKeys, MUSCLE_KEYS } from "../lib/exerciseMuscles";

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
