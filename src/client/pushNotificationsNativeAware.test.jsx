// @vitest-environment jsdom
//
// Regression coverage for the client-side equivalent of the coach's Push
// Notifications bug (see src/coach/pushNotificationsKeyMismatch.test.jsx):
// on the native iOS app, tapping either push-notification control here
// used to fall through to enablePush()'s browser-only Push API path,
// which always throws "not supported" inside WKWebView regardless of the
// real OS permission state — there's no browser Push API there at all,
// and native grants/denies push once via a one-time OS prompt with no
// in-app re-prompt. Both now send the client to iOS Settings instead.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/push", () => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  pushSupported: vi.fn(() => Promise.resolve(false)),
  // A getter so it reflects window.__apexNativePush at CLIENT.jsx's own
  // (fresh, per-test) import time, not whatever it was when this mock
  // factory first ran.
  get isNativeApp() {
    return typeof window !== "undefined" && !!window.__apexNativePush;
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.__apexNativePush;
  vi.resetModules();
});

async function loadComponents() {
  const mod = await import("./ClientApp");
  return { NotificationsPromptCard: mod.NotificationsPromptCard, PushNotificationsSheet: mod.PushNotificationsSheet };
}

describe("PushNotificationsSheet (client)", () => {
  it("on native, tapping the toggle while disabled never calls the doomed browser Push API path", async () => {
    window.__apexNativePush = { setToken() {} };
    const { PushNotificationsSheet } = await loadComponents();
    const { enablePush } = await import("../lib/push");
    render(<PushNotificationsSheet open onClose={() => {}} showToast={vi.fn()} userId="client-1" />);

    fireEvent.click(screen.getByLabelText("Open iOS Settings to turn on push notifications"));

    expect(enablePush).not.toHaveBeenCalled();
    expect(screen.getByText(/Controlled by iOS/)).toBeTruthy();
  });

  it("off native, tapping the toggle still goes through enablePush as before", async () => {
    const { PushNotificationsSheet } = await loadComponents();
    const { enablePush } = await import("../lib/push");
    enablePush.mockResolvedValue("a-real-web-push-token");
    render(<PushNotificationsSheet open onClose={() => {}} showToast={vi.fn()} userId="client-1" />);

    fireEvent.click(screen.getByLabelText("Turn on push notifications"));

    await screen.findByText("Enabled on this device");
    expect(enablePush).toHaveBeenCalledWith("client-1");
  });
});

describe("NotificationsPromptCard (client)", () => {
  it("shows on native even though the browser Push API itself is unsupported there", async () => {
    window.__apexNativePush = { setToken() {} };
    const { NotificationsPromptCard } = await loadComponents();
    render(<NotificationsPromptCard userId="client-1" showToast={vi.fn()} />);

    expect(await screen.findByText(/Turn on notifications/)).toBeTruthy();
  });

  it("on native, tapping ENABLE opens iOS Settings instead of calling enablePush", async () => {
    window.__apexNativePush = { setToken() {} };
    const { NotificationsPromptCard } = await loadComponents();
    const { enablePush } = await import("../lib/push");
    render(<NotificationsPromptCard userId="client-1" showToast={vi.fn()} />);

    const enableButton = await screen.findByText("ENABLE");
    fireEvent.click(enableButton);

    expect(enablePush).not.toHaveBeenCalled();
  });

  it("stays hidden off native when the browser genuinely doesn't support push", async () => {
    const { NotificationsPromptCard } = await loadComponents();
    render(<NotificationsPromptCard userId="client-1" showToast={vi.fn()} />);

    // pushSupported() is mocked to resolve false — matches a real
    // unsupported browser off the native app.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Turn on notifications/)).toBeNull();
  });
});
