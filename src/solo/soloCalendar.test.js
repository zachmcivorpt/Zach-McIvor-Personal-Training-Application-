import { describe, expect, it } from "vitest";
import { buildSoloCalendar, mondayOf, sessionOffsets } from "./soloCalendar";

const program = { id: "p1", name: "Upper/Lower" };
const content = {
  phases: [
    { durationWeeks: 2, days: [{ id: "a", label: "Upper" }, { id: "b", label: "Lower" }, { id: "c", label: "Full" }] },
    { durationWeeks: 1, days: [{ id: "d", label: "Test" }] },
  ],
};
const purchase = { id: "u_p1", programId: "p1", startDate: "2026-10-05" }; // a Monday

function build(extra = {}) {
  return buildSoloCalendar({
    purchases: [purchase],
    programsById: { p1: program },
    contentByProgramId: { p1: content },
    accountCreatedAt: "2026-10-07",
    fromKey: "2026-10-01",
    toKey: "2026-10-31",
    ...extra,
  });
}

describe("soloCalendar", () => {
  it("finds the Monday on or before a date", () => {
    expect(mondayOf("2026-10-07")).toBe("2026-10-05"); // Wed
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Mon
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sun
  });

  it("spreads a week's sessions evenly", () => {
    expect(sessionOffsets(3)).toEqual([0, 2, 4]);
    expect(sessionOffsets(4)).toEqual([0, 1, 3, 5]);
    expect(sessionOffsets(1)).toEqual([0]);
    expect(sessionOffsets(0)).toEqual([]);
  });

  it("lays out every week of every phase from the start date", () => {
    const cal = build();
    const titles = (k) => (cal[k] || []).filter((i) => i.type === "workout").map((i) => i.title);
    expect(titles("2026-10-05")).toEqual(["Upper"]);
    expect(titles("2026-10-07")).toEqual(["Lower"]);
    expect(titles("2026-10-09")).toEqual(["Full"]);
    expect(titles("2026-10-12")).toEqual(["Upper"]); // week 2
    expect(titles("2026-10-19")).toEqual(["Test"]); // phase 2, week 3
    expect(titles("2026-10-26")).toEqual([]); // program over
  });

  it("marks a session done only for its own purchase, week and day", () => {
    const cal = build({ workoutLogs: [{ purchaseId: "u_p1", weekNumber: 1, dayId: "b" }] });
    expect(cal["2026-10-07"].find((i) => i.type === "workout").done).toBe(true);
    expect(cal["2026-10-05"].find((i) => i.type === "workout").done).toBe(false);
    expect(cal["2026-10-14"].find((i) => i.type === "workout").done).toBe(false); // week 2 Lower
  });

  it("schedules body stats and photos every Monday from the account's first week", () => {
    const cal = build();
    const mondays = Object.keys(cal).filter((k) => cal[k].some((i) => i.type === "bodystats")).sort();
    expect(mondays).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(cal["2026-10-05"].some((i) => i.type === "photos")).toBe(true);
  });

  it("counts a weigh-in or photo anywhere in that Monday–Sunday week", () => {
    const cal = build({ weighIns: [{ date: new Date("2026-10-15T09:00:00").getTime() }], progressPhotos: [{ date: "2026-10-18" }] });
    expect(cal["2026-10-12"].find((i) => i.type === "bodystats").done).toBe(true);
    expect(cal["2026-10-12"].find((i) => i.type === "photos").done).toBe(true);
    expect(cal["2026-10-19"].find((i) => i.type === "bodystats").done).toBe(false);
  });

  it("skips programs with no start date or no content yet", () => {
    const cal = build({ purchases: [{ ...purchase, startDate: null }] });
    expect(Object.values(cal).flat().some((i) => i.type === "workout")).toBe(false);
  });
});
