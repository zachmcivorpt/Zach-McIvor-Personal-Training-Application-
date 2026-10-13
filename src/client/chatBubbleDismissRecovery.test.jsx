// @vitest-environment jsdom
//
// Root-cause fix for "the coach chat bubble is missing everywhere, for
// both genuine clients and coach View as Client, and closing/reopening
// the app doesn't fix it": CoachChatBubble's own dismiss ("X") button
// sets localStorage.chatBubbleHidden = "1" and never unsets it anywhere
// — confirmed by grep, those two call sites (ClientApp.jsx) are the ONLY
// places that key is ever read or written in the whole codebase. Once set
// on a device, the bubble is permanently gone (no in-app way back), on
// every account signed into that device/browser — including both a real
// client login and a coach's "View as Client" session, since localStorage
// is per-origin, not per-account. That matches every symptom reported:
// missing on every screen (not just the workout session), unaffected by
// force-quitting/reopening the app (localStorage persists that), and
// identical in both modes.
//
// This isn't a guess about the user's actual device state — it's the only
// mechanism in the codebase that could produce exactly this behavior.
// Fix: ProfileScreen now shows a "Show chat bubble" row (same card
// pattern as the existing Messages/Check-ins/Quick Tips rows) whenever
// that flag is set, which clears it. No change to CoachChatBubble's own
// dismiss behavior — clients can still hide it if they want to.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileScreen, ClientThemeContext } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    deleteMyAccount: vi.fn(),
    viewingAsClient: false,
  }),
}));

function baseProps(overrides = {}) {
  return {
    user: { name: "Zach McIvor", fitnessLevel: "Beginner", username: "zach" },
    onLogout: () => {},
    coachOpen: false,
    setCoachOpen: () => {},
    messagesOpen: false,
    setMessagesOpen: () => {},
    unreadCount: 0,
    onAvatarChange: () => {},
    logsForClient: [],
    scheduledWorkouts: [],
    onOpenNotifications: () => {},
    notifCount: 0,
    showToast: vi.fn(),
    dueCheckInsCount: 0,
    onOpenCheckIns: () => {},
    ...overrides,
  };
}

function renderProfile(overrides = {}) {
  return render(
    <MemoryRouter>
      <ClientThemeContext.Provider value={false}>
        <ProfileScreen {...baseProps(overrides)} />
      </ClientThemeContext.Provider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Chat bubble dismiss recovery", () => {
  it("shows no 'restore' row when the bubble was never dismissed", () => {
    renderProfile();
    expect(screen.queryByText("Show chat bubble")).toBeNull();
  });

  it("shows a 'Show chat bubble' row when the bubble was previously dismissed on this device", () => {
    localStorage.setItem("chatBubbleHidden", "1");
    renderProfile();
    expect(screen.getByText("Show chat bubble")).toBeTruthy();
  });

  it("tapping it clears the flag and confirms via toast, so the bubble can appear again", () => {
    localStorage.setItem("chatBubbleHidden", "1");
    const showToast = vi.fn();
    renderProfile({ showToast });

    fireEvent.click(screen.getByText("Show chat bubble"));

    expect(localStorage.getItem("chatBubbleHidden")).toBeNull();
    expect(showToast).toHaveBeenCalledWith("Chat bubble restored");
    // Row disappears once restored — nothing left to do here again.
    expect(screen.queryByText("Show chat bubble")).toBeNull();
  });
});
