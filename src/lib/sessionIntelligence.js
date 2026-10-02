// Deterministic "Session Intelligence" analysis — reads the exercises
// already programmed into a session (category, name, target
// sets/reps/rest from the exercise library + program) and derives a
// classification, a plain-language briefing, and session stats, with no
// coach configuration required. No AI/network call: it's pattern matching
// over data that's already there, so it updates instantly whenever the
// program does.
//
// Real programs mix library exercises (a proper `category` like "Chest")
// with coach-added custom ones that just carry `category: "Custom"` — so
// category alone isn't reliable. Name-keyword matching is the fallback for
// both body region and movement pattern whenever category doesn't resolve.
//
// A second, optional pass (buildPersonalNote) layers in this specific
// client's own logged history for the exercises programmed today — same
// "every number is real, traceable data" rule src/lib/apexInsights.js
// follows, just one grounded observation instead of a whole rules engine,
// since this renders inline in a workout screen rather than a dashboard.
import { countExercises, estimateWorkoutMinutes, countWorkoutSets } from "./workoutStats";
import { estimate1RM } from "./AppContext";

const REST_CATEGORIES = new Set(["Warm-up", "Cool-down"]);

const CATEGORY_REGION = {
  Chest: "Upper",
  Back: "Upper",
  Shoulders: "Upper",
  Biceps: "Upper",
  Triceps: "Upper",
  Legs: "Lower",
  Core: "Core",
};

// Fallback pattern for an exercise whose name didn't match a specific
// keyword (e.g. an isolation move like a lateral raise) — merges into the
// more common variant for that category rather than a separate generic
// "push"/"pull" bucket, so it doesn't crowd out the more specific patterns
// other exercises in the same session already matched by name.
const CATEGORY_PATTERN = {
  Chest: "Horizontal Push",
  Shoulders: "Vertical Push",
  Triceps: "Horizontal Push",
  Back: "Horizontal Pull",
  Biceps: "Horizontal Pull",
};

// Checked in order — more specific lower-body phrases ("leg curl") must be
// matched before the generic upper-body ones ("curl") get a chance to.
const NAME_REGION_KEYWORDS = [
  {
    region: "Lower",
    keywords: ["squat", "lunge", "deadlift", "leg press", "leg curl", "leg extension", "calf", "glute", "hip thrust", "step up", "step-up", "hamstring", "quad", "good morning"],
  },
  {
    region: "Core",
    keywords: ["plank", "crunch", "sit up", "sit-up", "russian twist", "ab wheel", "hollow", "dead bug", "core", "leg raise"],
  },
  {
    region: "Upper",
    keywords: ["press", "row", "pull", "fly", "curl", "extension", "raise", "dip", "push up", "push-up", "kickback", "pulldown", "chest", "shoulder", "bicep", "tricep", "delt", "chin up", "chin-up", "shrug", "lat "],
  },
];

const PATTERN_KEYWORDS = [
  { pattern: "Hinge", keywords: ["deadlift", "rdl", "romanian", "hip thrust", "good morning", "kettlebell swing", "hyperextension"] },
  { pattern: "Squat", keywords: ["squat", "lunge", "leg press", "step up", "step-up", "split squat"] },
  { pattern: "Carry", keywords: ["carry", "farmer"] },
  { pattern: "Core", keywords: ["plank", "crunch", "sit up", "sit-up", "russian twist", "leg raise", "ab wheel", "hollow", "dead bug"] },
  { pattern: "Vertical Push", keywords: ["overhead press", "shoulder press", "military press", "push press", "handstand"] },
  { pattern: "Horizontal Push", keywords: ["bench press", "chest press", "push up", "push-up", "dip", "fly", "chest fly"] },
  { pattern: "Vertical Pull", keywords: ["pull up", "pull-up", "pulldown", "chin up", "chin-up"] },
  { pattern: "Horizontal Pull", keywords: ["row", "face pull"] },
];

const PATTERN_LABELS = {
  Hinge: "hip hinging",
  Squat: "squatting",
  Carry: "loaded carries",
  Core: "core stability",
  "Vertical Push": "overhead pressing",
  "Horizontal Push": "horizontal pressing",
  "Vertical Pull": "vertical pulling",
  "Horizontal Pull": "horizontal rowing",
  Legs: "leg strength",
};

function matchFirst(name, list) {
  for (const { keywords, ...rest } of list) {
    if (keywords.some((k) => name.includes(k))) return rest;
  }
  return null;
}

// Resolves a library or custom exercise to a body region (Upper/Lower/Core)
// and a movement pattern for display, preferring real category/name
// signals and falling back sensibly when either is missing or generic
// (e.g. a coach-added exercise saved under category "Custom").
function classifyExercise(exercise) {
  if (!exercise) return { region: null, pattern: null };
  const category = exercise.category;
  const name = (exercise.name || "").toLowerCase();

  let region = CATEGORY_REGION[category] || null;
  if (!region) region = matchFirst(name, NAME_REGION_KEYWORDS)?.region || null;

  let pattern = matchFirst(name, PATTERN_KEYWORDS)?.pattern || null;
  if (!pattern) {
    pattern = CATEGORY_PATTERN[category] || (region === "Lower" ? "Legs" : region === "Core" ? "Core" : null);
  }

  return { region, pattern };
}

const RETURNING_GAP_DAYS = 7;
const TREND_SESSIONS = 3;

// Best e1RM (or rep count for an unweighted/bodyweight set) logged for one
// exercise in one session — mirrors how apexInsights.js scores a session's
// best set for the same exercise, so "best this session" means the same
// thing everywhere in the app.
function sessionBestScore(entry) {
  let best = 0;
  (entry?.sets || []).forEach((s) => {
    if (!s.reps) return;
    const score = s.weight > 0 ? estimate1RM(s.weight, s.reps) : s.reps;
    if (score > best) best = score;
  });
  return best;
}

// One grounded observation about THIS client, from their own logged
// history for the exercises actually programmed today — never more than
// one, so the card stays a single clear thought rather than a stat dump.
// Priority: a real break in training (changes how today should be
// approached) outranks a performance trend (changes ambition), which
// outranks a brand-new exercise (purely informational).
function buildPersonalNote(list, exercisesById, logsForClient) {
  if (!logsForClient || logsForClient.length === 0) return null;

  // logsForClient is already newest-first (see AppContext.jsx's bucket()).
  const lastSession = logsForClient[0];
  if (lastSession?.date) {
    const gapDays = Math.round((Date.now() - lastSession.date) / 86400000);
    if (gapDays >= RETURNING_GAP_DAYS) {
      return `It's been ${gapDays} days since your last logged session — ease back in today rather than chasing a new max.`;
    }
  }

  let trendUp = null; // best % climb across the lifts programmed today
  let stalled = null; // a lift flat across the last 3 sessions
  let brandNew = null; // first lift programmed today with zero history

  for (const exMeta of list) {
    const exercise = exercisesById?.[exMeta.exerciseId];
    if (!exercise) continue;

    const sessionsForLift = [];
    for (const log of logsForClient) {
      const entry = log.entries?.find((e) => e.exerciseId === exMeta.exerciseId);
      if (!entry) continue;
      const score = sessionBestScore(entry);
      if (score > 0) sessionsForLift.push({ date: log.date, score });
      if (sessionsForLift.length >= TREND_SESSIONS) break;
    }

    if (sessionsForLift.length === 0) {
      if (!brandNew) brandNew = exercise.name;
      continue;
    }

    if (sessionsForLift.length >= TREND_SESSIONS) {
      const [newest, mid, oldest] = sessionsForLift; // newest-first
      if (newest.score > mid.score && mid.score > oldest.score) {
        const pct = Math.round(((newest.score - oldest.score) / oldest.score) * 100);
        if (!trendUp || pct > trendUp.pct) trendUp = { name: exercise.name, pct };
      } else if (newest.score === mid.score && mid.score === oldest.score) {
        if (!stalled) stalled = exercise.name;
      }
    }
  }

  if (trendUp && trendUp.pct >= 3) {
    return `Your ${trendUp.name} has climbed ${trendUp.pct}% over your last ${TREND_SESSIONS} logged sessions — good day to chase another PR.`;
  }
  if (stalled) {
    return `Your ${stalled} has held at the same best for ${TREND_SESSIONS} sessions straight — today could be the day to add a rep or a little weight.`;
  }
  if (brandNew && list.length > 0 && exercisesById?.[list[0].exerciseId]?.name === brandNew) {
    return `First time logging ${brandNew} in this program — focus on finding a solid working weight today.`;
  }
  return null;
}

// Analyses a day's programmed exercises (the same `exercises` array shape
// used everywhere else — targetSets/targetReps/targetType/restSeconds per
// entry) against the exercise library, and returns a summary for display.
// logsForClient (optional) is this client's own workoutLogs, newest-first —
// passing it adds one personalized observation grounded in their real
// history; omitting it just skips that line, same as before. Returns null
// if there's nothing usable to analyse yet.
export function analyzeSession(exercises, exercisesById, logsForClient) {
  const list = (exercises || []).filter((e) => !e.isRest);
  if (list.length === 0) return null;

  let upperWeight = 0;
  let lowerWeight = 0;
  let coreWeight = 0;
  const patternWeights = {};
  let repWeightedSum = 0;
  let repWeightedSets = 0;
  let amrapOrTimedSets = 0;
  let shortRestSets = 0;
  let workingSets = 0;
  let movingSets = 0; // excludes warm-up/cool-down library entries

  list.forEach((exMeta) => {
    const exercise = exercisesById?.[exMeta.exerciseId];
    const sets = exMeta.targetSets || 1;
    const isRestCategory = exercise?.category && REST_CATEGORIES.has(exercise.category);

    workingSets += sets;
    if (isRestCategory) return;
    movingSets += sets;

    const { region, pattern } = classifyExercise(exercise);
    if (region === "Upper") upperWeight += sets;
    else if (region === "Lower") lowerWeight += sets;
    else if (region === "Core") coreWeight += sets;

    if (pattern) patternWeights[pattern] = (patternWeights[pattern] || 0) + sets;

    const reps = exMeta.targetType === "time" ? NaN : Number(exMeta.targetReps);
    if (exMeta.targetType !== "time" && exMeta.targetReps !== "" && exMeta.targetReps != null && !isNaN(reps)) {
      repWeightedSum += reps * sets;
      repWeightedSets += sets;
    } else {
      amrapOrTimedSets += sets;
    }
    if ((exMeta.restSeconds ?? 90) <= 45) shortRestSets += sets;
  });

  // Nothing but warm-up/cool-down entries — treat the whole thing as
  // mobility work rather than guessing a strength focus that isn't there.
  if (movingSets === 0) {
    return buildResult({ bodyFocus: "Mobility & Recovery", trainingGoal: null, patternWeights, exercises: list, workingSets, logsForClient, exercisesById });
  }

  const totalRegionWeight = upperWeight + lowerWeight + coreWeight;
  let bodyFocus;
  if (upperWeight > 0 && lowerWeight === 0) bodyFocus = "Upper Body";
  else if (lowerWeight > 0 && upperWeight === 0) bodyFocus = "Lower Body";
  else if (upperWeight > 0 && lowerWeight > 0) {
    const minority = Math.min(upperWeight, lowerWeight) / totalRegionWeight;
    bodyFocus = minority >= 0.25 ? "Full Body" : upperWeight > lowerWeight ? "Upper Body" : "Lower Body";
  } else if (coreWeight > 0) {
    bodyFocus = "Core";
  } else {
    // Region couldn't be determined for anything (unrecognized categories
    // and no matching name keywords) — fall back to a neutral label rather
    // than a wrong body-part guess.
    bodyFocus = "Full Body";
  }

  let trainingGoal;
  const avgReps = repWeightedSets > 0 ? repWeightedSum / repWeightedSets : null;
  const conditioningShare = amrapOrTimedSets / movingSets;
  const shortRestShare = shortRestSets / movingSets;
  if (conditioningShare >= 0.5 && shortRestShare >= 0.4) {
    trainingGoal = "Conditioning";
  } else if (avgReps == null) {
    trainingGoal = "Strength & Hypertrophy";
  } else if (avgReps <= 6) {
    trainingGoal = "Strength";
  } else if (avgReps <= 9) {
    trainingGoal = "Strength & Hypertrophy";
  } else if (avgReps <= 15) {
    trainingGoal = "Hypertrophy";
  } else {
    trainingGoal = "Endurance";
  }

  return buildResult({ bodyFocus, trainingGoal, patternWeights, exercises: list, workingSets, logsForClient, exercisesById });
}

function buildResult({ bodyFocus, trainingGoal, patternWeights, exercises, workingSets, logsForClient, exercisesById }) {
  const topPatterns = Object.entries(patternWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => PATTERN_LABELS[p] || p.toLowerCase());

  const classification = trainingGoal ? `${bodyFocus} ${trainingGoal}` : bodyFocus;
  const briefing = buildBriefing(bodyFocus, trainingGoal, topPatterns);
  const personalNote = buildPersonalNote(exercises, exercisesById, logsForClient);
  const whyItMatters = buildWhyItMatters(bodyFocus, trainingGoal) + (personalNote ? ` ${personalNote}` : "");
  const estMinutes = estimateWorkoutMinutes(exercises);

  return {
    bodyFocus,
    trainingGoal,
    classification,
    briefing,
    whyItMatters,
    movementPatterns: topPatterns,
    stats: {
      exerciseCount: countExercises(exercises),
      workingSets,
      estMinutes,
      primaryFocus: classification,
    },
  };
}

function joinPhrases(phrases) {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

function buildBriefing(bodyFocus, trainingGoal, topPatterns) {
  if (bodyFocus === "Mobility & Recovery") {
    return "Mobility and recovery session focused on movement quality and preparing the body for training.";
  }
  const focusAdj = { "Upper Body": "Upper-body", "Lower Body": "Lower-body", "Full Body": "Full-body", Core: "Core-focused" }[bodyFocus];
  const goalLower = (trainingGoal || "training").toLowerCase();
  const patternPhrase = topPatterns.length > 0 ? joinPhrases(topPatterns) : "compound and accessory movements";
  return `${focusAdj} ${goalLower} session focused on ${patternPhrase}.`;
}

function buildWhyItMatters(bodyFocus, trainingGoal) {
  const goalClause =
    {
      Strength: "strength and force production",
      "Strength & Hypertrophy": "strength and muscle",
      Hypertrophy: "muscle size and strength",
      Endurance: "muscular endurance and work capacity",
      Conditioning: "conditioning and work capacity",
    }[trainingGoal] || "strength and muscle";

  switch (bodyFocus) {
    case "Upper Body":
      return `Today's training builds upper-body ${goalClause} while developing balanced pushing and pulling capacity.`;
    case "Lower Body":
      return `This session builds lower-body ${goalClause} to support overall movement performance.`;
    case "Full Body":
      return `This full-body session develops ${goalClause} across major movement patterns for balanced overall training.`;
    case "Core":
      return "This session strengthens core stability and control, supporting posture and performance in other lifts.";
    case "Mobility & Recovery":
      return "This session supports recovery and joint mobility, helping the body handle training load and move well.";
    default:
      return `This session develops ${goalClause} through the exercises programmed today.`;
  }
}
