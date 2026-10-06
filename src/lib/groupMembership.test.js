import { describe, expect, it } from "vitest";
import { removedMemberIds } from "./groupMembership";

describe("removedMemberIds", () => {
  it("returns ids present in the current roster but missing from the next one", () => {
    expect(removedMemberIds(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("returns an empty array when membership only grows", () => {
    expect(removedMemberIds(["a"], ["a", "b"])).toEqual([]);
  });

  it("returns an empty array when nothing changed", () => {
    expect(removedMemberIds(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("handles missing/undefined lists without throwing", () => {
    expect(removedMemberIds(undefined, ["a"])).toEqual([]);
    expect(removedMemberIds(["a"], undefined)).toEqual(["a"]);
  });
});
