// #234: Team week streak maths and invite codes.
import { describe, it, expect } from "vitest";
import { weekKey, shiftWeek, teamStreak, teamWeekView, normalisePartnerCode, makePartnerCode, pairIdFor, weekFor, partnerSessionToSolo } from "./partners";

const met = { done: 3, target: 3 };
const short = { done: 1, target: 3 };

describe("weekKey", () => {
  it("is the Monday of the week, Sunday included", () => {
    expect(weekKey("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekKey("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekKey("2026-01-01")).toBe("2025-12-29"); // across a year
  });
  it("shiftWeek moves whole weeks", () => {
    expect(shiftWeek("2026-11-09", -1)).toBe("2026-11-02");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });
});

describe("teamStreak", () => {
  const cur = "2026-11-09";
  it("counts consecutive weeks both hit, this week included once met", () => {
    const a = { "2026-10-26": met, "2026-11-02": met, [cur]: met };
    const b = { "2026-10-26": met, "2026-11-02": met, [cur]: { done: 4, target: 3 } };
    expect(teamStreak(a, b, cur, "2026-10-01")).toBe(3);
  });
  it("an unfinished week doesn't break it (it's still this week)", () => {
    const a = { "2026-10-26": met, "2026-11-02": met, [cur]: short };
    const b = { "2026-10-26": met, "2026-11-02": met, [cur]: met };
    expect(teamStreak(a, b, cur, "2026-10-01")).toBe(2);
  });
  it("one partner missing a past week ends the run there", () => {
    const a = { "2026-10-26": met, "2026-11-02": met };
    const b = { "2026-10-26": met, "2026-11-02": short };
    expect(teamStreak(a, b, cur, "2026-10-01")).toBe(0);
  });
  it("weeks before they paired never count", () => {
    const a = { "2026-10-26": met, "2026-11-02": met };
    const b = { "2026-10-26": met, "2026-11-02": met };
    expect(teamStreak(a, b, cur, "2026-11-02")).toBe(1);
  });
  it("each partner is held to their own target", () => {
    const a = { "2026-11-02": { done: 2, target: 2 } };
    const b = { "2026-11-02": { done: 5, target: 5 } };
    expect(teamStreak(a, b, cur, "2026-11-02")).toBe(1);
  });
  it("no data is 0, not an error", () => {
    expect(teamStreak(undefined, null, cur, cur)).toBe(0);
  });
});

describe("teamWeekView", () => {
  it("falls back to the member's own target before they log this week", () => {
    expect(weekFor({ target: 4, weeks: {} }, "2026-11-09")).toEqual({ done: 0, target: 4 });
  });
  it("puts it together for the row", () => {
    const mine = { target: 3, weeks: { "2026-11-09": met } };
    const theirs = { target: 2, weeks: { "2026-11-09": { done: 1, target: 2 } } };
    const v = teamWeekView({ mine, theirs, todayKey: "2026-11-12", pairedAt: new Date(2026, 10, 1).getTime() });
    expect(v.me).toEqual({ done: 3, target: 3 });
    expect(v.them).toEqual({ done: 1, target: 2 });
    expect(v.metThisWeek).toBe(false);
  });
});

describe("invite codes", () => {
  it("reads a typed code or a pasted invite", () => {
    expect(normalisePartnerCode(" abc234 ")).toBe("ABC234");
    expect(normalisePartnerCode("Train with me… Join with code ABC234: https://x.app/solo/join/ABC234")).toBe("ABC234");
    expect(normalisePartnerCode("abc")).toBe("");
  });
  it("makes 6-character codes without look-alike letters", () => {
    const code = makePartnerCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
  it("pair ids are the same whoever joins", () => {
    expect(pairIdFor("b", "a")).toBe("a_b");
    expect(pairIdFor("a", "b")).toBe("a_b");
  });
});

describe("train their session (#243)", () => {
  const lib = { bp: { id: "bp", name: "Bench Press" }, row: { id: "row", name: "Seated Row" } };
  it("becomes a one-off session with their sets and reps, named for them", () => {
    const s = partnerSessionToSolo({ title: "Upper", exercises: [{ exerciseId: "bp", sets: 3, reps: 6 }, { exerciseId: "gone", sets: 3, reps: 8 }, { exerciseId: "row", sets: 1, reps: 12 }] }, lib, "Sam");
    expect(s.name).toBe("Sam's Upper");
    expect(s.exercises.map((e) => [e.exerciseId, e.targetSets, e.targetReps])).toEqual([
      ["bp", 3, 6],
      ["row", 1, 12],
    ]);
    expect(JSON.stringify(s)).not.toMatch(/weight/);
  });
  it("keeps a name that's already someone's, and gives nothing when no exercise is known", () => {
    expect(partnerSessionToSolo({ title: "Jo's Upper", exercises: [{ exerciseId: "bp", sets: 3, reps: 6 }] }, lib, "Sam").name).toBe("Jo's Upper");
    expect(partnerSessionToSolo({ title: "X", exercises: [{ exerciseId: "gone", sets: 3, reps: 6 }] }, lib, "Sam")).toBe(null);
    expect(partnerSessionToSolo(null, lib, "Sam")).toBe(null);
  });
});
