// @vitest-environment jsdom
// #152: Session history is the last section of Train Solo's Progress tab.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
afterEach(cleanup);

const ex = [{ id: "sq", name: "Back Squat", category: "Legs" }];
const log = (n) => ({ id: "l" + n, purchaseId: "u1_p1", dayLabel: `Lower ${n}`, durationMin: 50, date: new Date(2026, 9, n, 8).getTime(), entries: [{ exerciseId: "sq", sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }] });

function setCtx(logs) {
  ctx = {
    soloCurrentUser: { id: "u1" }, soloWorkoutLogs: logs, soloExercises: ex, soloWeighIns: [], soloProgressPhotos: [], soloBodyMetrics: [],
    soloAccess: { tier: "plus", live: true }, soloGatesLive: true, soloTier: "plus", soloEntitlementReady: true,
    soloTrainingPrograms: [{ id: "u1_p1", programId: "p1" }], soloProgramsById: { p1: { id: "p1", name: "Strength Foundation" } },
    logSoloWeight() {}, deleteSoloWeighIn() {}, addSoloProgressPhoto() {}, deleteSoloProgressPhoto() {}, logSoloBodyMetric() {}, deleteSoloBodyMetric() {},
  };
}

async function renderProgress() {
  const { default: SoloProgressScreen } = await import("./SoloProgressScreen");
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  render(<MemoryRouter><SoloThemeProvider><SoloPaywallProvider><SoloProgressScreen /></SoloPaywallProvider></SoloThemeProvider></MemoryRouter>);
}

describe("Session history on Progress", () => {
  it("is the last section of the Progress tab", async () => {
    setCtx([log(3), log(2), log(1)]);
    await renderProgress();
    const history = screen.getByTestId("session-history");
    const achievements = screen.getByText("Achievements");
    // Comes after every other section (Achievements was the last one).
    expect(achievements.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(history.nextElementSibling).toBe(null);
    expect(within(history).getByText("Session History")).toBeTruthy();
    expect(within(history).getAllByRole("button").map((b) => b.textContent.split(/\d/)[0])).toEqual(["Lower ", "Lower ", "Lower "]);
    expect(history.textContent).toContain("2 sets");
  });

  it("tapping a session opens what was logged", async () => {
    setCtx([log(3)]);
    await renderProgress();
    fireEvent.click(within(screen.getByTestId("session-history")).getByText("Lower 3"));
    expect(screen.getAllByText("Back Squat").length).toBeGreaterThan(0);
  });

  it("shows 10, then all with Show all", async () => {
    setCtx(Array.from({ length: 12 }, (_, i) => log(12 - i)));
    await renderProgress();
    const history = screen.getByTestId("session-history");
    expect(within(history).getAllByText(/^Lower \d+$/)).toHaveLength(10);
    fireEvent.click(within(history).getByText("Show all 12 sessions"));
    expect(within(history).getAllByText(/^Lower \d+$/)).toHaveLength(12);
  });

  it("nothing logged: no section", async () => {
    setCtx([]);
    await renderProgress();
    expect(screen.queryByTestId("session-history")).toBe(null);
  });
});
