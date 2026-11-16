// @vitest-environment jsdom
//
// #244: the real summary screen ends on the peak: the PR first, next time's
// targets, the week's progress (and Team Week), a quiet stats row last, no
// calorie estimate.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("./SoloThemeContext", async (orig) => ({ ...(await orig()), useSoloTheme: () => ({ dark: true }) }));
vi.mock("./partnerStore", () => ({
  usePartners: () => ({
    ready: true,
    pairs: [{ id: "a_b", members: ["a", "b"], createdAt: 1 }],
    activity: { b: { firstName: "Blair", target: 3, weeks: {} } },
  }),
}));
const { default: SoloWorkoutSummaryScreen } = await import("./SoloWorkoutSummaryScreen");

afterEach(cleanup);
const today = new Date();
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = new Date(today.getTime() - 86400000);

function renderIt(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/s", state }]}>
      <Routes>
        <Route path="/s" element={<SoloWorkoutSummaryScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("workout summary", () => {
  it("leads with the PR, then next time, the week, and a quiet stats row", () => {
    ctx = {
      soloCurrentUser: { id: "a", onboarding: { answers: { sessionsPerWeek: 3 } } },
      soloExercises: [{ id: "bp", name: "Bench Press" }],
      soloWorkoutLogs: [{ id: "old", date: new Date(`${key(yesterday)}T09:00:00`).getTime(), entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] }],
      soloWeighIns: [],
      soloBodyMetrics: [],
      soloAccess: { tier: "free", live: true },
    };
    renderIt({ daySession: { label: "Upper", exercises: [{ exerciseId: "bp", targetReps: 5 }] }, activeLog: { bp: [{ weight: 82.5, reps: 5, completed: true, isPR: true }] }, durationMin: 48, logId: "new" });
    const peak = screen.getByTestId("summary-peak");
    expect(peak.textContent).toBe("New personal bestBench Press 82.5 kg × 5+2.5 kg on last time");
    expect(within(screen.getByTestId("summary-next")).getByText("85 kg × 5")).toBeTruthy();
    expect(screen.getByTestId("summary-progress").textContent).toMatch(/of 3 this week/);
    expect(screen.getByTestId("summary-progress").textContent).toMatch(/Team week with Blair/);
    expect(screen.getByTestId("summary-stats").textContent).toBe("48 min · 1 set · 413 kg lifted");
    expect(screen.queryByText(/Calories/i)).toBe(null);
    expect(screen.getByText("Share your PR")).toBeTruthy();
    // The peak comes before next time, which comes before the stats.
    const order = ["summary-peak", "summary-next", "summary-progress", "summary-stats"].map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
