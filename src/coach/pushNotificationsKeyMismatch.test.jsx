// @vitest-environment jsdom
//
// Regression coverage for a real production report: the coach's Push
// Notifications toggle in More always showed "off" on the native iOS app
// and threw "Push notifications aren't supported on this device or
// browser" when tapped — even though push was already registered and
// working in the background. Cause: src/lib/nativeBridge.js (what actually
// registers push on the native build) writes the token to a per-account
// localStorage key, `pushToken_<uid>`, but this screen was reading/writing
// a bare, unnamespaced "pushToken" key that native registration never
// touches — so the screen could never see that push was already on, and
// falling back to the browser Push API path (enablePush) always fails
// inside the native app's WKWebView wrapper, which has no Push API at all.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PushNotificationsCard } from "./CoachMore";

vi.mock("../lib/push", () => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CoachMore's PushNotificationsCard", () => {
  it("shows enabled when native already registered a token under the namespaced key", () => {
    localStorage.setItem("pushToken_coach-1", "fake-fcm-token");
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);
    // Only rendered when `enabled` is true.
    expect(screen.getByText("New messages")).toBeTruthy();
    expect(screen.getByText("Check-in submissions")).toBeTruthy();
  });

  it("does not show enabled from the old bare, unnamespaced key alone", () => {
    localStorage.setItem("pushToken", "stale-token-from-a-different-account-or-build");
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{}} updateUser={vi.fn()} showToast={vi.fn()} />);
    expect(screen.queryByText("New messages")).toBeNull();
  });
});
