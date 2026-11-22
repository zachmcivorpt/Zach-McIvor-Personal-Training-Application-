// @vitest-environment jsdom
// #317 (owner, 2026-11-22): the coach's client Calendar on PHONES opens on a
// vertical Week view (Month / Week / Day); desktop keeps the month grid.
// Pure maths checked by hand, then the REAL CoachClientDetail rendered with
// db grouped by client (#167) at phone width (matchMedia) and desktop width.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { weekKeys, weekRangeLabel, mondayOf, splitDay, weekSummary } from "./calendarWeek";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import CoachClientDetail from "./CoachClientDetail";

describe("calendarWeek maths (#317)", () => {
  it("weeks run Monday–Sunday, across month ends", () => {
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // a Sunday
    expect(weekKeys("2026-11-26")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(weekRangeLabel("2026-11-26")).toBe("Mon 23 – Sun 29 Nov");
    expect(weekRangeLabel("2026-12-02")).toBe("Mon 30 Nov – Sun 6 Dec");
  });
  it("splits a day: strength vs cardio, done / planned / missed, minutes added up", () => {
    const items = [
      { type: "workout", category: "workout", label: "Upper", done: true, key: "a", log: { date: new Date(2026, 10, 24, 7, 12).getTime() } },
      { type: "workout", category: "cardio", label: "Walk", done: true, key: "b", log: { cardio: { durationMin: 20 } } },
      { type: "workout", category: "cardio", label: "Bike", done: true, key: "c", log: { cardio: { durationMin: 15 } } },
      { type: "habits", label: "Water", done: true, key: "h1" },
      { type: "habits", label: "Steps", done: false, key: "h2" },
    ];
    const s = splitDay(items, "2026-11-24", "2026-11-26");
    expect(s.workouts.map((w) => [w.label, w.status, w.time])).toEqual([["Upper", "done", "7:12am"]]);
    expect(s.cardio).toMatchObject({ sessions: 2, minutes: 35 });
    expect(s.habits).toHaveLength(2);
    expect(splitDay([{ type: "workout", category: "workout", done: false, key: "x" }], "2026-11-25", "2026-11-26").workouts[0].status).toBe("missed");
    expect(splitDay([{ type: "workout", category: "workout", done: false, key: "x" }], "2026-11-26", "2026-11-26").workouts[0].status).toBe("planned");
  });
  it("week totals: workouts done/scheduled, habits only up to today, cardio sessions + minutes", () => {
    const day = (key, items) => ({ key, split: splitDay(items, key, "2026-11-26") });
    const W = (done) => ({ type: "workout", category: "workout", done, key: Math.random() });
    const H = (done) => ({ type: "habits", done, key: Math.random() });
    const C = (min) => ({ type: "workout", category: "cardio", done: true, key: Math.random(), log: { cardio: { durationMin: min } } });
    const sum = weekSummary(
      [day("2026-11-24", [W(true), H(true), H(true), C(20)]), day("2026-11-25", [W(false), H(true), H(false)]), day("2026-11-27", [W(false), H(false), C(30)])],
      "2026-11-26"
    );
    // 1 of 3 scheduled done; habits 3 of 4 (the 27th isn't due yet); 2 cardio, 50 min.
    expect(sum).toEqual({ workoutsDone: 1, workoutsTotal: 3, habitsDone: 3, habitsDue: 4, cardioSessions: 2, cardioMinutes: 50 });
  });
});

// ---- rendering ----
const T = (y, m, d, h = 7, min = 0) => new Date(y, m - 1, d, h, min).getTime();
function setup() {
  const client = { id: "u1", name: "Zach McIvor", status: "active", role: "client", createdAt: T(2026, 10, 1) };
  ctx = {
    db: {
      users: [client],
      exercises: [{ id: "bp", name: "Bench Press", category: "Chest" }],
      workoutLogs: {
        u1: [
          { id: "l1", clientId: "u1", date: T(2026, 11, 23, 7, 12), dayLabel: "Upper Body", entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] },
          { id: "c1", clientId: "u1", date: T(2026, 11, 23, 18), dayLabel: "Walking", entries: [], cardio: { activityLabel: "Walking", durationMin: 20 } },
        ],
      },
      scheduledWorkouts: { u1: [{ date: "2026-11-23", label: "Upper Body" }, { date: "2026-11-24", label: "Lower Body" }, { date: "2026-11-27", label: "Upper Body" }] },
      habits: { u1: [{ id: "h1", label: "Protein", createdAt: T(2026, 10, 1) }, { id: "h2", label: "Water", createdAt: T(2026, 10, 1) }] },
      habitLog: { u1: { "2026-11-23": ["h1", "h2"], "2026-11-24": ["h1"] } },
      clientPhases: {}, weighIns: {}, nutritionLogs: { u1: [] }, liveSessions: {}, workoutComments: {}, clientNotes: {}, messages: {},
      forms: [], formSchedules: { u1: [] }, formResponses: {}, bodyStatsSchedules: {}, videoFeedback: {}, programs: [], appDesign: {},
    },
    currentUser: { id: "coach-1", role: "coach" },
    scheduleWorkout: vi.fn(), unscheduleWorkout: vi.fn(), deleteScheduledWorkoutById: vi.fn(), scheduleBodyStatsCheckin: vi.fn(),
    unscheduleBodyStatsCheckin: vi.fn(), deleteWorkoutLog: vi.fn(), removeHabit: vi.fn(), startViewAsClient: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab="calendar" />
    </MemoryRouter>
  );
}
function phoneWidth(isPhone) {
  window.matchMedia = vi.fn((q) => ({ matches: isPhone && q.includes("max-width: 767px"), addEventListener() {}, removeEventListener() {} }));
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 26, 12)); // Thu 26 Nov
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("coach client Calendar on phones (#317)", () => {
  it("opens on Week: seven days, workouts with status, habits with ticks, cardio minutes, the week's totals", () => {
    phoneWidth(true);
    setup();
    const week = screen.getByTestId("calendar-week");
    expect(screen.getByRole("tab", { name: "Week" }).getAttribute("aria-selected")).toBe("true");
    expect(within(week).getByText("Mon 23 – Sun 29 Nov")).toBeTruthy();
    const days = within(week).getAllByTestId("week-day");
    expect(days.map((d) => d.getAttribute("data-date"))).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    const mon = within(days[0]);
    expect(mon.getByTestId("week-workout").getAttribute("data-status")).toBe("done");
    expect(mon.getByText(/7:12am/)).toBeTruthy();
    expect(within(mon.getByTestId("week-cardio")).getByText(/20 min/)).toBeTruthy();
    expect(mon.getAllByLabelText("done")).toHaveLength(2);
    expect(within(days[1]).getByTestId("week-workout").getAttribute("data-status")).toBe("missed");
    expect(within(days[4]).getByTestId("week-workout").getAttribute("data-status")).toBe("planned");
    expect(within(days[2]).getByText("Add Session")).toBeTruthy();
    const sum = screen.getByTestId("week-summary");
    // 1 of 3 scheduled done; habits Mon 2/2, Tue 1/2, Wed 0/2, Thu (today) 0/2 = 3/8; cardio 1 · 20 min.
    expect(within(sum).getByText("1 / 3 Workouts")).toBeTruthy();
    expect(sum.textContent).toContain("3 / 8 Habits");
    expect(sum.textContent).toContain("1 Cardio · 20 min");
  });

  it("Day view, week navigation, Add Session and Month all work", () => {
    phoneWidth(true);
    setup();
    fireEvent.click(screen.getByLabelText("Next week"));
    expect(screen.getByText("Mon 30 Nov – Sun 6 Dec")).toBeTruthy();
    fireEvent.click(screen.getByText("Back to today"));
    fireEvent.click(screen.getByRole("tab", { name: "Day" }));
    expect(screen.getByTestId("calendar-day")).toBeTruthy();
    expect(screen.getByText("Thursday 26 November")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Previous day"));
    expect(screen.getByText("Wednesday 25 November")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.queryByTestId("calendar-week")).toBeNull();
    expect(screen.getByLabelText("Previous month")).toBeTruthy(); // the existing grid
    expect(screen.getByText("November 2026")).toBeTruthy();
  });

  it("desktop keeps the month grid only (no switch, no week)", () => {
    phoneWidth(false);
    setup();
    expect(screen.queryByTestId("calendar-week")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Week" })).toBeNull();
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
  });
});
