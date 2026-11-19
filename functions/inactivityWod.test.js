// #311 (owner): the Reignition workout is still built from the client's own
// program and put on today's calendar after 5 days without training, but no
// message or push is sent any more. Reads the scheduled handler's source
// (it needs live Firestore to run).
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
const start = src.indexOf("exports.inactivityWod = onSchedule(");
const handler = src.slice(start, src.indexOf("\n);\n", start));

describe("Reignition workout (#311)", () => {
  it("still schedules the workout from their own program", () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain("buildInactivityWod(uid, todayKey)");
    expect(handler).toContain('collection("scheduledWorkouts").doc(scheduledId).set(');
  });
  it("sends no chat message and no push", () => {
    expect(handler).not.toMatch(/collection\("messages"\)/);
    expect(handler).not.toMatch(/notifyUser\(/);
  });
  it("fires after 5 days with no training", () => {
    expect(src).toMatch(/const INACTIVITY_DAYS = 5;/);
  });
});
