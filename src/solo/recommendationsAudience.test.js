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
  it("women get only programs tagged for women, men only programs tagged for men (#179)", () => {
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "female" })).toEqual(["b", "w"]);
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "male" })).toEqual(["b", "m"]);
  });

  it("never filters a customer who chose other / prefer not to say, or hasn't answered", () => {
    expect(ids({ primaryGoal: "get_stronger", sexForScreening: "other" })).toEqual(["a", "b", "m", "w"]);
    expect(ids({ primaryGoal: "get_stronger" })).toEqual(["a", "b", "m", "w"]);
  });

  it("an untagged program is not suggested to men or women (#179)", () => {
    expect(suitsAudience(anyone, { sexForScreening: "male" })).toBe(false);
    expect(suitsAudience(anyone, { sexForScreening: "female" })).toBe(false);
    expect(suitsAudience(womens, { sexForScreening: "male" })).toBe(false);
  });
});
