// #140: one program at a time — current vs archived, switching, resuming
// where it was left, and older profiles with several programs running.
import { describe, expect, it } from "vitest";
import { resolveCurrentProgramId, applyCurrentProgram, planSwitch, legacyMigration, planArchiveForLater, NEVER } from "./currentProgram";
import { addDays } from "./soloCalendar";

const TODAY = "2026-11-03"; // a Tuesday
const owned = (programId, startDate) => ({ id: `u1_${programId}`, programId, startDate, source: "owned", status: "active" });
const custom = (cid, startDate) => ({ id: `u1_cp_${cid}`, programId: `cp_${cid}`, customProgramId: cid, startDate, source: "custom", status: "active" });
const enrolled = (programId, startDate, status = "active", extra = {}) => ({ id: `u1_${programId}`, programId, startDate, source: "all_access", status, enrolmentStatus: status, exists: true, ...extra });

describe("which program is current", () => {
  it("the profile's choice wins; null means none; a missing or locked one means none", () => {
    const rows = [owned("a", "2026-10-01"), custom("x", "2026-10-20")];
    expect(resolveCurrentProgramId(rows, "a")).toBe("a");
    expect(resolveCurrentProgramId(rows, null)).toBe(null);
    expect(resolveCurrentProgramId(rows, "gone")).toBe(null);
    expect(resolveCurrentProgramId([{ ...owned("a", "2026-10-01"), locked: true }], "a")).toBe(null);
  });
  it("older profiles: the active All Access program, else the latest started", () => {
    expect(resolveCurrentProgramId([owned("a", "2026-10-01"), enrolled("b", "2026-09-01")], undefined)).toBe("b");
    expect(resolveCurrentProgramId([owned("a", "2026-10-01"), custom("x", "2026-10-20")], undefined)).toBe("cp_x");
    expect(resolveCurrentProgramId([owned("a", null)], undefined)).toBe("a");
  });
});

describe("only the current program reaches the calendar", () => {
  it("the current is active; an archived one keeps its history up to the day it was archived; a never-started one shows nothing", () => {
    const rows = applyCurrentProgram([owned("a", "2026-10-01"), custom("x", "2026-10-20"), owned("c", null)], {
      currentProgramId: "cp_x",
      archived: { a: { archivedAt: "2026-10-20", archivedAtWeek: 3 }, c: { archivedAt: null, archivedAtWeek: null } },
      todayKey: TODAY,
    });
    const by = Object.fromEntries(rows.map((r) => [r.programId, r]));
    expect(by.cp_x).toMatchObject({ current: true, status: "active", untilDate: null });
    expect(by.a).toMatchObject({ current: false, status: "paused", untilDate: "2026-10-20", pausedAtWeek: 3, started: true });
    expect(by.c).toMatchObject({ current: false, status: "paused", untilDate: NEVER, started: false });
    expect(rows.filter((r) => r.current)).toHaveLength(1);
  });
});

describe("switching programs", () => {
  const totalWeeksFor = () => 8;
  it("starting a new program archives the current one at the week it's in, in one plan", () => {
    const current = { ...owned("a", addDays(TODAY, -15)), current: true }; // week 3
    const plan = planSwitch({ uid: "u1", target: custom("x", null), current, rows: [current], archived: {}, startDate: "2026-11-10", todayKey: TODAY, totalWeeksFor });
    expect(plan.profile.currentProgramId).toBe("cp_x");
    expect(plan.profile.archivedPrograms.a).toEqual({ archivedAt: TODAY, archivedAtWeek: 3 });
    expect(plan.customPrograms).toEqual([{ id: "x", startDate: "2026-11-10" }]);
    expect(plan.resumed).toBe(false);
  });

  it("resuming an archived program carries on from its week (today falls in that week) and archives the other", () => {
    const current = { ...custom("x", addDays(TODAY, -7)), current: true };
    const target = { ...owned("a", "2026-09-01"), status: "paused" };
    const plan = planSwitch({ uid: "u1", target, current, rows: [current, target], archived: { a: { archivedAt: "2026-10-20", archivedAtWeek: 4 } }, todayKey: TODAY, totalWeeksFor });
    expect(plan.resumed).toBe(true);
    expect(plan.purchases).toEqual([{ id: "u1_a", startDate: addDays(TODAY, -21) }]);
    expect(plan.profile.archivedPrograms.a).toBeUndefined();
    expect(plan.profile.archivedPrograms.cp_x).toEqual({ archivedAt: TODAY, archivedAtWeek: 2 });
  });

  it("All Access: a new program creates its enrolment; the current All Access one is paused to match", () => {
    const current = { ...enrolled("b", addDays(TODAY, -8)), current: true };
    const plan = planSwitch({ uid: "u1", target: { programId: "n", source: "all_access" }, current, rows: [current], archived: {}, startDate: TODAY, todayKey: TODAY, totalWeeksFor });
    expect(plan.enrolments).toContainEqual({ id: "u1_b", fields: { status: "paused", pausedAt: TODAY, pausedAtWeek: 2 } });
    const created = plan.enrolments.find((e) => e.create);
    expect(created).toMatchObject({ id: "u1_n", fields: { status: "active", startDate: TODAY, programId: "n", soloUserId: "u1" } });
  });

  it("a program replaced before it started is archived as not started (no week)", () => {
    const current = { ...owned("a", "2026-12-01"), current: true };
    const plan = planSwitch({ uid: "u1", target: custom("x", null), current, rows: [current], archived: {}, startDate: TODAY, todayKey: TODAY, totalWeeksFor });
    expect(plan.profile.archivedPrograms.a).toEqual({ archivedAt: null, archivedAtWeek: null });
  });

  it("kept for later: archived, not started", () => {
    expect(planArchiveForLater({}, "cp_x")).toEqual({ cp_x: { archivedAt: null, archivedAtWeek: null } });
  });
});

describe("older profiles with several programs running", () => {
  it("keeps one current and archives the rest as of today, once", () => {
    const rows = [owned("a", addDays(TODAY, -15)), custom("x", addDays(TODAY, -2)), enrolled("b", addDays(TODAY, -30), "paused", { pausedAt: "2026-10-01", pausedAtWeek: 2 })];
    const plan = legacyMigration({ rows, savedCurrentId: undefined, archived: {}, todayKey: TODAY, totalWeeksFor: () => 8 });
    expect(plan.profile.currentProgramId).toBe("cp_x");
    expect(plan.profile.archivedPrograms).toEqual({ a: { archivedAt: TODAY, archivedAtWeek: 3 }, b: { archivedAt: "2026-10-01", archivedAtWeek: 2 } });
    expect(legacyMigration({ rows, savedCurrentId: "cp_x", archived: {}, todayKey: TODAY })).toBe(null);
    expect(legacyMigration({ rows: [owned("a", TODAY)], savedCurrentId: undefined, archived: {}, todayKey: TODAY })).toBe(null);
  });
});
