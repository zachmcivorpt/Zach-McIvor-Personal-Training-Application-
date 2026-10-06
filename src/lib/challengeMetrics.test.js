// Regression coverage for the challenge leaderboard giving distinct
// ranks to tied scores: two participants with the identical score used
// to be sorted by value only, then assigned sequential ranks 1, 2, 3...
// with no tie-check — e.g. P1=12, P2=12, P3=8 gave P1 rank 1, P2 rank 2
// despite an equal score. Standard competition ranking (both get rank 1,
// the next distinct score gets rank 3) wasn't implemented.
import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "./challengeMetrics";

function workoutsOn(dates) {
  return dates.map((d) => ({ date: d, entries: [] }));
}

describe("computeLeaderboard", () => {
  it("gives two participants with an identical score the same rank, and skips the next rank", () => {
    const challenge = {
      metric: "workouts",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      participantIds: ["p1", "p2", "p3"],
    };
    const day = new Date("2026-10-05T12:00:00").getTime();
    const db = {
      workoutLogs: {
        p1: workoutsOn(Array.from({ length: 12 }, () => day)),
        p2: workoutsOn(Array.from({ length: 12 }, () => day)),
        p3: workoutsOn(Array.from({ length: 8 }, () => day)),
      },
    };

    const board = computeLeaderboard(challenge, db);
    const byId = Object.fromEntries(board.map((r) => [r.clientId, r]));

    expect(byId.p1.value).toBe(12);
    expect(byId.p2.value).toBe(12);
    expect(byId.p3.value).toBe(8);
    expect(byId.p1.rank).toBe(1);
    expect(byId.p2.rank).toBe(1);
    expect(byId.p3.rank).toBe(3);
  });

  it("ranks distinct scores sequentially with no ties", () => {
    const challenge = { metric: "workouts", startDate: "2026-10-01", endDate: "2026-10-31", participantIds: ["a", "b", "c"] };
    const day = new Date("2026-10-05T12:00:00").getTime();
    const db = {
      workoutLogs: {
        a: workoutsOn(Array.from({ length: 10 }, () => day)),
        b: workoutsOn(Array.from({ length: 7 }, () => day)),
        c: workoutsOn(Array.from({ length: 3 }, () => day)),
      },
    };
    const board = computeLeaderboard(challenge, db);
    const byId = Object.fromEntries(board.map((r) => [r.clientId, r]));
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(2);
    expect(byId.c.rank).toBe(3);
  });
});
