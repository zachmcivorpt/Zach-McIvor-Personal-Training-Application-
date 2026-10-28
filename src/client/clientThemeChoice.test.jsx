// @vitest-environment jsdom
//
// Each client picks Light or Dark for their own app (Profile > Appearance),
// saved on the phone per person like Train Solo's toggle
// (REGRESSION_TESTS.md #112). Until they pick, the coach's Design Settings
// default applies. One person's choice never changes another's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileScreen, ClientThemeContext, resolveClientDark, readClientThemePick } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ deleteMyAccount: vi.fn(), viewingAsClient: false }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("client theme choice", () => {
  it("follows the coach's default until the client picks, then the client's pick wins", () => {
    expect(resolveClientDark(null, true)).toBe(true);
    expect(resolveClientDark(null, false)).toBe(false);
    expect(resolveClientDark(null, undefined)).toBe(false);
    expect(resolveClientDark("light", true)).toBe(false);
    expect(resolveClientDark("dark", false)).toBe(true);
  });

  it("is saved per person: one client's pick doesn't change another's", () => {
    localStorage.setItem("clientTheme_a", "dark");
    expect(readClientThemePick("clientTheme_a")).toBe("dark");
    expect(readClientThemePick("clientTheme_b")).toBeNull();
    localStorage.setItem("clientTheme_c", "garbage");
    expect(readClientThemePick("clientTheme_c")).toBeNull();
  });

  it("Profile shows Appearance with the current mode and toggles it", () => {
    const onToggleTheme = vi.fn();
    const props = {
      user: { name: "Zach McIvor", username: "zach" }, onLogout: () => {}, coachOpen: false, setCoachOpen: () => {},
      messagesOpen: false, setMessagesOpen: () => {}, unreadCount: 0, onAvatarChange: () => {}, logsForClient: [],
      scheduledWorkouts: [], onOpenNotifications: () => {}, notifCount: 0, showToast: vi.fn(), dueCheckInsCount: 0,
      onOpenCheckIns: () => {}, onToggleTheme,
    };
    render(
      <MemoryRouter>
        <ClientThemeContext.Provider value={false}>
          <ProfileScreen {...props} />
        </ClientThemeContext.Provider>
      </MemoryRouter>
    );
    expect(screen.getByText("Appearance")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    fireEvent.click(screen.getByText("Appearance"));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});
