// @vitest-environment jsdom
//
// The coach's client Progress panel shows the client's Steps, Sleep and
// Resting Heart Rate (logged by hand or synced from Apple Health) — it used
// to show only weight, body fat, lean mass and measurements.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      progressPhotos: {},
      workoutLogs: {},
      weighIns: {},
      scheduledWorkouts: {},
      exercises: [],
      bodyMetrics: {
        c1: [
          { id: "c1_2026-10-20", clientId: "c1", date: "2026-10-20", steps: 8000, sleepHours: 7 },
          { id: "c1_2026-10-21", clientId: "c1", date: "2026-10-21", steps: 9500, restingHeartRate: 58, appleHealth: { steps: true } },
        ],
        c2: [{ id: "c2_2026-10-21", clientId: "c2", date: "2026-10-21", steps: 123 }],
      },
    },
    logWeight: vi.fn(),
    deleteWeighIn: vi.fn(),
    logBodyMetric: vi.fn(),
    deleteBodyMetric: vi.fn(),
  }),
  getCurrentPhase: () => null,
  programPhases: () => [],
}));

afterEach(() => cleanup());

describe("coach Progress panel: daily metrics", () => {
  it("shows the client's steps, sleep and resting heart rate with their latest values", async () => {
    const { ProgressPanel } = await import("./CoachClientDetail");
    render(<ProgressPanel client={{ id: "c1", name: "Alice" }} showToast={() => {}} />);
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText(/^9500 · up 1500 since your first log$/)).toBeTruthy();
    expect(screen.getByText(/^7 hrs · first log$/)).toBeTruthy();
    expect(screen.getByText(/^58 bpm · first log$/)).toBeTruthy();
    // only this client's data
    expect(screen.queryByText(/^123/)).toBeNull();
  });
});
