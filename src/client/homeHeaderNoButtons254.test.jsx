// @vitest-environment jsdom
// #254 (owner): Home's greeting row has no bell or profile picture; they
// were taller than the row, so the weekly review's line ran under them.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} } }) }));
import { HomeScreen } from "./ClientApp";
afterEach(cleanup);

describe("Home greeting row (#254)", () => {
  it("only the greeting: no notifications button, no avatar", () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    render(
      <MemoryRouter>
        <HomeScreen user={{ id: "u1", name: "Zach McIvor" }} userId="u1" dayOffset={0} onSelectDay={() => {}} isToday habits={[]} completedHabitIds={[]} dayHabitCompletedIds={[]} cardioLogs={[]} challenges={[]} groups={[]} targets={{ calories: 2000 }} dayNutrition={null} notifCount={1} dbReady />
      </MemoryRouter>
    );
    // #256: no greeting row at all now; still no bell or avatar on Home's top.
    expect(screen.queryByTestId("home-header-row")).toBeNull();
    expect(screen.getByTestId("home-top").querySelectorAll("button")).toHaveLength(0);
  });
});
