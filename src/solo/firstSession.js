// Day one (#141): a short full-body first session built from the
// exercise library for the equipment the customer said they have, so a new
// member trains straight after the questionnaire instead of landing on the
// catalogue. Available on every plan (it's their own session, logged like a
// quick session — customSessions.js).
//
// One exercise per movement: legs (squat/lunge), push, pull, hinge, core.
// Simpler kit first (dumbbells, machines, bodyweight) — a first session
// isn't the day to learn a barbell lift alone.

const PATTERNS = [
  ["Legs", /goblet squat|squat|lunge|leg press|step[- ]?up|split squat/i],
  ["Push", /push[- ]?up|press[- ]?up|chest press|bench press|dumbbell press|floor press|shoulder press/i],
  ["Pull", /row|pulldown|pull[- ]?down|pull[- ]?up|chin[- ]?up|face pull/i],
  ["Hinge", /romanian|rdl|hip thrust|glute bridge|bridge|deadlift|good morning|kettlebell swing|hip hinge/i],
  ["Core", /plank|dead ?bug|bird ?dog|pallof|hollow|crunch/i],
];

// The equipment values exercises carry, for each questionnaire answer.
const KIT = {
  barbell: ["Barbell"],
  dumbbells: ["Dumbbell"],
  machines: ["Machine", "Cable"],
  bands: ["Band"],
  bodyweight: ["Bodyweight", "None"],
};
const PREFERENCE = ["Dumbbell", "Machine", "Cable", "Bodyweight", "None", "Band", "Barbell"];

export function equipmentFor(answers = {}) {
  const env = answers.trainingEnvironment;
  const picked = Array.isArray(answers.availableEquipment) ? answers.availableEquipment : [];
  const allowed = new Set(["Bodyweight", "None"]);
  for (const k of picked) for (const e of KIT[k] || []) allowed.add(e);
  if (env === "commercial_gym" && picked.length === 0) ["Dumbbell", "Machine", "Cable", "Barbell"].forEach((e) => allowed.add(e));
  return allowed;
}

export function starterSession(exercises = [], answers = {}) {
  const allowed = equipmentFor(answers);
  const usable = exercises.filter((e) => e && e.name && !["Warm-up", "Cool-down"].includes(e.category) && allowed.has(e.equipment || "Bodyweight"));
  const used = new Set();
  const picks = [];
  for (const [, pattern] of PATTERNS) {
    const options = usable
      .filter((e) => !used.has(e.id) && pattern.test(e.name))
      .sort((a, b) => PREFERENCE.indexOf(a.equipment || "Bodyweight") - PREFERENCE.indexOf(b.equipment || "Bodyweight") || a.name.localeCompare(b.name));
    if (options[0]) {
      used.add(options[0].id);
      picks.push(options[0]);
    }
  }
  return {
    id: "first-session",
    name: "Your first session",
    exercises: picks.map((e) => ({
      exerciseId: e.id,
      targetSets: 3,
      targetReps: /plank|hollow|dead ?bug|bird ?dog/i.test(e.name) ? 30 : 10,
      targetType: /plank|hollow/i.test(e.name) ? "time" : "reps",
      targetRIR: 3,
      restSeconds: 75,
      section: "main",
      notes: "Pick a weight you could lift a few more times. Today is about learning the movement.",
    })),
  };
}
