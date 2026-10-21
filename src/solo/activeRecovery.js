// Train Solo's Active Recovery sessions, offered on calendar rest days.
// Built only from exercises that already exist in the shared `exercises`
// library (ids verified against it — Cardio / Warm-up categories), never
// invented. Each session runs through the normal SoloWorkoutSessionScreen
// and is logged like any workout, under a per-customer "recovery"
// purchase id so it never counts toward a program's own progress.
const time = (exerciseId, seconds, sets = 1, rest = 30) => ({
  exerciseId,
  targetSets: sets,
  targetReps: seconds,
  targetType: "time",
  restSeconds: rest,
  section: "main",
  isRest: false,
});
const reps = (exerciseId, count, sets = 2, rest = 30) => ({
  exerciseId,
  targetSets: sets,
  targetReps: count,
  targetType: "reps",
  restSeconds: rest,
  section: "main",
  isRest: false,
});

export const ACTIVE_RECOVERY_SESSIONS = [
  {
    id: "recovery-mobility",
    label: "Full-Body Mobility Flow",
    kind: "Mobility",
    duration: "~15 min",
    description: "Gentle, controlled movement through the hips, spine and shoulders to ease stiffness between training days.",
    exercises: [
      reps("ex_cat-cow", 10),
      reps("buR8MSVTiHQECHGqSgeo", 6), // World's Greatest Stretch
      reps("ex_hip-90-90-switch", 8),
      reps("1k8P7uVOvxN3B4X6f9bh", 8), // Thoracic Rotations (Quadruped)
      reps("ex_hip-car", 5),
      reps("dv2NGT0uYgWd5xUrGMXg", 6), // Inchworm
      time("ex_runners-lunge-hip-flexor-stretch", 30, 2),
      time("ex_static-distal-hamstring-stretch", 30, 2),
    ],
  },
  {
    id: "recovery-cardio-gym",
    label: "Low-Intensity Cardio",
    kind: "Cardio",
    duration: "~30 min",
    description: "Easy, conversational-pace cardio to keep blood flowing and aid recovery — not a hard session.",
    exercises: [time("a0rd12bCilthHnUgZRe6", 1200, 1, 60), time("ex_stationary-cycling", 600, 1, 0)], // Incline Treadmill Walk, Stationary Cycling
  },
  {
    id: "recovery-cardio-outdoor",
    label: "Easy Outdoor Cardio",
    kind: "Cardio · no equipment",
    duration: "~25 min",
    description: "A relaxed outdoor run or ride at an easy pace, finished with a short stretch.",
    exercises: [time("ex_outdoor-running", 1200, 1, 60), time("ex_lower-calf-stretch", 30, 2), time("ex_static-distal-hamstring-stretch", 30, 2)],
  },
];

// The fields SoloWorkoutSessionScreen needs to run one of these. The log id
// it builds is `${purchaseId}_${dayId}_w${weekNumber}`, so the date as the
// "week" keeps one log per session per day, and the uid in purchaseId keeps
// it unique per customer.
export function recoverySessionState(uid, session, dateKey) {
  return {
    purchaseId: `${uid}_recovery`,
    programId: null,
    dayId: session.id,
    weekNumber: dateKey,
    day: { id: session.id, label: session.label, exercises: session.exercises },
  };
}

export function isRecoveryLog(log) {
  return typeof log?.purchaseId === "string" && log.purchaseId.endsWith("_recovery");
}
