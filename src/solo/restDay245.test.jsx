// @vitest-environment jsdom
// #245: a program's rest day shows what's recovering and tomorrow's
// session above its Active Recovery (it was only on an empty day, which a
// program never has). Fixture from oneProgramAtATime.test.jsx.
//
// #140: one program at a time. My Training shows the current program and
// an Archived list; starting or resuming another goes through one sheet
// that says what moves to Archived; a newly built program can start now or
// be kept for later; a short run-through explains it once; History reads
// "Session history".
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));

const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const strength = { id: "p1", name: "Strength Foundation", status: "published", weekOnePreview: { totalWeeks: 8 } };
const hyper = { id: "p2", name: "Hypertrophy", status: "published", weekOnePreview: { totalWeeks: 8 } };
const content = { phases: [{ id: "ph", name: "Phase 1", durationWeeks: 8, days: ["Upper Body", "Lower Body", "Full Body"].map((label, i) => ({ id: "d" + i, label, exercises: [{ exerciseId: "bp" }] })) }] };
const currentRow = { id: "u1_p1", programId: "p1", startDate: "2026-10-18", source: "owned", status: "active", current: true, untilDate: null };
const archivedRow = { id: "u1_p2", programId: "p2", startDate: daysAgo(60), source: "all_access", status: "paused", current: false, started: true, pausedAtWeek: 3, untilDate: daysAgo(20) };

function baseCtx(over = {}) {
  return {
    soloPrograms: [strength, hyper],
    soloPurchases: [{ id: "u1_p1", programId: "p1", startDate: currentRow.startDate }],
    soloWorkoutLogs: [{ id: "l1", purchaseId: "u1_p1", dayId: "d1", weekNumber: 1, dayLabel: "Day 1", entries: [], durationMin: 40, date: Date.now() - 86400000 * 10 }],
    soloExercises: [],
    soloCurrentUser: { id: "u1", programsGuideSeenAt: 1, onboarding: { answers: {} } },
    soloWeighIns: [],
    soloBodyMetrics: [],
    soloProgressPhotos: [],
    soloWaterLogs: [],
    soloCustomSessions: [],
    soloCustomPrograms: [],
    soloTrainingPrograms: [currentRow, archivedRow],
    soloCurrentProgram: currentRow,
    soloProgramsById: { p1: strength, p2: hyper },
    soloContentById: { p1: content, p2: content },
    soloAccess: { tier: "all_access", live: true },
    soloEnrolments: [],
    soloHasAllAccess: true,
    soloEntitlement: null,
    soloTier: "all_access",
    soloGatesLive: true,
    soloAuthUser: { uid: "u1" },
    switchSoloProgram: vi.fn(() => Promise.resolve({ enrolments: [] })),
    keepSoloProgramForLater: vi.fn(() => Promise.resolve()),
    markSoloProgramsGuideSeen: vi.fn(() => Promise.resolve()),
    setSoloSessionPlan: vi.fn(() => Promise.resolve()),
    planSoloSession: vi.fn(() => Promise.resolve()),
    saveSoloCustomProgram: vi.fn((uid, p) => Promise.resolve({ ...p, id: "new1" })),
    deleteSoloCustomProgram: vi.fn(),
    addSoloWater: vi.fn(),
    setSoloWaterGoal: vi.fn(),
    setPurchaseStartDate: vi.fn(),
    setEnrolmentStartDate: vi.fn(),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({})),
    startSoloSubscription: vi.fn(),
    openSoloBillingPortal: vi.fn(),
    ...over,
  };
}


beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-02T10:00:00")); // a Wednesday rest day
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function renderAt(path, element, routePath) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  render(
    <MemoryRouter initialEntries={[path]}>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <Routes>
            <Route path={routePath} element={element} />
            <Route path="/solo/home" element={<p>home-page</p>} />
          </Routes>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("rest day on My Training (#245)", () => {
  it("shows recovering muscles and tomorrow above Active Recovery", async () => {
    ctx = baseCtx({
      soloExercises: [{ id: "bp", name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps"] }],
      soloWorkoutLogs: [{ id: "l1", purchaseId: "u1_p1", dayId: "d0", weekNumber: 7, dayLabel: "Upper Body", date: new Date("2026-12-01T18:00:00").getTime(), entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] }],
      soloTrainingPrograms: [currentRow],
    });
    const { default: SoloMyTrainingScreen } = await import("./SoloMyTrainingScreen");
    await renderAt("/solo/training", <SoloMyTrainingScreen />, "/solo/training");
    const rest = await screen.findByTestId("rest-day");
    expect(rest.textContent).toContain("Recovering: Chest (32 h)");
    expect(rest.textContent).toMatch(/Tomorrow: (Upper|Lower|Full) Body/);
    expect(screen.getByText("Active Recovery")).toBeTruthy();
    // Active Recovery is the mobility option: no second button.
    expect(rest.textContent).not.toContain("10-minute mobility");
    // Program finish date (#245): week 7 of 8, last day 12 Dec.
    expect(screen.getByText(/finishes 12 Dec/)).toBeTruthy();
  });
});
