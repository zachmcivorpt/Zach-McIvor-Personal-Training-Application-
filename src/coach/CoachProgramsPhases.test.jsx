// @vitest-environment jsdom
//
// Library > Programs editor: every phase is listed in the program's detail
// view (not only in the desktop sidebar) and can be selected, duplicated
// (with fresh ids) and reordered.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 20000 });

const updateProgram = vi.fn(() => Promise.resolve());
const phases = [
  { id: "ph1", name: "Foundation", durationWeeks: 4, days: [{ id: "d1", label: "Upper A", exercises: [] }] },
  { id: "ph2", name: "Build", durationWeeks: 3, days: [{ id: "d2", label: "Lower B", exercises: [] }, { id: "d3", label: "Full", exercises: [] }] },
];
vi.mock("../lib/AppContext", () => ({
  programPhases: (p) => p?.phases || [],
  useApp: () => ({
    db: { exercises: [], masterWorkouts: [], programs: [{ id: "p1", name: "Test Program", level: "Beginner", phases }] },
    createProgram: vi.fn(),
    updateProgram,
    deleteProgram: vi.fn(),
    createExercise: vi.fn(),
  }),
}));

beforeEach(() => updateProgram.mockClear());
afterEach(cleanup);

async function renderEditor() {
  const { default: CoachPrograms } = await import("./CoachPrograms");
  render(<CoachPrograms showToast={() => {}} />);
}

describe("Library > Programs phase list", () => {
  it("lists every phase with its weeks and session count", async () => {
    await renderEditor();
    // Phases and total weeks now read as large figures above the phase dropdowns.
    expect(within(screen.getByText("Phases").parentElement).getByText("2")).toBeTruthy();
    expect(within(screen.getByText("Weeks").parentElement).getByText("7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Foundation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Build" })).toBeTruthy();
    expect(screen.getByText("3 wks · 2 sessions")).toBeTruthy();
  });

  it("duplicates a phase right after itself with fresh phase and session ids", async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Foundation actions" }));
    fireEvent.click(screen.getByText("Duplicate"));
    const saved = updateProgram.mock.calls[0][1].phases;
    expect(saved.map((p) => p.name)).toEqual(["Foundation", "Foundation (copy)", "Build"]);
    expect(saved[1].id).not.toBe("ph1");
    expect(saved[1].days[0].label).toBe("Upper A");
    expect(saved[1].days[0].id).not.toBe("d1");
  });

  it("moves a phase up", async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Build actions" }));
    fireEvent.click(screen.getByText("Move up"));
    expect(updateProgram.mock.calls[0][1].phases.map((p) => p.id)).toEqual(["ph2", "ph1"]);
  });
});
