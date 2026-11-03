// #144: what goes on the Program complete share card — checked by hand.
import { describe, expect, it } from "vitest";
import { bodyweightChange, shareCardContent } from "./shareCard";

describe("bodyweight over the program", () => {
  it("first weigh-in from the start date vs the latest", () => {
    const weighIns = [
      { weight: 90, date: new Date("2026-08-01T12:00:00").getTime() }, // before the program: ignored
      { weight: 84.2, date: new Date("2026-09-02T12:00:00").getTime() },
      { weight: 82.0, date: new Date("2026-10-01T12:00:00").getTime() },
      { weight: 80.9, date: new Date("2026-10-28T12:00:00").getTime() },
    ];
    expect(bodyweightChange(weighIns, "2026-09-01")).toEqual({ from: 84.2, to: 80.9, change: -3.3 });
  });
  it("needs two weigh-ins", () => {
    expect(bodyweightChange([{ weight: 80, date: Date.now() }], null)).toBe(null);
    expect(bodyweightChange([], "2026-01-01")).toBe(null);
  });
});

describe("card content", () => {
  const exercisesById = { a: { name: "Back Squat" }, b: { name: "Bench Press" }, c: { name: "Deadlift" }, d: { name: "Row" }, e: { name: "OHP" }, f: { name: "Curl" } };
  const strength = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ exerciseId: id, from: 100, to: 100 + (6 - i) * 5, pct: (6 - i) * 5 }));
  it("sessions, total lifted and bodyweight change, then the five biggest lift gains", () => {
    const c = shareCardContent({ programName: "Strength Foundation", stats: { sessions: 24, volume: 85230, prs: 9, strength }, bodyweight: { from: 84.2, to: 80.9, change: -3.3 }, exercisesById });
    expect(c.title).toBe("Strength Foundation");
    expect(c.figures).toEqual([
      { value: "24", label: "Sessions" },
      { value: "85.2 t", label: "Total lifted" },
      { value: "−3.3 kg", label: "Bodyweight" },
    ]);
    expect(c.lifts.map((l) => `${l.name} ${l.pct}`)).toEqual(["Back Squat +30%", "Bench Press +25%", "Deadlift +20%", "Row +15%", "OHP +10%"]);
  });
  it("without weigh-ins it shows PRs instead; lifts that didn't improve are left off", () => {
    const c = shareCardContent({ programName: "P", stats: { sessions: 3, volume: 2450, prs: 2, strength: [{ exerciseId: "a", from: 100, to: 95, pct: -5 }] }, bodyweight: null, exercisesById });
    expect(c.figures[1]).toEqual({ value: "2,450 kg", label: "Total lifted" });
    expect(c.figures[2]).toEqual({ value: "2", label: "PRs" });
    expect(c.lifts).toEqual([]);
  });
});
