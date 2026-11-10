// @vitest-environment jsdom
// #217: the client page is drawn on document.body, above the console bars.
// (setup copied from #208:) the coach's client page in Jarvis mode — glass panels, a "Needs
// you" list with one-tap actions, Session History filters, and calendar
// tiles (workout chips, habits as dots). Renders the REAL CoachClientDetail
// with db shaped exactly as AppContext builds it (grouped by client, #167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { needsYouItems, filterSessionLogs } from "./needsYou";

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
afterEach(cleanup);

import { readFileSync } from "node:fs";

describe("client page above the console bars (#217)", () => {
  it("is drawn straight on document.body, not inside the console's scrolling area", () => {
    const { container } = setup("summary");
    const page = document.querySelector("[data-testid=coach-client-jarvis]");
    expect(page).not.toBeNull();
    expect(container.contains(page)).toBe(false);
    expect(page.parentElement).toBe(document.body);
    expect(within(page).getAllByText("Zach McIvor").length).toBeGreaterThan(0);
  });
  it("keeps clear of the iPhone's top and bottom edges", () => {
    const page = (setup("summary"), document.querySelector("[data-testid=coach-client-jarvis]"));
    expect(page.className).toContain("pt-safe");
    expect(readFileSync("src/coach/CoachClientDetail.jsx", "utf8")).toContain('className="flex-1 min-w-0 min-h-0 overflow-y-auto pb-safe"');
  });
  it("the console tab bar sits low on the bottom edge", () => {
    const shell = readFileSync("src/coach/CoachShell.jsx", "utf8");
    expect(shell).toContain('TAB_BAR_BOTTOM = "max(calc(env(safe-area-inset-bottom) - 14px), 4px)"');
    expect(shell).toMatch(/data-testid="coach-tab-bar"/);
  });
});
