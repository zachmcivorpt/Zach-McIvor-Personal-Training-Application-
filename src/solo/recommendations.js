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

// Recommendations are an EXACT match to the consultation, not a best
// guess: a program is suggested only if it matches every answer that has a
// program setting to match against —
//   sessionsPerWeek   = the program's sessions a week (weekOnePreview)
//   priorExperience   → the program's level (EXPERIENCE_TO_LEVEL)
//   primaryGoal       ∈ the program's goals
//   preferredStyle    = the program's training style
//   trainingEnvironment ∈ the program's environments
//   sexForScreening   → the program's "Who it's for" (suitsAudience)
// A question that wasn't answered (older accounts), or answered "Something
// else" (goal/style — matches nothing), is skipped rather than failing
// every program. Secondary goals aren't required — they only order the
// matches, most overlap first. Questions with no program setting (age,
// session length, equipment, injuries) can't be matched and don't filter.
export function matchesAnswers(program, answers) {
  const a = answers || {};
  if (!suitsAudience(program, a)) return false;
  if (!fitsSessionsPerWeek(program, a)) return false;
  const level = EXPERIENCE_TO_LEVEL[a.priorExperience];
  if (level && program.level !== level) return false;
  if (a.primaryGoal && a.primaryGoal !== "other" && !(program.goals || []).includes(a.primaryGoal)) return false;
  if (a.preferredStyle && a.preferredStyle !== "other" && program.style !== a.preferredStyle) return false;
  if (a.trainingEnvironment && !(program.environments || []).includes(a.trainingEnvironment)) return false;
  return true;
}

// True once the customer has answered at least one question that can be
// matched — before that (no consultation yet) nothing is recommended.
function hasMatchableAnswer(a) {
  return !!(Number(a.sessionsPerWeek) || EXPERIENCE_TO_LEVEL[a.priorExperience] || (a.primaryGoal && a.primaryGoal !== "other") || (a.preferredStyle && a.preferredStyle !== "other") || a.trainingEnvironment);
}

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

// Exactly the number of sessions a week the customer chose. Unanswered →
// not filtered; a program whose count isn't known (or has no sessions yet)
// never matches someone who did answer.
export function fitsSessionsPerWeek(program, answers) {
  const wanted = Number(answers?.sessionsPerWeek);
  if (!wanted) return true;
  return program.weekOnePreview?.sessionsPerWeek === wanted;
}

// Deliberately does NOT filter out or re-rank anything based on
// isFlaggedForMedicalReview — APSS Stage 1's own instruction is "seek
// guidance before exercising," not "here is a safe subset of programs";
// inventing a filter would be inventing a clinical judgment this app has
// no basis to make. The caller (SoloCatalogueScreen) surfaces that flag as
// its own standing safety notice instead.
export function recommendPrograms(programs, categories, answers, { limit = 2, excludeIds = [] } = {}) {
  const a = answers || {};
  if (!hasMatchableAnswer(a)) return [];
  const excluded = new Set(excludeIds);
  const secondary = new Set((a.secondaryGoals || []).filter((g) => g && g !== "none"));
  return visiblePrograms(programs, categories)
    .filter((p) => !excluded.has(p.id) && matchesAnswers(p, a))
    .map((program) => ({ program, overlap: (program.goals || []).filter((g) => secondary.has(g)).length }))
    .sort((x, y) => y.overlap - x.overlap)
    .slice(0, limit)
    .map((x) => x.program);
}

// How many of the matchable answers a program meets, for the "closest"
// fallback below — one point each for sessions a week, level, main goal,
// style and environment. Unanswered / "Something else" answers score
// nothing either way.
function answersMatched(program, a) {
  let n = 0;
  const wanted = Number(a.sessionsPerWeek);
  if (wanted && program.weekOnePreview?.sessionsPerWeek === wanted) n++;
  const level = EXPERIENCE_TO_LEVEL[a.priorExperience];
  if (level && program.level === level) n++;
  if (a.primaryGoal && a.primaryGoal !== "other" && (program.goals || []).includes(a.primaryGoal)) n++;
  if (a.preferredStyle && a.preferredStyle !== "other" && program.style === a.preferredStyle) n++;
  if (a.trainingEnvironment && (program.environments || []).includes(a.trainingEnvironment)) n++;
  return n;
}

// The Catalogue's and consultation screen's picks: exact matches when there
// are any (`exact: true`), otherwise the closest programs (`exact: false`) —
// most answers matched, then the nearest sessions a week, then the most
// shared secondary goals. "Who it's for" stays a hard rule even for the
// closest picks, and a program matching none of the answers is never
// offered.
export function recommendForAnswers(programs, categories, answers, { limit = 2, excludeIds = [] } = {}) {
  const exactPicks = recommendPrograms(programs, categories, answers, { limit, excludeIds });
  if (exactPicks.length > 0) return { programs: exactPicks, exact: true };
  const a = answers || {};
  if (!hasMatchableAnswer(a)) return { programs: [], exact: false };
  const excluded = new Set(excludeIds);
  const secondary = new Set((a.secondaryGoals || []).filter((g) => g && g !== "none"));
  const wanted = Number(a.sessionsPerWeek);
  const closest = visiblePrograms(programs, categories)
    .filter((p) => !excluded.has(p.id) && suitsAudience(p, a))
    .map((program) => ({
      program,
      matched: answersMatched(program, a),
      sessionsGap: wanted && typeof program.weekOnePreview?.sessionsPerWeek === "number" ? Math.abs(program.weekOnePreview.sessionsPerWeek - wanted) : 99,
      overlap: (program.goals || []).filter((g) => secondary.has(g)).length,
    }))
    .filter((x) => x.matched > 0)
    .sort((x, y) => y.matched - x.matched || x.sessionsGap - y.sessionsGap || y.overlap - x.overlap)
    .slice(0, limit)
    .map((x) => x.program);
  return { programs: closest, exact: false };
}
