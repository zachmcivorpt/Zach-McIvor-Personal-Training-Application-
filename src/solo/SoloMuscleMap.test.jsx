// @vitest-environment jsdom
// #148: the muscle map in My Training — a slim row that opens the full map.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
afterEach(cleanup);
import { SoloMuscleMapRow } from "./SoloMuscleMap";
import { MuscleBody, TRAINED_RED } from "./MuscleBody";
import { SOLO_THEMES } from "./SoloThemeContext";

const ex = { bp: { id: "bp", name: "Bench Press", category: "Chest" }, sq: { id: "sq", name: "Back Squat", category: "Legs" } };
const sets = (n) => Array.from({ length: n }, () => ({ weight: 60, reps: 8 }));

describe("muscle map row", () => {
  it("names the trained muscles in red and opens the map listing sets", () => {
    const logs = [{ date: Date.now() - 20 * 3600e3, entries: [{ exerciseId: "bp", sets: sets(4) }] }];
    const t = SOLO_THEMES.dark;
    render(<SoloMuscleMapRow logs={logs} exercisesById={ex} dark t={t} />);
    const row = screen.getByTestId("muscle-map-row");
    expect(row.textContent).toContain("Trained: Chest, Shoulders, Triceps");
    expect(within(row).getByText("Trained:").style.color).toBe("rgb(255, 77, 87)");

    fireEvent.click(row);
    const list = screen.getByTestId("muscle-map-list");
    expect(list.textContent).toContain("Chest4 sets · 20 h ago");
    expect(list.textContent).toContain("Triceps2 sets");
    expect(screen.getByText(/Ready:/).parentElement.textContent).toContain("Quads");
    // Sheet text follows the theme (dark mode isn't black-on-glass, #146).
    expect(list.parentElement.style.color).not.toBe("");
  });

  it("says everything's ready when nothing was trained in the last 3 days", () => {
    const logs = [{ date: Date.now() - 100 * 3600e3, entries: [{ exerciseId: "sq", sets: sets(5) }] }];
    render(<SoloMuscleMapRow logs={logs} exercisesById={ex} t={SOLO_THEMES.light} />);
    expect(screen.getByTestId("muscle-map-row").textContent).toContain("everything's ready");
  });
});

describe("the body", () => {
  it("draws trained muscles red, others blue, both sides mirrored", () => {
    const { container } = render(<MuscleBody view="front" levels={{ chest: 0.8 }} />);
    const chest = container.querySelector('[data-muscle="chest"] path');
    expect(chest.getAttribute("fill")).toBe(TRAINED_RED);
    expect(container.querySelector('[data-muscle="quads"] path').getAttribute("fill")).toBe("#2F8FFF");
    expect(container.querySelectorAll('[data-muscle="chest"] path')).toHaveLength(4); // 2 parts × 2 sides
    const back = render(<MuscleBody view="back" levels={{}} />).container;
    for (const m of ["lats", "glutes", "hamstrings", "lowerBack", "triceps"]) expect(back.querySelector(`[data-muscle="${m}"]`)).not.toBe(null);
  });
});
