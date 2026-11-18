// @vitest-environment jsdom
// #278 (owner: "why is there such a big gap in the bottom header to the
// bottom of the phone?"): the client tab bar was 64px tall with its icons
// centred, plus the FULL home-bar inset under it (~98pt on an iPhone). It is
// now 54px + the inset less 14px (never under 6px). Harness from #274 (owner, a client: "Your app is playing up mate. Keeps kicking me out
// of my session"): a workout saved on the phone must survive a reload. It
// was thrown away on every reload when it had been started for a day other
// than today (a missed session caught up from the calendar / Home) or from
// the Program tab's phase list (no date at all) — the client landed outside
// the workout with their sets gone. Renders the REAL ClientApp after a
// "reload" (fresh mount over what's saved on the phone).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("client tab bar sits close to the bottom of the phone (#278)", () => {
  it("51px buttons and a trimmed home-bar inset, not 64px + the full inset", async () => {
    setup();
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    const bar = await screen.findByTestId("client-tab-bar");
    expect(bar.className).not.toMatch(/\bpb-safe\b/);
    expect(bar.parentElement.style.paddingBottom).toMatch(/^max\(6px,.*14px.*safe-area-inset-bottom|^max\(6px,.*safe-area-inset-bottom.*14px/);
    const buttons = bar.querySelectorAll("button");
    expect(buttons.length).toBe(6);
    buttons.forEach((b) => {
      expect(b.className).toMatch(/h-\[51px\]/); // #279 floating bar, mock-up size
      expect(b.className).not.toMatch(/\bh-16\b/);
    });
  });
});
