// #215: coach push notifications for client workouts, progress photos and weigh-ins.
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const n = require("./coachActivityNotify.js");
const NOW = 1_800_000_000_000;

function fakeDb(docs) {
  const get = (path) => ({ exists: path in docs, data: () => docs[path] });
  const db = {
    collection: (c) => ({
      doc: (id) => ({ path: `${c}/${id}`, get: async () => get(`${c}/${id}`) }),
      where: (f, op, v) => ({
        get: async () => {
          const list = Object.entries(docs)
            .filter(([p, d]) => p.startsWith(`${c}/`) && d[f] === v)
            .map(([p, d]) => ({ id: p.split("/")[1], data: () => d }));
          return { empty: list.length === 0, docs: list };
        },
      }),
    }),
    runTransaction: async (fn) =>
      fn({ get: async (ref) => get(ref.path), set: (ref, data) => (docs[ref.path] = { ...(docs[ref.path] || {}), ...data }) }),
  };
  return db;
}
const people = () => ({ "users/coach": { role: "coach", lastLoginAt: 5 }, "users/c1": { role: "client", name: "Jarrod Kolsch" } });

describe("messages", () => {
  it("workout: name, session and PRs counted from the saved sets; no RPE", () => {
    const log = { dayLabel: "Pull Day Intermediate", rpe: 1, entries: [{ sets: [{ isPR: true }, { isPR: true }] }, { sets: [{ isPR: true }, {}] }] };
    const m = n.workoutMessage(log, "Jarrod Kolsch");
    expect(m).toEqual({ title: "Jarrod completed Pull Day Intermediate", body: "3 new personal bests." });
    expect(JSON.stringify(m)).not.toMatch(/RPE/i);
    expect(n.workoutMessage({ dayLabel: "Legs", entries: [] }, "Sam").body).toBe("Tap to see their session.");
  });
  it("weigh-in shows the kg", () => {
    expect(n.weighInMessage({ weight: 82.46 }, "Jarrod K")).toEqual({ title: "Jarrod logged a weigh-in", body: "82.5 kg" });
  });
  it("coach-typed or backdated weigh-ins don't notify", () => {
    expect(n.weighInWorthNotifying({ weight: 80, date: NOW - 1000 }, NOW)).toBe(true);
    expect(n.weighInWorthNotifying({ weight: 80, date: NOW - 1000, loggedBy: "coach" }, NOW)).toBe(false);
    expect(n.weighInWorthNotifying({ weight: 80, date: NOW - 3 * 86400000 }, NOW)).toBe(false);
  });
});

describe("notifyCoachOfActivity", () => {
  it("sends the coach a workout push under the workouts switch", async () => {
    const send = vi.fn();
    await n.notifyCoachOfActivity(fakeDb(people()), send, "workout", { clientId: "c1", dayLabel: "Pull Day", entries: [] }, NOW);
    expect(send).toHaveBeenCalledWith("coach", { title: "Jarrod completed Pull Day", body: "Tap to see their session." }, "workouts");
  });
  it("one push per photo set: more photos within 15 minutes are quiet", async () => {
    const db = fakeDb(people());
    const send = vi.fn();
    expect(await n.notifyCoachOfActivity(db, send, "photo", { clientId: "c1" }, NOW)).toBe(true);
    expect(await n.notifyCoachOfActivity(db, send, "photo", { clientId: "c1" }, NOW + 60_000)).toBe(false);
    expect(await n.notifyCoachOfActivity(db, send, "photo", { clientId: "c1" }, NOW + n.PHOTO_QUIET_MS + 1)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("coach", { title: "Jarrod added progress photos", body: "Tap to see them." }, "progressPhotos");
  });
  it("weigh-ins use the weighIns switch; never for a non-client", async () => {
    const send = vi.fn();
    await n.notifyCoachOfActivity(fakeDb(people()), send, "weighIn", { clientId: "c1", weight: 80, date: NOW }, NOW);
    expect(send).toHaveBeenCalledWith("coach", { title: "Jarrod logged a weigh-in", body: "80 kg" }, "weighIns");
    const send2 = vi.fn();
    await n.notifyCoachOfActivity(fakeDb(people()), send2, "workout", { clientId: "coach", dayLabel: "X" }, NOW);
    expect(send2).not.toHaveBeenCalled();
  });
  it("is wired to created workoutLogs, progressPhotos and weighIns", () => {
    const src = require("node:fs").readFileSync(new URL("./index.js", import.meta.url), "utf8");
    expect(src).toMatch(/coachActivityTrigger\("workoutLogs\/\{id\}", "workout"\)/);
    expect(src).toMatch(/coachActivityTrigger\("progressPhotos\/\{id\}", "photo"\)/);
    expect(src).toMatch(/coachActivityTrigger\("weighIns\/\{id\}", "weighIn"\)/);
  });
});
