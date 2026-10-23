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
  // Recovery add-ons have their own Catalogue section (visibleRecoveryAddons
  // below) and are never recommended or listed under a category.
  if (isRecoveryAddon(program)) return false;
  const categoryIds = program.categoryIds || [];
  // A program with zero categories, or whose only categories are all
  // archived, has nowhere visible to appear in the catalogue — same "no
  // empty/invisible section" rule applied one level down, to the program
  // itself rather than just the category list.
  return categoryIds.some((id) => categoriesById[id] && !categoriesById[id].archived);
}

export function visibleCategories(categories, programs) {
  const published = programs.filter((p) => p.status === "published" && !isRecoveryAddon(p));
  return categories
    .filter((c) => !c.archived)
    .filter((c) => published.some((p) => (p.categoryIds || []).includes(c.id)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// A free recovery/mobility product (kind "recovery") a customer can add
// alongside a purchased program — see SoloAppContext's setRecoveryAddon and
// soloCalendar.js, which lays its sessions onto the program's rest days.
export function isRecoveryAddon(program) {
  return program?.kind === "recovery";
}

export function visibleRecoveryAddons(programs) {
  return programs.filter((p) => p.status === "published" && isRecoveryAddon(p));
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

  // The customer's primary goal outweighs any secondary goal, so between
  // two otherwise-equal programs the one built for what they said matters
  // most ranks first.
  const secondaryGoals = new Set((answers.secondaryGoals || []).filter(Boolean));
  for (const goal of program.goals || []) {
    if (answers.primaryGoal && goal === answers.primaryGoal) score += 3;
    else if (secondaryGoals.has(goal)) score += 2;
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
// A program tagged for men or women (program.audience) is only suggested to
// a customer whose consultation sex matches. Untagged programs suit
// everyone, and a customer who chose "Other / prefer not to say" (or hasn't
// answered) is never filtered either way.
export function suitsAudience(program, answers) {
  const audience = program.audience || [];
  const sex = answers?.sexForScreening;
  if (audience.length === 0 || (sex !== "male" && sex !== "female")) return true;
  return audience.includes(sex);
}

export function recommendPrograms(programs, categories, answers, { limit = 2, excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  const candidates = visiblePrograms(programs, categories).filter((p) => !excluded.has(p.id) && suitsAudience(p, answers));
  const scored = candidates.map((program) => ({ program, score: scoreProgram(program, answers || {}) }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return matched.slice(0, limit).map((s) => s.program);
}
