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

function ex(exerciseId, targetSets, targetReps, targetRIR = 2, notes = "") {
  return { exerciseId, targetSets, targetReps, targetRIR, notes };
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
];
