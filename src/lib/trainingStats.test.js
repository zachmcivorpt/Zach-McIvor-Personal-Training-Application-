// @vitest-environment node
//
// Regression coverage for computePlateaus's detection metric. It used to
// flag/clear a plateau based on estimated 1RM (Epley formula off the best
// single set of a session) — which a single heavy low-rep set can inflate
// even while the client's actual working sets (reps/sets done, i.e. total
// volume) haven't moved at all. Switched to total session volume (sum of
// weight x reps across every set) so "no progression in reps or sets" is
// what actually drives the flag.
import { describe, expect, it } from "vitest";
import { computePlateaus } from "./trainingStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const exercisesById = { bench: { id: "bench", name: "Bench Press" } };

function logAt(daysAgo, sets) {
  return { date: Date.now() - daysAgo * DAY_MS, entries: [{ exerciseId: "bench", sets }] };
}

describe("computePlateaus", () => {
  it("flags a plateau driven by stalled volume even when a heavy single raised e1RM", () => {
    // Before the 3-week window: real working sets, high volume.
    const before = logAt(25, [
      { weight: 100, reps: 8 },
      { weight: 100, reps: 8 },
      { weight: 100, reps: 8 },
    ]);
    // In-window: three sessions of a single heavy rep each — e1RM-wise this
    // beats the 100x8 sets above, but actual volume moved is tiny.
    const inWindow = [15, 10, 2].map((d) => logAt(d, [{ weight: 130, reps: 1 }]));

    const plateaus = computePlateaus([before, ...inWindow], exercisesById);
    expect(plateaus).toHaveLength(1);
    expect(plateaus[0]).toMatchObject({ exerciseId: "bench", sessions: 3, currentVolume: 130 });
  });

  it("does not flag an exercise whose volume is genuinely increasing", () => {
    const before = logAt(25, [
      { weight: 100, reps: 8 },
      { weight: 100, reps: 8 },
    ]);
    // Same weight, more reps each time — real progression, no weight change.
    const inWindow = [
      logAt(15, [{ weight: 100, reps: 9 }, { weight: 100, reps: 9 }]),
      logAt(10, [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }]),
      logAt(2, [{ weight: 100, reps: 12 }, { weight: 100, reps: 12 }]),
    ];

    const plateaus = computePlateaus([before, ...inWindow], exercisesById);
    expect(plateaus).toHaveLength(0);
  });

  it("does not flag with fewer than 3 sessions in the window", () => {
    const before = logAt(25, [{ weight: 100, reps: 8 }]);
    const inWindow = [15, 10].map((d) => logAt(d, [{ weight: 100, reps: 8 }]));

    const plateaus = computePlateaus([before, ...inWindow], exercisesById);
    expect(plateaus).toHaveLength(0);
  });

  it("does not flag a brand-new exercise with no history before the window", () => {
    const inWindow = [15, 10, 2].map((d) => logAt(d, [{ weight: 100, reps: 8 }]));

    const plateaus = computePlateaus(inWindow, exercisesById);
    expect(plateaus).toHaveLength(0);
  });
});
