// @vitest-environment jsdom
//
// #181 Train Solo subscription lifecycle (website / Stripe returns, first
// frame of every fresh load):
//  - Back from a paid checkout: unlocked from the checkout itself at once
//    (session_id), not only when Stripe's webhook lands.
//  - Back from an abandoned checkout: the membership sheet says nothing was
//    charged (used to land on Home saying nothing, query left behind).
//  - Back from Stripe's billing portal (e.g. after cancelling): the plan is
//    re-read at once and Profile says "Checking" rather than the cancelled
//    plan; the Profile tab still opens.
//  - The return query is removed from the address (refresh / Back never
//    replays it).
//  - Manage → Stripe portal: busy from the tap, one portal session.
//  - index.html paints Train Solo's colour before any script (no white
//    flash on a fresh load), and SoloThemeProvider takes it over.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("../lib/appleHealth", () => ({ useAppleHealthSync: () => {} }));
vi.mock("../lib/firebase", () => ({ soloDb: {} }));
vi.mock("./SoloCatalogueScreen", () => ({ default: () => <p>catalogue-tab</p> }));
vi.mock("./SoloMyTrainingScreen", () => ({ default: () => <p>training-tab</p> }));
vi.mock("./SoloProgressScreen", () => ({ default: () => <p>progress-tab</p> }));
vi.mock("./SoloCalendarScreen", () => ({ default: () => <p>calendar-tab</p> }));
vi.mock("./SoloProfileScreen", async () => {
  const { useSoloPaywall } = await import("./SoloPaywall");
  return {
    default: function ProfileProbe() {
      const { membershipChecking } = useSoloPaywall();
      return <p>profile-tab {membershipChecking ? "checking" : "settled"}</p>;
    },
  };
});

const FAR = Date.now() + 30 * 86400000;
const stripeAllAccess = { sources: { stripe: { tier: "all_access", status: "active", plan: "all_access_yearly", expiresAt: FAR } }, stripeCustomerId: "cus_1" };

function baseCtx(over = {}) {
  const tier = over.soloTier || "free";
  return {
    soloCurrentUser: { id: "u1" },
    soloAuthUser: { uid: "u1" },
    soloBranding: {},
    soloEntitlement: null,
    soloEntitlementReady: true,
    soloTier: tier,
    soloGatesLive: true,
    soloAccess: { tier, live: true },
    startSoloSubscription: vi.fn(() => Promise.resolve({ url: "https://checkout.stripe.test/sub1" })),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "free" })),
    openSoloBillingPortal: vi.fn(() => new Promise(() => {})),
    ...over,
  };
}

let seen;
function LocationProbe() {
  const loc = useLocation();
  seen = loc;
  return null;
}

beforeEach(() => {
  ctx = baseCtx();
  seen = null;
  delete window.webkit;
  localStorage.removeItem("apexSoloPurchaseOutcome");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function tree(entry, element = <p>home-page</p>) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  return (
    <MemoryRouter initialEntries={[entry]}>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <LocationProbe />
          <Routes>
            <Route path="/solo/home" element={element} />
          </Routes>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("back from a paid Stripe checkout", () => {
  it("asks the server to unlock from that checkout straight away and welcomes them, without waiting for the webhook", async () => {
    ctx = baseCtx({ refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "plus" })) });
    render(await tree("/solo/home?subscribed=plus_yearly&session_id=cs_test_abc"));
    expect(screen.getByText("Confirming your membership")).toBeTruthy();
    await screen.findByTestId("solo-welcome");
    expect(ctx.refreshSoloEntitlement).toHaveBeenCalledWith({ checkoutSessionId: "cs_test_abc" });
    expect(screen.queryByText("Confirming your membership")).toBe(null);
  });
  it("removes the return query from the address, so a refresh doesn't replay it", async () => {
    render(await tree("/solo/home?subscribed=plus_yearly&session_id=cs_test_abc"));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/solo/home");
  });
  it("still welcomes on the live listener when the server's reply hasn't come yet (old return without session_id)", async () => {
    ctx = baseCtx({ refreshSoloEntitlement: vi.fn(() => new Promise(() => {})) });
    const view = render(await tree("/solo/home?subscribed=plus_yearly"));
    expect(ctx.refreshSoloEntitlement).toHaveBeenCalledWith(undefined);
    ctx = baseCtx({ soloTier: "plus", refreshSoloEntitlement: ctx.refreshSoloEntitlement });
    view.rerender(await tree("/solo/home?subscribed=plus_yearly"));
    await screen.findByTestId("solo-welcome");
  });
});

describe("back from an abandoned Stripe checkout", () => {
  it("reopens the membership sheet saying nothing was charged, and clears the query", async () => {
    render(await tree("/solo/home?subscribe=cancelled"));
    await screen.findByText("Checkout cancelled — you haven't been charged.");
    await waitFor(() => expect(seen.search).toBe(""));
  });
  it("waits for this account's plan before opening anything by itself", async () => {
    ctx = baseCtx({ soloEntitlementReady: false });
    const view = render(await tree("/solo/home?subscribe=cancelled"));
    await act(async () => {});
    expect(screen.queryByText("Checkout cancelled — you haven't been charged.")).toBe(null);
    ctx = baseCtx();
    view.rerender(await tree("/solo/home?subscribe=cancelled"));
    await screen.findByText("Checkout cancelled — you haven't been charged.");
  });
});

describe("back from Stripe's billing portal (e.g. after cancelling)", () => {
  async function renderShell(entry) {
    const { default: SoloShell } = await import("./SoloShell");
    return render(await tree(entry, <SoloShell />));
  }
  it("re-reads the plan at once and Profile says Checking until it's back, never the old plan", async () => {
    let answer;
    ctx = baseCtx({ soloTier: "all_access", soloEntitlement: stripeAllAccess, refreshSoloEntitlement: vi.fn(() => new Promise((r) => (answer = r))) });
    await renderShell("/solo/home?soloTab=profile&billing=returned");
    await screen.findByText("profile-tab checking");
    expect(ctx.refreshSoloEntitlement).toHaveBeenCalledTimes(1);
    await act(async () => answer({ tier: "free" }));
    await screen.findByText("profile-tab settled");
    expect(seen.search).toBe("");
    expect(seen.state?.soloTab).toBe("profile");
  });
  it("an older server's ?soloTab=profile return is treated the same", async () => {
    await renderShell("/solo/home?soloTab=profile");
    await screen.findByText(/profile-tab/);
    expect(ctx.refreshSoloEntitlement).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(seen.search).toBe(""));
  });
  it("never stays on Checking with no signal", async () => {
    vi.useFakeTimers();
    ctx = baseCtx({ refreshSoloEntitlement: vi.fn(() => new Promise(() => {})) });
    await renderShell("/solo/home?soloTab=profile&billing=returned");
    await act(async () => {});
    expect(screen.getByText("profile-tab checking")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(8500));
    expect(screen.getByText("profile-tab settled")).toBeTruthy();
  });
  it("a plain Home open asks nothing of the server", async () => {
    await renderShell("/solo/home");
    await act(async () => {});
    expect(ctx.refreshSoloEntitlement).not.toHaveBeenCalled();
  });
});

describe("Manage → Stripe's billing portal", () => {
  it("is busy from the tap and opens one portal session however many taps", async () => {
    ctx = baseCtx({ soloTier: "all_access", soloEntitlement: stripeAllAccess });
    const { useSoloPaywall } = await import("./SoloPaywall");
    function Opener() {
      const { openPaywall } = useSoloPaywall();
      return <button onClick={() => openPaywall({})}>open-sheet</button>;
    }
    render(await tree("/solo/home", <Opener />));
    fireEvent.click(screen.getByText("open-sheet"));
    const manage = await screen.findByRole("button", { name: "Manage" });
    await act(async () => fireEvent.click(manage));
    const busy = screen.getByRole("button", { name: "Opening…" });
    expect(busy.disabled).toBe(true);
    await act(async () => fireEvent.click(busy));
    expect(ctx.openSoloBillingPortal).toHaveBeenCalledTimes(1);
  });
});

describe("first frame of a fresh Train Solo load (index.html)", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("apex-solo-prepaint"));
  afterEach(() => {
    document.getElementById("apex-solo-prepaint")?.remove();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });
  it("paints the member's dark page colour on a Train Solo page before any app code", () => {
    window.history.replaceState(null, "", "/solo/home?soloTab=profile&billing=returned");
    new Function(script)();
    expect(document.getElementById("apex-solo-prepaint").textContent).toContain("#0A0A0B");
  });
  it("white for a light-mode member; nothing on Coaching pages", () => {
    localStorage.setItem("soloThemeDark", "false");
    window.history.replaceState(null, "", "/solo/home");
    new Function(script)();
    expect(document.getElementById("apex-solo-prepaint").textContent).toContain("#FFFFFF");
    document.getElementById("apex-solo-prepaint").remove();
    window.history.replaceState(null, "", "/client");
    new Function(script)();
    expect(document.getElementById("apex-solo-prepaint")).toBe(null);
  });
  it("Train Solo's theme takes the page colour over and removes it", async () => {
    window.history.replaceState(null, "", "/solo/home");
    new Function(script)();
    render(await tree("/solo/home"));
    expect(document.getElementById("apex-solo-prepaint")).toBe(null);
  });
});
