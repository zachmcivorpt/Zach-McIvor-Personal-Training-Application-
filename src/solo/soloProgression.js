// Train Solo's "what weight next?": a target for every set from that set's
// own last result and the program's rep target. With no coach to ask, the
// rule has to be explicit and explainable, so each target carries a reason.
//
// - Hit the target reps last time → add weight (~2.5%, at least 2.5 kg,
//   rounded to 2.5 kg plates) at the target reps.
// - 1–2 reps short → same weight, aim for the target again.
// - 3+ reps short → 10% lighter to rebuild.
// - Same top set for 3 sessions running (a plateau) → 10% lighter reset.
// - AMRAP → same weight, beat last time by a rep.
// - Bodyweight (0 kg) → add a rep.
// The coached app keeps its own simpler suggestNextSet (trainingStats.js).

const STEP = 2.5;
const roundToStep = (w) => Math.round(w / STEP) * STEP;
const lighter = (w) => Math.max(STEP, roundToStep(w * 0.9));

// prevSet: { weight, reps } from last time. stalled: from isStalled().
export function planSetTarget(prevSet, targetReps, { stalled = false } = {}) {
  const prevReps = Number(prevSet?.reps);
  if (!prevSet || !Number.isFinite(prevReps) || prevReps <= 0) return null;
  const prevWeight = Number(prevSet.weight) || 0;
  const amrap = targetReps === "AMRAP";
  const target = amrap ? null : Number(targetReps) || prevReps;

  if (prevWeight <= 0) {
    if (amrap || prevReps >= target) return { weight: 0, reps: prevReps + 1, reason: "more-reps" };
    return { weight: 0, reps: Math.min(target, prevReps + 1), reason: "build" };
  }
  if (stalled) return { weight: lighter(prevWeight), reps: target ?? prevReps, reason: "reset" };
  if (amrap) return { weight: prevWeight, reps: prevReps + 1, reason: "more-reps" };
  if (prevReps >= target) return { weight: Math.max(prevWeight + STEP, roundToStep(prevWeight * 1.025)), reps: target, reason: "up" };
  if (prevReps >= target - 2) return { weight: prevWeight, reps: target, reason: "hold" };
  return { weight: lighter(prevWeight), reps: target, reason: "back-off" };
}

// The heaviest set (then most reps) of one logged entry.
function topSet(sets) {
  return (sets || []).reduce((best, s) => {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) return { weight: w, reps: r };
    return best;
  }, null);
}

// A plateau: the last 3 sessions of this exercise (logs are newest first)
// all had the same top weight and the reps didn't climb.
export function isStalled(logs, exerciseId) {
  const tops = [];
  for (const log of logs || []) {
    const entry = (log.entries || []).find((e) => e.exerciseId === exerciseId && (e.sets || []).length);
    if (entry) tops.push(topSet(entry.sets));
    if (tops.length === 3) break;
  }
  if (tops.length < 3 || !(tops[0].weight > 0)) return false;
  return tops.every((t) => t.weight === tops[0].weight) && tops[0].reps <= tops[2].reps;
}

// Targets for every row of an exercise. A row beyond last time's set count
// works from last time's final set.
export function planExerciseTargets(previousSets, targetReps, rowCount, { stalled = false } = {}) {
  const prev = previousSets || [];
  return Array.from({ length: rowCount }, (_, i) => planSetTarget(prev[i] || prev[prev.length - 1], targetReps, { stalled }));
}

// One line explaining the plan, from the first set's reason.
export function targetReasonText(target, targetReps) {
  if (!target) return null;
  switch (target.reason) {
    case "up":
      return "You hit your reps last time, so the weight goes up.";
    case "hold":
      return `Just short last time. Same weight, aim for ${targetReps} reps.`;
    case "back-off":
      return "Missed reps last time. A little lighter to rebuild.";
    case "reset":
      return "Same result 3 sessions running. Reset 10% lighter and build back up.";
    case "more-reps":
      return "Beat last time by one rep.";
    case "build":
      return "Add a rep on last time.";
    default:
      return null;
  }
}
