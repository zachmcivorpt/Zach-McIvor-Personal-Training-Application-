// APEX AI Insights — a deterministic, explainable pattern-detection engine
// over the client's own logged data (training, check-ins, body metrics,
// nutrition, coach notes). It is NOT a generative/LLM layer: every insight
// is produced by an explicit, named rule reading real Firestore data, so
// "why you're seeing this" can always be traced back to the exact numbers
// that triggered it. See the file-level comment in CoachDashboard.jsx for
// where a real LLM call could later replace/augment a rule's phrasing —
// the rule's OUTPUT SHAPE (reasons/relevantContext/suggestion, all built
// from real values) is designed to stay the same either way.
//
// Every rule follows the same non-negotiables:
//   - Only fires on a genuine cross-referenced pattern (2+ corroborating
//     signals, or a threshold well past normal noise) — never a single
//     small measurement.
//   - Every "reason" line is a real number/date/quote pulled from `db`,
//     never invented or estimated beyond what's actually logged.
//   - The "suggestion" is phrased as a coaching consideration ("Consider
//     reviewing...", "May be worth...") never an instruction or diagnosis.

import { epley1RM } from "./trainingStats";

const DAY_MS = 86400000;
const RATING_SCALE_MAX = 5;

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Body-part groupings used only to connect a lift to a relevant check-in
// question (e.g. pressing exercises <-> shoulder soreness) — read straight
// off the exercise library's own category/primaryMuscles tags, never
// invented.
const PRESSING_MUSCLES = ["chest", "shoulders", "triceps"];

function isPressingExercise(ex) {
  if (!ex) return false;
  const tags = [ex.category, ...(ex.primaryMuscles || [])].filter(Boolean).map((m) => m.toLowerCase());
  return tags.some((m) => PRESSING_MUSCLES.includes(m));
}

// Every question across every one of the coach's check-in forms whose label
// contains one of the given keywords — finds "soreness"/"macro"-style
// questions regardless of exactly how a coach worded them, rather than
// hardcoding to the one built-in Weekly Check-In template.
function findQuestionsByKeyword(forms, keywords) {
  const matches = [];
  (forms || []).forEach((form) => {
    (form.questions || []).forEach((q) => {
      const label = (q.label || "").toLowerCase();
      if (keywords.some((k) => label.includes(k))) {
        matches.push({ formId: form.id, questionId: q.id, label: q.label, type: q.type });
      }
    });
  });
  return matches;
}

// Real answers to any of the given questions from a client's formResponses,
// oldest first (formResponses itself is stored newest-first). Skips blank
// answers rather than treating them as a 0/negative data point.
function recentAnswers(clientId, db, questions, limit = 6) {
  const responses = (db.formResponses || {})[clientId] || [];
  const out = [];
  for (const r of responses) {
    const matched = questions.find((q) => q.formId === r.formId);
    if (!matched) continue;
    const val = r.answers?.[matched.questionId];
    if (val === undefined || val === null || val === "") continue;
    out.push({ date: r.date, value: val, label: matched.label, type: matched.type });
    if (out.length >= limit) break;
  }
  return out.reverse();
}

// Coach notes + APEX-approved context whose text mentions any of the given
// keywords — surfaced as "relevant client context" so a flagged pattern
// that a coach already anticipated in writing ("shoulder gets irritated
// when pressing volume is too high") shows up alongside the insight instead
// of the AI re-discovering it from numbers alone.
function findRelevantContext(clientId, db, keywords) {
  const notes = (db.clientNotes || {})[clientId] || [];
  const context = (db.clientContext || {})[clientId] || [];
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  const hits = [];
  notes.forEach((n) => {
    const text = (n.text || "").toLowerCase();
    if (lowerKeywords.some((k) => text.includes(k))) {
      hits.push({ id: n.id, text: n.text, date: n.date, source: "note" });
    }
  });
  context.forEach((c) => {
    const text = (c.text || "").toLowerCase();
    if (lowerKeywords.some((k) => text.includes(k))) {
      hits.push({ id: c.id, text: c.text, date: c.createdAt, source: "context", category: c.category });
    }
  });
  return hits.sort((a, b) => b.date - a.date).slice(0, 3);
}

// Rule 1 — Recovery conflict: a pressing lift's performance has dropped
// across its last 3 logged sessions while a matched soreness check-in
// question has risen meaningfully over the same period. Both signals have
// to be present — a strength dip alone (could be a deload, a missed meal)
// or a soreness tick alone (normal after any hard session) isn't reported.
function recoveryConflictInsight(client, db) {
  const logs = (db.workoutLogs || {})[client.id] || [];
  const exercisesById = Object.fromEntries((db.exercises || []).map((e) => [e.id, e]));
  if (logs.length === 0) return null;

  const sorted = [...logs].sort((a, b) => a.date - b.date);
  const byExercise = {};
  sorted.forEach((log) => {
    if (log.cardio) return;
    (log.entries || []).forEach((entry) => {
      const ex = exercisesById[entry.exerciseId];
      if (!isPressingExercise(ex)) return;
      let best = 0;
      (entry.sets || []).forEach((s) => {
        const e1 = epley1RM(s.weight, s.reps);
        if (e1 > best) best = e1;
      });
      if (best <= 0) return;
      (byExercise[entry.exerciseId] ||= []).push({ date: log.date, e1rm: best, exName: ex.name });
    });
  });

  let decline = null;
  Object.values(byExercise).forEach((sessions) => {
    if (sessions.length < 3) return;
    const last3 = sessions.slice(-3);
    // Strictly declining across all 3 most recent sessions of this lift —
    // a single off session doesn't count, only a real multi-session trend.
    if (last3[0].e1rm > last3[1].e1rm && last3[1].e1rm > last3[2].e1rm) {
      const dropPct = Math.round(((last3[0].e1rm - last3[2].e1rm) / last3[0].e1rm) * 100);
      if (dropPct >= 5 && (!decline || dropPct > decline.dropPct)) {
        decline = { exName: last3[0].exName, sessions: last3, dropPct };
      }
    }
  });
  if (!decline) return null;

  const sorenessQuestions = findQuestionsByKeyword(db.forms, ["sore", "soreness"]);
  const soreness = recentAnswers(client.id, db, sorenessQuestions, 4).filter((a) => a.type === "rating");
  if (soreness.length < 2) return null;
  const last2Soreness = soreness.slice(-2);
  const sorenessRise = last2Soreness[1].value - last2Soreness[0].value;
  if (sorenessRise < 2) return null; // meaningful rise only, on the 1-5 scale

  const reasons = [
    `${decline.exName} e1RM declined across the last 3 logged sessions: ${decline.sessions.map((s) => `${Math.round(s.e1rm)}kg (${fmtDate(s.date)})`).join(" → ")} (${decline.dropPct}% drop).`,
    `"${last2Soreness[0].label}" rose from ${last2Soreness[0].value}/${RATING_SCALE_MAX} to ${last2Soreness[1].value}/${RATING_SCALE_MAX} (${fmtDate(last2Soreness[0].date)} → ${fmtDate(last2Soreness[1].date)}).`,
  ];

  // Corroborating (not required) signals — included only when they're
  // actually present in the data, never assumed.
  const sleepDocs = ((db.bodyMetrics || {})[client.id] || []).filter((d) => d.sleep != null);
  if (sleepDocs.length >= 2) {
    const last2Sleep = sleepDocs.slice(-2);
    if (last2Sleep[1].sleep - last2Sleep[0].sleep <= -1) {
      reasons.push(`Sleep dropped from ${last2Sleep[0].sleep}hrs to ${last2Sleep[1].sleep}hrs (${last2Sleep[0].date} → ${last2Sleep[1].date}).`);
    }
  }
  const recentWeekStart = Date.now() - 7 * DAY_MS;
  const priorWeekStart = recentWeekStart - 7 * DAY_MS;
  const pressingVolume = (start, end) =>
    sorted
      .filter((l) => l.date >= start && l.date < end && !l.cardio)
      .reduce(
        (acc, l) =>
          acc +
          (l.entries || [])
            .filter((e) => isPressingExercise(exercisesById[e.exerciseId]))
            .reduce((a, e) => a + (e.sets || []).reduce((b, s) => b + (s.weight || 0) * (s.reps || 0), 0), 0),
        0
      );
  const recentVol = pressingVolume(recentWeekStart, Date.now());
  const priorVol = pressingVolume(priorWeekStart, recentWeekStart);
  if (priorVol > 0 && recentVol > priorVol * 1.1) {
    const pct = Math.round(((recentVol - priorVol) / priorVol) * 100);
    reasons.push(`Pressing volume up ${pct}% week-over-week (${Math.round(priorVol)}kg → ${Math.round(recentVol)}kg).`);
  }

  const relevantContext = findRelevantContext(client.id, db, ["shoulder", "press", "pressing", "sore", "recover", decline.exName.toLowerCase()]);

  return {
    id: `apex-recovery-${client.id}`,
    client,
    kind: "apex",
    category: "recovery",
    title: "Potential recovery issue",
    detail: `${decline.exName} performance has declined while reported soreness has increased.`,
    reasons,
    relevantContext,
    suggestion: "Consider reviewing current pressing volume and recovery before the next session.",
  };
}

// Rule 2 — Bodyweight trend vs. nutrition adherence: a meaningful bodyweight
// change over ~3 weeks that isn't explained by inconsistent logging (the
// client HAS been tracking food most days in that window) — worth a coach
// look regardless of whether the goal is gain or loss, since either could
// be off-track from what was intended.
function bodyweightTrendInsight(client, db) {
  const weighIns = [...((db.weighIns || {})[client.id] || [])].sort((a, b) => a.date - b.date);
  if (weighIns.length < 2) return null;
  const windowMs = 21 * DAY_MS;
  const latest = weighIns[weighIns.length - 1];
  const cutoff = latest.date - windowMs;
  const baseline = [...weighIns].reverse().find((w) => w.date <= cutoff);
  if (!baseline) return null;

  const delta = Math.round((latest.weight - baseline.weight) * 10) / 10;
  if (Math.abs(delta) < 2) return null; // not a small/normal fluctuation

  const days = Math.round((latest.date - baseline.date) / DAY_MS);
  const nutritionLogs = (db.nutritionLogs || {})[client.id] || [];
  const loggedDaysInWindow = new Set(
    nutritionLogs
      .filter((n) => {
        const ts = new Date(n.date + "T00:00:00").getTime();
        return ts >= baseline.date && ts <= latest.date && n.meals && Object.values(n.meals).some((items) => items && items.length);
      })
      .map((n) => n.date)
  ).size;
  const adherencePct = Math.round((loggedDaysInWindow / days) * 100);
  if (adherencePct < 60) return null; // adherence itself is the more relevant story here — leave that to the existing nutrition alert

  const direction = delta > 0 ? "up" : "down";
  const relevantContext = findRelevantContext(client.id, db, ["weight", "nutrition", "diet", "goal", "bulk", "cut", "maintenance", "calorie"]);

  return {
    id: `apex-bodyweight-${client.id}`,
    client,
    kind: "apex",
    category: "nutrition",
    title: "Bodyweight trend worth reviewing",
    detail: `Bodyweight ${direction} ${Math.abs(delta)}kg over ${days} days despite consistently recorded nutrition.`,
    reasons: [
      `Bodyweight ${direction === "up" ? "increased" : "decreased"} ${Math.abs(delta)}kg — ${baseline.weight}kg (${fmtDate(baseline.date)}) → ${latest.weight}kg (${fmtDate(latest.date)}).`,
      `Food logged on ${loggedDaysInWindow} of ${days} days in that window (${adherencePct}%).`,
    ],
    relevantContext,
    suggestion: "Consider reviewing whether this trend still matches their current goal at your next check-in.",
  };
}

// Rule 3 — Self-reported nutrition struggle: the last two check-in
// responses to a "did you hit your macros/targets" style question both
// came back negative, with the client's own free-text reason (if any)
// quoted directly rather than summarized/invented.
function nutritionSelfReportInsight(client, db) {
  const macroQuestions = findQuestionsByKeyword(db.forms, ["macro", "hit your target", "hit your calorie"]).filter((q) => q.type === "choice");
  if (macroQuestions.length === 0) return null;
  const answers = recentAnswers(client.id, db, macroQuestions, 2);
  if (answers.length < 2) return null;
  const bothStruggled = answers.every((a) => !/^yes/i.test(String(a.value)));
  if (!bothStruggled) return null;

  // Best-effort: pull a same-form free-text "reason" question's answer from
  // the same two responses, if the coach's form has one — quoted verbatim.
  const reasonQuestions = findQuestionsByKeyword(db.forms, ["reason"]).filter((q) => q.type === "text");
  const reasonAnswers = recentAnswers(client.id, db, reasonQuestions, 2).filter((a) => String(a.value).trim());

  const relevantContext = findRelevantContext(client.id, db, ["nutrition", "macro", "diet", "meal"]);

  return {
    id: `apex-nutrition-selfreport-${client.id}`,
    client,
    kind: "apex",
    category: "nutrition",
    title: "Recurring nutrition difficulty",
    detail: "The last two check-ins both flagged a tough week hitting nutrition targets.",
    reasons: [
      ...answers.map((a) => `"${a.label}" — answered "${a.value}" (${fmtDate(a.date)}).`),
      ...reasonAnswers.map((a) => `"${a.label}": "${a.value}" (${fmtDate(a.date)}).`),
    ],
    relevantContext,
    suggestion: "May be worth checking in on nutrition adherence given the pattern across the last two check-ins.",
  };
}

const RULES = [recoveryConflictInsight, bodyweightTrendInsight, nutritionSelfReportInsight];

// Runs every rule for one client and returns whichever genuinely fired.
// Deliberately not memoized/cached here — CoachDashboard already only calls
// this for active clients once per render, same cost class as the other
// on-the-fly Needs Attention checks it sits alongside.
export function computeApexInsights(client, db) {
  return RULES.map((rule) => rule(client, db)).filter(Boolean);
}

// ---------------------------------------------------------------------
// Feature 2 — Intelligent Coach Notes: keyword-based detection of useful,
// categorizable context in a freeform note. This is intentionally a
// transparent heuristic (not an LLM call) — every detection is shown to the
// coach as a suggestion they must explicitly approve before it becomes
// persistent client context (see addClientContext in AppContext.jsx), so an
// imprecise keyword match costs nothing worse than an ignorable suggestion.
// ---------------------------------------------------------------------

const NOTE_CONTEXT_RULES = [
  {
    category: "Lifestyle",
    keywords: ["sleep", "waking up", "wakes up", "tired", "exhausted", "insomnia", "up at night"],
    suggestion: "Training consistency may currently be affected by disrupted sleep.",
  },
  {
    category: "Lifestyle",
    keywords: ["shift work", "night shift", "early shift", "long hours", "overtime", "busy at work"],
    suggestion: "Training schedule may be constrained by work hours.",
  },
  {
    category: "Lifestyle",
    keywords: ["travel", "traveling", "travelling", "flight", "work trip", "business trip"],
    suggestion: "May have irregular training access due to travel.",
  },
  {
    category: "Coaching Considerations",
    keywords: ["shoulder", "knee", "lower back", "back pain", "injury", "injured", "niggle", "tweak", "pain", "sore"],
    suggestion: "Flags a physical consideration that may be worth monitoring or modifying around.",
  },
  {
    category: "Nutrition",
    keywords: ["allerg", "intoleran", "doesn't eat", "dislikes eating", "vegetarian", "vegan", "can't stand", "won't eat"],
    suggestion: "May be a food preference or restriction worth reflecting in their nutrition plan.",
  },
  {
    category: "Training",
    keywords: ["no gym access", "home gym", "only has dumbbells", "resistance band", "no equipment", "hotel gym"],
    suggestion: "May affect what equipment is realistically available for their sessions.",
  },
  {
    category: "Personal Preferences",
    keywords: ["prefers text", "prefers calls", "prefers to be", "doesn't like being", "motivat"],
    suggestion: "May be a communication or motivation preference worth remembering.",
  },
];

// Returns an array of { category, suggestion } for whichever rules matched
// — never mutates/saves anything itself, purely a detector for the caller
// to present as an approve/reject choice.
export function detectNoteContext(noteText) {
  const text = (noteText || "").toLowerCase();
  if (!text.trim()) return [];
  const seen = new Set();
  const results = [];
  NOTE_CONTEXT_RULES.forEach((rule) => {
    if (rule.keywords.some((k) => text.includes(k)) && !seen.has(rule.suggestion)) {
      seen.add(rule.suggestion);
      results.push({ category: rule.category, suggestion: rule.suggestion });
    }
  });
  return results;
}

export const CLIENT_CONTEXT_CATEGORIES = ["Training", "Lifestyle", "Nutrition", "Coaching Considerations", "Personal Preferences"];
