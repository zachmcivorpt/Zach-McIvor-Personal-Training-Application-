// @vitest-environment jsdom
//
// #183: the iPhone app's step-by-step purchase log, readable from Train Solo
// Profile on test accounts in the iPhone app, so a device report says which
// step of the hand-back after Apple's sheet failed.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("../lib/appleHealth", () => ({
  appleHealthAvailable: () => false,
  isAppleHealthOn: () => false,
  connectAppleHealth: vi.fn(),
  disconnectAppleHealth: vi.fn(),
  useAppleHealthSync: () => {},
}));
vi.mock("../lib/push", () => ({ enableSoloPush: vi.fn(), hasSoloPushToken: () => false }));

function baseCtx(over = {}) {
  return {
    soloCurrentUser: { id: "u1", firstName: "Sam", onboarding: { completed: true, answers: {} } },
    soloAuthUser: { uid: "u1" },
    soloPurchases: [],
    soloPrograms: [],
    soloBranding: {},
    soloEntitlement: null,
    soloTier: "free",
    soloGatesLive: true,
    soloTestAccount: true,
    soloAccess: { tier: "free", live: true },
    soloLogout: vi.fn(),
    deleteMySoloAccount: vi.fn(),
    setSoloReminderPref: vi.fn(),
    saveSoloGettingStarted: vi.fn(),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "free" })),
    ...over,
  };
}

const TRACE = ["+0ms Apple's sheet requested from /solo/home", "+4210ms sheet closed · bought true", "+5800ms cover off"];
let posted;
function iphoneApp(answer) {
  posted = [];
  window.webkit = {
    messageHandlers: {
      apexPurchases: {
        postMessage(msg) {
          posted.push(msg);
          setTimeout(() => window.__apexNativePurchases.receive({ id: msg.id, ...answer(msg) }), 0);
        },
      },
    },
  };
}

beforeEach(() => {
  ctx = baseCtx();
  delete window.webkit;
});
afterEach(() => {
  cleanup();
  delete window.webkit;
});

async function renderProfile() {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  const { default: SoloProfileScreen } = await import("./SoloProfileScreen");
  render(
    <MemoryRouter>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <SoloProfileScreen />
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("Purchase log in Train Solo Profile (#183)", () => {
  it("a test account in the iPhone app sees it, and it shows the app's recorded steps", async () => {
    iphoneApp((msg) => (msg.action === "trace" ? { result: TRACE } : { result: {} }));
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "Purchase log" }));
    const log = await screen.findByTestId("purchase-log");
    expect(log.textContent).toContain("sheet closed · bought true");
    expect(log.textContent).toContain("cover off");
    expect(posted.some((m) => m.action === "trace")).toBe(true);
  });
  it("an app build without the log says so instead of failing", async () => {
    iphoneApp(() => ({ error: "Unknown purchase request." }));
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "Purchase log" }));
    await screen.findByText("This version of the app doesn't keep a purchase log yet.");
  });
  it("not shown to members who aren't test accounts, nor on the website", async () => {
    ctx = baseCtx({ soloTestAccount: false });
    iphoneApp(() => ({ result: [] }));
    await renderProfile();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Purchase log" })).toBe(null);
    cleanup();
    delete window.webkit;
    ctx = baseCtx();
    await renderProfile();
    expect(screen.queryByRole("button", { name: "Purchase log" })).toBe(null);
  });
});
