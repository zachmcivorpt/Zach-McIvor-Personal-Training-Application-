// @vitest-environment jsdom
// #148: the muscle map in My Training — a slim row that opens the full map.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
afterEach(cleanup);
import { SoloMuscleMapRow, daysSinceLastSession } from "./SoloMuscleMap";
import { MuscleBody, TRAINED_RED, MUSCLE_IDLE, muscleFill } from "./MuscleBody";
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
    // Large figures on the panel: days since the last session, 11 groups ready.
    expect(screen.getByText(/Days since/).previousSibling.textContent).toBe(String(daysSinceLastSession(logs)));
    expect(screen.getByText(/Muscle groups/).previousSibling.textContent).toBe("11");
    // Front / Back switch.
    fireEvent.click(screen.getByRole("tab", { name: "back" }));
    expect(document.querySelector('[data-muscle="lats"]')).not.toBe(null);
    // Sheet text follows the theme (dark mode isn't black-on-glass, #146).
    expect(list.parentElement.style.color).not.toBe("");
  });

  it("says everything's ready when nothing was trained in the last 3 days", () => {
    const logs = [{ date: Date.now() - 100 * 3600e3, entries: [{ exerciseId: "sq", sets: sets(5) }] }];
    render(<SoloMuscleMapRow logs={logs} exercisesById={ex} t={SOLO_THEMES.light} />);
    expect(screen.getByTestId("muscle-map-row").textContent).toContain("everything's ready");
  });
});

describe("days since last session", () => {
  it("counts calendar days from the latest log; none logged → null", () => {
    const now = new Date("2026-11-03T09:00:00").getTime();
    expect(daysSinceLastSession([{ date: new Date("2026-10-31T22:00:00").getTime() }, { date: new Date("2026-10-20T08:00:00").getTime() }], now)).toBe(3);
    expect(daysSinceLastSession([{ date: new Date("2026-11-03T07:00:00").getTime() }], now)).toBe(0);
    expect(daysSinceLastSession([], now)).toBe(null);
  });
});

describe("the body", () => {
  it("draws trained muscles red (deeper with more sets), others grey, both sides mirrored", () => {
    const { container } = render(<MuscleBody view="front" levels={{ chest: 1, quads: 0.45 }} />);
    expect(container.querySelector('[data-muscle="chest"] path').getAttribute("fill")).toBe(TRAINED_RED);
    expect(container.querySelector('[data-muscle="abs"] path').getAttribute("fill")).toBe(MUSCLE_IDLE);
    const light = container.querySelector('[data-muscle="quads"] path').getAttribute("fill");
    expect(light).not.toBe(MUSCLE_IDLE);
    expect(light).not.toBe(TRAINED_RED);
    expect(muscleFill(0.8)).not.toBe(light);
    expect(container.querySelectorAll('[data-muscle="chest"] path')).toHaveLength(2); // both sides
    const back = render(<MuscleBody view="back" levels={{}} />).container;
    for (const m of ["lats", "glutes", "hamstrings", "lowerBack", "triceps"]) expect(back.querySelector(`[data-muscle="${m}"]`)).not.toBe(null);
  });
});
