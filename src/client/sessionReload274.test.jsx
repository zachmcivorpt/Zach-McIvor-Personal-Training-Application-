// @vitest-environment jsdom
// #274 (owner, a client: "Your app is playing up mate. Keeps kicking me out
// of my session"): a workout saved on the phone must survive a reload. It
// was thrown away on every reload when it had been started for a day other
// than today (a missed session caught up from the calendar / Home) or from
// the Program tab's phase list (no date at all) — the client landed outside
// the workout with their sets gone. Renders the REAL ClientApp after a
// "reload" (fresh mount over what's saved on the phone).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { isPersistedSessionStale } from "../lib/sessionStaleness";

vi.setConfig({ testTimeout: 60000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

const TODAY = "2026-11-18";
const bench = { id: "bench", name: "Bench Press", category: "Chest" };
const day = (extra) => ({ label: "Hypertrophy 1B", muscleGroups: ["Chest"], exercises: [{ exerciseId: "bench", targetSets: 3, targetReps: 8, restSeconds: 90 }], ...extra });

function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  const db = new Proxy(
    {
      users: [{ id: "coach", role: "coach", name: "Zach" }],
      exercises: [bench],
      workoutLogs: { c1: [] },
      scheduledWorkouts: { c1: [] },
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
  const base = { currentUser: { id: "c1", name: "John Client", role: "client", status: "active" }, db, dbReady: true, viewingAsClient: false };
  ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? vi.fn(() => Promise.resolve()) : undefined) });
}

function saveOnPhone(snapshot) {
  localStorage.setItem("clientActiveSession_c1", JSON.stringify({ activeLog: { bench: [{ reps: 8, weight: 60, completed: true }] }, sessionOpen: true, exerciseNotes: {}, sessionNote: "", exerciseSwaps: {}, extraExercises: [], editingLogId: null, ...snapshot }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a workout survives a reload (#274)", () => {
  it("staleness is decided by the day it was started, not the day it was for", () => {
    expect(isPersistedSessionStale({ runningSession: { date: "2026-11-16" }, startedOn: TODAY }, TODAY)).toBe(false); // catch-up started today
    expect(isPersistedSessionStale({ runningSession: { label: "Program day" }, startedOn: TODAY }, TODAY)).toBe(false); // Program tab: no date
    expect(isPersistedSessionStale({ runningSession: { date: TODAY }, startedOn: "2026-11-17" }, TODAY)).toBe(true); // left over from yesterday
    // saved before #274 (no startedOn): an undated one is kept, an old dated one isn't
    expect(isPersistedSessionStale({ runningSession: { label: "x" } }, TODAY)).toBe(false);
    expect(isPersistedSessionStale({ runningSession: { date: "2026-11-16" } }, TODAY)).toBe(true);
  });

  it("a workout started from the Program tab (no date) reopens after a reload, sets kept", async () => {
    setup();
    saveOnPhone({ runningSession: day({ id: "d2" }), startedOn: TODAY });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    expect(await screen.findByText("Complete Workout")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("clientActiveSession_c1"));
    expect(saved.activeLog.bench[0]).toMatchObject({ reps: 8, weight: 60, completed: true });
    expect(saved.startedOn).toBe(TODAY);
  });

  it("a missed session caught up today reopens after a reload", async () => {
    setup();
    saveOnPhone({ runningSession: day({ id: "s9", date: "2026-11-16" }), startedOn: TODAY });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    expect(await screen.findByText("Complete Workout")).toBeTruthy();
    expect(localStorage.getItem("clientActiveSession_c1")).not.toBeNull();
  });

  it("yesterday's leftover still isn't reopened today", async () => {
    setup();
    saveOnPhone({ runningSession: day({ id: "s1", date: "2026-11-17" }), startedOn: "2026-11-17" });
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Complete Workout")).toBeNull();
    expect(localStorage.getItem("clientActiveSession_c1")).toBeNull();
  });
});
