// @vitest-environment jsdom
// #216: the muscle map on the coach's client Progress tab and the client's own Progress.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";

const NOW = Date.now();
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      progressPhotos: {},
      // grouped by client (#167); c2's logs must never show on c1's page
      workoutLogs: {
        c1: [{ id: "l1", clientId: "c1", date: NOW - 3600_000, dayLabel: "Push", entries: [{ exerciseId: "bench", sets: [{ reps: "8", weight: "80", completed: true }, { reps: "8", weight: "80", completed: true }] }] }],
        c2: [{ id: "l2", clientId: "c2", date: NOW - 3600_000, dayLabel: "Legs", entries: [{ exerciseId: "squat", sets: [{ reps: "5", weight: "120" }] }] }],
      },
      weighIns: {},
      scheduledWorkouts: {},
      bodyMetrics: {},
      exercises: [
        { id: "bench", name: "Barbell Bench Press", category: "Chest" },
        { id: "squat", name: "Barbell Back Squat", category: "Legs" },
      ],
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

describe("muscle map on the coaching side (#216)", () => {
  it("the coach's client Progress tab shows this client's trained muscles only", async () => {
    const { ProgressPanel } = await import("./CoachClientDetail");
    render(<ProgressPanel client={{ id: "c1", name: "Alice" }} showToast={() => {}} />);
    expect(await screen.findByTestId("muscle-map", {}, { timeout: 5000 })).toBeTruthy();
    const trained = screen.getByTestId("muscle-map-trained").textContent;
    expect(trained).toMatch(/Chest/);
    expect(trained).not.toMatch(/Quads/);
  });

  it("the client's own Progress shows it too, loaded only there", () => {
    const src = fs.readFileSync("src/client/ClientApp.jsx", "utf8");
    expect(src).toMatch(/const MuscleMapCard = React\.lazy\(\(\) => import\("\.\.\/solo\/SoloMuscleMap"\)/);
    expect(src).toMatch(/<MuscleMapCard logs=\{logsForClient\} exercisesById=\{exercisesById\} dark=\{dark\} \/>/);
    expect(src).not.toMatch(/^import .*SoloMuscleMap/m);
  });
});
