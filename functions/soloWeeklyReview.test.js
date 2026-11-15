// #236: the Sunday review push uses the member's real week.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { weekStats, reviewPushText } = require("./soloWeeklyReview.js");

// Sun 15 Nov 2026, 6pm Sydney (07:00 UTC).
const NOW = Date.UTC(2026, 10, 15, 7, 0, 0);
const log = (iso, prs = 0) => ({ date: Date.parse(iso), entries: [{ sets: Array.from({ length: prs + 1 }, (_, i) => ({ weight: 50, reps: 5, isPR: i < prs })) }] });

describe("weekStats", () => {
  it("counts this week's sessions and PRs on the member's own calendar", () => {
    const logs = [
      log("2026-11-09T00:30:00Z", 1), // Mon 9 Nov, 11:30am Sydney
      log("2026-11-14T22:00:00Z", 2), // Sun 15 Nov, 9am Sydney
      log("2026-11-08T12:00:00Z"), // Sun 8 Nov, 11pm Sydney: last week
    ];
    expect(weekStats(logs, "Australia/Sydney", NOW)).toEqual({ sessions: 2, prs: 3 });
  });
});

describe("reviewPushText", () => {
  it("says what they did, then points them to the review", () => {
    expect(reviewPushText({ sessions: 4, prs: 2, firstName: "Sam" })).toEqual({
      title: "Your weekly review is ready",
      body: "Nice work, Sam: 4 sessions and 2 PRs this week. See your progress and next week's focus.",
    });
    expect(reviewPushText({ sessions: 1, prs: 0 }).body).toBe("Nice work: 1 session this week. See your progress and next week's focus.");
  });
  it("a week with no sessions isn't praised", () => {
    expect(reviewPushText({ sessions: 0 }).body).toBe("A new week starts tomorrow. Open your review for next week's focus.");
  });
});
