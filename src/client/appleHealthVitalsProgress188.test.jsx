// @vitest-environment jsdom
//
// #188 on the coached client's own Progress screen: the Apple Health heart
// and lung measures show as cards once there's data; none without.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressScreen } from "./ClientApp";

afterEach(() => cleanup());

function renderProgress(bodyMetrics) {
  render(
    <ProgressScreen
      userId="c1"
      photos={[]}
      onAddPhoto={() => {}}
      onDeletePhoto={() => {}}
      weighIns={[]}
      onLogWeight={() => {}}
      onDeleteWeighIn={() => {}}
      logsForClient={[]}
      exercisesById={{}}
      bodyMetrics={bodyMetrics}
      onLogBodyMetric={() => {}}
      onDeleteBodyMetric={() => {}}
      scheduledWorkouts={[]}
    />
  );
}

describe("client Progress: Apple Health heart and lung measures (#188)", () => {
  it("shows blood pressure, heart rate, HRV, blood oxygen, respiratory rate and VO2 max", () => {
    renderProgress([
      { id: "c1_2026-11-05", clientId: "c1", date: "2026-11-05", bloodPressureSystolic: 118, bloodPressureDiastolic: 76 },
      { id: "c1_2026-11-06", clientId: "c1", date: "2026-11-06", heartRate: 72, bloodPressureSystolic: 121, bloodPressureDiastolic: 80, heartRateVariability: 44, bloodOxygen: 98, respiratoryRate: 14.3, vo2Max: 42.5, appleHealth: { heartRate: true } },
    ]);
    for (const label of ["Heart Rate", "Blood Pressure (Systolic)", "Blood Pressure (Diastolic)", "Heart Rate Variability", "Blood Oxygen", "Respiratory Rate", "VO2 Max"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.getByText(/^121 mmHg/)).toBeTruthy();
    expect(screen.getByText(/^42\.5 ml\/kg\/min/)).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
  });
  it("without any of them: the usual cards only, no empty ones", () => {
    renderProgress([{ id: "c1_2026-11-06", clientId: "c1", date: "2026-11-06", steps: 9000 }]);
    expect(screen.getByText("Resting Heart Rate")).toBeTruthy();
    for (const label of ["Heart Rate", "Blood Pressure (Systolic)", "Blood Oxygen", "VO2 Max"]) {
      expect(screen.queryByText(label), label).toBe(null);
    }
  });
});
