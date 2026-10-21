import { describe, expect, it } from "vitest";
import { analyzeSession } from "./sessionIntelligence";

// Regression: a first-time TIMED exercise (Active Recovery's Incline
// Treadmill Walk, or a plank hold) was told to "focus on finding a solid
// working weight today" — there's no weight to find.
const exercisesById = {
  walk: { id: "walk", name: "Incline Treadmill Walk", category: "Cardio" },
  squat: { id: "squat", name: "Back Squat", category: "Legs" },
};
// One recent unrelated session, so the note isn't the "returning after a gap" one.
const logs = [{ date: Date.now() - 86400000, entries: [{ exerciseId: "other", sets: [{ kg: "50", reps: "10", completed: true }] }] }];

describe("Session Intelligence first-time note", () => {
  it("doesn't mention a working weight for a timed exercise", () => {
    const r = analyzeSession([{ exerciseId: "walk", targetSets: 1, targetReps: 1200, targetType: "time", section: "main" }], exercisesById, logs);
    expect(r.whyItMatters).toContain("First time logging Incline Treadmill Walk");
    expect(r.whyItMatters).not.toMatch(/working weight/);
  });
  it("keeps the working-weight note for a weighted lift", () => {
    const r = analyzeSession([{ exerciseId: "squat", targetSets: 3, targetReps: 8, targetType: "reps", section: "main" }], exercisesById, logs);
    expect(r.whyItMatters).toContain("First time logging Back Squat in this program — focus on finding a solid working weight today.");
  });
});
