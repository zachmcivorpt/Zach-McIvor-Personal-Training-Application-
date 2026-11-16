// @vitest-environment jsdom
// #257 (owner): the weekly review's lines were pulled up through the logo
// and sat far apart. Now the logo block only pulls up a little (-mb-2) and
// the row is tight (py-2) with even spacing.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} } }) }));
import { HomeScreen } from "./ClientApp";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("#257", () => {
  it("the logo block isn't pulled into the review row; the row is tight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T19:00:00")); // a Monday
    window.HTMLElement.prototype.scrollIntoView = () => {};
    render(
      <MemoryRouter>
        <HomeScreen user={{ id: "u1", name: "Zach" }} userId="u1" dayOffset={0} onSelectDay={() => {}} isToday habits={[]} completedHabitIds={[]} dayHabitCompletedIds={[]} cardioLogs={[]} challenges={[]} groups={[]} targets={{ calories: 2000 }} dayNutrition={null} dbReady reviewData={{ workoutLogs: [{ id: "a", date: Date.now(), entries: [] }] }} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("home-top").className).not.toMatch(/-mb-3/);
    expect(screen.getByTestId("home-weekly-review").className).toMatch(/\bpy-2\b/);
  });
});
