import { describe, expect, it } from "vitest";
import { customProgramEntries, validateCustomProgram, dayFromSession, isCustomProgramId, customProgramKey } from "./customPrograms";
import { buildSoloCalendar, calendarItemTarget, addDays } from "./soloCalendar";
import { isCustomSessionLog } from "./customSessions";
import { localDateKey } from "../lib/dateKey";

const TODAY = localDateKey();
const session = { id: "s1", name: "Upper", exercises: [{ exerciseId: "e1", targetSets: 3, targetReps: 10 }] };

describe("own programs (Plus)", () => {
  it("a day is a copy of the session, so editing the session later doesn't change the program", () => {
    const day = dayFromSession(session);
    expect(day).toMatchObject({ label: "Upper", sessionId: "s1" });
    day.exercises[0].targetSets = 5;
    expect(session.exercises[0].targetSets).toBe(3);
  });

  it("validates name, weeks and sessions", () => {
    const ok = { name: "Block", weeks: 6, days: [dayFromSession(session)] };
    expect(validateCustomProgram(ok)).toBe(null);
    expect(validateCustomProgram({ ...ok, name: "  " })).toMatch(/name/);
    expect(validateCustomProgram({ ...ok, weeks: 0 })).toMatch(/weeks/);
    expect(validateCustomProgram({ ...ok, weeks: 17 })).toMatch(/weeks/);
    expect(validateCustomProgram({ ...ok, weeks: 2.5 })).toMatch(/weeks/);
    expect(validateCustomProgram({ ...ok, days: [] })).toMatch(/session/);
    expect(validateCustomProgram({ ...ok, days: Array(8).fill(dayFromSession(session)) })).toMatch(/7/);
    expect(validateCustomProgram({ ...ok, days: [{ ...dayFromSession(session), exercises: [] }] })).toMatch(/exercise/);
  });

  it("becomes a purchase-shaped row with its own content, never colliding with real programs or free sessions", () => {
    const { trainingRows, programsById, contentByProgramId } = customProgramEntries("u", [{ id: "x", name: "Block", weeks: 4, days: [dayFromSession(session)], startDate: TODAY }]);
    expect(trainingRows[0]).toMatchObject({ id: "u_cp_x", programId: "cp_x", source: "custom", startDate: TODAY, locked: false });
    expect(isCustomProgramId(trainingRows[0].programId)).toBe(true);
    expect(isCustomProgramId("abc")).toBe(false);
    expect(programsById.cp_x.name).toBe("Block");
    expect(contentByProgramId.cp_x.phases[0].durationWeeks).toBe(4);
    expect(isCustomSessionLog({ purchaseId: trainingRows[0].id })).toBe(false);
    expect(customProgramKey("x")).toBe("cp_x");
  });

  it("runs on the calendar every week and its sessions can be started", () => {
    const entries = customProgramEntries("u", [{ id: "x", name: "Block", weeks: 3, days: [dayFromSession(session), dayFromSession({ ...session, id: "s2", name: "Lower" })], startDate: TODAY }]);
    const byDate = buildSoloCalendar({ purchases: entries.trainingRows, programsById: entries.programsById, contentByProgramId: entries.contentByProgramId, fromKey: TODAY, toKey: addDays(TODAY, 30) });
    const workouts = Object.values(byDate).flat().filter((i) => i.type === "workout");
    expect(workouts).toHaveLength(6); // 2 a week × 3 weeks
    expect(workouts[0].source).toBe("custom");
    const first = workouts.find((w) => w.weekNumber === 1);
    const target = calendarItemTarget(first, { todayKey: TODAY, soloUid: "u", contentByProgramId: entries.contentByProgramId });
    expect(target.state.purchaseId).toBe("u_cp_x");
  });

  it("Plus lapsed: locked, off the calendar", () => {
    const entries = customProgramEntries("u", [{ id: "x", name: "Block", weeks: 3, days: [dayFromSession(session)], startDate: TODAY }], { locked: true });
    const byDate = buildSoloCalendar({ purchases: entries.trainingRows, programsById: entries.programsById, contentByProgramId: entries.contentByProgramId, fromKey: TODAY, toKey: addDays(TODAY, 30) });
    expect(Object.values(byDate).flat().filter((i) => i.type === "workout")).toHaveLength(0);
  });
});
