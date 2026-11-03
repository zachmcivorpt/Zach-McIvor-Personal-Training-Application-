// #142: scheduling done for them — weekdays for a built program's sessions,
// and their own sessions planned on a day.
import { describe, expect, it } from "vitest";
import { nextWeekday, fillWeekdays, defaultProgramName, byWeekday } from "./customPrograms";
import { sessionDateKeys, validWeekdays, buildSoloCalendar, calendarItemTarget } from "./soloCalendar";

describe("weekdays for a built program", () => {
  it("uses their training days first, in week order", () => {
    // trainingDays from the consultation: Mon (1), Wed (3), Fri (5)
    expect(nextWeekday([], [5, 1, 3])).toBe(1);
    expect(nextWeekday([1], [5, 1, 3])).toBe(3);
    expect(nextWeekday([1, 3], [5, 1, 3])).toBe(5);
  });
  it("with no training days left, spreads sessions out with rest between", () => {
    expect(nextWeekday([], [])).toBe(1); // Monday first
    expect(nextWeekday([1], [])).toBe(4); // furthest from Monday: Thursday (3 days either side)
    const filled = fillWeekdays([{ id: "a" }, { id: "b" }, { id: "c" }], []);
    expect(filled.map((d) => d.weekday)).toEqual([1, 4, 6]);
    expect(nextWeekday([0, 1, 2, 3, 4, 5, 6], [])).toBe(null);
  });
  it("keeps weekdays already set; sorts Monday → Sunday; names itself", () => {
    const filled = fillWeekdays([{ id: "a", weekday: 0 }, { id: "b" }], [2]);
    expect(filled.map((d) => d.weekday)).toEqual([0, 2]);
    expect([...filled].sort(byWeekday).map((d) => d.id)).toEqual(["b", "a"]);
    expect(defaultProgramName([1, 2, 3])).toBe("My 3-day program");
  });
});

describe("dates from weekdays", () => {
  it("puts each session on its weekday within the program week", () => {
    // Start Wed 4 Nov 2026; sessions on Mon, Wed, Fri → Fri 6, Mon 9, Wed 4 (week 1 = 4–10 Nov)
    expect(sessionDateKeys("2026-11-04", 1, 3, [], [1, 3, 5])).toEqual(["2026-11-09", "2026-11-04", "2026-11-06"]);
    expect(sessionDateKeys("2026-11-04", 2, 3, [], [1, 3, 5])).toEqual(["2026-11-16", "2026-11-11", "2026-11-13"]);
  });
  it("ignores weekdays that don't fit the sessions", () => {
    expect(validWeekdays([1, 1], 2)).toBe(false);
    expect(validWeekdays([1, 3], 3)).toBe(false);
    expect(validWeekdays([1, 9], 2)).toBe(false);
    // falls back to the old spread
    expect(sessionDateKeys("2026-11-02", 1, 2, [], [1])).toEqual(["2026-11-02", "2026-11-05"]);
  });
});

describe("own sessions planned on a day", () => {
  const session = { id: "s1", name: "Push", exercises: [{ exerciseId: "e1" }] };
  const base = { purchases: [], customSessions: [session], fromKey: "2026-11-02", toKey: "2026-11-08" };
  it("shows on its day, startable on (not before) the day, done once logged that day", () => {
    const byDate = buildSoloCalendar({ ...base, workoutLogs: [], plannedSessions: { "s1_2026-11-05": { sessionId: "s1", date: "2026-11-05" } } });
    const item = byDate["2026-11-05"].find((i) => i.type === "planned");
    expect(item).toMatchObject({ title: "Push", done: false });
    expect(calendarItemTarget(item, { todayKey: "2026-11-04", soloUid: "u1" })).toBe(null);
    const target = calendarItemTarget(item, { todayKey: "2026-11-05", soloUid: "u1" });
    expect(target.path).toBe("/solo/workout");
    expect(target.state).toMatchObject({ purchaseId: "u1_custom", dayId: "s1", day: { label: "Push" } });
    const done = buildSoloCalendar({
      ...base,
      workoutLogs: [{ id: "l", purchaseId: "u1_custom", dayId: "s1", date: new Date("2026-11-05T09:00:00").getTime() }],
      plannedSessions: { "s1_2026-11-05": { sessionId: "s1", date: "2026-11-05" } },
    });
    expect(done["2026-11-05"].find((i) => i.type === "planned").done).toBe(true);
  });
  it("a deleted session's plan shows nothing", () => {
    const byDate = buildSoloCalendar({ ...base, customSessions: [], workoutLogs: [], plannedSessions: { x: { sessionId: "gone", date: "2026-11-05" } } });
    expect(byDate["2026-11-05"]?.some((i) => i.type === "planned")).toBeFalsy();
  });
});
