import { describe, expect, it } from "vitest";
import { buildSoloCalendar, mondayOf, sessionOffsets, sessionDateKeys, sessionDayLabel } from "./soloCalendar";

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

  it("fills each rest day inside a program's span with Active Recovery", () => {
    const cal = build();
    const types = (k) => (cal[k] || []).map((i) => i.type);
    expect(types("2026-10-06")).toEqual(["recovery"]); // between Upper (5th) and Lower (7th)
    expect(types("2026-10-07")).toEqual(["workout"]); // training day: no recovery
    expect(types("2026-10-12")).toEqual(["workout", "bodystats", "photos"]);
    expect(types("2026-10-25")).toEqual(["recovery"]); // last day of the 3-week program
    expect(types("2026-10-26")).toEqual(["bodystats", "photos"]); // program over: no recovery
    expect(types("2026-10-02")).toEqual([]); // before the program starts
  });

  it("marks a rest day's Active Recovery done when a recovery session was logged that day", () => {
    const cal = build({ workoutLogs: [{ purchaseId: "u_recovery", dayId: "recovery-mobility", weekNumber: "2026-10-06", date: new Date("2026-10-06T18:00:00").getTime() }] });
    expect(cal["2026-10-06"][0].done).toBe(true);
    expect(cal["2026-10-08"][0].done).toBe(false);
  });

  it("lays a recovery add-on's week-N sessions onto week N's rest days and drops the built-in Active Recovery", () => {
    const addon = {
      id: "r1",
      name: "Mobility Add-on",
      recoveryPhases: [{ durationWeeks: 1, days: [{ id: "m1", label: "Hips" }, { id: "m2", label: "Spine" }] }, { durationWeeks: 1, days: [{ id: "m3", label: "Flow" }] }],
    };
    const cal = build({ recoveryAddon: addon });
    const at = (k) => (cal[k] || []).filter((i) => i.type === "addon" || i.type === "recovery").map((i) => `${i.type}:${i.title}`);
    // Week 1 rest days: 6, 8, 10, 11 (Oct). Two add-on sessions spread across them.
    expect(at("2026-10-06")).toEqual(["addon:Hips"]);
    expect(at("2026-10-08")).toEqual([]);
    expect(at("2026-10-10")).toEqual(["addon:Spine"]);
    expect(at("2026-10-11")).toEqual([]);
    expect(Object.values(cal).flat().some((i) => i.type === "recovery")).toBe(false);
    // Week 2 gets the add-on's week-2 session; week 3 is past the add-on's length.
    expect(at("2026-10-13")).toEqual(["addon:Flow"]);
    expect(Object.values(cal).flat().filter((i) => i.type === "addon" && i.weekNumber === 3)).toEqual([]);
  });

  it("marks an add-on session done only for the date it was scheduled", () => {
    const addon = { id: "r1", name: "A", recoveryPhases: [{ durationWeeks: 3, days: [{ id: "m1", label: "Hips" }] }] };
    const cal = build({ recoveryAddon: addon, workoutLogs: [{ purchaseId: "u_recovery", dayId: "r1:m1", weekNumber: "2026-10-06", date: Date.now() }] });
    expect(cal["2026-10-06"].find((i) => i.type === "addon").done).toBe(true);
    expect(cal["2026-10-13"].find((i) => i.type === "addon").done).toBe(false);
  });

  it("skips programs with no start date or no content yet", () => {
    const cal = build({ purchases: [{ ...purchase, startDate: null }] });
    expect(Object.values(cal).flat().some((i) => i.type === "workout")).toBe(false);
  });
});

describe("sessionDateKeys / sessionDayLabel", () => {
  it("places a week's sessions on the same days the calendar uses", () => {
    expect(sessionDateKeys("2026-10-20", 1, 3)).toEqual(["2026-10-20", "2026-10-22", "2026-10-24"]);
    expect(sessionDateKeys("2026-10-20", 2, 1)).toEqual(["2026-10-27"]);
    expect(sessionDateKeys(null, 1, 3)).toEqual([]);
  });
  it("labels today, tomorrow and yesterday relatively", () => {
    expect(sessionDayLabel("2026-10-21", "2026-10-21")).toBe("Today");
    expect(sessionDayLabel("2026-10-22", "2026-10-21")).toBe("Tomorrow");
    expect(sessionDayLabel("2026-10-20", "2026-10-21")).toBe("Yesterday");
    expect(sessionDayLabel("2026-10-25", "2026-10-21")).toMatch(/25/);
  });
});
