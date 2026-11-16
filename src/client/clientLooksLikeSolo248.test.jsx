// @vitest-environment jsdom
// #248 (owner): the coached client app's Home, Calendar and Progress read
// like Train Solo's — centred logo, smaller greeting, weekly review first,
// the day heading, the body stats check-in under the session; Solo's
// calendar day header; "Set your main goal" at the top of Progress.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import { HomeScreen } from "./ClientApp";
import ClientGoalCard from "./ClientGoal";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
// Home's weekly review row shows on Mondays (#249): pin a Monday evening.
function onMonday() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T19:00:00"));
}

function home(extra = {}) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  ctx = { db: { users: [], workoutLogs: {}, messages: {} }, currentUser: { id: "u1", name: "Zach McIvor", role: "client" } };
  return render(
    <MemoryRouter>
      <HomeScreen
        user={{ id: "u1", name: "Zach McIvor" }}
        userId="u1"
        dayOffset={0}
        onSelectDay={() => {}}
        isToday
        habits={[]}
        completedHabitIds={[]}
        dayHabitCompletedIds={[]}
        cardioLogs={[]}
        challenges={[]}
        groups={[]}
        targets={{ calories: 2200, protein: 150, carbs: 220, fat: 70 }}
        dayNutrition={null}
        bodyStatsDueToday
        onLogWeight={() => {}}
        reviewData={{ workoutLogs: [{ id: "l1", date: Date.now() - 86400000, entries: [] }] }}
        dbReady
        {...extra}
      />
    </MemoryRouter>
  );
}

describe("Home like Train Solo (#248)", () => {
  it("centred logo header (no visible title), smaller greeting, weekly review first, day heading, body stats under the session", () => {
    onMonday();
    home();
    const header = screen.getAllByTestId("client-tab-header")[0];
    expect(header.querySelector("h1").className).toMatch(/sr-only/);
    expect(screen.getByTestId("home-greeting").className).toMatch(/text-\[15px\]/);
    expect(screen.getByTestId("home-day-heading").textContent).toMatch(/^Today, \d+(st|nd|rd|th) [A-Z][a-z]+$/);
    const order = ["home-weekly-review", "home-day-heading", "home-body-stats"].map((id) => screen.getByTestId(id));
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("no weekly review row before there is anything to review", () => {
    onMonday();
    home({ reviewData: { workoutLogs: [] } });
    expect(screen.queryByTestId("home-weekly-review")).toBeNull();
  });
  it("#249: the weekly review row only on Mondays; logo 26px", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T19:00:00")); // Tuesday
    home();
    expect(screen.queryByTestId("home-weekly-review")).toBeNull();
    expect(screen.getAllByTestId("client-tab-header")[0].querySelector("img").style.height).toBe("26px");
    cleanup();
    onMonday();
    home();
    expect(screen.getByTestId("home-weekly-review")).toBeTruthy();
  });
});

describe("Progress goal (#248)", () => {
  it("offers Set your main goal, and saving stores a started goal", async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(<ClientGoalCard goal={null} logs={[]} weighIns={[]} bodyMetrics={[]} exercises={[]} dark onSave={onSave} />);
    fireEvent.click(screen.getByText("Set your main goal"));
    fireEvent.click(screen.getByTestId("goal-option-workouts"));
    fireEvent.click(screen.getByText("Save goal"));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ type: "workouts", target: 20 });
    expect(typeof saved.startKey).toBe("string");
  });
  it("shows the goal and its progress from their own logs", () => {
    const today = new Date();
    const logs = [0, 1, 2].map((i) => ({ id: `l${i}`, date: today.getTime() - i * 3600000, entries: [] }));
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    render(<ClientGoalCard goal={{ type: "workouts", target: 20, startKey: key }} logs={logs} weighIns={[]} bodyMetrics={[]} exercises={[]} dark={false} onSave={() => {}} />);
    expect(screen.getByText("Complete 20 workouts")).toBeTruthy();
    expect(screen.getByTestId("client-goal-value").textContent).toBe("3");
  });
});
