// Train Solo workout summary and comeback (#244). Pure; every figure from
// the member's own logs.
//  - summaryPeak: the best moment of the session, shown first (peak-end).
//  - nextTimeTargets: what to aim for next time on the main lifts. Free gets
//    a simple rule (+2.5 kg at the top of the reps, else +1 rep); Plus gets
//    the suggested-weights logic (soloProgression.planSetTarget).
//  - comeback: a member back after 4+ quiet days, and the short session
//    offered to bring them back.
import { localDateKey } from "../lib/dateKey";
import { e1rm } from "./trainingRecap";
import { planSetTarget, isStalled } from "./soloProgression";

export const COMEBACK_DAYS = 4;
const DAY = 86400000;
const tidy = (n) => Math.round(n * 10) / 10;
const dateOf = (log) => (typeof log?.date === "string" ? log.date.slice(0, 10) : log?.date != null ? localDateKey(new Date(log.date)) : null);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / DAY);

// The finished session's completed sets, as log-shaped entries.
export function sessionEntries(activeLog = {}) {
  return Object.entries(activeLog || {})
    .map(([exerciseId, sets]) => ({
      exerciseId,
      sets: (sets || []).filter((s) => s?.completed && Number(s.reps) > 0).map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps), isPR: !!s.isPR })),
    }))
    .filter((e) => e.sets.length);
}

function bestSet(sets) {
  return (sets || []).reduce((best, s) => {
    const est = e1rm(s.weight, s.reps);
    return !best || est > best.est || (est === best.est && s.reps > best.reps) ? { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, est, isPR: !!s.isPR } : best;
  }, null);
}

// This exercise's best set the last time it was done before this session.
function lastTimeBest(previousLogs, exerciseId) {
  const sorted = [...(previousLogs || [])].sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
  for (const log of sorted) {
    const entry = (log.entries || []).find((e) => e.exerciseId === exerciseId && (e.sets || []).length);
    if (entry) return bestSet(entry.sets);
  }
  return null;
}

const setText = (s) => (s.weight > 0 ? `${tidy(s.weight)} kg × ${s.reps}` : `${s.reps} reps`);

// Days since the member's session before this one, when that's a comeback.
export function comebackGap(previousLogs = [], todayKey = localDateKey()) {
  const last = [...previousLogs].map(dateOf).filter(Boolean).sort().pop();
  if (!last) return null;
  const gap = daysBetween(last, todayKey);
  return gap >= COMEBACK_DAYS ? gap : null;
}

// The best moment of the session. Order: back after a break, a new PR, a
// lift that beat last time, then simply done.
export function summaryPeak({ entries = [], previousLogs = [], exercisesById = {}, todayKey = localDateKey() }) {
  const name = (id) => exercisesById[id]?.name || "Lift";
  const gap = comebackGap(previousLogs, todayKey);
  const prs = entries
    .map((e) => ({ e, best: bestSet(e.sets.filter((s) => s.isPR)) }))
    .filter((x) => x.best)
    .sort((a, b) => b.best.est - a.best.est);
  if (gap) {
    return { kind: "comeback", eyebrow: "You're back", title: "You're back.", detail: `First session in ${gap} days. That's the one that counts.`, pr: prs[0] ? { exerciseId: prs[0].e.exerciseId, name: name(prs[0].e.exerciseId), set: prs[0].best } : null };
  }
  if (prs.length) {
    const { e, best } = prs[0];
    const before = lastTimeBest(previousLogs, e.exerciseId);
    const more = prs.length > 1 ? ` · ${prs.length} PRs today` : "";
    return {
      kind: "pr",
      eyebrow: "New personal best",
      title: `${name(e.exerciseId)} ${setText(best)}`,
      detail: before && before.weight > 0 && best.weight > before.weight ? `+${tidy(best.weight - before.weight)} kg on last time${more}` : more.replace(/^ · /, ""),
      pr: { exerciseId: e.exerciseId, name: name(e.exerciseId), set: best, before },
    };
  }
  let beat = null;
  for (const e of entries) {
    const now = bestSet(e.sets);
    const before = lastTimeBest(previousLogs, e.exerciseId);
    if (!now || !before || now.est <= before.est) continue;
    const gain = now.est - before.est;
    if (!beat || gain > beat.gain) beat = { e, now, before, gain };
  }
  if (beat) {
    const { now, before } = beat;
    const detail =
      now.weight === before.weight && now.reps > before.reps
        ? `${now.reps - before.reps} rep${now.reps - before.reps === 1 ? "" : "s"} more than last time`
        : now.weight > before.weight
        ? `+${tidy(now.weight - before.weight)} kg on last time`
        : "Better than last time";
    return { kind: "beat", eyebrow: "Better than last time", title: `${name(beat.e.exerciseId)} ${setText(now)}`, detail };
  }
  return { kind: "done", eyebrow: "Session done", title: "Every set done.", detail: entries.length ? "Consistency is the whole game." : "" };
}

// Next time on the 2–3 main lifts (most volume today, weighted lifts first).
export function nextTimeTargets({ entries = [], day = null, previousLogs = [], exercisesById = {}, smart = false, limit = 3 }) {
  const prescribed = Object.fromEntries((day?.exercises || []).map((x) => [x.exerciseId, x.targetReps]));
  const volume = (e) => e.sets.reduce((a, s) => a + (s.weight || 0) * s.reps, 0) || e.sets.reduce((a, s) => a + s.reps, 0) / 1000;
  return [...entries]
    .sort((a, b) => volume(b) - volume(a))
    .slice(0, limit)
    .map((e) => {
      const top = e.sets.reduce((b, s) => (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b), null);
      const targetReps = prescribed[e.exerciseId] ?? top.reps;
      let next;
      if (smart) {
        const logs = [{ entries: [e] }, ...[...previousLogs].sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0))];
        next = planSetTarget(top, targetReps, { stalled: isStalled(logs, e.exerciseId) });
      } else if (top.weight <= 0) {
        next = { weight: 0, reps: top.reps + 1, reason: "more-reps" };
      } else if (targetReps !== "AMRAP" && top.reps >= Number(targetReps)) {
        next = { weight: tidy(top.weight + 2.5), reps: Number(targetReps), reason: "up" };
      } else {
        next = { weight: top.weight, reps: top.reps + 1, reason: "more-reps" };
      }
      if (!next) return null;
      return { exerciseId: e.exerciseId, name: exercisesById[e.exerciseId]?.name || "Lift", target: next, text: next.weight > 0 ? `${tidy(next.weight)} kg × ${next.reps}` : `${next.reps} reps` };
    })
    .filter(Boolean);
}

// Days since the member last trained (null when they never have).
export function daysSinceLastSession(logs = [], todayKey = localDateKey()) {
  const last = [...logs].map(dateOf).filter(Boolean).sort().pop();
  return last ? daysBetween(last, todayKey) : null;
}

// The short session offered to bring them back: their latest session's
// main exercises (up to 3, the ones they did most sets of), 2 sets each at
// its typical reps. Started as a one-off; never saved.
export function comebackSession(logs = [], exercisesById = {}) {
  const latest = [...logs].filter((l) => (l.entries || []).some((e) => (e.sets || []).length)).sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0))[0];
  if (!latest) return null;
  const exercises = (latest.entries || [])
    .filter((e) => e.exerciseId && exercisesById[e.exerciseId] && (e.sets || []).length)
    .sort((a, b) => b.sets.length - a.sets.length)
    .slice(0, 3)
    .map((e) => {
      const reps = e.sets.map((s) => Number(s.reps) || 0).filter(Boolean).sort((a, b) => a - b);
      return { exerciseId: e.exerciseId, targetSets: 2, targetReps: Math.min(100, Math.max(1, reps[Math.floor(reps.length / 2)] || 10)), targetType: "reps", targetRIR: 2, restSeconds: 90, section: "main" };
    });
  if (!exercises.length) return null;
  const title = String(latest.dayLabel || "your session").replace(/^Comeback: /, "");
  return { name: `Comeback: ${title}`.slice(0, 60), exercises };
}

// Comebacks in a week (sessions after a 4+ day gap), for the Sunday review.
export function comebacksIn(logs = [], fromKey, toKey) {
  const keys = [...new Set(logs.map(dateOf).filter(Boolean))].sort();
  const out = [];
  for (let i = 1; i < keys.length; i++) {
    const gap = daysBetween(keys[i - 1], keys[i]);
    if (keys[i] >= fromKey && keys[i] < toKey && gap >= COMEBACK_DAYS) out.push({ dateKey: keys[i], gap });
  }
  return out;
}

// The member's weekly target, the same rule the server uses (partners).
export function weeklyTargetOf(profile) {
  const a = profile?.onboarding?.answers || {};
  const n = Number(a.sessionsPerWeek) || (Array.isArray(a.trainingDays) ? a.trainingDays.length : 0) || 3;
  return Math.min(7, Math.max(1, Math.round(n)));
}
