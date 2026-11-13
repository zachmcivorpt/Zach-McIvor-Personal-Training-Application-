// @vitest-environment jsdom
// #214: a client's session opened from Overview's Recent activity was
// white-on-white (white text inside a light sheet). The sheet is now dark,
// super-transparent glass; the session's blocks are see-through and PRs are
// blue (no green).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomSheet } from "../components/ui";
import { SHEET_GLASS } from "./darkUI";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import { WorkoutLogCard } from "./CoachClientDetail";

afterEach(cleanup);
const set = (w, r, isPR) => ({ weight: w, reps: r, completed: true, isPR });
const now = Date.now();
const prev = { id: "l0", clientId: "u1", date: now - 7 * 86400000, dayLabel: "Strength 1A", entries: [{ exerciseId: "row", sets: [set(60, 9)] }] };
const log = { id: "l1", clientId: "u1", date: now, dayLabel: "Strength 1A", entries: [{ exerciseId: "row", sets: [set(62.5, 10), set(70, 9, true)] }] };

describe("session sheet from Recent activity (#214)", () => {
  it("SHEET_GLASS is dark and see-through (well under half opaque) with a blur", () => {
    const a = Number(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(SHEET_GLASS.backgroundColor.replace(/\s/g, ""))[1]);
    expect(a).toBeLessThan(0.5);
    expect(SHEET_GLASS.backdropFilter).toMatch(/blur/);
  });
  it("the session reads white on dark glass inside the dark sheet: blue PRs, see-through blocks", () => {
    ctx = { db: { clientNotes: {}, workoutComments: {} } };
    render(
      <BottomSheet open onClose={() => {}} title="Jacob McIvor" dark surface={SHEET_GLASS}>
        <WorkoutLogCard log={log} exercisesById={{ row: { id: "row", name: "Cable Seated Wide Grip Row" } }} defaultOpen allLogs={[log, prev]} />
      </BottomSheet>
    );
    expect(screen.getByText("Strength 1A")).toBeTruthy();
    const pbs = screen.getByTestId("session-pbs");
    expect(pbs.style.border).toMatch(/rgba\(47,\s*143,\s*255/);
    expect(pbs.innerHTML).not.toMatch(/47,\s*196,\s*120/);
    const block = screen.getAllByText("Cable Seated Wide Grip Row").map((n) => n.parentElement).find((n) => n.className.includes("px-4"));
    expect(block.style.backgroundColor).toMatch(/rgba\(255,\s*255,\s*255,\s*0\.035\)/);
  });
});
