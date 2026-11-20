// @vitest-environment jsdom
// #315 (owner): a client was removed from the coach's iPhone at 16:11:56 on
// 2026-11-20 (Cloud Run log: iPhone app, the only delete call in 30 days).
// On a phone that took ⋮ → Remove client → Confirm: three taps, no typing.
// Every Remove client on the client page now opens a sheet that needs the
// client's full name typed. Renders the REAL CoachClientDetail with db
// shaped as AppContext builds it (#167). Replaces #314's double-tap test.
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

describe("Remove client on the client page needs the full name typed (#315)", () => {
  it("phone path ⋮ → Remove client: taps alone never archive; the typed name does", () => {
    setup("summary");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove client" }).at(-1));
    const archive = screen.getByRole("button", { name: "Archive client" });
    // The 16:11 path: more taps where Confirm used to be.
    fireEvent.click(archive);
    fireEvent.click(archive);
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Zach" } });
    fireEvent.click(archive);
    expect(ctx.removeClient).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "  zach  mcivor " } });
    fireEvent.click(archive);
    expect(ctx.removeClient).toHaveBeenCalledWith("u1", "  zach  mcivor ", { via: "client-page" });
  });

  it("sidebar Remove client opens the same sheet; Cancel archives nobody", () => {
    setup("summary");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove client" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(ctx.removeClient).not.toHaveBeenCalled();
  });
});
