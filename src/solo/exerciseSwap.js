// Train Solo's exercise swap ("the machine is taken"): alternatives for one
// exercise from the exercise library — same muscle group by default,
// optionally the same equipment, never the exercise itself or one already
// in today's session. Same matching idea as the coached app's
// SwapExerciseSheet, without its "tell your coach why" step.
//
// Coach-added exercises carry category "Custom" and no primaryMuscles, so
// the muscle group falls back to the exercise's name (leg curl → Legs,
// spider curl → Biceps). Warm-up and cool-down moves are only offered in
// place of other warm-up/cool-down moves.
import { matchesSearch } from "../lib/search";

const MUSCLES = new Set(["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Forearms", "Full Body", "Cardio"]);
// Finer muscle names (categories or primaryMuscles) folded into the groups above.
const CATEGORY_ALIASES = {
  "Biceps Brachii": "Biceps", "Bicep Femoris": "Legs", Lats: "Back", "Upper Back": "Back", "Lower Back": "Back", "Back Activation": "Back", Rhomboids: "Back", Traps: "Back", Trapezius: "Back",
  Glutes: "Legs", Hamstrings: "Legs", Quads: "Legs", Quadriceps: "Legs", Calves: "Legs", Delts: "Shoulders", Deltoids: "Shoulders", Pecs: "Chest", Abs: "Core", Obliques: "Core",
};
const PREP = new Set(["Warm-up", "Cool-down"]);

// First match wins, so the specific phrases come before the general words.
const NAME_RULES = [
  [/\b(leg|hamstring|nordic)\s*curl|squat|lunge|deadlift|leg press|leg extension|calf|glute|hip thrust|step[- ]?up|split squat|rdl|good morning/i, "Legs"],
  [/tricep|pushdown|skull ?crusher|\bdips?\b|close[- ]grip|kickback/i, "Triceps"],
  [/overhead press|shoulder press|military|lateral raise|front raise|rear delt|reverse fly|face pull|upright row|external rotation|internal rotation|\by raise|wall angel|\bdelt/i, "Shoulders"],
  [/curl/i, "Biceps"],
  [/row|pull[- ]?up|chin[- ]?up|pulldown|pull[- ]?down|lat\b|pullover|shrug|rack pull/i, "Back"],
  [/bench|chest|fly|flye|push[- ]?up|press[- ]?up|pec/i, "Chest"],
  [/crunch|plank|sit[- ]?up|ab\b|abs\b|oblique|leg raise|hollow|dead ?bug|russian twist|pallof|wood ?chop/i, "Core"],
  [/wrist|forearm|grip/i, "Forearms"],
];

export function primaryMuscleOf(exercise) {
  if (!exercise) return null;
  const category = CATEGORY_ALIASES[exercise.category] || exercise.category;
  if (MUSCLES.has(category)) return category;
  const listed = (exercise.primaryMuscles || [])[0];
  if (listed) return CATEGORY_ALIASES[listed] || listed;
  const rule = NAME_RULES.find(([pattern]) => pattern.test(exercise.name || ""));
  return rule ? rule[1] : null;
}

const isPrep = (exercise) => PREP.has(exercise?.category);

// Words that say nothing about the movement itself.
const FILLER = new Set(["the", "a", "with", "and", "on", "of", "to", "machine", "barbell", "dumbbell", "cable", "band", "bodyweight", "kettlebell", "smith", "single", "arm", "leg", "seated", "standing"]);
const wordsOf = (name) => new Set(String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !FILLER.has(w)));

// How close `candidate` is to `exercise` as a stand-in (#141): the same
// movement pattern in the name counts most (row → row, press → press), then
// the same equipment, then sharing the other muscles worked.
export function swapScore(exercise, candidate) {
  if (!exercise || !candidate) return 0;
  const a = wordsOf(exercise.name);
  let score = 0;
  for (const w of wordsOf(candidate.name)) if (a.has(w)) score += 3;
  if (exercise.equipment && candidate.equipment === exercise.equipment) score += 2;
  const secondary = new Set([...(exercise.primaryMuscles || []), ...(exercise.secondaryMuscles || [])]);
  for (const m of [...(candidate.primaryMuscles || []), ...(candidate.secondaryMuscles || [])]) if (secondary.has(m)) score += 1;
  return score;
}

// Closest matches first (swapScore), then A–Z.
export function swapCandidates(exercise, allExercises, { search = "", sameMuscle = true, sameEquipment = false, excludeIds = new Set(), limit = 40 } = {}) {
  const muscle = primaryMuscleOf(exercise);
  const prep = isPrep(exercise);
  return (allExercises || [])
    .filter((e) => e.id !== exercise?.id && !excludeIds.has(e.id))
    .filter((e) => isPrep(e) === prep)
    .filter((e) => matchesSearch(e.name || "", search))
    .filter((e) => !sameMuscle || !muscle || primaryMuscleOf(e) === muscle)
    .filter((e) => !sameEquipment || !exercise?.equipment || e.equipment === exercise.equipment)
    .map((e) => ({ e, score: swapScore(exercise, e) }))
    .sort((x, y) => y.score - x.score || String(x.e.name).localeCompare(String(y.e.name)))
    .slice(0, limit)
    .map(({ e }) => e);
}
