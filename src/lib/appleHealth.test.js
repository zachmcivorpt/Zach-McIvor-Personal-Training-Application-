// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { planAppleHealthSync, appleHealthAvailable } from "./appleHealth";
import { buildSoloCalendar } from "../solo/soloCalendar";

const noon = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

describe("Apple Health sync plan", () => {
  it("fills empty days, rounding each value the way it's logged by hand", () => {
    const { metrics, weights } = planAppleHealthSync([
      { date: "2026-10-20", steps: 8432.6, sleepHours: 7.46, restingHeartRate: 57.4, weightKg: 82.34 },
    ]);
    expect(metrics).toEqual([
      { date: "2026-10-20", field: "steps", value: 8433 },
      { date: "2026-10-20", field: "sleepHours", value: 7.5 },
      { date: "2026-10-20", field: "restingHeartRate", value: 57 },
    ]);
    expect(weights).toEqual([{ date: "2026-10-20", weight: 82.3 }]);
  });

  it("never overwrites a value typed in by hand", () => {
    const { metrics } = planAppleHealthSync([{ date: "2026-10-20", steps: 9000, sleepHours: 6 }], {
      bodyMetrics: [{ date: "2026-10-20", steps: 12000 }],
    });
    expect(metrics).toEqual([{ date: "2026-10-20", field: "sleepHours", value: 6 }]);
  });

  it("updates a value it synced itself when it changes (today's steps), and skips it when unchanged", () => {
    const bodyMetrics = [{ date: "2026-10-26", steps: 3000, sleepHours: 7, appleHealth: { steps: true, sleepHours: true } }];
    const { metrics } = planAppleHealthSync([{ date: "2026-10-26", steps: 6500, sleepHours: 7 }], { bodyMetrics });
    expect(metrics).toEqual([{ date: "2026-10-26", field: "steps", value: 6500 }]);
  });

  it("adds a weight only on a day with no weigh-in, and only once", () => {
    const days = [
      { date: "2026-10-20", weightKg: 82 },
      { date: "2026-10-21", weightKg: 81.8 },
      { date: "2026-10-22", weightKg: 81.6 },
    ];
    const { weights } = planAppleHealthSync(days, {
      weighIns: [{ weight: 82.5, date: noon("2026-10-20") }],
      importedWeightDates: ["2026-10-21"],
    });
    expect(weights).toEqual([{ date: "2026-10-22", weight: 81.6 }]);
  });

  it("ignores zero, negative, impossible and malformed values", () => {
    const { metrics, weights } = planAppleHealthSync([
      { date: "2026-10-20", steps: 0, sleepHours: 30, restingHeartRate: -1, weightKg: 0 },
      { date: "bad", steps: 500 },
      null,
    ]);
    expect(metrics).toEqual([]);
    expect(weights).toEqual([]);
  });

  it("is off outside the iPhone app", () => {
    expect(appleHealthAvailable()).toBe(false);
  });
});

describe("Train Solo Monday check-in with Apple Health", () => {
  const base = { purchases: [], programsById: {}, contentByProgramId: {}, workoutLogs: [], progressPhotos: [], accountCreatedAt: noon("2026-10-19"), fromKey: "2026-10-19", toKey: "2026-10-25" };
  const statsDone = (opts) => (buildSoloCalendar({ ...base, ...opts })["2026-10-19"] || []).find((i) => i.type === "bodystats")?.done;

  it("isn't ticked off by synced steps alone", () => {
    expect(statsDone({ bodyMetrics: [{ id: "u_2026-10-20", soloUserId: "u", date: "2026-10-20", steps: 9000, appleHealth: { steps: true } }] })).toBe(false);
  });

  it("is still ticked off by a hand-logged stat or a weigh-in", () => {
    expect(statsDone({ bodyMetrics: [{ id: "u_2026-10-20", soloUserId: "u", date: "2026-10-20", steps: 9000, bodyFatPct: 18, appleHealth: { steps: true } }] })).toBe(true);
    expect(statsDone({ bodyMetrics: [], weighIns: [{ weight: 80, date: noon("2026-10-21") }] })).toBe(true);
  });
});

describe("Apple Health bridge to the iPhone app", () => {
  it("connects through the native handler, remembered per account and side", async () => {
    const { connectAppleHealth, disconnectAppleHealth, isAppleHealthOn, readAppleHealthDays } = await import("./appleHealth");
    const posted = [];
    window.webkit = {
      messageHandlers: {
        apexHealth: {
          postMessage(msg) {
            posted.push(msg);
            const result = msg.action === "read" ? { days: [{ date: "2026-10-26", steps: 4000 }] } : { ok: true };
            setTimeout(() => window.__apexNativeHealth.receive({ id: msg.id, result }), 0);
          },
        },
      },
    };
    try {
      await connectAppleHealth("solo", "u1");
      expect(isAppleHealthOn("solo", "u1")).toBe(true);
      expect(isAppleHealthOn("coached", "u1")).toBe(false);
      expect(isAppleHealthOn("solo", "u2")).toBe(false);
      expect(await readAppleHealthDays(7)).toEqual([{ date: "2026-10-26", steps: 4000 }]);
      expect(posted.map((m) => m.action)).toEqual(["authorize", "read"]);
      disconnectAppleHealth("solo", "u1");
      expect(isAppleHealthOn("solo", "u1")).toBe(false);
    } finally {
      delete window.webkit;
    }
  });

  it("passes on an error from the iPhone app", async () => {
    const { connectAppleHealth, isAppleHealthOn } = await import("./appleHealth");
    window.webkit = {
      messageHandlers: { apexHealth: { postMessage: (msg) => setTimeout(() => window.__apexNativeHealth.receive({ id: msg.id, error: "Not available" }), 0) } },
    };
    try {
      await expect(connectAppleHealth("coached", "u3")).rejects.toThrow("Not available");
      expect(isAppleHealthOn("coached", "u3")).toBe(false);
    } finally {
      delete window.webkit;
    }
  });
});
