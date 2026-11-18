// @vitest-environment jsdom
// #301 (owner: "Session doubles up, I already completed a different session
// today why is it showing here, and it's scheduled for Friday"): a workout
// opened and cancelled with nothing entered took over Home's finished card
// as "Resume". Renders the REAL ClientApp.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.setConfig({ testTimeout: 60000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

const TODAY = "2026-11-18";
const bench = { id: "bench", name: "Bench Press", category: "Chest" };
const day = (extra) => ({ label: "Hypertrophy 1B", muscleGroups: ["Chest"], exercises: [{ exerciseId: "bench", targetSets: 3, targetReps: 8, restSeconds: 90 }], ...extra });

function setup(scheduled = [], logs = []) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  const db = new Proxy(
    {
      users: [{ id: "coach", role: "coach", name: "Zach" }],
      exercises: [bench],
      workoutLogs: { c1: logs },
      scheduledWorkouts: { c1: scheduled },
      clientPhases: { c1: [] },
      nutritionLogs: { c1: [] },
      messages: { c1: [] },
      habits: { c1: [] },
      challenges: [],
      groups: [],
      forms: [],
      appDesign: {},
    },
    { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? {} : undefined) }
  );
  const base = { currentUser: { id: "c1", name: "John Client", role: "client", status: "active" }, db, dbReady: true, viewingAsClient: false, pendingCoachDate: null };
  ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? vi.fn(() => Promise.resolve()) : undefined) });
}

// The live screen is closed (sessionOpen false) but sets are logged.
function saveOnPhone(snapshot) {
  localStorage.setItem(
    "clientActiveSession_c1",
    JSON.stringify({ activeLog: { bench: [{ reps: 8, weight: 60, completed: true }] }, sessionOpen: false, exerciseNotes: {}, sessionNote: "", exerciseSwaps: {}, extraExercises: [], editingLogId: null, startedOn: TODAY, ...snapshot })
  );
}
const savedSets = () => JSON.parse(localStorage.getItem("clientActiveSession_c1") || "null")?.activeLog?.bench;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const doneToday = { id: "l1", clientId: "c1", date: new Date(`${TODAY}T08:00:00`).getTime(), dayLabel: "Hypertrophy 1A", scheduledDate: TODAY, entries: [{ exerciseId: "bench", sets: [{ reps: 8, weight: 60, completed: true }] }] };
const todayEntry = { id: "t1", clientId: "c1", date: TODAY, ...day({ label: "Hypertrophy 1A" }) };
const fridayEntry = { id: "f1", clientId: "c1", date: "2026-11-20", ...day({ label: "Hypertrophy 1B" }) };

describe("an opened-and-cancelled workout never doubles up on Home (#301)", () => {
  it("Friday's session opened with nothing entered doesn't replace today's completed card", async () => {
    setup([todayEntry, fridayEntry], [doneToday]);
    saveOnPhone({ runningSession: day({ id: "f1", date: "2026-11-20", label: "Hypertrophy 1B" }), activeLog: {} });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    await screen.findByText("Hypertrophy 1A");
    expect(screen.queryByText("Hypertrophy 1B")).toBeNull();
    expect(screen.queryByText(/Resume/i)).toBeNull();
    expect(localStorage.getItem("clientActiveSession_c1")).toBeNull();
  });

  it("Cancel on the live screen with nothing entered clears it", async () => {
    setup([todayEntry, fridayEntry], [doneToday]);
    saveOnPhone({ runningSession: day({ id: "f1", date: "2026-11-20", label: "Hypertrophy 1B" }), activeLog: {}, sessionOpen: true });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    await screen.findByText("Complete Workout");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Hypertrophy 1A");
    expect(screen.queryByText("Hypertrophy 1B")).toBeNull();
    expect(localStorage.getItem("clientActiveSession_c1")).toBeNull();
  });

  it("another day's workout WITH sets still shows, labelled as in progress, not today's", async () => {
    setup([todayEntry, fridayEntry], [doneToday]);
    saveOnPhone({ runningSession: day({ id: "f1", date: "2026-11-20", label: "Hypertrophy 1B" }) });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    expect(await screen.findByText("Hypertrophy 1B")).toBeTruthy();
    expect(screen.getAllByText(/Workout in progress/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Today's workout/i)).toBeNull();
  });
});
