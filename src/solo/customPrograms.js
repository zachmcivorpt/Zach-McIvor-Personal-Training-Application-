// Programs a Plus customer builds themselves (ROADMAP.txt step 2): pick some
// of their saved sessions as the days of a week, choose how many weeks, set
// a start date — and it runs on the calendar like any catalogue program,
// with suggested weights carrying the progression week to week.
//
// soloCustomPrograms/{id}: { id, soloUserId, name, weeks, startDate,
//   days: [{ id, label, sessionId, exercises }], createdAt, updatedAt }
// The days are a COPY of the sessions at the time they were added, so
// editing or deleting a saved session later never changes a program
// that's already running (or the history it logged).
//
// Everything downstream (calendar, My Training, workout logs) works off the
// same purchase-shaped rows as catalogue programs; these use programId
// `cp_{id}` and the log key `{uid}_cp_{id}`, which no catalogue program or
// purchase can ever have.
import { newId } from "../lib/id";

export const MAX_PROGRAM_WEEKS = 16;
export const MAX_PROGRAM_DAYS = 7;
export const CUSTOM_PROGRAM_PREFIX = "cp_";

export const customProgramKey = (id) => `${CUSTOM_PROGRAM_PREFIX}${id}`;
export const isCustomProgramId = (programId) => typeof programId === "string" && programId.startsWith(CUSTOM_PROGRAM_PREFIX);

// A saved session → a program day (a copy, see above).
export function dayFromSession(session) {
  return {
    id: newId("day"),
    label: session.name,
    sessionId: session.id,
    exercises: (session.exercises || []).map((e) => ({ ...e })),
  };
}

export function validateCustomProgram(draft) {
  if (!draft?.name?.trim()) return "Give your program a name.";
  const weeks = Number(draft.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_PROGRAM_WEEKS) return `Choose between 1 and ${MAX_PROGRAM_WEEKS} weeks.`;
  if (!Array.isArray(draft.days) || draft.days.length === 0) return "Add at least one session to the week.";
  if (draft.days.length > MAX_PROGRAM_DAYS) return `A week can have up to ${MAX_PROGRAM_DAYS} sessions.`;
  if (draft.days.some((d) => !(d.exercises || []).length)) return "Every session needs at least one exercise.";
  return null;
}

// Purchase-shaped rows plus the programsById/contentByProgramId entries the
// calendar and My Training look programs up in. `locked` (Plus lapsed after
// launch) keeps them off the calendar, like a lapsed All Access program.
export function customProgramEntries(uid, programs = [], { locked = false } = {}) {
  const trainingRows = [];
  const programsById = {};
  const contentByProgramId = {};
  for (const p of programs) {
    const key = customProgramKey(p.id);
    programsById[key] = { id: key, name: p.name, kind: "custom", customProgramId: p.id };
    contentByProgramId[key] = { phases: [{ id: "custom", name: "Your program", durationWeeks: Number(p.weeks) || 1, days: p.days || [] }] };
    trainingRows.push({
      id: `${uid}_${key}`,
      programId: key,
      startDate: p.startDate || null,
      source: "custom",
      status: "active",
      untilDate: null,
      locked,
      customProgramId: p.id,
    });
  }
  return { trainingRows, programsById, contentByProgramId };
}
