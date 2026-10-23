import { describe, it, expect } from "vitest";
import { recommendPrograms, suitsAudience } from "./recommendations";

const category = { id: "c1", name: "Strength" };
const base = { status: "published", categoryIds: ["c1"], goals: ["get_stronger"] };
const mens = { ...base, id: "m", name: "Men's", audience: ["male"] };
const womens = { ...base, id: "w", name: "Women's", audience: ["female"] };
const anyone = { ...base, id: "a", name: "Anyone" };
const both = { ...base, id: "b", name: "Both", audience: ["male", "female"] };
const programs = [mens, womens, anyone, both];
const ids = (answers) => recommendPrograms(programs, [category], answers, { limit: 10 }).map((p) => p.id).sort();

describe("program audience (Who it's for)", () => {
  it("only suggests programs tagged for the customer's consultation sex, plus untagged ones", () => {
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "female" })).toEqual(["a", "b", "w"]);
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "male" })).toEqual(["a", "b", "m"]);
  });

  it("never filters a customer who chose other / prefer not to say, or hasn't answered", () => {
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "other" })).toEqual(["a", "b", "m", "w"]);
    expect(ids({ primaryGoal: "get_stronger" })).toEqual(["a", "b", "m", "w"]);
  });

  it("treats an untagged program as suiting everyone", () => {
    expect(suitsAudience(anyone, { sexForScreening: "male" })).toBe(true);
    expect(suitsAudience(womens, { sexForScreening: "male" })).toBe(false);
  });
});
