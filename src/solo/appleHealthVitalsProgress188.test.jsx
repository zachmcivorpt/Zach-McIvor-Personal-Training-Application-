// @vitest-environment jsdom
//
// #188 on Train Solo's Progress: the new Apple Health measures show as
// cards once there's data, and not at all for someone without them.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
afterEach(cleanup);

function setCtx(soloBodyMetrics) {
  ctx = {
    soloCurrentUser: { id: "u1" }, soloWorkoutLogs: [], soloExercises: [], soloWeighIns: [], soloProgressPhotos: [], soloBodyMetrics,
    soloAccess: { tier: "plus", live: true }, soloGatesLive: true, soloTier: "plus", soloEntitlementReady: true,
    soloTrainingPrograms: [], soloProgramsById: {},
    logSoloWeight() {}, deleteSoloWeighIn() {}, addSoloProgressPhoto() {}, deleteSoloProgressPhoto() {}, logSoloBodyMetric() {}, deleteSoloBodyMetric() {},
  };
}
async function renderProgress() {
  const { default: SoloProgressScreen } = await import("./SoloProgressScreen");
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  render(<MemoryRouter><SoloThemeProvider><SoloPaywallProvider><SoloProgressScreen /></SoloPaywallProvider></SoloThemeProvider></MemoryRouter>);
}

describe("Train Solo Progress: Apple Health heart and lung measures (#188)", () => {
  it("shows blood pressure, heart rate, HRV, blood oxygen, respiratory rate and VO2 max with their latest values", async () => {
    setCtx([
      { id: "u1_2026-11-05", soloUserId: "u1", date: "2026-11-05", heartRate: 70, bloodPressureSystolic: 118, bloodPressureDiastolic: 78, appleHealth: { heartRate: true } },
      { id: "u1_2026-11-06", soloUserId: "u1", date: "2026-11-06", heartRate: 72, bloodPressureSystolic: 121, bloodPressureDiastolic: 80, heartRateVariability: 44, bloodOxygen: 98, respiratoryRate: 14.3, vo2Max: 42.5 },
    ]);
    await renderProgress();
    for (const label of ["Heart Rate", "Blood Pressure (Systolic)", "Blood Pressure (Diastolic)", "Heart Rate Variability", "Blood Oxygen", "Respiratory Rate", "VO2 Max"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.getByText(/^121 mmHg/)).toBeTruthy();
    expect(screen.getByText(/^80 mmHg/)).toBeTruthy();
    expect(screen.getByText(/^72 bpm/)).toBeTruthy();
    expect(screen.getByText(/^98 %/)).toBeTruthy();
    // The existing three stay.
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("Resting Heart Rate")).toBeTruthy();
  });
  it("no Apple Health measures: no empty cards", async () => {
    setCtx([{ id: "u1_2026-11-06", soloUserId: "u1", date: "2026-11-06", steps: 8000 }]);
    await renderProgress();
    expect(screen.getByText("Steps")).toBeTruthy();
    for (const label of ["Heart Rate", "Blood Pressure (Systolic)", "Blood Oxygen", "VO2 Max"]) {
      expect(screen.queryByText(label), label).toBe(null);
    }
  });
});
