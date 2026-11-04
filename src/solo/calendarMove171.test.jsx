// @vitest-environment jsdom
//
// #171 (owner): Calendar is a tab (My Training, Progress, Calendar,
// Catalogue, Profile) and a session still to do can be held and dragged
// onto another day — the same sessionPlan / plannedSessions records the
// missed-session move and the Plan sheet use.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { canMoveItem, planMove, addDays } from "./soloCalendar";
import { localDateKey } from "../lib/dateKey";

const TODAY = localDateKey();
const purchase = { id: "u1_p1", programId: "p1", status: "active", startDate: TODAY, current: true };
const workout = (over = {}) => ({ type: "workout", id: "w1", dateKey: addDays(TODAY, 1), done: false, purchase, weekNumber: 1, day: { id: "d1", label: "Pull" }, title: "Pull", ...over });

describe("which sessions can move, and the write", () => {
  it("a session still to do, today or later, of a running program", () => {
    expect(canMoveItem(workout(), TODAY)).toBe(true);
    expect(canMoveItem(workout({ dateKey: TODAY }), TODAY)).toBe(true);
    expect(canMoveItem(workout({ done: true }), TODAY)).toBe(false);
    expect(canMoveItem(workout({ dateKey: addDays(TODAY, -1) }), TODAY)).toBe(false);
    expect(canMoveItem(workout({ skipped: true }), TODAY)).toBe(false);
    expect(canMoveItem(workout({ purchase: { ...purchase, status: "paused" } }), TODAY)).toBe(false);
    expect(canMoveItem(workout({ purchase: { ...purchase, locked: true } }), TODAY)).toBe(false);
    expect(canMoveItem({ type: "bodystats", dateKey: TODAY }, TODAY)).toBe(false);
    expect(canMoveItem({ type: "addon", dateKey: TODAY }, TODAY)).toBe(false);
    expect(canMoveItem({ type: "planned", dateKey: TODAY, done: false }, TODAY)).toBe(true);
  });
  it("program session → sessionPlan moveTo; back to its own day clears the move", () => {
    const to = addDays(TODAY, 3);
    expect(planMove(workout(), to, TODAY)).toMatchObject({ kind: "session", purchaseId: "u1_p1", key: "1_d1", value: { moveTo: to } });
    const moved = workout({ dateKey: to, movedFrom: addDays(TODAY, 1) });
    expect(planMove(moved, addDays(TODAY, 1), TODAY)).toMatchObject({ kind: "session", key: "1_d1", value: null });
  });
  it("own planned session → plannedSessions date", () => {
    const item = { type: "planned", planId: "pl1", session: { id: "s1" }, dateKey: TODAY, done: false };
    expect(planMove(item, addDays(TODAY, 2), TODAY)).toEqual({ kind: "planned", planId: "pl1", sessionId: "s1", date: addDays(TODAY, 2) });
  });
  it("never into the past, never onto its own day", () => {
    expect(planMove(workout(), addDays(TODAY, -1), TODAY)).toBe(null);
    expect(planMove(workout(), workout().dateKey, TODAY)).toBe(null);
  });
});

// The screen.
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
const program = { id: "p1", name: "Push Pull Legs", status: "published" };
const content = { phases: [{ id: "ph", name: "P", durationWeeks: 4, days: [{ id: "d1", label: "Pull", exercises: [] }, { id: "d2", label: "Legs", exercises: [] }] }] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  ctx = {
    soloCurrentUser: { id: "u1", onboarding: { answers: {} }, createdAt: Date.now() },
    soloTrainingPrograms: [{ ...purchase, source: "owned", untilDate: null }],
    soloProgramsById: { p1: program },
    soloContentById: { p1: content },
    soloWorkoutLogs: [],
    soloWeighIns: [],
    soloBodyMetrics: [],
    soloProgressPhotos: [],
    soloAccess: { tier: "free", live: false },
    soloCustomSessions: [],
    soloBranding: {},
    setSoloSessionPlan: vi.fn(() => Promise.resolve()),
    planSoloSession: vi.fn(() => Promise.resolve()),
  };
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.elementFromPoint;
});

async function renderCalendar() {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { default: SoloCalendarScreen } = await import("./SoloCalendarScreen");
  return render(
    <MemoryRouter initialEntries={["/solo/home"]}>
      <SoloThemeProvider>
        <SoloCalendarScreen />
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("Calendar: drag to move (the client calendar's mechanics)", () => {
  it("tells members they can move workouts", async () => {
    await renderCalendar();
    expect(screen.getByTestId("calendar-move-hint").textContent).toMatch(/Hold a workout and drag it to another day/);
  });

  it("hold the grip, drag onto a day in the list, let go → moved there", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    await renderCalendar();
    const handle = screen.getAllByTestId("drag-handle")[0];
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId("drag-ghost")).toBeTruthy();
    const target = addDays(TODAY, 5);
    const day = document.querySelector(`[data-date="${target}"]`);
    document.elementFromPoint = () => day;
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 400, pointerId: 1 });
    // one frame of the drag loop: finds the day under the finger
    const tick = raf.mock.calls.at(-1)?.[0];
    act(() => tick?.());
    fireEvent.pointerUp(handle, { pointerId: 1 });
    await act(async () => {});
    expect(ctx.setSoloSessionPlan).toHaveBeenCalledTimes(1);
    const [uid, purchaseId, , value] = ctx.setSoloSessionPlan.mock.calls[0];
    expect([uid, purchaseId, value.moveTo]).toEqual(["u1", "u1_p1", target]);
    raf.mockRestore();
  });

  it("moving the finger before the hold is a scroll, not a drag", async () => {
    await renderCalendar();
    const handle = screen.getAllByTestId("drag-handle")[0];
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 140, pointerId: 1 });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId("drag-ghost")).toBe(null);
  });

  it("every day is listed, so any day can take a session", async () => {
    await renderCalendar();
    expect(document.querySelector(`[data-date="${addDays(TODAY, 6)}"]`)).toBeTruthy();
  });
});

describe("Train Solo tabs", () => {
  it("are My Training, Progress, Calendar, Catalogue, Profile", () => {
    const src = require("node:fs").readFileSync("src/solo/SoloShell.jsx", "utf8");
    const labels = [...src.match(/const TABS = \[([\s\S]*?)\];/)[1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["My Training", "Progress", "Calendar", "Catalogue", "Profile"]);
  });
});
