// @vitest-environment jsdom
// #208: the coach's client page in Jarvis mode — glass panels, a "Needs
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

describe("needsYou helpers (#208)", () => {
  it("lists sessions with notes, plateaus and a quiet week — only from real data", () => {
    const items = needsYouItems({ logs, plateaus: [{ exerciseId: "x", exerciseName: "Tricep Ext", sessions: 3, currentVolume: 617 }], now });
    expect(items.map((i) => i.id)).toEqual(["notes", "plateau:x"]);
    expect(items[0].title).toBe("1 session with client notes this week");
    expect(needsYouItems({ logs: logs.map((l) => ({ ...l, date: now - 10 * DAY })), now }).map((i) => i.id)).toEqual(["quiet"]);
    expect(needsYouItems({ logs: [], now })).toEqual([]);
  });
  it("filters Session History", () => {
    expect(filterSessionLogs(logs, "cardio").map((l) => l.id)).toEqual(["l2"]);
    expect(filterSessionLogs(logs, "workouts").map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(filterSessionLogs(logs, "prs").map((l) => l.id)).toEqual(["l1"]);
    expect(filterSessionLogs(logs, "notes").map((l) => l.id)).toEqual(["l1"]);
    expect(filterSessionLogs(logs, "all")).toHaveLength(3);
  });
});

describe("the client's Training tab (#208)", () => {
  it("is glass, shows Needs you with a one-tap Review, and the history filters work", () => {
    setup("program");
    expect(screen.getByTestId("coach-client-jarvis")).toBeTruthy();
    expect(document.querySelectorAll('[data-glass="true"]').length).toBeGreaterThan(2);
    expect(screen.getByTestId("training-command-header")).toBeTruthy();
    const item = screen.getAllByTestId("needs-you-item")[0];
    expect(item.textContent).toMatch(/1 session with client notes this week/);
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    fireEvent.click(within(item).getByText("Review"));
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
    const history = screen.getByRole("tablist", { name: "Filter sessions" }).parentElement;
    expect(within(history).queryByText("Hypertrophy 1A")).toBeNull();
    expect(within(history).getByText("Strength 1A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Cardio" }));
    expect(within(history).getByText("Walking")).toBeTruthy();
    expect(within(history).queryByText("Strength 1A")).toBeNull();
  });
  it("Send to client sends the weekly focus as a message", () => {
    setup("program");
    fireEvent.click(screen.getByText("SEND TO CLIENT"));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage.mock.calls[0][0]).toBe("u1");
    expect(ctx.sendMessage.mock.calls[0][2]).toMatch(/^Focus for next week: /);
  });
});

describe("the client's Calendar tab (#208)", () => {
  it("shows done/planned workout chips, habits as dots, and filters", () => {
    setup("calendar");
    expect(document.querySelector('[data-chip="done"]')?.textContent).toMatch(/Strength 1A|Hypertrophy 1A|Walking/);
    expect(document.querySelector('[data-chip="planned"]')?.textContent).toBe("Core & Arms");
    expect(screen.getAllByTestId("cal-habits")[0].textContent).toMatch(/2 habits/);
    expect(screen.queryByText("Track Body Weight")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Habits" }));
    expect(document.querySelector('[data-chip]')).toBeNull();
    expect(screen.getAllByTestId("cal-habits").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Nutrition" }));
    expect(screen.queryAllByTestId("cal-habits")).toHaveLength(0);
    expect(screen.getByText("1977 kcal")).toBeTruthy();
  });
});
