// @vitest-environment jsdom
// #255 (owner): the coached client's Profile looks like Train Solo's —
// ringed picture, name large in capitals, Sessions logged / Kg lifted
// tiles, Black / White, then the rows in glass lists.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], messages: {} }, viewingAsClient: false, deleteMyAccount: vi.fn() }) }));
import { ProfileScreen } from "./ClientApp";
afterEach(cleanup);

const logs = [
  { id: "a", entries: [{ sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }] },
  { id: "b", entries: [{ sets: [{ weight: 60, reps: 10 }] }] },
];

describe("client Profile like Train Solo (#255)", () => {
  it("shows the name, the two totals and Black / White", () => {
    const toggle = vi.fn();
    render(
      <MemoryRouter>
        <ProfileScreen
          user={{ id: "u1", name: "Zach McIvor", username: "z@example.invalid" }}
          logsForClient={logs}
          unreadCount={0}
          notifCount={1}
          dueCheckInsCount={1}
          setMessagesOpen={() => {}}
          setCoachOpen={() => {}}
          onOpenCheckIns={() => {}}
          onOpenNotifications={() => {}}
          onLogout={() => {}}
          showToast={() => {}}
          onToggleTheme={toggle}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId("client-profile-name").className).toMatch(/uppercase/);
    expect(screen.getByTestId("client-profile-sessions").textContent).toBe("2");
    expect(screen.getByTestId("client-profile-kg").textContent).toBe("1,600");
    expect(screen.getByText("Your coach")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Appearance" });
    const [black, white] = group.querySelectorAll("button");
    fireEvent.click(black.getAttribute("aria-pressed") === "true" ? white : black);
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
