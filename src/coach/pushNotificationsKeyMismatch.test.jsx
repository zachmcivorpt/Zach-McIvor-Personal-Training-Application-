// @vitest-environment jsdom
//
// Regression coverage for a real production report: the coach's Push
// Notifications toggle in More always showed "off" on the native iOS app
// and threw "Push notifications aren't supported on this device or
// browser" when tapped.
//
// Two compounding causes, both covered here:
// 1. src/lib/nativeBridge.js (what actually registers push on the native
//    build) writes the token to a per-account localStorage key,
//    `pushToken_<uid>`, but this screen was reading/writing a bare,
//    unnamespaced "pushToken" key that native registration never
//    touches — so it could never see that push was already on.
// 2. Even with that fixed, tapping the toggle while genuinely not yet
//    enabled on native (e.g. the coach denied the one-time iOS
//    permission prompt, or hasn't been asked yet) fell back to
//    enablePush()'s browser Push API path, which always throws "not
//    supported" inside WKWebView — true regardless of the real OS
//    permission state, since that API doesn't exist there at all. On
//    native this now opens iOS Settings instead of calling enablePush.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/push", () => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.__apexNativePush;
  vi.resetModules();
});

// isNativeApp (CoachMore.jsx) is read once at module-load time — matching
// how it actually runs (nativeBridge.js always finishes setting
// window.__apexNativePush, synchronously, before CoachMore.jsx's lazy
// chunk ever loads) — so each test sets window.__apexNativePush BEFORE
// importing the module fresh.
async function loadCard() {
  const mod = await import("./CoachMore");
  return mod.PushNotificationsCard;
}

describe("CoachMore's PushNotificationsCard", () => {
  it("shows enabled when native already registered a token under the namespaced key", async () => {
    localStorage.setItem("pushToken_coach-1", "fake-fcm-token");
    const PushNotificationsCard = await loadCard();
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);
    // Only rendered when `enabled` is true.
    expect(screen.getByText("New messages")).toBeTruthy();
    expect(screen.getByText("Check-in submissions")).toBeTruthy();
  });

  it("does not show enabled from the old bare, unnamespaced key alone", async () => {
    localStorage.setItem("pushToken", "stale-token-from-a-different-account-or-build");
    const PushNotificationsCard = await loadCard();
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);
    expect(screen.queryByText("New messages")).toBeNull();
  });

  it("on native, tapping the toggle while disabled never calls the doomed browser Push API path", async () => {
    window.__apexNativePush = { setToken() {} };
    const PushNotificationsCard = await loadCard();
    const { enablePush } = await import("../lib/push");
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);

    const toggleButton = screen.getByLabelText("Open iOS Settings to turn on push notifications");
    fireEvent.click(toggleButton);

    expect(enablePush).not.toHaveBeenCalled();
    expect(screen.getByText(/Controlled by iOS/)).toBeTruthy();
  });

  it("off native (regular browser/PWA), tapping the toggle still goes through enablePush as before", async () => {
    const PushNotificationsCard = await loadCard();
    const { enablePush } = await import("../lib/push");
    enablePush.mockResolvedValue("a-real-web-push-token");
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Turn on push notifications"));

    await screen.findByText("New messages");
    expect(enablePush).toHaveBeenCalledWith("coach-1");
  });
});
