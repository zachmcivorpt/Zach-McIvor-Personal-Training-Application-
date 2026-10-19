// Matches a Train Solo customer's completed consultation answers
// (src/solo/onboarding/questionnaireConfig.js) against published programs'
// coach-set attributes (goals/style/environments/level — set in the coach
// console's Program Builder, see src/coach/CoachTrainSolo.jsx). Pure
// functions, no Firestore/React here, so adding a new program or category
// never needs a code change — only a coach tagging a program with the
// right attributes. See src/solo/programAttributes.js for the shared
// vocabulary both sides draw from.
import { EXPERIENCE_TO_LEVEL } from "./programAttributes";

export function formatAudPrice(priceCents) {
  if (priceCents == null) return "Price TBC";
  return `A$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}`;
}

// Only ever reads from the published catalogue and non-archived
// categories — callers are expected to have already filtered to those
// (see visiblePrograms/visibleCategories below), but filtering again here
// too means a recommendation can never surface a draft or an archived
// category's program even if a caller forgets to pre-filter.
function isVisible(program, categoriesById) {
  if (!program || program.status !== "published") return false;
  const categoryIds = program.categoryIds || [];
  // A program with zero categories, or whose only categories are all
  // archived, has nowhere visible to appear in the catalogue — same "no
  // empty/invisible section" rule applied one level down, to the program
  // itself rather than just the category list.
  return categoryIds.some((id) => categoriesById[id] && !categoriesById[id].archived);
}

export function visibleCategories(categories, programs) {
  const published = programs.filter((p) => p.status === "published");
  return categories
    .filter((c) => !c.archived)
    .filter((c) => published.some((p) => (p.categoryIds || []).includes(c.id)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function visiblePrograms(programs, categories) {
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  return programs.filter((p) => isVisible(p, categoriesById));
}

// One program's score against one set of answers — higher is a better
// match. Returns 0 for "no meaningful signal", never negative, so callers
// can treat "score > 0" as "worth recommending" and sort the rest only as
// a browse-all fallback order.
function scoreProgram(program, answers) {
  let score = 0;

  const experienceLevel = EXPERIENCE_TO_LEVEL[answers.priorExperience];
  if (experienceLevel && program.level === experienceLevel) score += 3;

  if (answers.preferredStyle && program.style && answers.preferredStyle === program.style) score += 3;

  const customerGoals = new Set([answers.primaryGoal, ...(answers.secondaryGoals || [])].filter(Boolean));
  for (const goal of program.goals || []) {
    if (customerGoals.has(goal)) score += 2;
  }

  if (answers.trainingEnvironment && (program.environments || []).includes(answers.trainingEnvironment)) score += 2;

  return score;
}

// `answers` may be partial/empty (questionnaire not completed, or a
// customer who skipped every non-required question) — scoreProgram simply
// contributes 0 for whatever's missing, so this degrades gracefully to "no
// particular match" rather than throwing or guessing.
//
// Deliberately does NOT filter out or re-rank anything based on
// isFlaggedForMedicalReview — APSS Stage 1's own instruction is "seek
// guidance before exercising," not "here is a safe subset of programs";
// inventing a filter would be inventing a clinical judgment this app has
// no basis to make. The caller (SoloCatalogueScreen) surfaces that flag as
// its own standing safety notice instead (see SoloCatalogueScreen.jsx and
// SoloProfileScreen.jsx), same as the earlier placeholder home screen
// this phase replaced.
export function recommendPrograms(programs, categories, answers, { limit = 3 } = {}) {
  const candidates = visiblePrograms(programs, categories);
  const scored = candidates.map((program) => ({ program, score: scoreProgram(program, answers || {}) }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return matched.slice(0, limit).map((s) => s.program);
}
