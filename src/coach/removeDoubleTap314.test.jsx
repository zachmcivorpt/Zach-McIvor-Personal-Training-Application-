// @vitest-environment jsdom
// #314 (owner): a client was removed at 4:11pm without the coach meaning to.
// Remove client turned into Cancel | Confirm in the same spot, so a double
// tap confirmed it. Confirm now ignores taps in its first second.
// (setup copied from #208:) the coach's client page in Jarvis mode — glass panels, a "Needs
// you" list with one-tap actions, Session History filters, and calendar
// tiles (workout chips, habits as dots). Renders the REAL CoachClientDetail
// with db shaped exactly as AppContext builds it (grouped by client, #167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import CoachClientDetail from "./CoachClientDetail";

const DAY = 86400000;
const now = Date.now();
const key = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const set = (w, r, isPR = false) => ({ weight: w, reps: r, completed: true, isPR });
const logs = [
  { id: "l1", clientId: "u1", date: now - 1 * DAY, dayLabel: "Strength 1A", entries: [{ exerciseId: "bp", sets: [set(80, 5, true)], note: "elbow sore" }] },
  { id: "l2", clientId: "u1", date: now - 2 * DAY, dayLabel: "Walking", entries: [], cardio: { activityLabel: "Walking", durationMin: 35 } },
  { id: "l3", clientId: "u1", date: now - 3 * DAY, dayLabel: "Hypertrophy 1A", entries: [{ exerciseId: "bp", sets: [set(60, 10)] }] },
];
function setup(tab) {
  const client = { id: "u1", name: "Zach McIvor", status: "active", role: "client", createdAt: now - 90 * DAY };
  ctx = {
    db: {
      users: [client],
      exercises: [{ id: "bp", name: "Bench Press", category: "Chest" }],
      workoutLogs: { u1: logs },
      clientPhases: { u1: [] },
      scheduledWorkouts: { u1: [{ date: key(now + DAY), label: "Core & Arms" }] },
      scheduledBodyStats: {},
      weighIns: {},
      nutritionLogs: { u1: [{ date: key(now - DAY), calories: 1977, meals: { breakfast: [{ name: "Oats", calories: 1977 }] } }] },
      habits: { u1: [{ id: "h1", label: "Track Body Weight", createdAt: now - 30 * DAY }, { id: "h2", label: "Meditate", createdAt: now - 30 * DAY }] },
      habitLog: { u1: { [key(now - DAY)]: ["h1"] } },
      liveSessions: {},
      workoutComments: {},
      clientNotes: {},
      messages: {},
      forms: [],
      formSchedules: {},
      programs: [],
      appDesign: {},
    },
    sendMessage: vi.fn(),
    updateUser: vi.fn(async () => {}),
    removeClient: vi.fn(),
    startViewAsClient: vi.fn(),
    setClientAccessPaused: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab={tab} />
    </MemoryRouter>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Remove client can't be confirmed by a double tap (#314)", () => {
  it("a second tap straight after Remove client does nothing; a deliberate Confirm still works", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T16:11:53"));
    setup("summary");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove client" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]); // the double tap
    expect(ctx.removeClient).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-11-20T16:11:55"));
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
    expect(ctx.removeClient).toHaveBeenCalledWith("u1");
  });
});
