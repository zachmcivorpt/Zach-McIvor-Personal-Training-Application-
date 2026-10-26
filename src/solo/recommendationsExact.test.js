import { describe, it, expect } from "vitest";
import { recommendPrograms, matchesAnswers } from "./recommendations";

const category = { id: "c1", name: "Strength" };
const answers = {
  sexForScreening: "male",
  sessionsPerWeek: "4",
  priorExperience: "intermediate",
  primaryGoal: "get_stronger",
  secondaryGoals: ["build_muscle"],
  preferredStyle: "strength",
  trainingEnvironment: "commercial_gym",
};
// A program matching every answer above.
const exact = {
  id: "exact",
  status: "published",
  categoryIds: ["c1"],
  level: "Intermediate",
  goals: ["get_stronger"],
  style: "strength",
  environments: ["commercial_gym", "home_gym"],
  audience: ["male"],
  weekOnePreview: { sessionsPerWeek: 4 },
};
const ids = (programs, a = answers) => recommendPrograms(programs, [category], a, { limit: 10 }).map((p) => p.id);

describe("recommendations match the consultation exactly", () => {
  it("suggests a program matching every answer", () => {
    expect(ids([exact])).toEqual(["exact"]);
  });

  it.each([
    ["sessions a week differ (3 vs 4)", { weekOnePreview: { sessionsPerWeek: 3 } }],
    ["sessions a week differ (5 vs 4)", { weekOnePreview: { sessionsPerWeek: 5 } }],
    ["sessions a week unknown", { weekOnePreview: {} }],
    ["level differs", { level: "Beginner" }],
    ["main goal not among its goals", { goals: ["lose_fat"] }],
    ["training style differs", { style: "hypertrophy" }],
    ["no training style set", { style: null }],
    ["environment not covered", { environments: ["home_minimal"] }],
    ["tagged for women only", { audience: ["female"] }],
  ])("leaves it out when %s", (_, change) => {
    expect(matchesAnswers({ ...exact, ...change }, answers)).toBe(false);
    expect(ids([{ ...exact, ...change }])).toEqual([]);
  });

  it("skips a question answered 'Something else', or not answered at all", () => {
    expect(ids([{ ...exact, goals: ["lose_fat"] }], { ...answers, primaryGoal: "other" })).toEqual(["exact"]);
    const { preferredStyle, ...noStyle } = answers;
    void preferredStyle;
    expect(ids([{ ...exact, style: "hypertrophy" }], noStyle)).toEqual(["exact"]);
  });

  it("orders exact matches by secondary-goal overlap", () => {
    const plain = { ...exact, id: "plain" };
    const bonus = { ...exact, id: "bonus", goals: ["get_stronger", "build_muscle"] };
    expect(ids([plain, bonus])).toEqual(["bonus", "plain"]);
  });

  it("recommends nothing before the consultation is answered", () => {
    expect(ids([exact], {})).toEqual([]);
  });
});
