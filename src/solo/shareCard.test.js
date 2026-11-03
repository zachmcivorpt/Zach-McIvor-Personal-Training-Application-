// #144: what goes on the Program complete share card — checked by hand.
import { describe, expect, it } from "vitest";
import { bodyweightChange, shareCardContent, progressPhotoPair } from "./shareCard";

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

describe("progress photos for the card", () => {
  const at = (d) => new Date(`${d}T12:00:00`).getTime();
  it("first photo from the start vs the last, labelled with their program week", () => {
    const photos = [
      { url: "data:old", date: at("2026-08-20") }, // before the program: ignored
      { url: "data:w1", date: at("2026-09-03") },
      { url: "data:w4", date: at("2026-09-24") },
      { url: "data:w8", date: at("2026-10-26") },
    ];
    // Start Tue 1 Sep: 3 Sep is week 1; 26 Oct is 55 days in → week 8.
    expect(progressPhotoPair(photos, "2026-09-01", 8)).toEqual({ before: { url: "data:w1", label: "Week 1" }, after: { url: "data:w8", label: "Week 8" } });
  });
  it("needs two photos on different days; a late photo is capped at the last week", () => {
    expect(progressPhotoPair([{ url: "a", date: at("2026-09-03") }], "2026-09-01", 8)).toBe(null);
    expect(progressPhotoPair([{ url: "a", date: at("2026-09-03") }, { url: "b", date: at("2026-09-03") }], "2026-09-01", 8)).toBe(null);
    expect(progressPhotoPair([{ url: "a", date: at("2026-09-03") }, { url: "b", date: at("2026-12-25") }], "2026-09-01", 8).after.label).toBe("Week 8");
  });
  it("puts the week labels on the card", () => {
    const c = shareCardContent({ programName: "P", stats: { sessions: 1, volume: 0, strength: [] }, photos: { before: { url: "a", label: "Week 1" }, after: { url: "b", label: "Week 8" } } });
    expect(c.photos).toEqual({ before: { label: "WEEK 1" }, after: { label: "WEEK 8" } });
  });
});
