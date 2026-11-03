// @vitest-environment jsdom
// #150: estimated max per lift on Progress.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { estMaxSeries } from "./estMax";
import { SoloEstMaxChart } from "./SoloEstMaxChart";

afterEach(cleanup);

const ex = { sq: { name: "Back Squat", category: "Legs" }, bp: { name: "Bench Press", category: "Chest" }, pu: { name: "Push-Up", category: "Chest" }, wu: { name: "Arm Circles", category: "Warm-up" } };
const day = (n) => new Date(2026, 9, n, 9).getTime();

describe("estMaxSeries", () => {
  it("one point per session: the best set as Epley est. max, by hand", () => {
    const logs = [
      { id: "a", date: day(1), entries: [{ exerciseId: "sq", sets: [{ weight: 100, reps: 5 }, { weight: 110, reps: 3 }] }] }, // 116.7 vs 121 → 121
      { id: "b", date: day(8), entries: [{ exerciseId: "sq", sets: [{ weight: 120, reps: 1 }] }, { exerciseId: "sq", sets: [{ weight: 105, reps: 6 }] }] }, // 120 vs 126 → 126
      { id: "c", date: day(4), entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 8 }] }] },
    ];
    const [sq] = estMaxSeries(logs, ex);
    expect(sq.name).toBe("Back Squat");
    expect(sq.points).toEqual([{ date: day(1), value: 121 }, { date: day(8), value: 126 }]);
    expect(sq.change).toBe(5);
    // Bench has only one session: no chart yet.
    expect(estMaxSeries(logs, ex).map((l) => l.name)).toEqual(["Back Squat"]);
  });

  it("ignores bodyweight-only sets, warm-ups and zero reps; heaviest lift first", () => {
    const logs = [1, 2, 3].map((n) => ({
      id: "l" + n,
      date: day(n),
      entries: [
        { exerciseId: "pu", sets: [{ weight: 0, reps: 20 }] },
        { exerciseId: "wu", sets: [{ weight: 5, reps: 10 }] },
        { exerciseId: "bp", sets: [{ weight: 60 + n, reps: 1 }, { weight: 200, reps: 0 }] },
        ...(n < 3 ? [] : [{ exerciseId: "sq", sets: [{ weight: 100, reps: 1 }] }]),
      ],
    }));
    logs.push({ id: "l4", date: day(5), entries: [{ exerciseId: "sq", sets: [{ weight: 110, reps: 1 }] }] });
    const lifts = estMaxSeries(logs, ex);
    expect(lifts.map((l) => l.name)).toEqual(["Back Squat", "Bench Press"]);
    expect(lifts[1].points.map((p) => p.value)).toEqual([61, 62, 63]);
  });
});

describe("Estimated Max chart", () => {
  const logs = [
    { id: "a", date: day(1), entries: [{ exerciseId: "sq", sets: [{ weight: 100, reps: 1 }] }, { exerciseId: "bp", sets: [{ weight: 70, reps: 1 }] }] },
    { id: "b", date: day(8), entries: [{ exerciseId: "sq", sets: [{ weight: 112, reps: 1 }] }, { exerciseId: "bp", sets: [{ weight: 75, reps: 1 }] }] },
  ];
  it("shows the latest est. max and the change; switching lift updates it", () => {
    render(<SoloEstMaxChart logs={logs} exercisesById={ex} />);
    expect(screen.getByTestId("est-max-latest").textContent).toBe("112kg");
    expect(screen.getByTestId("est-max-change").textContent).toMatch(/^\+12 kg since/);
    fireEvent.click(screen.getByRole("tab", { name: "Bench Press" }));
    expect(screen.getByTestId("est-max-latest").textContent).toBe("75kg");
    expect(screen.getByTestId("est-max-change").textContent).toMatch(/^\+5 kg since/);
  });
  it("says how to start when no lift has two sessions", () => {
    render(<SoloEstMaxChart logs={logs.slice(0, 1)} exercisesById={ex} />);
    expect(screen.getByTestId("est-max-chart").textContent).toContain("two sessions");
  });
});
