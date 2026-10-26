import { describe, it, expect } from "vitest";
import { sessionDateKeys } from "./soloCalendar";
import { QUESTIONS, isAnswered, getVisibleQuestions } from "./onboarding/questionnaireConfig";
import { recommendPrograms, fitsSessionsPerWeek } from "./recommendations";

// 2026-10-19 is a Monday; 2026-10-21 a Wednesday.
describe("sessions scheduled on the consultation's chosen days", () => {
  it("puts a week's sessions on the chosen weekdays, in order", () => {
    // Mon / Wed / Fri, program starting Monday
    expect(sessionDateKeys("2026-10-19", 1, 3, [1, 3, 5])).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
    // week 2 is the following Mon / Wed / Fri
    expect(sessionDateKeys("2026-10-19", 2, 3, [1, 3, 5])).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
  });

  it("follows the week as it falls from the start date (start Wednesday → Wed, Fri, then Mon)", () => {
    expect(sessionDateKeys("2026-10-21", 1, 3, [5, 1, 3])).toEqual(["2026-10-21", "2026-10-23", "2026-10-26"]);
  });

  it("uses only as many chosen days as the program has sessions", () => {
    expect(sessionDateKeys("2026-10-19", 1, 2, [1, 3, 5])).toEqual(["2026-10-19", "2026-10-21"]);
  });

  it("falls back to an even spread with no, or too few, chosen days", () => {
    expect(sessionDateKeys("2026-10-19", 1, 3)).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
    expect(sessionDateKeys("2026-10-19", 1, 3, [6])).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
  });
});

describe("questionnaire: sessions per week, then exactly that many days", () => {
  const days = QUESTIONS.find((q) => q.id === "trainingDays");

  it("only asks for days once sessions per week is answered", () => {
    expect(getVisibleQuestions({}).some((q) => q.id === "trainingDays")).toBe(false);
    expect(getVisibleQuestions({ sessionsPerWeek: "3" }).some((q) => q.id === "trainingDays")).toBe(true);
  });

  it("counts the days answered only when exactly the chosen number are picked", () => {
    expect(isAnswered(days, { sessionsPerWeek: "3", trainingDays: [1, 3] })).toBe(false);
    expect(isAnswered(days, { sessionsPerWeek: "3", trainingDays: [1, 3, 5] })).toBe(true);
    expect(isAnswered(days, { sessionsPerWeek: "2", trainingDays: [1, 3, 5] })).toBe(false);
  });
});

describe("suggestions have exactly the sessions a week chosen", () => {
  const category = { id: "c1", name: "Strength" };
  const make = (id, n) => ({ id, status: "published", categoryIds: ["c1"], goals: ["get_stronger"], weekOnePreview: { sessionsPerWeek: n } });
  const programs = [make("two", 2), make("three", 3), make("five", 5), { ...make("unknown", 0), weekOnePreview: {} }];

  it("only suggests programs with exactly that many sessions a week", () => {
    const ids = recommendPrograms(programs, [category], { primaryGoal: "get_stronger", sessionsPerWeek: "3" }, { limit: 10 }).map((p) => p.id).sort();
    expect(ids).toEqual(["three"]);
  });

  it("doesn't filter when sessions per week hasn't been answered", () => {
    expect(fitsSessionsPerWeek(make("five", 5), {})).toBe(true);
  });
});
