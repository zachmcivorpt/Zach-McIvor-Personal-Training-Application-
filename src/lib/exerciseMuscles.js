// Every exercise's primary and secondary muscles, from its movement (#149).
// One source of truth for the coach console (Exercises, Training Load,
// insights) and Train Solo (muscle map, swaps): the textbook pattern a
// coach would give — bench press → chest, with triceps and front shoulders
// helping — so the library's muscles are specific and consistent, instead
// of free text that was often blank, vague ("Full Body", "Spine") or
// spelled differently from one exercise to the next.
//
// Muscles are stored as these labels:
export const MUSCLE_LABEL = {
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
  traps: "Upper Back",
  lowerBack: "Lower Back",
};
export const MUSCLE_KEYS = Object.keys(MUSCLE_LABEL);

// [pattern, primary, secondary] — most specific first. Stretches and
// warm-ups come before the lifts they share words with ("Overhead Triceps
// Stretch" is a stretch; "Walking Lunge" is still a lunge).
const P = (pattern, primary, secondary = []) => [pattern, primary, secondary];
export const MOVEMENT_RULES = [
  // Stretches and mobility (the muscle being stretched).
  P(/hamstring stretch|forward fold|standing toe touch/i, ["hamstrings"], ["lowerBack"]),
  P(/quad stretch|quad pull/i, ["quads"]),
  P(/chest stretch|doorway stretch|pec stretch/i, ["chest"], ["shoulders"]),
  P(/calf stretch|ankle circle|ankle mobility/i, ["calves"]),
  P(/triceps? stretch/i, ["triceps"]),
  P(/pigeon|figure[- ]four|glute stretch|hip circle|knee hug|fire hydrant|clam ?shell|leg swings? \(lateral\)|lateral leg swing/i, ["glutes"]),
  P(/leg swings?/i, ["hamstrings", "glutes"]),
  P(/child'?s pose|cat[- ]cow|lower back stretch/i, ["lowerBack"], ["abs"]),
  P(/cobra|upward dog/i, ["abs", "lowerBack"]),
  P(/neck (roll|stretch)|lateral neck|neck circle/i, ["traps"]),
  P(/wrist (circle|stretch)/i, ["forearms"]),
  P(/arm circle|shoulder roll|arm swing|band dislocate|shoulder pass/i, ["shoulders"], ["traps"]),
  P(/scapular push|scap push|serratus/i, ["shoulders"], ["chest"]),
  P(/world'?s greatest stretch|spiderman lunge/i, ["glutes", "hamstrings"], ["obliques", "lowerBack"]),
  P(/inchworm/i, ["hamstrings", "abs"], ["shoulders"]),
  P(/torso twist|side bend|trunk rotation/i, ["obliques"], ["abs"]),
  P(/frankenstein|butt kick/i, ["hamstrings"]),
  P(/high knees/i, ["quads", "abs"], ["calves"]),
  P(/carioca|grapevine/i, ["glutes", "obliques"], ["calves"]),
  P(/skater/i, ["glutes", "quads"], ["calves"]),
  P(/bear crawl/i, ["abs", "shoulders"], ["quads"]),
  P(/jumping jack|star jump/i, ["calves", "shoulders"], ["quads"]),
  P(/squat to stand/i, ["quads", "glutes"], ["hamstrings"]),
  P(/deep breathing|breathwork|box breathing/i, ["abs"]),
  P(/nasal breathing|diaphragm/i, ["abs"]),
  P(/it band/i, ["quads", "glutes"]),
  P(/full body stretch|overhead reach/i, ["lats", "abs"], ["shoulders"]),

  // Full-body and strongman.
  P(/burpee/i, ["chest", "quads"], ["shoulders", "triceps", "abs"]),
  P(/man maker|devil press/i, ["shoulders", "chest", "quads"], ["glutes", "triceps", "abs"]),
  P(/clean (and|&|to) (press|jerk)|clean to press|long cycle|thruster/i, ["shoulders", "quads", "glutes"], ["triceps", "traps", "hamstrings"]),
  P(/\bclean\b|\bsnatch\b/i, ["glutes", "hamstrings", "traps"], ["quads", "shoulders", "lowerBack"]),
  P(/tire flip/i, ["glutes", "hamstrings", "quads"], ["lowerBack", "traps", "biceps"]),
  P(/yoke/i, ["traps", "quads", "abs"], ["glutes", "forearms"]),
  P(/sled (push|drive)|prowler/i, ["quads", "glutes"], ["calves", "shoulders"]),
  P(/sled (pull|drag)/i, ["hamstrings", "glutes"], ["calves", "lats"]),
  P(/battle rope/i, ["shoulders"], ["abs", "forearms"]),
  P(/wall ball/i, ["quads", "shoulders"], ["glutes", "triceps"]),
  P(/box jump|broad jump|jump squat|squat jump|tuck jump|bounding/i, ["quads", "glutes"], ["calves", "hamstrings"]),
  P(/turkish get[- ]?up/i, ["shoulders", "abs"], ["glutes", "obliques"]),

  // Cardio (what does the work).
  P(/rowing (machine|erg|interval)|rowing intervals|concept ?2|ski ?erg/i, ["lats", "quads"], ["hamstrings", "biceps", "abs"]),
  P(/swim|pool/i, ["lats", "shoulders"], ["abs", "triceps"]),
  P(/jump rope|double unders|skipping/i, ["calves"], ["shoulders", "forearms"]),
  P(/boxing|heavy bag|shadow ?box/i, ["shoulders", "obliques"], ["chest", "triceps"]),
  P(/versaclimber|climber machine/i, ["quads", "shoulders"], ["glutes", "lats"]),
  P(/cycling|\bbike\b|spin bike|spin class|stationary cycle/i, ["quads", "glutes"], ["hamstrings", "calves"]),
  P(/elliptical|cross[- ]trainer/i, ["quads", "glutes"], ["hamstrings", "calves"]),
  P(/stair|step mill|stepper/i, ["quads", "glutes"], ["calves", "hamstrings"]),
  P(/\brun\b|running|sprint|\bjog|treadmill|fartlek|shuttle|agility|cone drill|tabata|zone 2|incline walk|power walk|hiking/i, ["quads", "hamstrings", "calves"], ["glutes"]),

  // Lifts.
  P(/leg curl|hamstring curl|nordic/i, ["hamstrings"], ["calves"]),
  P(/leg extension/i, ["quads"]),
  P(/calf|calves|tibialis/i, ["calves"]),
  P(/romanian|\brdl\b|stiff[- ]leg|good morning|single[- ]leg deadlift/i, ["hamstrings", "glutes"], ["lowerBack"]),
  P(/deadlift|rack pull/i, ["hamstrings", "glutes", "lowerBack"], ["traps", "forearms", "quads"]),
  P(/hip thrust|glute bridge|\bbridge\b|glute kickback|cable kickback|donkey kick|frog pump/i, ["glutes"], ["hamstrings"]),
  P(/kettlebell swing|\bswing\b/i, ["glutes", "hamstrings"], ["lowerBack", "shoulders"]),
  P(/back extension|hyperextension|superman|reverse hyper/i, ["lowerBack"], ["glutes", "hamstrings"]),
  P(/adductor|adduction|copenhagen/i, ["quads"], ["glutes"]),
  P(/hip abduct|abduction|lateral band walk|monster walk/i, ["glutes"]),
  P(/squat|leg press|lunge|split squat|step[- ]?up|hack|pistol|wall sit|sissy/i, ["quads", "glutes"], ["hamstrings"]),
  P(/skull ?crusher|tricep|pushdown|push-down|french press|close[- ]grip (bench|press|push)|overhead extension|jm press|\bkickback/i, ["triceps"]),
  P(/\bdips?\b/i, ["triceps", "chest"], ["shoulders"]),
  P(/push[- ]?up|press[- ]?up|bench press|chest press|floor press|\bfly\b|\bflyes?\b|pec deck|crossover|svend|chest dip/i, ["chest"], ["triceps", "shoulders"]),
  P(/shrug/i, ["traps"], ["forearms"]),
  P(/face pull|rear delt|reverse fly|reverse flye|pull[- ]apart|\by[- ]raise|\bt[- ]raise|\bw[- ]raise/i, ["shoulders", "traps"]),
  P(/upright row/i, ["shoulders", "traps"], ["biceps"]),
  P(/overhead press|shoulder press|military|arnold press|push press|\bohp\b|landmine press|z press|handstand/i, ["shoulders"], ["triceps", "traps"]),
  P(/lateral raise|side raise|front raise|lu raise/i, ["shoulders"], ["traps"]),
  P(/pull[- ]?up|chin[- ]?up|pulldown|pull[- ]down|pullover|muscle[- ]up|straight[- ]arm/i, ["lats"], ["biceps", "traps"]),
  P(/\brows?\b|rowing|inverted row|seal row|meadows/i, ["lats", "traps"], ["biceps", "shoulders"]),
  P(/wrist curl|wrist roller|forearm|farmer|carry|grip|dead hang|plate pinch/i, ["forearms"], ["traps", "abs"]),
  P(/curl/i, ["biceps"], ["forearms"]),
  P(/russian twist|wood ?chop|pallof|side plank|oblique|windmill|landmine twist|suitcase/i, ["obliques"], ["abs"]),
  P(/plank|crunch|sit[- ]?up|dead ?bug|hollow|leg raise|knee raise|ab wheel|rollout|mountain climber|v[- ]up|bird ?dog|flutter|l[- ]sit|toes to bar/i, ["abs"], ["obliques"]),
];

// Free-text muscle names already in the library, for anything the
// movement rules don't name.
const SYNONYMS = {
  chest: ["chest"], pecs: ["chest"], pectoralis: ["chest"], "serratus anterior": ["shoulders"],
  shoulders: ["shoulders"], delts: ["shoulders"], deltoids: ["shoulders"],
  biceps: ["biceps"], "biceps brachii": ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearms"], wrists: ["forearms"], grip: ["forearms"],
  core: ["abs"], abs: ["abs"], abdominals: ["abs"], obliques: ["obliques"],
  quads: ["quads"], quadriceps: ["quads"], "hip flexors": ["quads"], adductors: ["quads"], "hip adductors": ["quads"], groin: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"], hips: ["glutes"],
  calves: ["calves"], ankles: ["calves"],
  lats: ["lats"], back: ["lats", "traps"], "upper back": ["traps"], rhomboids: ["traps"], traps: ["traps"], trapezius: ["traps"], neck: ["traps"],
  "lower back": ["lowerBack"], spine: ["lowerBack"], "thoracic spine": ["traps"], "erector spinae": ["lowerBack"],
  legs: ["quads", "hamstrings", "glutes"],
};
export function musclesFromNames(names = []) {
  const keys = [];
  for (const n of names || []) {
    const k = String(n || "").trim().toLowerCase();
    const label = MUSCLE_KEYS.find((key) => MUSCLE_LABEL[key].toLowerCase() === k);
    for (const m of label ? [label] : SYNONYMS[k] || []) if (!keys.includes(m)) keys.push(m);
  }
  return keys;
}

// Presses and extensions the name doesn't place: the exercise's category
// says which (a "Seated Dumbbell Press" filed under Shoulders is a
// shoulder press; "Tate Press" under Triceps is a triceps press).
const BY_CATEGORY = {
  press: { Chest: [["chest"], ["triceps", "shoulders"]], Shoulders: [["shoulders"], ["triceps", "traps"]], Triceps: [["triceps"], ["chest"]] },
  extension: { Triceps: [["triceps"], []], Legs: [["quads"], []], Back: [["lowerBack"], ["glutes"]] },
};

// The movement's muscles as keys, or null when the name doesn't say.
// Accepts a name, or an exercise ({ name, category }).
export function movementMuscles(nameOrExercise) {
  const name = typeof nameOrExercise === "string" ? nameOrExercise : nameOrExercise?.name || "";
  const category = typeof nameOrExercise === "string" ? null : nameOrExercise?.category;
  for (const [pattern, primary, secondary] of MOVEMENT_RULES) {
    if (pattern.test(name)) return { primary: [...primary], secondary: secondary.filter((m) => !primary.includes(m)) };
  }
  for (const [word, byCat] of Object.entries(BY_CATEGORY)) {
    if (new RegExp(`\\b${word}`, "i").test(name) && category && byCat[category]) {
      const [primary, secondary] = byCat[category];
      return { primary: [...primary], secondary: [...secondary] };
    }
  }
  return null;
}

// An exercise's muscles as keys: its movement, else its listed muscles
// (normalised), else its category.
export function exerciseMuscleKeys(exercise) {
  if (!exercise) return { primary: [], secondary: [] };
  const byMovement = movementMuscles(exercise);
  if (byMovement) return byMovement;
  const primary = musclesFromNames(exercise.primaryMuscles);
  if (primary.length) return { primary, secondary: musclesFromNames(exercise.secondaryMuscles).filter((m) => !primary.includes(m)) };
  return { primary: musclesFromNames([exercise.category]), secondary: [] };
}

// The fields to store on the exercise: { primaryMuscles, secondaryMuscles }
// as labels.
export function canonicalMuscleFields(exercise) {
  const { primary, secondary } = exerciseMuscleKeys(exercise);
  return { primaryMuscles: primary.map((k) => MUSCLE_LABEL[k]), secondaryMuscles: secondary.map((k) => MUSCLE_LABEL[k]) };
}

const same = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

// Exercises whose stored muscles differ from their movement's — the
// one-time correction. Exercises the rules can't place keep theirs.
export function muscleCorrections(exercises = []) {
  const out = [];
  for (const ex of exercises) {
    if (!ex?.id) continue;
    const fields = canonicalMuscleFields(ex);
    if (!fields.primaryMuscles.length) continue;
    if (same(fields.primaryMuscles, ex.primaryMuscles || []) && same(fields.secondaryMuscles, ex.secondaryMuscles || [])) continue;
    out.push({ id: ex.id, fields });
  }
  return out;
}
