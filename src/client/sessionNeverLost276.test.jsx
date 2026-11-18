// @vitest-environment jsdom
// #276 (owner: "A CLIENT SHOULD NEVER BE TAKEN OUT OF A SESSION ... EVEN IF
// THAT SESSION WAS SCHEDULED FOR A DIFFERENT DAY"). Renders the REAL
// ClientApp over a workout saved on the phone, with the live screen closed
// (the client left it / came back into the app), and taps Home's card.
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

function setup(scheduled = []) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  const db = new Proxy(
    {
      users: [{ id: "coach", role: "coach", name: "Zach" }],
      exercises: [bench],
      workoutLogs: { c1: [] },
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

describe("a client is never taken out of a workout (#276)", () => {
  it("Resume on Home reopens today's workout with every set kept", async () => {
    const entry = { id: "s1", clientId: "c1", date: TODAY, ...day() };
    setup([entry]);
    saveOnPhone({ runningSession: day({ id: "s1", date: TODAY }) });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    fireEvent.click(await screen.findByTestId("client-session-hero"));
    expect(await screen.findByText("Complete Workout")).toBeTruthy();
    expect(savedSets()[0]).toMatchObject({ reps: 8, weight: 60, completed: true });
  });

  it("a session for another day (nothing on today) is on Home and reopens with its sets", async () => {
    setup([]);
    saveOnPhone({ runningSession: day({ id: "s9", date: "2026-11-16", label: "Missed Monday" }) });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    expect(await screen.findByText("Missed Monday")).toBeTruthy();
    fireEvent.click(screen.getByTestId("client-session-hero"));
    expect(await screen.findByText("Complete Workout")).toBeTruthy();
    expect(savedSets()[0]).toMatchObject({ reps: 8, weight: 60 });
  });

  it("another day's session in progress isn't replaced by today's when Home's card is tapped", async () => {
    const entry = { id: "t1", clientId: "c1", date: TODAY, ...day({ label: "Today's Legs" }) };
    setup([entry]);
    saveOnPhone({ runningSession: day({ id: "s9", date: "2026-11-16", label: "Missed Monday" }) });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    fireEvent.click(await screen.findByTestId("client-session-hero"));
    expect(await screen.findByText("Complete Workout")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("clientActiveSession_c1"));
    expect(saved.runningSession.label).toBe("Missed Monday");
    expect(saved.activeLog.bench[0]).toMatchObject({ reps: 8, weight: 60 });
  });

  it("a workout started days ago with sets survives a reload", async () => {
    setup([]);
    saveOnPhone({ runningSession: day({ id: "s2", date: "2026-11-14" }), startedOn: "2026-11-14", savedAt: new Date("2026-11-14T18:00:00").getTime() });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    await screen.findByTestId("client-session-hero");
    expect(savedSets()[0]).toMatchObject({ reps: 8, weight: 60 });
  });
});
