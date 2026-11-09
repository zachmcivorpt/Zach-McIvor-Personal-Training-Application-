// @vitest-environment jsdom
// #213: Library > Programs opens on program cards (owner, mock-up B); a
// card opens that program's detail full width, with Back to the cards.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.setConfig({ testTimeout: 20000 });
const ph = (id, w, n) => ({ id, name: id, durationWeeks: w, days: Array.from({ length: n }, (_, i) => ({ id: `${id}d${i}`, label: `D${i}`, exercises: [] })) });
vi.mock("../lib/AppContext", () => ({
  programPhases: (p) => p?.phases || [],
  useApp: () => ({
    db: {
      exercises: [],
      masterWorkouts: [],
      programs: [
        { id: "p1", name: "5-Day Push/Pull", level: "Intermediate", phases: [ph("a", 4, 5), ph("b", 4, 5)] },
        { id: "p2", name: "Beginner Upper Lower", level: "Beginner", phases: [ph("c", 4, 4)] },
      ],
    },
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
    createExercise: vi.fn(),
  }),
}));
afterEach(cleanup);

async function renderPrograms() {
  const { default: CoachPrograms } = await import("./CoachPrograms");
  render(<CoachPrograms showToast={() => {}} />);
}

describe("Library > Programs cards (#213)", () => {
  it("shows a card per program with its level, weeks, phases and sessions; detail hidden until one is tapped", async () => {
    await renderPrograms();
    const cards = screen.getAllByTestId("program-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch(/Intermediate · 8 wks/);
    expect(cards[0].textContent).toMatch(/2 phases · 10 sessions/);
    expect(screen.getByTestId("program-detail").className).toMatch(/\bhidden\b/);
  });
  it("filters by level and search", async () => {
    await renderPrograms();
    fireEvent.click(screen.getByRole("tab", { name: "Beginner" }));
    expect(screen.getAllByTestId("program-card").map((c) => c.textContent)).toEqual([expect.stringMatching(/Beginner Upper Lower/)]);
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Search programs"), { target: { value: "push" } });
    expect(screen.getAllByTestId("program-card")).toHaveLength(1);
  });
  it("a card opens that program full width; Back returns to the cards", async () => {
    await renderPrograms();
    fireEvent.click(screen.getAllByTestId("program-card")[1]);
    expect(screen.queryByTestId("program-cards")).toBeNull();
    expect(screen.getByTestId("program-detail").className).not.toMatch(/\bhidden\b/);
    expect(screen.getByRole("heading", { name: "Beginner Upper Lower" })).toBeTruthy();
    fireEvent.click(screen.getByText("All programs"));
    expect(screen.getAllByTestId("program-card")).toHaveLength(2);
  });
});
