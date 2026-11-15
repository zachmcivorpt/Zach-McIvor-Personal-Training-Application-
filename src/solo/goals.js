// Train Solo main goal (#236). One goal on the profile (soloUsers.goal);
// its progress is worked out from what the member already logs — workouts,
// weigh-ins, steps — never a second tracking system. Pure.
import { localDateKey } from "../lib/dateKey";
import { addDays, mondayOf } from "./soloCalendar";

export const GOAL_TYPES = ["consistency", "bodyweight", "lift", "workouts", "steps"];
export const MILESTONES = [0.25, 0.5, 0.75, 1];

// The lifts a strength goal can be for, matched by name in the library.
export const GOAL_LIFTS = [
  { key: "bench", label: "Bench press", match: /^(barbell )?bench press$/i },
  { key: "squat", label: "Squat", match: /^(barbell )?(back )?squat$/i },
  { key: "deadlift", label: "Deadlift", match: /^(barbell )?(conventional )?deadlift$/i },
  { key: "ohp", label: "Overhead press", match: /^(barbell )?(overhead|shoulder|military) press$/i },
];

const dateOf = (log) => (typeof log?.date === "string" ? log.date.slice(0, 10) : log?.date != null ? localDateKey(new Date(log.date)) : null);
const roundUp = (n, step) => Math.ceil(n / step) * step;
const tidy = (n) => Math.round(n * 10) / 10;

// Heaviest weight lifted for at least one rep on an exercise, from the logs
// given (optionally only before a day).
export function bestWeight(logs = [], exerciseId, beforeKey = null) {
  let best = 0;
  for (const log of logs) {
    if (beforeKey && (dateOf(log) || "") >= beforeKey) continue;
    for (const e of log.entries || []) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of e.sets || []) if ((Number(s.reps) || 0) >= 1) best = Math.max(best, Number(s.weight) || 0);
    }
  }
  return best;
}

// The library exercise for each goal lift (the one they've logged most, if
// several names match).
export function goalLiftExercises(exercises = [], logs = []) {
  const counts = {};
  for (const log of logs) for (const e of log.entries || []) counts[e.exerciseId] = (counts[e.exerciseId] || 0) + 1;
  return GOAL_LIFTS.map((lift) => {
    const found = exercises.filter((x) => lift.match.test(String(x.name || "").trim())).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return found[0] ? { ...lift, exerciseId: found[0].id, name: found[0].name } : null;
  }).filter(Boolean);
}

export function latestWeight(weighIns = []) {
  const sorted = [...weighIns].filter((w) => Number(w.weight) > 0).sort((a, b) => Number(new Date(b.date)) - Number(new Date(a.date)));
  return sorted[0] ? Number(sorted[0].weight) : null;
}

// What each goal is called, from its own numbers.
export function goalTitle(goal) {
  if (!goal) return "";
  const n = Number(goal.target);
  switch (goal.type) {
    case "consistency":
      return `${goal.aim === "build_muscle" ? "Build muscle: train" : "Train"} ${goal.perWeek}× a week for ${n} weeks`;
    case "bodyweight":
      return `${goal.direction === "gain" ? "Gain" : "Lose"} ${tidy(n)} kg`;
    case "lift":
      return `${goal.liftLabel || "Lift"} ${tidy(n)} kg`;
    case "workouts":
      return `Complete ${n} workouts`;
    case "steps":
      return `${Number(goal.stepTarget || 10000).toLocaleString("en-AU")} steps a day for ${n} days`;
    default:
      return "Your goal";
  }
}

// Suggestions, most relevant first for the answer they gave in the
// questionnaire, each with sensible numbers they can change.
export function suggestedGoals({ answers = {}, exercises = [], logs = [] } = {}) {
  const perWeek = Math.min(6, Math.max(2, Number(answers.sessionsPerWeek) || (answers.trainingDays || []).length || 3));
  const lifts = goalLiftExercises(exercises, logs);
  const bench = lifts.find((l) => l.key === "bench") || lifts[0];
  const liftBest = bench ? bestWeight(logs, bench.exerciseId) : 0;
  const all = {
    consistency: { type: "consistency", target: 12, perWeek, aim: "build_muscle" },
    bodyweight: { type: "bodyweight", target: 5, direction: "lose" },
    lift: bench ? { type: "lift", target: liftBest > 0 ? roundUp(liftBest * 1.1, 5) : 100, exerciseId: bench.exerciseId, liftKey: bench.key, liftLabel: bench.label } : null,
    workouts: { type: "workouts", target: 20 },
    steps: { type: "steps", target: 30, stepTarget: 10000 },
  };
  const order = {
    build_muscle: ["consistency", "lift", "workouts", "bodyweight", "steps"],
    get_stronger: ["lift", "consistency", "workouts", "bodyweight", "steps"],
    lose_fat: ["bodyweight", "steps", "workouts", "consistency", "lift"],
    health_markers: ["steps", "workouts", "bodyweight", "consistency", "lift"],
    general_fitness: ["workouts", "steps", "consistency", "lift", "bodyweight"],
    sport_performance: ["consistency", "lift", "workouts", "steps", "bodyweight"],
  }[answers.primaryGoal] || ["consistency", "bodyweight", "lift", "workouts", "steps"];
  return order.map((k) => all[k]).filter(Boolean);
}

// A goal ready to save: the starting point is fixed now, from their data.
export function startGoal(goal, { logs = [], weighIns = [], todayKey = localDateKey(), now = Date.now() } = {}) {
  const g = { ...goal, target: Number(goal.target), startKey: todayKey, setAt: now };
  if (g.type === "lift") g.start = bestWeight(logs, g.exerciseId);
  if (g.type === "bodyweight") g.start = latestWeight(weighIns);
  return g;
}

// Progress against the goal, from their own logs. `pct` 0–1, `done`
// once reached; `value` / `of` the big figures; `left` what remains.
export function goalProgress(goal, { logs = [], weighIns = [], bodyMetrics = [], todayKey = localDateKey() } = {}) {
  if (!goal?.type) return null;
  const target = Number(goal.target) || 0;
  const since = goal.startKey || todayKey;
  const out = (current, of, unit, left) => {
    const pct = of > 0 ? Math.max(0, Math.min(1, current / of)) : 0;
    return { value: current, of, unit, pct, done: pct >= 1, left: pct >= 1 ? "" : left };
  };
  switch (goal.type) {
    case "workouts": {
      const n = logs.filter((l) => (dateOf(l) || "") >= since).length;
      const left = Math.max(0, target - n);
      return out(n, target, "workouts", `${left} workout${left === 1 ? "" : "s"} to go`);
    }
    case "consistency": {
      const perWeek = Number(goal.perWeek) || 3;
      const thisMonday = mondayOf(todayKey);
      let weeks = 0;
      for (let k = mondayOf(since); k <= thisMonday; k = addDays(k, 7)) {
        const end = addDays(k, 7);
        const n = logs.filter((l) => {
          const d = dateOf(l) || "";
          return d >= k && d < end && d >= since;
        }).length;
        if (n >= perWeek) weeks += 1;
      }
      const left = Math.max(0, target - weeks);
      return out(weeks, target, "weeks", `${left} week${left === 1 ? "" : "s"} to go`);
    }
    case "lift": {
      const best = bestWeight(logs, goal.exerciseId);
      const start = Number(goal.start) || 0;
      const span = target - start;
      const pct = best >= target ? 1 : span > 0 ? Math.max(0, (best - start) / span) : 0;
      const left = tidy(Math.max(0, target - best));
      return { value: best, of: target, unit: "kg", pct: Math.min(1, pct), done: best >= target, left: best >= target ? "" : `${left} kg to go` };
    }
    case "bodyweight": {
      const start = Number(goal.start) || null;
      const now = latestWeight(weighIns);
      if (!start || !now) return { value: null, of: target, unit: "kg", pct: 0, done: false, left: "Log your weight in Progress to track this", needsWeight: true };
      const change = tidy(goal.direction === "gain" ? now - start : start - now);
      const p = out(Math.max(0, change), target, "kg", `${tidy(Math.max(0, target - change))} kg to go`);
      return { ...p, value: Math.max(0, change) };
    }
    case "steps": {
      const stepTarget = Number(goal.stepTarget) || 10000;
      const days = new Set(bodyMetrics.filter((m) => m.date >= since && m.date <= todayKey && Number(m.steps) >= stepTarget).map((m) => m.date)).size;
      const left = Math.max(0, target - days);
      return out(days, target, "days", `${left} day${left === 1 ? "" : "s"} to go`);
    }
    default:
      return null;
  }
}

// The last milestone reached (0, 0.25 … 1).
export function milestoneOf(pct) {
  return MILESTONES.filter((m) => pct >= m).pop() || 0;
}

// A short, encouraging line for where they are.
export function encouragement(progress) {
  if (!progress) return "";
  if (progress.needsWeight) return progress.left;
  const p = progress.pct;
  if (progress.done) return "Goal reached. Set your next one.";
  if (p >= 0.9) return `So close — ${progress.left}.`;
  if (p >= 0.75) return `Three quarters there — ${progress.left}.`;
  if (p >= 0.5) return `Halfway there — ${progress.left}.`;
  if (p >= 0.25) return `A quarter of the way — ${progress.left}.`;
  return `Every session counts — ${progress.left}.`;
}

// Did the latest workout take them past a milestone? The milestone, else null.
export function milestoneCrossed(goal, data, latestLogId) {
  if (!goal || !latestLogId) return null;
  const after = goalProgress(goal, data);
  const before = goalProgress(goal, { ...data, logs: (data.logs || []).filter((l) => l.id !== latestLogId) });
  if (!after || !before) return null;
  const a = milestoneOf(after.pct);
  return a > milestoneOf(before.pct) ? a : null;
}

// ---- Their own goal, in their own words (#237) ----
// Reads a goal typed in plain English into one of the goal types above, so
// it's tracked automatically. Returns null when it can't be measured from
// what the app logs (the screen then shows examples that can be).

const LIFT_ALIASES = [
  { re: /\bbench\b/, key: "bench" },
  { re: /\bsquat/, key: "squat" },
  { re: /\bdead\s?lift/, key: "deadlift" },
  { re: /\b(ohp|overhead|shoulder press|military press)\b/, key: "ohp" },
];
const GENERIC_WORDS = new Set(["barbell", "the", "a", "an", "and", "of", "to", "with", "my"]);
const num = (s) => Number(String(s).replace(/,/g, ""));
const stepsNum = (s) => (/k$/i.test(s) ? num(s.slice(0, -1)) * 1000 : num(s));

// The library exercise a goal's words name: one of the big lifts by its
// nickname, else the longest library name whose words are all there.
function exerciseIn(text, exercises, logs) {
  const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !GENERIC_WORDS.has(w));
  const said = new Set(words(text));
  let best = null;
  for (const x of exercises) {
    const w = words(x.name);
    if (w.length && w.every((part) => said.has(part) || said.has(`${part}s`) || said.has(part.replace(/s$/, ""))) && (!best || w.length > best.n)) best = { x, n: w.length };
  }
  if (best && best.n > 1) return best.x;
  for (const alias of LIFT_ALIASES) {
    if (!alias.re.test(text)) continue;
    const lift = goalLiftExercises(exercises, logs).find((l) => l.key === alias.key);
    if (lift) return { id: lift.exerciseId, name: lift.name };
  }
  return best ? best.x : null;
}

export function parseGoal(input, { exercises = [], logs = [], weighIns = [] } = {}) {
  const text = String(input || "").toLowerCase().replace(/kilos?|kgs/g, "kg").trim();
  if (text.length < 3) return null;
  const weeksIn = (fallback) => {
    const w = text.match(/(\d+)\s*weeks?/);
    const m = text.match(/(\d+)\s*months?/);
    return w ? num(w[1]) : m ? Math.round(num(m[1]) * 4.33) : /\bmonth\b/.test(text) ? 4 : fallback;
  };

  // Steps: "12k steps a day for 60 days"
  const steps = text.match(/(\d[\d,.]*k?)\s*steps/);
  if (steps || /\bsteps\b/.test(text)) {
    const d = text.match(/(\d+)\s*days?/);
    const days = d ? num(d[1]) : weeksIn(null) ? weeksIn(null) * 7 : 30;
    return { type: "steps", stepTarget: steps ? stepsNum(steps[1]) : 10000, target: days };
  }

  // Training frequency: "train 4 times a week for 10 weeks"
  const freq = text.match(/(\d+)\s*(?:x|×|times|sessions?|workouts?|days?)\s*(?:a|per|each|every)\s*week/);
  if (freq) return { type: "consistency", perWeek: Math.min(7, num(freq[1])), target: weeksIn(12) };

  // Bodyweight: "lose 8 kg", "gain 3kg", "get down to 75 kg"
  const lose = text.match(/\b(?:lose|drop|cut|shed|burn)\b[^\d]*(\d+(?:\.\d+)?)\s*(kg)?/);
  if (lose && !exerciseIn(text, exercises, logs)) return { type: "bodyweight", direction: "lose", target: num(lose[1]) };
  const gain = text.match(/\b(?:gain|put on|bulk|add)\b[^\d]*(\d+(?:\.\d+)?)\s*kg/);
  if (gain && !exerciseIn(text, exercises, logs)) return { type: "bodyweight", direction: "gain", target: num(gain[1]) };
  const reach = text.match(/\b(?:weigh|get (?:down |up )?to|reach|hit|be)\b[^\d]*(\d+(?:\.\d+)?)\s*kg/);
  if (reach && /\b(weigh|bodyweight|body weight|get down|get to|be)\b/.test(text) && !exerciseIn(text, exercises, logs)) {
    const now = latestWeight(weighIns);
    const want = num(reach[1]);
    if (!now || Math.abs(now - want) < 0.5) return null;
    return { type: "bodyweight", direction: want < now ? "lose" : "gain", target: Math.round(Math.abs(now - want) * 10) / 10 };
  }

  // A lift: "bench 120 kg", "140kg squat", "deadlift 2x bodyweight" isn't measurable
  const lift = exerciseIn(text, exercises, logs);
  // Without "kg" the number has to come after the lift ("squat 140"):
  // "10 pull ups" is reps, which the app doesn't set goals on.
  const afterLift = lift && text.match(new RegExp(`${String(lift.name).toLowerCase().split(/[^a-z]+/).filter(Boolean).pop()?.replace(/s$/, "")}\\w*\\D{0,12}(\\d{2,3}(?:\\.\\d+)?)(?!\\s*(?:reps?|times|x\\b))`));
  const kgs = text.match(/(\d+(?:\.\d+)?)\s*kg/) || afterLift || (lift && LIFT_ALIASES.some((a) => a.re.test(text)) && text.match(/(?:bench|squat|lift|press)\D{0,12}(\d{2,3}(?:\.\d+)?)/));
  if (lift && kgs) {
    const alias = GOAL_LIFTS.find((l) => l.match.test(String(lift.name).trim()));
    return { type: "lift", exerciseId: lift.id, liftKey: alias?.key, liftLabel: lift.name, target: num(kgs[1]) };
  }

  // Count of workouts: "20 workouts", "50 sessions"
  const count = text.match(/(\d+)\s*(?:workouts?|sessions?|trainings?)/);
  if (count) return { type: "workouts", target: num(count[1]) };

  // No numbers: the usual aims, with sensible ones they can change.
  if (/\b(lose|losing|drop)\b.*\b(weight|fat|kg)\b|\b(get lean|lean out|slim)/.test(text)) return { type: "bodyweight", direction: "lose", target: 5 };
  if (/\b(gain|put on)\b.*\b(weight|size|mass)\b|\bbulk/.test(text)) return { type: "bodyweight", direction: "gain", target: 3 };
  if (/\b(build|gain|grow)\b.*\bmuscle|\b(get bigger|tone|toned)\b/.test(text)) return { type: "consistency", perWeek: 3, target: weeksIn(12), aim: "build_muscle" };
  if (/\b(consistent|consistency|get fit|fitter|habit|routine)\b/.test(text)) return { type: "consistency", perWeek: 3, target: weeksIn(12) };
  return null;
}
