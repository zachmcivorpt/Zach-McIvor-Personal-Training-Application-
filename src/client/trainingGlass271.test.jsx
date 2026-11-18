// @vitest-environment jsdom
// #271 (owner, approved mock-up 2026-11-18): the client Training tab's
// Today and Program in glass — logo-only header, glass Today/Program switch,
// this week with today ringed in blue, today's workout on a glass card,
// the phase on a glass card (blue ring, week bars, this week blue), numbered
// glass workout rows with today's outlined in blue. Light mode has soft
// glows; dark mode is plain black (no silver). A real client sees only
// "Log a cardio session"; the coach's Edit / move, Remove, Create, Add and
// Import stay View-as-Client only.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { phaseWeeks, weekDays } from "./trainingGlass";

vi.setConfig({ testTimeout: 30000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
window.HTMLElement.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pull = { id: "d2", label: "Pull Day", muscleGroups: ["Upper Traps", "Rhomboids", "Lats"], exercises: [{ id: "e1", sets: [{}, {}, {}] }, { id: "e2", sets: [{}, {}] }] };
const push = { id: "d1", label: "Push Day", muscleGroups: ["Chest"], exercises: [{ id: "e3", sets: [{}] }] };

function setup({ viewingAsClient = false } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T10:00:00")); // Wednesday, week 3 of the phase
  ctx = {
    viewingAsClient,
    currentUser: { id: "c1", name: "Geoff Bennett", role: "client" },
    db: {
      users: [],
      exercises: [],
      masterWorkouts: [],
      messages: {},
      workoutLogs: { c1: [] },
      scheduledWorkouts: { c1: [{ id: "s1", date: "2026-11-18", label: "Pull Day", exercises: pull.exercises }] },
      clientPhases: { c1: [{ id: "p1", name: "Week 5 - 8 Strength Phase", startDate: "2026-11-02", endDate: "2026-12-06", weeks: [{ id: "w1", days: [push, pull] }] }] },
    },
    saveScheduledWorkout: vi.fn(),
    deleteScheduledWorkoutById: vi.fn(),
    updateClientPhase: vi.fn(),
  };
}

async function renderTraining(dark, over = {}) {
  const { WorkoutsScreen, ClientThemeContext } = await import("./ClientApp");
  return render(
    <ClientThemeContext.Provider value={dark}>
      <WorkoutsScreen
        todaySession={pull}
        todayScheduledEntry={{ id: "s1", date: "2026-11-18", label: "Pull Day", exercises: pull.exercises }}
        scheduledWorkoutsByDate={{}}
        activeLog={null}
        completedOnDate={false}
        onStart={() => {}}
        onDiscardWorkout={() => {}}
        onViewWorkout={() => {}}
        onPreviewWorkout={() => {}}
        logsForClient={[]}
        exercisesById={{}}
        onLogCardio={() => {}}
        dbReady
        showToast={() => {}}
        {...over}
      />
    </ClientThemeContext.Provider>
  );
}

describe("Training tab glass design (#271)", () => {
  it("helpers: this week Mon–Sun with today marked; phase weeks and the current one", () => {
    const days = weekDays("2026-11-18");
    expect(days.map((d) => d.key)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(days.filter((d) => d.isToday).map((d) => d.key)).toEqual(["2026-11-18"]);
    // 2 Nov – 6 Dec = 35 days = 5 weeks; 18 Nov is day 17 → week index 2.
    expect(phaseWeeks("2026-11-02", "2026-12-06", "2026-11-18")).toEqual({ count: 5, current: 2 });
    expect(phaseWeeks("2026-11-02", "2026-12-06", "2026-11-01")).toEqual({ count: 5, current: -1 });
    expect(phaseWeeks("2026-11-02", null, "2026-11-18")).toBeNull();
  });

  it("#279: no Today tab — the top bar, the Your Program heading, no switch or week strip", async () => {
    setup();
    await renderTraining(false);
    const header = screen.getByTestId("client-tab-header");
    expect(header.querySelector("h1").className).toMatch(/sr-only/);
    expect(screen.getByTestId("training-heading").textContent).toMatch(/Your Program/);
    expect(screen.queryByTestId("training-switch")).toBeNull();
    expect(screen.queryByTestId("training-week-strip")).toBeNull();
    expect(document.querySelector('img[src="/brand/gym-dark.jpg"]')).toBeNull();
  });

  it("a real client sees only Log a cardio session; the coach in View as Client gets the coach actions", async () => {
    setup();
    await renderTraining(false);
    const actions = screen.getByTestId("training-actions");
    expect(actions.textContent).toMatch(/Log a cardio session/);
    expect(actions.textContent).not.toMatch(/Edit \/ move|Remove|Create workout of the day/);
    cleanup();
    setup({ viewingAsClient: true });
    await renderTraining(false);
    expect(screen.getByTestId("training-actions").textContent).toMatch(/Edit \/ move.*Remove.*Create workout of the day.*Log a cardio session/);
  });

  it("Program: glass phase card with the ring, done/to go, week bars (this week blue), today's workout outlined; no Add/Import for a real client", async () => {
    setup();
    await renderTraining(false);
    const card = screen.getByTestId("training-phase-card");
    expect(card.textContent).toMatch(/Week 5 - 8 Strength Phase/);
    expect(card.textContent).toMatch(/CURRENT PHASE/i);
    const bars = screen.getByTestId("training-phase-weeks").children;
    expect(bars).toHaveLength(5);
    expect(bars[2].getAttribute("data-now")).toBe("true");
    const rows = screen.getByTestId("training-phase-workouts").querySelectorAll("button");
    expect(rows[0].textContent).toMatch(/01Push Day/);
    expect(rows[1].getAttribute("data-today")).toBe("true");
    expect(rows[1].textContent).toMatch(/TODAY/);
    expect(screen.queryByText(/ADD WORKOUT/)).toBeNull();
    expect(screen.queryByText(/IMPORT/)).toBeNull();
  });

  it("light mode has the soft glows; dark mode is plain (no silver)", async () => {
    setup();
    await renderTraining(false);
    expect(screen.getByTestId("training-glows")).toBeTruthy();
    cleanup();
    setup();
    await renderTraining(true);
    expect(screen.queryByTestId("training-glows")).toBeNull();
    // #279: the client app's see-through charcoal card, as on Home.
    expect(screen.getByTestId("training-phase-card").style.backgroundColor).toBe("rgba(30, 30, 32, 0.48)");
  });
});
