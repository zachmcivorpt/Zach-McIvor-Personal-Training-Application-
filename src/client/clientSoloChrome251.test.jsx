// @vitest-environment jsdom
// #251 (owner: "exactly the same as Train Solo"): every client tab's header
// shows Train Solo's own APEX mark, never the coach's uploaded logo.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SOLO_MARK_BLACK } from "../solo/soloMark";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} } }) }));
import { HomeScreen } from "./ClientApp";
afterEach(cleanup);

describe("Train Solo chrome in the client app (#251)", () => {
  it("the header logo is Train Solo's APEX mark", () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    render(
      <MemoryRouter>
        <HomeScreen user={{ id: "u1", name: "Zach McIvor" }} userId="u1" dayOffset={0} onSelectDay={() => {}} isToday habits={[]} completedHabitIds={[]} dayHabitCompletedIds={[]} cardioLogs={[]} challenges={[]} groups={[]} targets={{ calories: 2000 }} dayNutrition={null} dbReady />
      </MemoryRouter>
    );
    expect(screen.getByTestId("client-tab-logo").getAttribute("src")).toBe(SOLO_MARK_BLACK);
  });
});
