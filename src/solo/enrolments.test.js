import { describe, expect, it } from "vitest";
import { trainingPrograms, planStart, resumeStartDate, activeEnrolment } from "./enrolments";
import { buildSoloCalendar, calendarItemTarget, addDays } from "./soloCalendar";
import { currentWeekNumber } from "./weekProgress";
import { localDateKey } from "../lib/dateKey";

const TODAY = localDateKey();
const content = { phases: [{ durationWeeks: 4, days: [{ id: "d1", label: "Push" }, { id: "d2", label: "Pull" }, { id: "d3", label: "Legs" }] }] };

describe("All Access enrolments", () => {
  it("a bought program always wins over an enrolment of the same program", () => {
    const rows = trainingPrograms({
      purchases: [{ id: "u_p1", programId: "p1", startDate: TODAY }],
      enrolments: [{ id: "u_p1", programId: "p1", status: "active", startDate: TODAY }],
      allAccess: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "owned", locked: false });
  });

  it("without All Access, enrolled programs are locked but bought ones are not", () => {
    const rows = trainingPrograms({
      purchases: [{ id: "u_p1", programId: "p1", startDate: TODAY }],
      enrolments: [{ id: "u_p2", programId: "p2", status: "active", startDate: TODAY }],
      allAccess: false,
    });
    expect(rows.find((r) => r.programId === "p1").locked).toBe(false);
    expect(rows.find((r) => r.programId === "p2").locked).toBe(true);
  });

  it("starting a second program pauses the first at the week it's in", () => {
    const start = addDays(TODAY, -15); // week 3
    const plan = planStart({
      uid: "u",
      programId: "p2",
      startDate: TODAY,
      enrolments: [{ id: "u_p1", programId: "p1", status: "active", startDate: start }],
      totalWeeksByProgramId: { p1: 8 },
      todayKey: TODAY,
    });
    expect(plan.pause).toEqual({ id: "u_p1", fields: { status: "paused", pausedAt: TODAY, pausedAtWeek: 3 } });
    expect(plan.start.id).toBe("u_p2");
    expect(plan.start.fields).toMatchObject({ status: "active", startDate: TODAY, programId: "p2", soloUserId: "u" });
  });

  it("resuming continues from the paused week, keeping week numbers (so logs line up)", () => {
    const plan = planStart({
      uid: "u",
      programId: "p1",
      startDate: TODAY,
      enrolments: [
        { id: "u_p1", programId: "p1", status: "paused", pausedAt: addDays(TODAY, -30), pausedAtWeek: 3, startDate: addDays(TODAY, -45) },
        { id: "u_p2", programId: "p2", status: "active", startDate: addDays(TODAY, -30) },
      ],
      totalWeeksByProgramId: { p1: 8, p2: 6 },
      todayKey: TODAY,
    });
    expect(plan.start.resumed).toBe(true);
    expect(currentWeekNumber(plan.start.fields.startDate, 8)).toBe(3);
    expect(plan.pause.id).toBe("u_p2");
    expect(plan.pause.fields.pausedAtWeek).toBe(5);
  });

  it("starting the program that's already active changes nothing else", () => {
    const plan = planStart({ uid: "u", programId: "p1", startDate: TODAY, enrolments: [{ id: "u_p1", programId: "p1", status: "active", startDate: TODAY }], todayKey: TODAY });
    expect(plan.pause).toBe(null);
  });

  it("resumeStartDate puts today in the given week", () => {
    expect(resumeStartDate(1, TODAY)).toBe(TODAY);
    expect(currentWeekNumber(resumeStartDate(4, TODAY), 10)).toBe(4);
    expect(resumeStartDate(undefined, TODAY)).toBe(TODAY);
  });

  it("activeEnrolment finds the one active enrolment", () => {
    expect(activeEnrolment([{ status: "paused" }, { id: "x", status: "active" }]).id).toBe("x");
    expect(activeEnrolment([])).toBe(null);
  });
});

describe("calendar with All Access programs", () => {
  const programsById = { p1: { id: "p1", name: "Hypertrophy" }, p2: { id: "p2", name: "Strength" } };
  const contentByProgramId = { p1: content, p2: content };
  const range = { fromKey: addDays(TODAY, -21), toKey: addDays(TODAY, 21) };

  // #169: an archived (paused) program's calendar is its history — the
  // sessions actually done before it was archived. Ones never done used to
  // show as still "to do" (a dot on a day before the switch).
  it("a paused program shows only the sessions done before it was paused, none after", () => {
    const rows = trainingPrograms({
      enrolments: [{ id: "u_p1", programId: "p1", status: "paused", pausedAt: TODAY, startDate: addDays(TODAY, -14) }],
      allAccess: true,
    });
    const all = buildSoloCalendar({ purchases: rows.map((r) => ({ ...r, untilDate: null })), programsById, contentByProgramId, ...range });
    const first = Object.values(all).flat().find((i) => i.type === "workout" && i.dateKey < TODAY);
    const workoutLogs = [{ id: "l1", purchaseId: "u_p1", weekNumber: first.weekNumber, dayId: first.day.id, date: Date.now() }];
    const byDate = buildSoloCalendar({ purchases: rows, programsById, contentByProgramId, workoutLogs, ...range });
    const items = Object.entries(byDate).flatMap(([k, list]) => list.filter((i) => i.type === "workout").map((i) => ({ ...i, k })));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ done: true, weekNumber: first.weekNumber });
    expect(items.every((i) => i.k < TODAY)).toBe(true);
    // nor rest-day recovery after the pause
    const recoveryAfter = Object.entries(byDate).filter(([k, list]) => k >= TODAY && list.some((i) => i.type === "recovery"));
    expect(recoveryAfter).toHaveLength(0);
  });

  it("a paused program never shows a session still to do (history only)", () => {
    const rows = trainingPrograms({ enrolments: [{ id: "u_p1", programId: "p1", status: "paused", pausedAt: TODAY, startDate: addDays(TODAY, -14) }], allAccess: true });
    const byDate = buildSoloCalendar({ purchases: rows, programsById, contentByProgramId, ...range });
    expect(Object.values(byDate).flat().filter((i) => i.type === "workout" && !i.done)).toHaveLength(0);
  });

  it("a locked program (All Access lapsed) is not on the calendar", () => {
    const rows = trainingPrograms({ enrolments: [{ id: "u_p1", programId: "p1", status: "active", startDate: TODAY }], allAccess: false });
    const byDate = buildSoloCalendar({ purchases: rows, programsById, contentByProgramId, ...range });
    expect(Object.values(byDate).flat().filter((i) => i.type === "workout")).toHaveLength(0);
  });

  it("the active program's sessions are marked as All Access, a bought one's as owned", () => {
    const rows = trainingPrograms({
      purchases: [{ id: "u_p2", programId: "p2", startDate: TODAY }],
      enrolments: [{ id: "u_p1", programId: "p1", status: "active", startDate: TODAY }],
      allAccess: true,
    });
    const items = Object.values(buildSoloCalendar({ purchases: rows, programsById, contentByProgramId, ...range })).flat().filter((i) => i.type === "workout");
    expect(items.some((i) => i.programId === "p1" && i.source === "all_access")).toBe(true);
    expect(items.some((i) => i.programId === "p2" && i.source === "owned")).toBe(true);
  });
});
