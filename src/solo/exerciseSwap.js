// Train Solo's exercise swap ("the machine is taken"): alternatives for one
// exercise from the exercise library — same muscle group by default,
// optionally the same equipment, never the exercise itself or one already
// in today's session. Same matching as the coached app's SwapExerciseSheet,
// without its "tell your coach why" step.
import { matchesSearch } from "../lib/search";

export function primaryMuscleOf(exercise) {
  return exercise?.category || (exercise?.primaryMuscles || [])[0] || null;
}

export function swapCandidates(exercise, allExercises, { search = "", sameMuscle = true, sameEquipment = false, excludeIds = new Set(), limit = 40 } = {}) {
  const muscle = primaryMuscleOf(exercise);
  return (allExercises || [])
    .filter((e) => e.id !== exercise?.id && !excludeIds.has(e.id))
    .filter((e) => matchesSearch(e.name || "", search))
    .filter((e) => !sameMuscle || !muscle || primaryMuscleOf(e) === muscle)
    .filter((e) => !sameEquipment || !exercise?.equipment || e.equipment === exercise.equipment)
    .slice(0, limit);
}
