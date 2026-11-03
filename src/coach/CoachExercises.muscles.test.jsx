// @vitest-environment jsdom
//
// #149: adding an exercise fills its muscles from the movement; a coach's
// own change is kept and marked manual so the library correction leaves it.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const app = vi.hoisted(() => ({ createExercise: vi.fn(), updateExercise: vi.fn(), deleteExercise: vi.fn() }));
vi.mock("../lib/AppContext", () => ({ useApp: () => app }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openNew() {
  const { ExerciseSheet } = await import("./CoachExercises");
  render(<ExerciseSheet open exercise={null} onClose={() => {}} showToast={() => {}} />);
}

describe("exercise editor muscles (#149)", () => {
  it("fills Primary / Secondary Muscles from the name and saves them as the movement's", async () => {
    await openNew();
    const name = screen.getByPlaceholderText("e.g. Bulgarian Split Squat");
    fireEvent.change(name, { target: { value: "Incline Barbell Bench Press" } });
    fireEvent.blur(name);
    expect(screen.getByPlaceholderText("Quads, Glutes").value).toBe("Chest");
    expect(screen.getByPlaceholderText("Core").value).toBe("Triceps, Shoulders");
    fireEvent.change(screen.getByPlaceholderText("Legs"), { target: { value: "Chest" } });
    fireEvent.submit(name.closest("form"));
    expect(app.createExercise).toHaveBeenCalledWith(expect.objectContaining({ primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps", "Shoulders"], musclesSource: "movement" }));
  });

  it("a coach's own muscles are kept and marked manual", async () => {
    await openNew();
    const name = screen.getByPlaceholderText("e.g. Bulgarian Split Squat");
    fireEvent.change(name, { target: { value: "Back Squat" } });
    fireEvent.blur(name);
    fireEvent.change(screen.getByPlaceholderText("Quads, Glutes"), { target: { value: "Quads" } });
    fireEvent.change(screen.getByPlaceholderText("Legs"), { target: { value: "Legs" } });
    fireEvent.submit(name.closest("form"));
    expect(app.createExercise).toHaveBeenCalledWith(expect.objectContaining({ primaryMuscles: ["Quads"], musclesSource: "manual" }));
  });
});
