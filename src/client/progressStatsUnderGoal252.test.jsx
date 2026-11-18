// @vitest-environment jsdom
// #252 (owner): "Log body stats & photos" sits right under the main goal on
// Progress; the gap under Home's greeting is tight.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {}, progressPhotos: {} } }) }));
import { ProgressScreen, HomeScreen } from "./ClientApp";
afterEach(cleanup);

describe("#252", () => {
  it("Log body stats & photos comes straight after the goal", async () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    render(
      <MemoryRouter>
        <ProgressScreen userId="u1" photos={[]} weighIns={[]} logsForClient={[]} exercisesById={{}} bodyMetrics={[]} scheduledWorkouts={[]} goal={null} onSaveGoal={() => {}} />
      </MemoryRouter>
    );
    const goal = await screen.findByTestId("client-goal");
    const stats = screen.getByTestId("progress-log-stats");
    expect(goal.nextElementSibling).toBe(stats);
  });
  it("Home's greeting block pulls the next section closer", () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    render(
      <MemoryRouter>
        <HomeScreen user={{ id: "u1", name: "Zach McIvor" }} userId="u1" dayOffset={0} onSelectDay={() => {}} isToday habits={[]} completedHabitIds={[]} dayHabitCompletedIds={[]} cardioLogs={[]} challenges={[]} groups={[]} targets={{ calories: 2000 }} dayNutrition={null} dbReady />
      </MemoryRouter>
    );
    // #279: the greeting sits straight under the top bar (pulled up 6px).
    expect(screen.getByTestId("home-greeting-row").className).toMatch(/-mt-1\.5/);
  });
});
