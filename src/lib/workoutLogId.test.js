import { describe, expect, it, vi } from "vitest";
import { scheduledWorkoutLogId, workoutLogDocId } from "./workoutLogId";

describe("scheduledWorkoutLogId", () => {
  it("is deterministic — the same client/date/label always produces the same id", () => {
    const a = scheduledWorkoutLogId("client-a", "2026-10-06", "Push Day");
    const b = scheduledWorkoutLogId("client-a", "2026-10-06", "Push Day");
    expect(a).toBe(b);
  });

  it("differs by client, by date, and by label", () => {
    const base = scheduledWorkoutLogId("client-a", "2026-10-06", "Push Day");
    expect(scheduledWorkoutLogId("client-b", "2026-10-06", "Push Day")).not.toBe(base);
    expect(scheduledWorkoutLogId("client-a", "2026-10-07", "Push Day")).not.toBe(base);
    expect(scheduledWorkoutLogId("client-a", "2026-10-06", "Pull Day")).not.toBe(base);
  });

  it("is a valid Firestore document id (no slashes, reasonable length)", () => {
    const id = scheduledWorkoutLogId("client-a", "2026-10-06", "Push Day / Leg Finisher");
    expect(id).not.toContain("/");
    expect(id.length).toBeLessThan(200);
  });
});

describe("workoutLogDocId", () => {
  it("uses the deterministic scheduled-day id when the entry has a scheduledDate", () => {
    const makeRandomId = vi.fn(() => "should-not-be-used");
    const id = workoutLogDocId("client-a", { scheduledDate: "2026-10-06", dayLabel: "Push Day" }, makeRandomId);
    expect(id).toBe(scheduledWorkoutLogId("client-a", "2026-10-06", "Push Day"));
    expect(makeRandomId).not.toHaveBeenCalled();
  });

  it("falls back to a fresh random id for an unscheduled log (e.g. ad-hoc cardio) so repeats aren't deduped", () => {
    const makeRandomId = vi.fn(() => "random-id-1");
    const id = workoutLogDocId("client-a", { dayLabel: "Morning Run (Cardio)" }, makeRandomId);
    expect(id).toBe("random-id-1");
    expect(makeRandomId).toHaveBeenCalledTimes(1);
  });
});
