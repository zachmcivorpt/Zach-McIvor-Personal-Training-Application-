// @vitest-environment jsdom
//
// Train Solo program editor: every phase is listed (not hidden behind a
// dropdown) and can be selected, duplicated (with fresh ids) and reordered.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 20000 });

const updateSoloProgram = vi.fn(() => Promise.resolve());
const phases = [
  { id: "ph1", name: "Foundation", durationWeeks: 4, days: [{ id: "d1", label: "Upper A", exercises: [] }] },
  { id: "ph2", name: "Build", durationWeeks: 3, days: [{ id: "d2", label: "Lower B", exercises: [] }, { id: "d3", label: "Full", exercises: [] }] },
];
vi.mock("../lib/AppContext", () => ({
  programPhases: (content) => content?.phases || [],
  useApp: () => ({
    db: {
      exercises: [],
      soloProgramCategories: [],
      soloPrograms: [{ id: "p1", name: "Test Program", status: "draft", level: "Beginner", categoryIds: [] }],
      soloProgramContent: [{ id: "p1", phases }],
      soloBranding: {},
    },
    createSoloProgram: vi.fn(),
    updateSoloProgram,
    deleteSoloProgram: vi.fn(),
    createExercise: vi.fn(),
  }),
}));
vi.mock("../lib/storage", () => ({ uploadSoloProgramArtwork: vi.fn() }));

beforeEach(() => updateSoloProgram.mockClear());
afterEach(cleanup);

async function openProgram() {
  const { default: CoachTrainSolo } = await import("./CoachTrainSolo");
  render(<CoachTrainSolo showToast={() => {}} />);
  fireEvent.click(screen.getAllByText("Test Program")[0]);
}

describe("Train Solo program editor phases", () => {
  it("lists every phase with its weeks and workout count", async () => {
    await openProgram();
    expect(screen.getByText(/PHASES \(2\) · 7 WEEKS/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Foundation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Build" })).toBeTruthy();
    expect(screen.getByText("3 wks · 2 workouts")).toBeTruthy();
  });

  it("selecting a phase shows that phase's workouts", async () => {
    await openProgram();
    fireEvent.click(screen.getByRole("button", { name: "Select Build" }));
    expect(screen.getByText(/Workouts in Build/)).toBeTruthy();
    expect(screen.getByText("Lower B")).toBeTruthy();
  });

  it("duplicates a phase right after itself with fresh phase and workout ids", async () => {
    await openProgram();
    fireEvent.click(screen.getByRole("button", { name: "Foundation actions" }));
    fireEvent.click(screen.getByText("Duplicate"));
    const saved = updateSoloProgram.mock.calls[0][1].phases;
    expect(saved.map((p) => p.name)).toEqual(["Foundation", "Foundation (copy)", "Build"]);
    expect(saved[1].id).not.toBe("ph1");
    expect(saved[1].days[0].label).toBe("Upper A");
    expect(saved[1].days[0].id).not.toBe("d1");
  });

  it("moves a phase up", async () => {
    await openProgram();
    fireEvent.click(screen.getByRole("button", { name: "Build actions" }));
    fireEvent.click(screen.getByText("Move up"));
    expect(updateSoloProgram.mock.calls[0][1].phases.map((p) => p.id)).toEqual(["ph2", "ph1"]);
  });
});
