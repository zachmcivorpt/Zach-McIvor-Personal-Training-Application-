// @vitest-environment jsdom
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
const content = { phases: [{ id: "ph", name: "Phase 1", durationWeeks: 8, days: [{ id: "d1", label: "Day 1", exercises: [{ exerciseId: "e1" }] }] }] };
const currentRow = { id: "u1_p1", programId: "p1", startDate: daysAgo(15), source: "owned", status: "active", current: true, untilDate: null };
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
  ctx = baseCtx();
  localStorage.clear();
});
afterEach(cleanup);

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
async function renderMyTraining() {
  const { default: SoloMyTrainingScreen } = await import("./SoloMyTrainingScreen");
  await renderAt("/solo/training", <SoloMyTrainingScreen />, "/solo/training");
}

describe("My Training: one program at a time (#140)", () => {
  it("shows the one current program, and the rest under Archived with where they stopped", async () => {
    await renderMyTraining();
    expect(screen.getByRole("heading", { name: "Your program" })).toBeTruthy();
    expect(screen.queryByText("Your Programs")).toBe(null);
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("Archived at Week 3 · tap to resume")).toBeTruthy();
  });

  it("resuming an archived program says the current one moves to Archived at its week, then switches", async () => {
    await renderMyTraining();
    fireEvent.click(screen.getByText("Hypertrophy"));
    await screen.findByText("Resume program");
    expect(screen.getByText(/Picks up at Week 3/)).toBeTruthy();
    const note = screen.getByText(/moves to Archived at Week 3/);
    expect(note.textContent).toContain("Strength Foundation");
    fireEvent.click(screen.getByRole("button", { name: "SWITCH PROGRAM" }));
    await waitFor(() => expect(ctx.switchSoloProgram).toHaveBeenCalledWith(expect.objectContaining({ target: archivedRow })));
  });

  it("with nothing current, the page says so and a not-started program asks for its start date", async () => {
    const notStarted = { ...archivedRow, started: false, pausedAtWeek: null };
    ctx = baseCtx({ soloTrainingPrograms: [notStarted], soloCurrentProgram: null });
    await renderMyTraining();
    expect(screen.getByText(/Nothing on your calendar right now/)).toBeTruthy();
    fireEvent.click(screen.getByText("Not started · tap to start"));
    await screen.findByText("Start program");
    expect(screen.getByLabelText("Week 1, Day 1 starts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "START PROGRAM" }));
    await waitFor(() => expect(ctx.switchSoloProgram).toHaveBeenCalled());
  });

  it("the run-through shows once for someone who hasn't seen it, and is always under How it works", async () => {
    ctx = baseCtx({ soloCurrentUser: { id: "u1", onboarding: { answers: {} } } });
    await renderMyTraining();
    await screen.findByText("How your programs work");
    expect(screen.getByText("One program at a time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "GOT IT" }));
    await waitFor(() => expect(ctx.markSoloProgramsGuideSeen).toHaveBeenCalledTimes(1));
    cleanup();
    ctx = baseCtx();
    await renderMyTraining();
    expect(screen.queryByText("How your programs work")).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    await screen.findByText("How your programs work");
  });

  it("a missed session from this week can be moved to today or skipped (#141)", async () => {
    await renderMyTraining();
    expect(screen.getByText("Missed this week")).toBeTruthy();
    expect(screen.getByText(/Planned yesterday · Week 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move to today" }));
    const today = daysAgo(0);
    await waitFor(() => expect(ctx.setSoloSessionPlan).toHaveBeenCalledWith("u1", "u1_p1", "3_d1", expect.objectContaining({ moveTo: today })));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(ctx.setSoloSessionPlan).toHaveBeenLastCalledWith("u1", "u1_p1", "3_d1", expect.objectContaining({ skipped: true })));
  });

  it("the log list reads Session history", async () => {
    await renderMyTraining();
    expect(screen.getByText("Session history")).toBeTruthy();
    expect(screen.queryByText(/^History$/)).toBe(null);
  });
});

describe("Build a program: start it now or keep it for later (#140)", () => {
  const session = { id: "s1", name: "Push", exercises: [{ exerciseId: "e1", targetSets: 3, targetReps: 10 }] };
  async function buildOne() {
    const { default: SoloProgramBuilderScreen } = await import("./SoloProgramBuilderScreen");
    await renderAt("/solo/program-builder", <SoloProgramBuilderScreen />, "/solo/program-builder");
    fireEvent.change(screen.getByPlaceholderText(/strength block/i), { target: { value: "My Split" } });
    fireEvent.click(screen.getByRole("button", { name: /add a session/i }));
    fireEvent.click(await screen.findByText("Push"));
    fireEvent.click(screen.getByRole("button", { name: /create program/i }));
  }

  it("with another program running it asks: switch (archiving it) or keep for later", async () => {
    ctx = baseCtx({ soloCustomSessions: [session], soloAccess: { tier: "plus", live: true } });
    await buildOne();
    const sheet = await screen.findByText("Start program");
    expect(sheet).toBeTruthy();
    expect(screen.getByText(/moves to Archived at Week 3/).textContent).toContain("Strength Foundation");
    fireEvent.click(screen.getByRole("button", { name: "Keep it for later" }));
    await waitFor(() => expect(ctx.keepSoloProgramForLater).toHaveBeenCalledWith("cp_new1"));
    expect(ctx.switchSoloProgram).not.toHaveBeenCalled();
  });

  it("with nothing running it simply becomes the current program", async () => {
    ctx = baseCtx({ soloCustomSessions: [session], soloAccess: { tier: "plus", live: true }, soloCurrentProgram: null, soloTrainingPrograms: [] });
    await buildOne();
    await waitFor(() => expect(ctx.switchSoloProgram).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ programId: "cp_new1", source: "custom" }) })));
    await screen.findByText("home-page");
  });
});

describe("scheduling, done for them (#142)", () => {
  const sessions = [
    { id: "s1", name: "Push", exercises: [{ exerciseId: "e1" }] },
    { id: "s2", name: "Pull", exercises: [{ exerciseId: "e1" }] },
    { id: "s3", name: "Legs", exercises: [{ exerciseId: "e1" }] },
  ];

  it("Build a program puts sessions on their training days, lets them move one, starts today, names itself", async () => {
    ctx = baseCtx({
      soloCustomSessions: sessions,
      soloAccess: { tier: "plus", live: true },
      soloCurrentProgram: null,
      soloTrainingPrograms: [],
      soloCurrentUser: { id: "u1", programsGuideSeenAt: 1, onboarding: { answers: { trainingDays: [1, 3, 5] } } },
    });
    const { default: SoloProgramBuilderScreen } = await import("./SoloProgramBuilderScreen");
    await renderAt("/solo/program-builder", <SoloProgramBuilderScreen />, "/solo/program-builder");
    for (const name of ["Push", "Pull", "Legs"]) {
      fireEvent.click(screen.getByRole("button", { name: /add a session/i }));
      fireEvent.click(await screen.findByText(name));
    }
    const week = screen.getByTestId("program-week").textContent;
    expect(week).toMatch(/Mon\s*Push.*Wed\s*Pull.*Fri\s*Legs/);
    expect(screen.getByText(/On your training days\. Tap a day to move a session\./)).toBeTruthy();
    expect(screen.getByTestId("program-starts").textContent).toMatch(/^Today/);
    // Move Legs to Saturday.
    fireEvent.click(screen.getByRole("button", { name: "Change day for Legs" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Day for Legs" })).getByRole("button", { name: "Sa" }));
    expect(screen.getByTestId("program-week").textContent).toMatch(/Sat\s*Legs/);
    fireEvent.click(screen.getByRole("button", { name: /create program/i }));
    await waitFor(() => expect(ctx.saveSoloCustomProgram).toHaveBeenCalled());
    const saved = ctx.saveSoloCustomProgram.mock.calls[0][1];
    expect(saved.name).toBe("My 3-day program");
    expect(saved.days.map((d) => d.label)).toEqual(["Push", "Pull", "Legs"]);
    expect(saved.weekdays).toEqual([1, 3, 6]);
  });

  it("Plan puts one of their sessions on a day: the best day picked, one tap to add", async () => {
    ctx = baseCtx({ soloCustomSessions: sessions, soloCurrentUser: { id: "u1", programsGuideSeenAt: 1, onboarding: { answers: {} } } });
    await renderMyTraining();
    fireEvent.click(screen.getByRole("button", { name: "Plan Push" }));
    await screen.findByText("Plan this session");
    expect(screen.getByText("Which day?")).toBeTruthy();
    const pressed = within(screen.getByRole("group", { name: "Day" })).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "ADD TO CALENDAR" }));
    await waitFor(() => expect(ctx.planSoloSession).toHaveBeenCalledWith("u1", expect.stringMatching(/^s1_\d{4}-\d{2}-\d{2}$/), "s1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
  });

  it("the run-through is marked seen the moment it shows, and is clear glass", async () => {
    ctx = baseCtx({ soloCurrentUser: { id: "u1", onboarding: { answers: {} } } });
    await renderMyTraining();
    const title = await screen.findByText("How your programs work");
    expect(ctx.markSoloProgramsGuideSeen).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("apexSoloProgramsGuide:u1")).toBeTruthy();
    // The membership sheet's clear glass, not the denser standard sheet.
    let panel = title.parentElement;
    while (panel && !panel.style.backdropFilter) panel = panel.parentElement;
    expect(["rgba(255, 255, 255, 0.3)", "rgba(16, 16, 18, 0.38)"]).toContain(panel.style.backgroundColor);
    cleanup();
    // The profile save hasn't come back yet, but this phone remembers: never twice.
    ctx = baseCtx({ soloCurrentUser: { id: "u1", onboarding: { answers: {} } } });
    await renderMyTraining();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("How your programs work")).toBe(null);
  });
});
