// @vitest-environment jsdom
// #148: the muscle map card on Progress.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SoloMuscleMapCard, daysSinceLastSession } from "./SoloMuscleMap";
import { MuscleBody, TRAINED_RED, READY_BLUE, muscleStyle } from "./MuscleBody";

afterEach(cleanup);

const ex = { bp: { id: "bp", name: "Bench Press", category: "Chest" }, sq: { id: "sq", name: "Back Squat", category: "Legs" } };
const sets = (n) => Array.from({ length: n }, () => ({ weight: 60, reps: 8 }));

describe("muscle map card", () => {
  it("lists trained muscles (red) with sets and ready ones (blue), with the two figures", () => {
    const logs = [{ date: Date.now() - 20 * 3600e3, entries: [{ exerciseId: "bp", sets: sets(4) }] }];
    render(<SoloMuscleMapCard logs={logs} exercisesById={ex} dark />);
    const trained = screen.getByTestId("muscle-map-trained");
    expect(trained.textContent).toBe("Trained Chest 4 · Shoulders 2 · Triceps 2");
    expect(trained.firstChild.style.color).toBe("rgb(255, 77, 87)");
    const ready = screen.getByTestId("muscle-map-ready");
    expect(ready.textContent).toContain("Quads");
    expect(ready.firstChild.style.color).toBe("rgb(47, 143, 255)");
    expect(screen.getByText(/Days since/).previousSibling.textContent).toBe(String(daysSinceLastSession(logs)));
    const readyFigure = screen.getByText(/Muscle groups/).previousSibling;
    expect(readyFigure.textContent).toBe("11");
    expect(readyFigure.style.color).toBe("rgb(47, 143, 255)");
    // Text follows the theme.
    expect(screen.getByTestId("muscle-map").style.color).not.toBe("");
  });

  it("Front / Back switch shows the back muscles", () => {
    render(<SoloMuscleMapCard logs={[]} exercisesById={ex} />);
    expect(document.querySelector('[data-muscle="lats"]')).toBe(null);
    fireEvent.click(screen.getByRole("tab", { name: "back" }));
    for (const m of ["lats", "glutes", "hamstrings", "lowerBack", "triceps"]) expect(document.querySelector(`[data-muscle="${m}"]`)).not.toBe(null);
  });

  it("nothing trained in the last 3 days: says so, everything ready, no days figure without logs", () => {
    render(<SoloMuscleMapCard logs={[]} exercisesById={ex} />);
    expect(screen.getByTestId("muscle-map-trained").textContent).toContain("nothing in the last 3 days");
    expect(screen.getByText(/Muscle groups/).previousSibling.textContent).toBe("14");
    expect(screen.getByText(/Days since/).previousSibling.textContent).toBe("–");
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
  it("trained muscles red (deeper with more sets), ready ones blue", () => {
    const { container } = render(<MuscleBody view="front" levels={{ chest: 1, quads: 0.45 }} />);
    const chest = container.querySelector('[data-muscle="chest"] path');
    expect(chest.getAttribute("fill")).toBe(TRAINED_RED);
    expect(Number(chest.getAttribute("fill-opacity"))).toBe(1);
    const quad = container.querySelector('[data-muscle="quads"] path');
    expect(quad.getAttribute("fill")).toBe(TRAINED_RED);
    expect(Number(quad.getAttribute("fill-opacity"))).toBeLessThan(1);
    expect(container.querySelector('[data-muscle="abs"] path').getAttribute("fill")).toBe(READY_BLUE);
    expect(muscleStyle(0).fill).toBe(READY_BLUE);
  });

  it("draws every head: 4 quads, 3 hamstrings, 2 biceps, 2 triceps, delts, calves 2 heads + soleus", () => {
    const heads = (c, m) => c.querySelectorAll(`[data-muscle="${m}"] path`).length / 2; // mirrored
    const front = render(<MuscleBody view="front" />).container;
    expect(heads(front, "quads")).toBe(4);
    expect(heads(front, "biceps")).toBe(2);
    expect(heads(front, "shoulders")).toBe(2);
    expect(heads(front, "chest")).toBe(2);
    expect(heads(front, "abs")).toBe(4);
    const back = render(<MuscleBody view="back" />).container;
    expect(heads(back, "hamstrings")).toBe(3);
    expect(heads(back, "triceps")).toBe(2);
    expect(heads(back, "calves")).toBe(3);
    expect(heads(back, "glutes")).toBe(2);
  });
});
