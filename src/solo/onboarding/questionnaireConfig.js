// Train Solo's consultation questionnaire — the schema and branching logic
// only (no UI here; see SoloOnboarding.jsx). One flat, ordered list of
// questions, each with an optional `visibleIf(answers)` so a question only
// appears when it's actually relevant (e.g. "describe your current
// routine" only if the user said they're training). The UI always re-derives
// the visible list from the current answers rather than storing a separate
// "path" — so editing an earlier answer that changes branching (e.g.
// switching "currently training" to "not training") correctly hides/shows
// the right follow-ups on the next render, with no stale state.
//
// The five `apss_*` items in the "safety" section are reproduced verbatim
// (wording only lightly adapted for second person where the source already
// was) from Stage 1 of the Australian Adult Pre-Exercise Screening System
// (APSS) — Exercise & Sport Science Australia / Sports Medicine Australia /
// AUSactive, "Adult Pre-Exercise Screening Tool" V2 (2019). Stage 1 is the
// APSS's own compulsory, self-administered stage; its own instruction is:
// "IF YOU ANSWERED 'YES' to any of the 6 questions, please seek guidance
// from an appropriate allied health professional or medical practitioner
// prior to undertaking exercise." isFlaggedForMedicalReview() below
// implements exactly that rule — nothing stricter, nothing looser, and no
// diagnosis of what a "yes" might mean.
//
// Deliberately NOT implemented: APSS Stage 1's own Q7 (weighted
// light/moderate/vigorous minutes-per-week volume calculation, which then
// recommends a specific exercise intensity progression) and all of Stage 2
// (family history, blood pressure, cholesterol, blood glucose — a
// clinician-administered risk assessment, not something to self-report
// into a signup flow). Both would mean this questionnaire itself generating
// an exercise recommendation, which the task scope explicitly rules out
// ("do not invent recommendations without an actual program catalogue").
// Stage 1's six yes/no items are screening questions, not a prescription,
// so including exactly those (and nothing from Stage 2/3) keeps this
// faithful to "use the framework appropriately" without overreaching it.

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const SECTIONS = [
  { id: "personal", label: "A few basics" },
  { id: "goals", label: "Goals & motivation" },
  { id: "history", label: "Training history" },
  { id: "preferences", label: "Training preferences" },
  { id: "safety", label: "Before we go further" },
];

// Each question: { id, section, type, label, helper?, options?, required, visibleIf?(answers) }
// type: "select" | "multiselect" | "text" | "number" | "consent"
export const QUESTIONS = [
  // --- personal -----------------------------------------------------
  {
    id: "age",
    section: "personal",
    type: "number",
    label: "How old are you?",
    helper: "Used for your own context only.",
    required: true,
  },
  {
    id: "sexForScreening",
    section: "personal",
    type: "select",
    label: "Which of these best applies to you?",
    helper: "Used for your own context only.",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "other", label: "Other / prefer not to say" },
    ],
    required: true,
  },
  {
    id: "lifestyleContext",
    section: "personal",
    type: "select",
    label: "What's your day-to-day activity like outside of training?",
    options: [
      { value: "desk", label: "Mostly sitting — desk job" },
      { value: "on_feet", label: "On my feet a lot" },
      { value: "physical_job", label: "Physically demanding job" },
      { value: "mixed", label: "A mix of both" },
    ],
    required: true,
  },

  // --- goals ----------------------------------------------------------
  {
    id: "primaryGoal",
    section: "goals",
    type: "select",
    label: "What's your main training goal right now?",
    options: [
      { value: "build_muscle", label: "Build muscle" },
      { value: "lose_fat", label: "Lose fat" },
      { value: "general_fitness", label: "Improve general fitness" },
      { value: "get_stronger", label: "Get stronger" },
      { value: "sport_performance", label: "Improve sport performance" },
      { value: "health_markers", label: "Improve health markers" },
      { value: "other", label: "Something else" },
    ],
    required: true,
  },
  {
    id: "primaryGoalOther",
    section: "goals",
    type: "text",
    label: "What's the main goal, in your own words?",
    required: true,
    visibleIf: (a) => a.primaryGoal === "other",
  },
  {
    id: "secondaryGoals",
    section: "goals",
    type: "multiselect",
    label: "Anything else you'd like to work on, alongside that?",
    options: [
      { value: "build_muscle", label: "Build muscle" },
      { value: "lose_fat", label: "Lose fat" },
      { value: "general_fitness", label: "General fitness" },
      { value: "get_stronger", label: "Get stronger" },
      { value: "sport_performance", label: "Sport performance" },
      { value: "health_markers", label: "Health markers" },
      { value: "none", label: "Nothing else in particular" },
    ],
    required: false,
  },
  {
    id: "mostWantToImprove",
    section: "goals",
    type: "text",
    label: "If you had to name one thing you most want to see change, what would it be?",
    required: false,
  },
  {
    id: "mainObstacles",
    section: "goals",
    type: "multiselect",
    label: "What's mainly held you back so far?",
    options: [
      { value: "time", label: "Lack of time" },
      { value: "motivation", label: "Lack of motivation" },
      { value: "no_plan", label: "Not knowing what to do" },
      { value: "consistency", label: "Staying consistent" },
      { value: "injury", label: "An injury or physical limitation" },
      { value: "diet", label: "Diet/nutrition" },
      { value: "other", label: "Something else" },
    ],
    required: true,
  },
  {
    id: "mainObstaclesOther",
    section: "goals",
    type: "text",
    label: "What else has held you back?",
    required: false,
    visibleIf: (a) => Array.isArray(a.mainObstacles) && a.mainObstacles.includes("other"),
  },
  {
    id: "reasonForChange",
    section: "goals",
    type: "text",
    label: "What's making now the right time to make a change?",
    required: false,
  },

  // --- training history -------------------------------------------------
  {
    id: "priorExperience",
    section: "history",
    type: "select",
    label: "How much strength-training/gym experience do you have?",
    options: [
      { value: "none", label: "None" },
      { value: "beginner", label: "Beginner — under 6 months" },
      { value: "intermediate", label: "Intermediate — 6 months to 2 years" },
      { value: "advanced", label: "Advanced — 2+ years" },
    ],
    required: true,
  },
  {
    id: "currentRoutine",
    section: "history",
    type: "select",
    label: "Are you currently training?",
    options: [
      { value: "not_training", label: "Not at the moment" },
      { value: "inconsistent", label: "Yes, but inconsistently" },
      { value: "consistent", label: "Yes, consistently" },
    ],
    required: true,
  },
  {
    id: "consistencyDetail",
    section: "history",
    type: "text",
    label: "What does that currently look like?",
    required: false,
    visibleIf: (a) => a.currentRoutine && a.currentRoutine !== "not_training",
  },
  {
    id: "whatWorkedBefore",
    section: "history",
    type: "text",
    label: "What's worked well for you in the past, if anything?",
    required: false,
  },
  {
    id: "whatDidntWork",
    section: "history",
    type: "text",
    label: "What hasn't worked, or what made you stop before?",
    required: false,
  },
  {
    id: "enjoyedStyles",
    section: "history",
    type: "multiselect",
    label: "Which of these do you actually enjoy?",
    options: [
      { value: "strength", label: "Weightlifting / strength training" },
      { value: "cardio", label: "Cardio / running" },
      { value: "classes", label: "Group classes" },
      { value: "sport", label: "Sport" },
      { value: "mobility", label: "Yoga / mobility" },
      { value: "calisthenics", label: "Bodyweight / calisthenics" },
      { value: "none", label: "None of these, particularly" },
    ],
    required: false,
  },
  {
    id: "dislikedStyles",
    section: "history",
    type: "multiselect",
    label: "Any of those you'd rather avoid?",
    options: [
      { value: "strength", label: "Weightlifting / strength training" },
      { value: "cardio", label: "Cardio / running" },
      { value: "classes", label: "Group classes" },
      { value: "sport", label: "Sport" },
      { value: "mobility", label: "Yoga / mobility" },
      { value: "calisthenics", label: "Bodyweight / calisthenics" },
      { value: "none", label: "No, happy to do any of it" },
    ],
    required: false,
  },

  // --- preferences --------------------------------------------------
  {
    id: "trainingEnvironment",
    section: "preferences",
    type: "select",
    label: "Where will you mainly be training?",
    options: [
      { value: "commercial_gym", label: "Commercial gym" },
      { value: "home_gym", label: "Home gym" },
      { value: "home_minimal", label: "Home — minimal equipment" },
      { value: "outdoors", label: "Outdoors" },
      { value: "no_equipment", label: "No equipment at all" },
    ],
    required: true,
  },
  {
    id: "availableEquipment",
    section: "preferences",
    type: "multiselect",
    label: "What equipment do you actually have access to?",
    options: [
      { value: "barbell", label: "Barbell" },
      { value: "dumbbells", label: "Dumbbells" },
      { value: "machines", label: "Machines" },
      { value: "bands", label: "Resistance bands" },
      { value: "bodyweight", label: "Bodyweight only" },
      { value: "cardio", label: "Cardio equipment" },
    ],
    required: true,
  },
  {
    id: "daysPerWeek",
    section: "preferences",
    type: "select",
    label: "Realistically, how many days a week can you train?",
    options: [
      { value: "1-2", label: "1–2 days" },
      { value: "3-4", label: "3–4 days" },
      { value: "5-6", label: "5–6 days" },
      { value: "7", label: "Every day" },
    ],
    required: true,
  },
  {
    id: "sessionDuration",
    section: "preferences",
    type: "select",
    label: "How long do you want a typical session to be?",
    options: [
      { value: "under_30", label: "Under 30 minutes" },
      { value: "30-45", label: "30–45 minutes" },
      { value: "45-60", label: "45–60 minutes" },
      { value: "60+", label: "60 minutes or more" },
    ],
    required: true,
  },
  {
    id: "preferredStyle",
    section: "preferences",
    type: "select",
    label: "Which style sounds most like what you want?",
    options: [
      { value: "strength", label: "Strength training" },
      { value: "hypertrophy", label: "Muscle building (hypertrophy)" },
      { value: "functional", label: "Functional / athletic" },
      { value: "general", label: "Mixed / general fitness" },
      { value: "conditioning", label: "HIIT / conditioning" },
      { value: "other", label: "Something else" },
    ],
    required: true,
  },
  {
    id: "constraints",
    section: "preferences",
    type: "text",
    label: "Anything practical that affects how consistent you can be — travel, shift work, family, etc.?",
    required: false,
  },

  // --- safety / APSS Stage 1 -----------------------------------------
  {
    id: "healthConsent",
    section: "safety",
    type: "consent",
    label: "Before the last few questions",
    required: true,
  },
  {
    id: "priorInjuriesSurgeries",
    section: "safety",
    type: "select",
    label: "Have you had any previous injuries or surgeries relevant to exercise?",
    options: YES_NO,
    required: true,
  },
  {
    id: "priorInjuriesSurgeriesDetail",
    section: "safety",
    type: "text",
    label: "Tell us about it, and whether it still affects you.",
    required: false,
    visibleIf: (a) => a.priorInjuriesSurgeries === "yes",
  },
  {
    id: "currentPainLimitations",
    section: "safety",
    type: "select",
    label: "Do you currently have any pain, injury or movement limitation?",
    options: YES_NO,
    required: true,
  },
  {
    id: "currentPainLimitationsDetail",
    section: "safety",
    type: "text",
    label: "What's going on, and does it limit any particular movements?",
    required: false,
    visibleIf: (a) => a.currentPainLimitations === "yes",
  },
  {
    id: "apss_heartCondition",
    section: "safety",
    type: "select",
    label: "Has a medical practitioner ever told you that you have a heart condition, or have you ever suffered a stroke?",
    options: YES_NO,
    required: true,
    apss: true,
  },
  {
    id: "apss_chestPain",
    section: "safety",
    type: "select",
    label: "Do you ever experience unexplained pain or discomfort in your chest, at rest or during physical activity?",
    options: YES_NO,
    required: true,
    apss: true,
  },
  {
    id: "apss_dizziness",
    section: "safety",
    type: "select",
    label: "Do you ever feel faint, dizzy, or lose your balance during physical activity?",
    options: YES_NO,
    required: true,
    apss: true,
  },
  {
    id: "apss_asthma",
    section: "safety",
    type: "select",
    label: "Have you had an asthma attack requiring immediate medical attention at any time in the last 12 months?",
    options: YES_NO,
    required: true,
    apss: true,
  },
  {
    id: "apss_diabetesControl",
    section: "safety",
    type: "select",
    label: "If you have diabetes (type 1 or 2), have you had trouble controlling your blood sugar in the last 3 months?",
    helper: "If you don't have diabetes, choose \"Doesn't apply to me.\"",
    options: [...YES_NO, { value: "na", label: "Doesn't apply to me" }],
    required: true,
    apss: true,
  },
  {
    id: "apss_otherConditions",
    section: "safety",
    type: "select",
    label: "Do you have any other condition that may need special consideration before you exercise?",
    options: YES_NO,
    required: true,
    apss: true,
  },
  {
    id: "apss_otherConditionsDetail",
    section: "safety",
    type: "text",
    label: "What should we know?",
    required: false,
    visibleIf: (a) => a.apss_otherConditions === "yes",
  },
  {
    id: "healthcareRestriction",
    section: "safety",
    type: "select",
    label: "Has a healthcare professional ever told you to avoid or modify any particular type of exercise?",
    options: YES_NO,
    required: true,
  },
  {
    id: "healthcareRestrictionDetail",
    section: "safety",
    type: "text",
    label: "What were you told to avoid or modify?",
    required: false,
    visibleIf: (a) => a.healthcareRestriction === "yes",
  },
];

export function getVisibleQuestions(answers) {
  return QUESTIONS.filter((q) => !q.visibleIf || q.visibleIf(answers || {}));
}

export function isAnswered(question, answers) {
  const v = answers?.[question.id];
  if (question.type === "consent") return v === true;
  if (question.type === "multiselect") return Array.isArray(v) && v.length > 0;
  if (question.type === "number") return v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v));
  return v !== undefined && v !== null && String(v).trim() !== "";
}

// First visible question that's required and not yet answered — where a
// new user starts, and where a returning user with an unfinished
// questionnaire resumes. Recomputed fresh from `answers` every time rather
// than stored as its own "currentStep" pointer, so editing an earlier
// answer that hides/reveals later questions can never leave a stale
// position pointing at a question that no longer applies.
export function firstUnansweredIndex(answers) {
  const visible = getVisibleQuestions(answers);
  for (let i = 0; i < visible.length; i++) {
    const q = visible[i];
    if (q.required && !isAnswered(q, answers)) return i;
  }
  return visible.length - 1; // all required questions answered — land on the last one
}

export function isComplete(answers) {
  const visible = getVisibleQuestions(answers);
  return visible.every((q) => !q.required || isAnswered(q, answers));
}

// Implements APSS Stage 1's own rule verbatim: a "yes" to any of its six
// compulsory questions means seek guidance from an allied health
// professional or medical practitioner before exercising. Nothing else
// collected here (the non-APSS injury/pain/healthcare-restriction
// questions) feeds this flag — they're real safety information but aren't
// part of APSS Stage 1 itself, so this stays exactly as strict (and exactly
// as loose) as the source framework, not broadened by our own judgment.
export function isFlaggedForMedicalReview(answers) {
  return QUESTIONS.some((q) => q.apss && answers?.[q.id] === "yes");
}
