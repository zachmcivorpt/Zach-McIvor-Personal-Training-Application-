// Ready-made program templates the coach can import in one click from the
// Program Templates screen, then edit freely like any other template.
// Exercise ids reference the shared seed exercise library (src/lib/seed.js).
//
// Each template is authored once at "hypertrophy" baseline loading, then
// expanded into a real 3-phase, 12-week periodised block — the same day
// structure and exercise selection throughout, with sets/reps/RIR scaled
// per phase (a standard, legitimate way to periodise a mesocycle without
// changing the movements clients are already used to):
//   Weeks 1-4  Stabilisation & Body Recomposition — higher reps, lighter, more RIR buffer
//   Weeks 5-8  Hypertrophy & Body Recomposition   — as authored below
//   Weeks 9-12 Strength                            — lower reps, heavier, less RIR buffer

function d(label, muscleGroups, exercises) {
  return { id: `d_${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label, muscleGroups, exercises };
}

function ex(exerciseId, targetSets, targetReps, targetRIR = 2, notes = "", section = "main") {
  return { exerciseId, targetSets, targetReps, targetRIR, notes, section };
}

const PHASES = [
  { id: "ph1", name: "Stabilisation & Body Recomposition Phase", durationWeeks: 4, kind: "stabilisation" },
  { id: "ph2", name: "Hypertrophy & Body Recomposition Phase", durationWeeks: 4, kind: "hypertrophy" },
  { id: "ph3", name: "Strength Phase", durationWeeks: 4, kind: "strength" },
];

// Timed/carry-style entries are authored with targetReps: 1 (the real
// prescription lives in notes, e.g. "Hold 45-60 seconds") — leave those
// alone rather than rep-scaling them into nonsense.
function scaleExercise(e, kind) {
  if (e.targetReps === 1 || kind === "hypertrophy") return { ...e };
  if (kind === "stabilisation") {
    return {
      ...e,
      targetSets: Math.max(2, e.targetSets - 1),
      targetReps: Math.min(20, Math.max(12, Math.round(e.targetReps * 1.5))),
      targetRIR: Math.min(3, e.targetRIR + 1),
    };
  }
  // strength
  return {
    ...e,
    targetSets: e.targetSets + 1,
    targetReps: Math.min(6, Math.max(3, Math.round(e.targetReps * 0.4))),
    targetRIR: Math.max(0, e.targetRIR - 1),
  };
}

function scaleDay(day, kind) {
  return { ...day, id: `${day.id}-${kind}`, exercises: day.exercises.map((e) => scaleExercise(e, kind)) };
}

// Takes the hypertrophy-baseline days and produces the full 3-phase block.
function periodisedPhases(days) {
  return PHASES.map((phase) => ({
    id: phase.id,
    name: phase.name,
    durationWeeks: phase.durationWeeks,
    days: days.map((day) => scaleDay(day, phase.kind)),
  }));
}

export const STARTER_PROGRAMS = [
  {
    name: "5-Day Push/Pull/Lower/Upper Training System",
    level: "Intermediate",
    description: "Classic 5-day PPLUL rotation — push, pull, legs, then a second upper/lower pass for extra frequency. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Push Day", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_bench-press", 4, 6, 2, "Top set heavy, back-off sets at the same weight."),
        ex("ex_incline-dumbbell-press", 3, 10, 2),
        ex("ex_overhead-press", 3, 8, 2),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Pull Day", ["Back", "Biceps"], [
        ex("ex_bent-over-bb-row", 4, 8, 2, "Chest up, pull to the lower ribs."),
        ex("ex_lat-pulldown", 3, 10, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Legs Day", ["Legs", "Core"], [
        ex("ex_squat", 4, 6, 2, "Hit depth, drive through the whole foot."),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-press", 3, 12, 1),
        ex("ex_leg-extension", 2, 15, 1),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
      d("Upper Body", ["Chest", "Back", "Shoulders", "Arms"], [
        ex("ex_incline-bb-bench-press", 4, 8, 2),
        ex("ex_pull-up", 3, 8, 2, "Add weight once bodyweight reps exceed 12."),
        ex("ex_db-shoulder-press", 3, 10, 2),
        ex("ex_cable-fly", 3, 12, 1),
        ex("ex_hammer-curl", 3, 12, 1),
        ex("ex_rope-pushdown", 3, 12, 1),
      ]),
      d("Lower Body", ["Legs"], [
        ex("ex_leg-press", 4, 10, 2),
        ex("ex_bulgarian-split-squat", 3, 10, 2, "Per leg."),
        ex("ex_lying-leg-curl", 3, 12, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
        ex("ex_hanging-knee-raise", 3, 15, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Comprehensive Hypertrophy Split",
    level: "Intermediate",
    description: "Traditional body-part split for maximum per-muscle volume and mind-muscle focus. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Chest", ["Chest", "Triceps"], [
        ex("ex_bench-press", 4, 8, 2),
        ex("ex_incline-dumbbell-press", 4, 10, 2),
        ex("ex_flat-db-fly", 3, 12, 1),
        ex("ex_cable-crossover", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Back", ["Back", "Biceps"], [
        ex("ex_conventional-deadlift", 3, 5, 2, "Reset each rep, brace hard."),
        ex("ex_lat-pulldown", 4, 10, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_straight-arm-pulldown", 3, 12, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Legs", ["Legs", "Core"], [
        ex("ex_squat", 4, 8, 2),
        ex("ex_leg-press", 3, 12, 1),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-extension", 3, 15, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
      d("Shoulders & Abs", ["Shoulders", "Core"], [
        ex("ex_overhead-press", 4, 8, 2),
        ex("ex_lateral-raise", 4, 15, 1),
        ex("ex_rear-delt-fly", 3, 15, 1),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_cable-crunch", 3, 15, 1),
        ex("ex_hanging-knee-raise", 3, 12, 1),
      ]),
      d("Arms", ["Biceps", "Triceps"], [
        ex("ex_ez-bar-curl", 4, 10, 1),
        ex("ex_skull-crusher", 4, 10, 1),
        ex("ex_hammer-curl", 3, 12, 1),
        ex("ex_rope-pushdown", 3, 12, 1),
        ex("ex_concentration-curl", 2, 15, 1),
        ex("ex_diamond-push-up", 2, 15, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Structured Resistance Training Program",
    level: "Intermediate",
    description: "Power days early in the week for heavy compounds, hypertrophy days later for volume and finish work. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Upper Power", ["Chest", "Back", "Shoulders"], [
        ex("ex_bench-press", 5, 5, 2, "Heavy, controlled — build to a top set."),
        ex("ex_bent-over-bb-row", 5, 5, 2),
        ex("ex_overhead-press", 4, 6, 2),
        ex("ex_lat-pulldown", 3, 8, 2),
      ]),
      d("Lower Power", ["Legs"], [
        ex("ex_squat", 5, 5, 2, "Heavy, controlled — build to a top set."),
        ex("ex_romanian-deadlift", 4, 6, 2),
        ex("ex_leg-press", 3, 10, 2),
        ex("ex_standing-calf-raise", 4, 12, 1),
      ]),
      d("Push Hypertrophy", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_incline-dumbbell-press", 4, 10, 1),
        ex("ex_cable-fly", 3, 12, 1),
        ex("ex_db-shoulder-press", 3, 10, 1),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Pull Hypertrophy", ["Back", "Biceps"], [
        ex("ex_seated-row", 4, 10, 1),
        ex("ex_wide-grip-lat-pulldown", 3, 12, 1),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_hammer-curl", 3, 12, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Legs Hypertrophy", ["Legs", "Core"], [
        ex("ex_bulgarian-split-squat", 3, 10, 1, "Per leg."),
        ex("ex_leg-extension", 3, 15, 1),
        ex("ex_lying-leg-curl", 3, 12, 1),
        ex("ex_cable-pull-through", 3, 12, 1),
        ex("ex_cable-crunch", 3, 15, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Upper-Body Emphasis Training Split",
    level: "Intermediate",
    description: "Four upper-body sessions and one dedicated leg day for clients prioritising upper-body size and strength. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Chest & Triceps", ["Chest", "Triceps"], [
        ex("ex_bench-press", 4, 8, 2),
        ex("ex_incline-dumbbell-press", 3, 10, 2),
        ex("ex_cable-crossover", 3, 12, 1),
        ex("ex_skull-crusher", 3, 10, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Back & Biceps", ["Back", "Biceps"], [
        ex("ex_bent-over-bb-row", 4, 8, 2),
        ex("ex_lat-pulldown", 3, 10, 2),
        ex("ex_seated-row", 3, 10, 1),
        ex("ex_ez-bar-curl", 3, 10, 1),
        ex("ex_hammer-curl", 3, 12, 1),
      ]),
      d("Shoulders & Arms", ["Shoulders", "Biceps", "Triceps"], [
        ex("ex_overhead-press", 4, 8, 2),
        ex("ex_lateral-raise", 4, 15, 1),
        ex("ex_rear-delt-fly", 3, 15, 1),
        ex("ex_cable-bicep-curl", 3, 12, 1),
        ex("ex_rope-pushdown", 3, 12, 1),
      ]),
      d("Chest & Back", ["Chest", "Back"], [
        ex("ex_incline-bb-bench-press", 4, 8, 2),
        ex("ex_pull-up", 4, 8, 2, "Add weight once bodyweight reps exceed 12."),
        ex("ex_flat-db-fly", 3, 12, 1),
        ex("ex_straight-arm-pulldown", 3, 12, 1),
        ex("ex_face-pull", 3, 15, 1),
      ]),
      d("Legs", ["Legs", "Core"], [
        ex("ex_squat", 4, 8, 2),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-press", 3, 12, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
    ]),
  },
  {
    name: "5-Day Progressive Strength & Hypertrophy Program",
    level: "Advanced",
    description: "Powerbuilding split — one heavy main lift per day, backed by hypertrophy accessory work. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Squat Day", ["Legs", "Core"], [
        ex("ex_squat", 5, 5, 2, "Build to a heavy top set for the week."),
        ex("ex_leg-press", 3, 10, 1),
        ex("ex_leg-extension", 3, 15, 1),
        ex("ex_hanging-knee-raise", 3, 15, 1),
      ]),
      d("Bench Day", ["Chest", "Triceps"], [
        ex("ex_bench-press", 5, 5, 2, "Build to a heavy top set for the week."),
        ex("ex_incline-dumbbell-press", 3, 10, 1),
        ex("ex_cable-fly", 3, 12, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Deadlift Day", ["Back", "Legs"], [
        ex("ex_conventional-deadlift", 5, 4, 2, "Build to a heavy top set for the week. Reset each rep."),
        ex("ex_bent-over-bb-row", 3, 8, 1),
        ex("ex_lat-pulldown", 3, 10, 1),
        ex("ex_barbell-shrug", 3, 12, 1),
      ]),
      d("Overhead Press Day", ["Shoulders", "Triceps"], [
        ex("ex_overhead-press", 5, 5, 2, "Build to a heavy top set for the week."),
        ex("ex_db-shoulder-press", 3, 10, 1),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_rope-pushdown", 3, 12, 1),
      ]),
      d("Hypertrophy Accessory Day", ["Biceps", "Triceps", "Core"], [
        ex("ex_ez-bar-curl", 3, 10, 1),
        ex("ex_hammer-curl", 3, 12, 1),
        ex("ex_skull-crusher", 3, 10, 1),
        ex("ex_lying-leg-curl", 3, 12, 1),
        ex("ex_cable-crunch", 3, 15, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Comprehensive Development Program",
    level: "Intermediate",
    description: "Two full-body sessions bookend a push/pull/legs middle for balanced strength and size development. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Full Body A", ["Legs", "Chest", "Back"], [
        ex("ex_squat", 4, 6, 2),
        ex("ex_bench-press", 3, 8, 2),
        ex("ex_bent-over-bb-row", 3, 8, 2),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
      d("Push Day", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_incline-dumbbell-press", 4, 10, 2),
        ex("ex_overhead-press", 3, 8, 2),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Pull Day", ["Back", "Biceps"], [
        ex("ex_lat-pulldown", 4, 10, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Legs Day", ["Legs"], [
        ex("ex_leg-press", 4, 10, 2),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-extension", 3, 15, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
      ]),
      d("Full Body B", ["Legs", "Chest", "Back", "Shoulders"], [
        ex("ex_front-squat", 3, 8, 2),
        ex("ex_pull-up", 3, 8, 2, "Add weight once bodyweight reps exceed 12."),
        ex("ex_db-shoulder-press", 3, 10, 1),
        ex("ex_hanging-knee-raise", 3, 15, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Push/Pull/Lower/Core/Upper Protocol",
    level: "Intermediate",
    description: "A push/pull/lower base with a dedicated core & conditioning day and a finishing upper session. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Push Day", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_bench-press", 4, 8, 2),
        ex("ex_db-shoulder-press", 3, 10, 2),
        ex("ex_cable-fly", 3, 12, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Pull Day", ["Back", "Biceps"], [
        ex("ex_bent-over-bb-row", 4, 8, 2),
        ex("ex_lat-pulldown", 3, 10, 2),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Lower Body", ["Legs"], [
        ex("ex_squat", 4, 8, 2),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-press", 3, 12, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
      ]),
      d("Core & Conditioning", ["Core", "Cardio"], [
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
        ex("ex_hanging-leg-raise", 3, 12, 1),
        ex("ex_cable-crunch", 3, 15, 1),
        ex("ex_russian-twist", 3, 20, 1),
        ex("ex_assault-bike", 5, 1, 1, "5 rounds of 30s hard / 30s easy."),
      ]),
      d("Upper Body", ["Chest", "Back", "Shoulders", "Arms"], [
        ex("ex_incline-bb-bench-press", 3, 10, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_hammer-curl", 3, 12, 1),
        ex("ex_rope-pushdown", 3, 12, 1),
      ]),
    ]),
  },
  {
    name: "5-Day Periodised Resistance Training Split",
    level: "Advanced",
    description: "Heavy strength days early in the week, hypertrophy volume mid-week, lighter accessory/conditioning to close it out. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Heavy Lower (Strength)", ["Legs"], [
        ex("ex_squat", 5, 5, 1, "Heavy — 1-2 reps left in the tank."),
        ex("ex_romanian-deadlift", 4, 6, 2),
        ex("ex_leg-press", 3, 8, 2),
      ]),
      d("Heavy Upper (Strength)", ["Chest", "Back"], [
        ex("ex_bench-press", 5, 5, 1, "Heavy — 1-2 reps left in the tank."),
        ex("ex_bent-over-bb-row", 4, 6, 2),
        ex("ex_overhead-press", 3, 6, 2),
      ]),
      d("Hypertrophy Push", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_incline-dumbbell-press", 4, 10, 1),
        ex("ex_cable-fly", 3, 12, 1),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Hypertrophy Pull", ["Back", "Biceps"], [
        ex("ex_lat-pulldown", 4, 10, 1),
        ex("ex_seated-row", 3, 12, 1),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Accessory & Conditioning", ["Legs", "Core", "Cardio"], [
        ex("ex_leg-extension", 3, 15, 1),
        ex("ex_lying-leg-curl", 3, 15, 1),
        ex("ex_standing-calf-raise", 4, 15, 1),
        ex("ex_cable-crunch", 3, 15, 1),
        ex("ex_rowing-machine", 1, 1, 1, "10-15 min easy pace."),
      ]),
    ]),
  },
  {
    name: "3-Day Push/Pull/Legs Training System",
    level: "Beginner",
    description: "The classic 3-day PPL rotation — a great starting split for clients training three times a week. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Push Day", ["Chest", "Shoulders", "Triceps"], [
        ex("ex_bench-press", 4, 8, 2),
        ex("ex_incline-dumbbell-press", 3, 10, 2),
        ex("ex_overhead-press", 3, 8, 2),
        ex("ex_lateral-raise", 3, 15, 1),
        ex("ex_tricep-pushdown", 3, 12, 1),
      ]),
      d("Pull Day", ["Back", "Biceps"], [
        ex("ex_lat-pulldown", 4, 10, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_face-pull", 3, 15, 1),
        ex("ex_bicep-curl", 3, 10, 1),
      ]),
      d("Legs Day", ["Legs", "Core"], [
        ex("ex_squat", 4, 8, 2),
        ex("ex_romanian-deadlift", 3, 10, 2),
        ex("ex_leg-press", 3, 12, 1),
        ex("ex_standing-calf-raise", 3, 15, 1),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
    ]),
  },
  {
    name: "3-Day Full-Body Strength Program",
    level: "Intermediate",
    description: "Three full-body sessions built around the big compound lifts, rotating emphasis each day. Periodised across a 12-week block.",
    phases: periodisedPhases([
      d("Full Body A — Squat Focus", ["Legs", "Chest", "Back"], [
        ex("ex_squat", 4, 6, 2),
        ex("ex_bench-press", 3, 8, 2),
        ex("ex_seated-row", 3, 10, 2),
        ex("ex_plank", 3, 1, 1, "Hold 45-60 seconds."),
      ]),
      d("Full Body B — Bench Focus", ["Chest", "Legs", "Back"], [
        ex("ex_bench-press", 4, 6, 2),
        ex("ex_leg-press", 3, 10, 2),
        ex("ex_lat-pulldown", 3, 10, 2),
        ex("ex_hanging-knee-raise", 3, 15, 1),
      ]),
      d("Full Body C — Deadlift Focus", ["Back", "Legs", "Shoulders"], [
        ex("ex_conventional-deadlift", 4, 5, 2, "Reset each rep, brace hard."),
        ex("ex_overhead-press", 3, 8, 2),
        ex("ex_bulgarian-split-squat", 3, 10, 1, "Per leg."),
        ex("ex_cable-crunch", 3, 15, 1),
      ]),
    ]),
  },
  {
    // Zach's actual "Beginner Push Pull Legs" program, imported from his
    // Trainerize library. Only the first 4-week phase (Stabilisation &
    // Hypertrophy) is built out — his weeks 5-8 and 8-12 phases weren't
    // provided, so this ships as a single-phase program for now rather
    // than guessing at what those two phases contain. Add them the same
    // way once you've got that content ready.
    name: "Beginner Push Pull Legs",
    level: "Beginner",
    description:
      "12-Week Push-Pull-Legs (PPL) Beginner Program. Designed for beginners to build a strong training foundation with a focus on form and technique, eccentric control, and full warm-up/cool-down routines each session.",
    phases: [
      {
        id: "ph1",
        name: "Stabilisation & Hypertrophy Phase",
        durationWeeks: 4,
        days: [
          d("Leg Day Beginner", ["Legs"], [
            ex("ex_dynamic-frog-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_dynamic-hip-flexor-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_lower-calf-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-pigeon-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_dynamic-side-lunge-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_smith-machine-back-squat", 3, 10, 2, "3-1-2 tempo."),
            ex("ex_hack-squat-machine", 3, 12, 2, "3-1-2 tempo."),
            ex("ex_lying-hamstring-curl", 3, 12, 2, "3-1-2 tempo."),
            ex("ex_machine-seated-leg-extension", 2, 10, 2, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_machine-seated-hip-adduction", 3, 10, 2, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_foam-roller-calf", 2, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-hamstring", 2, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-glute", 2, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_dynamic-hamstring-stretch", 2, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_lying-piriformis-stretch", 2, 1, 1, "20 seconds each side.", "cooldown"),
          ]),
          d("Pull Day Beginner", ["Back", "Biceps"], [
            ex("ex_suspension-standing-figure-four-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_dynamic-hip-flexor-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-pigeon-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_suspension-low-back-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-frog-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_dumbbell-incline-bench-row", 3, 12, 2, "2-1-3 tempo."),
            ex("ex_lat-pulldown-supinated-grip", 3, 10, 2, "2-1-3 tempo."),
            ex("ex_cable-seated-close-grip-row", 2, 10, 2, "2-1-3 tempo."),
            ex("ex_kneeling-single-arm-lat-pulldown", 3, 10, 2, "2-1-3 tempo."),
            ex("ex_dumbbell-incline-alternating-curl", 2, 10, 2, "2-1-3 tempo."),
            ex("ex_preacher-curl-machine", 3, 10, 2, "2-1-3 tempo."),
            ex("ex_stairmaster", 1, 1, 1, "10 minutes — monitor heart rate on the machine."),
            ex("ex_foam-roller-lower-back", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_foam-roller-back", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_suspension-low-back-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_forward-fold-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
          ]),
          d("Push Day Beginner", ["Chest", "Shoulders", "Triceps"], [
            ex("ex_arm-circles", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_dynamic-frog-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-lat-tricep-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_suspension-low-back-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_suspension-chest-stretch", 2, 1, 1, "20 seconds.", "warmup"),
            ex("ex_smith-machine-bench-press", 3, 10, 2, "3-1-1 tempo."),
            ex("ex_machine-seated-chest-fly", 3, 10, 2, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_machine-lateral-raise", 2, 10, 1, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_machine-seated-chest-fly", 3, 10, 2, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_machine-seated-shoulder-press", 3, 10, 2, "Drop set on the last set. 2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_cable-v-bar-tricep-pushdown", 3, 10, 2, "2-1-2 tempo, ~70% of your 1RM."),
            ex("ex_treadmill", 1, 1, 1, "15 minutes — monitor heart rate on the machine."),
            ex("ex_suspension-standing-figure-four-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_static-lat-tricep-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_foam-roller-chest", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_neck-stretch-lateral", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_dynamic-frog-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
          ]),
        ],
      },
    ],
  },
  {
    // Zach's actual "Intermediate Push Pull Legs Upper" program. His phase 1
    // (Stabilisation & Hypertrophy) has 7 workouts total; only 3 were
    // provided in enough detail to build accurately — HIIT Session, Lower
    // Body Intermediate, and Lower Body Mobility Session. Pull Day
    // Intermediate, Push Day Intermediate, Steady State Cardiovascular, and
    // Upper Body Day still need their exercise lists before they can be
    // added here — do NOT guess at their content.
    name: "Intermediate Push Pull Legs Upper",
    level: "Intermediate",
    description:
      "12-Week Bulking Program for Men (Push-Pull Upper-Lower Split). This 12-week training block combines heavy compound lifts with dedicated mobility and conditioning sessions.",
    phases: [
      {
        id: "ph1",
        name: "Stabilisation & Hypertrophy Phase",
        durationWeeks: 4,
        days: [
          {
            id: "d_hiit-session",
            label: "HIIT Session",
            muscleGroups: ["Cardio", "Core"],
            exercises: [
              { exerciseId: "ex_battle-rope-high-plank-alt-slams", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_plyo-push-up", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_cross-body-mountain-climber", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_dumbbell-alternating-shoulder-press", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_hollow-body-hold-flutter-kicks", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_medicine-ball-hollow-hold-press", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "AMRAP.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_rowing-machine", section: "main", targetSets: 3, targetType: "time", targetReps: 60, targetRIR: 1, notes: "Strong finish — target the anaerobic system.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_farmer-walk", section: "main", targetSets: 3, targetType: "time", targetReps: 40, targetRIR: 1, notes: "Heavy load — use kettlebells.", groupId: "hiit-circuit", groupType: "circuit" },
              { exerciseId: "ex_nasal-breathing", section: "main", targetSets: 3, targetType: "time", targetReps: 30, targetRIR: 1, notes: "Focus on nasal breathing only.", groupId: "hiit-circuit", groupType: "circuit" },
            ],
          },
          d("Lower Body Intermediate", ["Legs"], [
            ex("ex_cross-leg-stretch", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_dynamic-hip-flexor-stretch", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_banded-spanish-squat-isometric", 3, 10, 2, "Pause at the bottom for 2 seconds."),
            ex("ex_banded-leg-extension-isometric", 2, 6, 2, "On the injured leg — 30 seconds each rep."),
            ex("ex_machine-seated-leg-extension", 2, 10, 2, "Quad activation focus. 1-2-4 tempo, slow eccentric."),
            ex("ex_dumbbell-walking-lunge", 3, 1, 1, "15 meters — ~70% of your 1RM."),
            ex("ex_zercher-squat", 2, 10, 2, "Focus on form first — 50% of your 1RM."),
            ex("ex_trap-bar-deadlift", 2, 10, 2, "Feet shoulder-width apart."),
            ex("ex_front-squat", 3, 10, 2, "Controlled — start at ~70% of your 1RM."),
            ex("ex_kettlebell-racked-carry", 3, 1, 1, "15 meters — shoulders back, squeeze your lats, elbows in."),
            ex("ex_lying-piriformis-stretch", 1, 1, 1, "30 seconds.", "cooldown"),
            ex("ex_lying-knee-hugs", 1, 1, 1, "30 seconds each.", "cooldown"),
            ex("ex_childs-pose", 1, 1, 1, "30 seconds.", "cooldown"),
            ex("ex_foam-roller-lower-back", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-calf", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-hamstring", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-glute", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_hip-90-90-switch", 3, 1, 1, "", "cooldown"),
            ex("ex_dynamic-rfe-split-squat-stretch", 3, 1, 1, "", "cooldown"),
          ]),
          d("Lower Body Mobility Session (Performance Based)", ["Legs", "Hips"], [
            ex("ex_hip-car", 2, 15, 1, "Each side.", "warmup"),
            ex("ex_runners-lunge-hip-flexor-stretch", 2, 15, 1, "Each side.", "warmup"),
            ex("ex_dynamic-pigeon", 2, 10, 1, "Each side.", "warmup"),
            ex("ex_hip-90-90-switch", 2, 1, 1, "", "warmup"),
            ex("ex_mini-band-clamshell", 3, 12, 1, "Each side."),
            ex("ex_kettlebell-hip-flexion", 3, 12, 1, "Each side — 4kg kettlebell."),
            ex("ex_kettlebell-loaded-butterfly", 2, 1, 1, "45 seconds each."),
            ex("ex_straight-leg-raise-hip-flexor", 3, 15, 1, "Each side."),
            ex("ex_static-pigeon-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
            ex("ex_static-hip-flexor-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
            ex("ex_static-frog-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
          ]),
        ],
      },
    ],
  },
  {
    // Zach's actual "Sculpt & Strengthen Women" program — all 5 phase-1
    // workouts now built. Its own Lower Body Mobility Session (Performance
    // Based) turned out genuinely different from the one built for the
    // Intermediate PPL Upper program (fewer sets on several exercises,
    // shorter hold on the kettlebell butterfly) — good thing that wasn't
    // assumed to be identical.
    name: "Sculpt & Strengthen Women",
    level: "Intermediate",
    description:
      "4-week Stabilisation block built around glute/hamstring and quad/glute focused lower-body days, plus upper-body pull and shoulder/core work, each with full warm-up and cool-down routines.",
    phases: [
      {
        id: "ph1",
        name: "Stabilisation Phase",
        durationWeeks: 4,
        days: [
          d("Back & Shoulders & Core", ["Back", "Shoulders", "Core"], [
            ex("ex_static-rear-delt-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_suspension-neck-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-frog-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_suspension-low-back-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_superband-standing-row", 2, 12, 2, "Activation."),
            ex("ex_dumbbell-single-arm-row", 2, 10, 2, "2-1-3 tempo."),
            ex("ex_close-grip-lat-pulldown", 2, 12, 2, "2-2-3 tempo."),
            ex("ex_cable-seated-wide-grip-row", 3, 10, 2, "2-1-3 tempo."),
            ex("ex_standing-lat-push-down", 3, 10, 2, "2-1-3 tempo."),
            ex("ex_kneeling-face-pull", 4, 10, 2, "2-2-3 tempo."),
            ex("ex_dumbbell-alternating-bicep-curl", 3, 12, 1, "2-2-3 tempo."),
            ex("ex_foam-roller-lower-back", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_suspension-low-back-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_static-oblique-lat-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_runner-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
            ex("ex_forward-fold-stretch", 2, 1, 1, "20 seconds.", "cooldown"),
          ]),
          d("Lower Body (Glute & Hamstring Focused Day I)", ["Legs", "Glutes"], [
            ex("ex_dynamic-frog-stretch", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_piriformis-stretch-seated", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_dynamic-side-lunge-stretch", 1, 1, 1, "", "warmup"),
            ex("ex_static-distal-hamstring-stretch", 1, 1, 1, "", "warmup"),
            ex("ex_banded-bodyweight-squat", 1, 15, 1, "For glute activation."),
            ex("ex_banded-seated-hip-abduction", 1, 15, 1, "For glute activation."),
            ex("ex_kas-glute-bridge-barbell", 2, 10, 2, "2-2-2 tempo."),
            ex("ex_elevated-smith-machine-rdl", 3, 8, 2, "2-2-2 tempo."),
            ex("ex_glute-medius-kickback", 3, 10, 2, "2-2-3 tempo."),
            { exerciseId: "ex_machine-seated-abduction", section: "main", targetSets: 2, targetReps: 10, targetRIR: 0, notes: "3-2-3 tempo.", groupId: "glute-superset", groupType: "superset" },
            { exerciseId: "ex_machine-hip-abduction-leaning", section: "main", targetSets: 2, targetReps: 10, targetRIR: 0, notes: "3-2-3 tempo.", groupId: "glute-superset", groupType: "superset" },
            ex("ex_foam-roller-lower-back", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-hamstring", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-glute", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-adductor", 1, 1, 1, "20 seconds each side.", "cooldown"),
          ]),
          d("Lower Body (Quad & Glute Focused Day II)", ["Legs", "Glutes"], [
            ex("ex_dynamic-frog-stretch", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_piriformis-stretch-seated", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_dynamic-side-lunge-stretch", 1, 1, 1, "", "warmup"),
            ex("ex_static-distal-hamstring-stretch", 1, 1, 1, "", "warmup"),
            ex("ex_smith-machine-back-squat", 2, 8, 2, "3-2-2 tempo."),
            ex("ex_angled-machine-sumo-leg-press", 3, 10, 2, "3-P(2)-2 tempo."),
            ex("ex_hyperextension-roman-chair-back-extension", 2, 10, 2, "Slow and controlled."),
            ex("ex_lying-hamstring-curl", 3, 12, 1, "3-P(2)-2 tempo."),
            ex("ex_machine-seated-leg-extension", 3, 10, 1, "3-P(2)-2 tempo."),
            ex("ex_foam-roller-lower-back", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-hamstring", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-glute", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_foam-roller-adductor", 1, 1, 1, "20 seconds each side.", "cooldown"),
          ]),
          d("Lower Body Mobility Session (Performance Based)", ["Legs", "Hips"], [
            ex("ex_hip-car", 2, 15, 1, "Each side.", "warmup"),
            ex("ex_runners-lunge-hip-flexor-stretch", 2, 15, 1, "Each side.", "warmup"),
            ex("ex_dynamic-pigeon", 2, 10, 1, "Each side.", "warmup"),
            ex("ex_hip-90-90-switch", 2, 1, 1, "", "warmup"),
            ex("ex_mini-band-clamshell", 2, 12, 1, "Each side."),
            ex("ex_kettlebell-hip-flexion", 3, 12, 1, "Each side — 4kg kettlebell."),
            ex("ex_kettlebell-loaded-butterfly", 2, 1, 1, "30 seconds each."),
            ex("ex_straight-leg-raise-hip-flexor", 2, 12, 1, "Each side."),
            ex("ex_static-pigeon-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
            ex("ex_static-hip-flexor-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
            ex("ex_static-frog-stretch", 1, 1, 1, "60 seconds.", "cooldown"),
          ]),
          d("Shoulders & Arms & Core", ["Shoulders", "Biceps", "Triceps", "Core"], [
            ex("ex_forward-fold-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_doorway-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-neck-extension-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-oblique-lat-stretch", 1, 1, 1, "20 seconds.", "warmup"),
            ex("ex_static-lat-tricep-stretch", 1, 1, 1, "20 seconds each side.", "warmup"),
            ex("ex_bench-press", 3, 10, 2, "2-1-2 tempo."),
            ex("ex_lateral-raise", 3, 12, 2, "2-2-3 tempo."),
            ex("ex_machine-seated-chest-press", 2, 10, 1, "2-1-3 tempo."),
            ex("ex_machine-seated-shoulder-press", 3, 12, 1, "2-2-2 tempo."),
            ex("ex_machine-seated-chest-fly", 2, 10, 1, "Optional added exercise for chest."),
            ex("ex_single-arm-cable-lateral-raise", 3, 12, 1, "2-2-2 tempo."),
            ex("ex_static-forearm-stretch", 1, 1, 1, "", "cooldown"),
            ex("ex_static-lat-tricep-stretch", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_static-oblique-lat-stretch", 1, 1, 1, "20 seconds each side.", "cooldown"),
            ex("ex_suspension-chest-stretch", 1, 1, 1, "20 seconds each side.", "cooldown"),
          ]),
        ],
      },
    ],
  },
  {
    // Zach's actual "Beginner Full Body" program — a standalone 4-week,
    // single-phase program (not part of a longer 12-week block). All 3 days
    // now built, Day One's warm-up finally confirmed after being cut off in
    // earlier screenshots.
    name: "Beginner Full Body",
    level: "Beginner",
    description: "A 4-week full-body program for beginners, rotating three sessions with full warm-up and cool-down routines each time.",
    phases: [
      {
        id: "ph1",
        name: "Stabilisation Phase",
        durationWeeks: 4,
        days: [
          d("Full Body Day One", ["Full Body"], [
            ex("ex_dynamic-hip-flexor-stretch", 1, 1, 1, "15 seconds.", "warmup"),
            ex("ex_suspension-standing-figure-four-stretch", 1, 1, 1, "15 seconds.", "warmup"),
            ex("ex_dynamic-side-lunge-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_static-distal-hamstring-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_elevated-goblet-squat", 3, 10, 2, "2-2-4 tempo."),
            ex("ex_leg-press", 3, 10, 2, "2-2-4 tempo."),
            ex("ex_cable-seated-close-grip-row", 2, 10, 2, "2-2-4 tempo."),
            ex("ex_wide-grip-lat-pulldown", 2, 10, 2, "2-2-4 tempo."),
            ex("ex_machine-seated-chest-fly", 2, 10, 2, "2-2-4 tempo."),
            ex("ex_machine-seated-chest-press", 2, 10, 2, "2-2-4 tempo."),
            ex("ex_butterfly-stretch", 1, 1, 1, "15 seconds.", "cooldown"),
            ex("ex_cross-leg-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_doorway-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_thread-the-needle-alternating", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_cobra-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
          ]),
          d("Full Body Day Two", ["Full Body"], [
            ex("ex_butterfly-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_lying-hamstring-stretch-strap", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_dynamic-hip-flexor-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_suspension-standing-figure-four-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_dumbbell-incline-bench-row", 3, 10, 2, "2-2-3 tempo."),
            ex("ex_machine-seated-leg-extension", 3, 12, 2, "2-2-3 tempo."),
            ex("ex_close-grip-strict-lat-pulldown", 2, 10, 2, "2-2-3 tempo."),
            ex("ex_hyperextension-roman-chair-back-extension", 2, 10, 2, "2-2-3 tempo."),
            ex("ex_cable-seated-wide-grip-row", 2, 10, 2, "2-2-3 tempo."),
            ex("ex_preacher-curl-machine", 3, 10, 2, "2-2-3 tempo."),
            ex("ex_static-hip-flexor-stretch", 1, 1, 1, "15 seconds.", "cooldown"),
            ex("ex_suspension-chest-stretch", 1, 1, 1, "15 seconds.", "cooldown"),
            ex("ex_lying-piriformis-stretch", 1, 1, 1, "15 seconds.", "cooldown"),
            ex("ex_butterfly-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_cross-leg-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
          ]),
          d("Full Body Day Three", ["Full Body"], [
            ex("ex_butterfly-stretch", 1, 1, 1, "15 seconds.", "warmup"),
            ex("ex_lying-hamstring-stretch-strap", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_static-hip-flexor-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_forward-fold-stretch", 1, 1, 1, "15 seconds.", "warmup"),
            ex("ex_static-forearm-stretch", 1, 1, 1, "15 seconds each side.", "warmup"),
            ex("ex_machine-seated-parallel-grip-press", 3, 10, 3, "2-2-3 tempo."),
            ex("ex_machine-incline-chest-press", 2, 10, 3, "2-2-3 tempo."),
            ex("ex_machine-seated-shoulder-press", 3, 10, 3, "2-2-3 tempo."),
            ex("ex_machine-lateral-raise", 2, 10, 3, "2-2-3 tempo."),
            ex("ex_cable-bicep-curl", 3, 10, 3, "2-2-3 tempo."),
            ex("ex_straight-bar-tricep-extension", 3, 10, 3, "2-2-3 tempo."),
            ex("ex_static-oblique-lat-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_thread-the-needle-alternating", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_static-neck-flexion-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_dynamic-hamstring-stretch", 1, 1, 1, "15 seconds each side.", "cooldown"),
            ex("ex_butterfly-stretch", 1, 1, 1, "Each side.", "cooldown"),
          ]),
        ],
      },
    ],
  },
];
