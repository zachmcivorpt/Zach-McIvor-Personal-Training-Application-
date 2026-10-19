// Shared vocabulary between the coach's Program Builder (tagging a Solo
// program with what it's actually for) and the customer-side recommendation
// engine (recommendations.js) that matches those tags against a customer's
// consultation answers. Defining both sides' option lists from the exact
// same values questionnaireConfig.js already uses for primaryGoal/
// secondaryGoals, preferredStyle and trainingEnvironment is what keeps
// matching correct as programs/categories are added — a coach tagging a
// program "lose_fat" only ever means the same thing recommendations.js
// checks for, because it's the same string from the same list, not two
// independently-typed option sets that can quietly drift apart.
export const GOAL_OPTIONS = [
  { value: "build_muscle", label: "Build muscle" },
  { value: "lose_fat", label: "Lose fat" },
  { value: "general_fitness", label: "General fitness" },
  { value: "get_stronger", label: "Get stronger" },
  { value: "sport_performance", label: "Sport performance" },
  { value: "health_markers", label: "Health markers" },
];

export const STYLE_OPTIONS = [
  { value: "strength", label: "Strength training" },
  { value: "hypertrophy", label: "Muscle building (hypertrophy)" },
  { value: "functional", label: "Functional / athletic" },
  { value: "general", label: "Mixed / general fitness" },
  { value: "conditioning", label: "HIIT / conditioning" },
];

export const ENVIRONMENT_OPTIONS = [
  { value: "commercial_gym", label: "Commercial gym" },
  { value: "home_gym", label: "Home gym" },
  { value: "home_minimal", label: "Home — minimal equipment" },
  { value: "outdoors", label: "Outdoors" },
  { value: "no_equipment", label: "No equipment at all" },
];

export const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced"];

// priorExperience (questionnaire) -> the program level it maps to for
// matching purposes. "none" and "beginner" both point at a Beginner
// program — there's no narrower program level to tell them apart.
export const EXPERIENCE_TO_LEVEL = {
  none: "Beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
