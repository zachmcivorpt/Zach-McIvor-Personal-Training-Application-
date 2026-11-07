// @vitest-environment jsdom
//
// #157 Train Solo journey sweep, on real screens:
//  - Forgot password on the Train Solo login.
//  - Pay / Subscribe stay busy while the page leaves for Stripe (a second
//    tap started a second checkout — two charges).
//  - A program page opened before the catalogue arrives doesn't flash
//    "This program isn't available".
//  - Back from a website subscription checkout: "Confirming your
//    membership", then the welcome (used to show nothing).
//  - Stripe's billing portal returns to ?soloTab=profile — the Profile tab.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// The membership sheet from a program page (#186): in the iPhone app (or for
// someone who can't buy single programs) the "Unlock with All Access"
// button; on the website, Start Program → the pay sheet's All Access option.
function openAllAccess() {
  const unlock = screen.queryByRole("button", { name: /unlock with all access/i });
  if (unlock) return fireEvent.click(unlock);
  fireEvent.click(screen.getByRole("button", { name: /start program/i }));
  fireEvent.click(screen.getByRole("button", { name: /or get every program with all access/i }));
}


vi.setConfig({ testTimeout: 20000 });

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("../lib/appleHealth", () => ({ useAppleHealthSync: () => {} }));
vi.mock("../lib/firebase", () => ({ soloDb: {} }));
vi.mock("./SoloCatalogueScreen", () => ({ default: () => <p>catalogue-tab</p> }));
vi.mock("./SoloMyTrainingScreen", () => ({ default: () => <p>training-tab</p> }));
vi.mock("./SoloProgressScreen", () => ({ default: () => <p>progress-tab</p> }));
vi.mock("./SoloProfileScreen", () => ({ default: () => <p>profile-tab</p> }));

const category = { id: "c1", name: "Strength" };
const program = { id: "p1", name: "Hypertrophy", status: "published", categoryIds: ["c1"], priceCents: 7999, level: "Beginner", weekOnePreview: { totalWeeks: 8 } };

function baseCtx(over = {}) {
  const tier = over.soloTier || "free";
  const live = over.soloGatesLive ?? false;
  return {
    soloPrograms: [program],
    soloProgramsLoaded: true,
    soloProgramCategories: [category],
    soloExercises: [],
    soloCurrentUser: { id: "u1", recoveryAddon: null },
    soloAuthUser: { uid: "u1" },
    soloPurchases: [],
    soloEnrolments: [],
    soloBranding: {},
    soloEntitlement: null,
    soloTier: tier,
    soloGatesLive: live,
    soloHasAllAccess: live && tier === "all_access",
    soloAccess: { tier, live },
    soloAppDesign: {},
    startSoloCheckout: vi.fn(() => Promise.resolve({ url: "https://checkout.stripe.test/s1" })),
    startSoloSubscription: vi.fn(() => Promise.resolve({ url: "https://checkout.stripe.test/sub1" })),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "free" })),
    openSoloBillingPortal: vi.fn(),
    setRecoveryAddon: vi.fn(() => Promise.resolve()),
    sendSoloPasswordReset: vi.fn(() => Promise.resolve()),
    soloLogin: vi.fn(),
    fetchOnboardingCompletedFromServer: vi.fn(() => Promise.resolve(true)),
    ...over,
  };
}

beforeEach(() => {
  ctx = baseCtx();
  delete window.webkit;
  localStorage.removeItem("apexSoloPurchaseOutcome");
});
afterEach(cleanup);

async function tree(path, element, routePath) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  return (
    <MemoryRouter initialEntries={[path]}>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <Routes>
            <Route path={routePath} element={element} />
            <Route path="/solo/home" element={<p>home-page</p>} />
          </Routes>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}
async function renderProgram(id) {
  const { default: SoloProgramDetailsScreen } = await import("./SoloProgramDetailsScreen");
  return render(await tree(`/solo/program/${id}`, <SoloProgramDetailsScreen />, "/solo/program/:id"));
}

describe("Train Solo login: forgot password", () => {
  it("sends a reset link for the typed email and says so without revealing whether the account exists", async () => {
    ctx = baseCtx({ soloCurrentUser: null });
    const { default: SoloLoginScreen } = await import("./SoloLoginScreen");
    render(await tree("/solo/login", <SoloLoginScreen />, "/solo/login"));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "me@example.invalid" } });
    fireEvent.click(screen.getByText("Forgot password?"));
    expect(screen.getByPlaceholderText("you@example.com").value).toBe("me@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "SEND RESET LINK" }));
    await screen.findByText(/a password reset link is on its way/);
    expect(ctx.sendSoloPasswordReset).toHaveBeenCalledWith("me@example.invalid");
    fireEvent.click(screen.getByText("Back to sign in"));
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });
  it("shows the reason when the email can't be sent", async () => {
    ctx = baseCtx({ soloCurrentUser: null, sendSoloPasswordReset: vi.fn(() => Promise.reject(new Error("That doesn't look like a valid email."))) });
    const { default: SoloLoginScreen } = await import("./SoloLoginScreen");
    render(await tree("/solo/login", <SoloLoginScreen />, "/solo/login"));
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "typo@example" } });
    fireEvent.click(screen.getByRole("button", { name: "SEND RESET LINK" }));
    await screen.findByText("That doesn't look like a valid email.");
  });
});

describe("one checkout per tap", () => {
  it("a single program's Pay button stays busy while leaving for Stripe", async () => {
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    const pay = await screen.findByRole("button", { name: /PAY/ });
    await act(async () => fireEvent.click(pay));
    const busy = screen.getByRole("button", { name: "STARTING CHECKOUT…" });
    expect(busy.disabled).toBe(true);
    await act(async () => fireEvent.click(busy));
    expect(ctx.startSoloCheckout).toHaveBeenCalledTimes(1);
  });
  it("is usable again when the page comes back from the browser's page cache", async () => {
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: /PAY/ })));
    const ev = new Event("pageshow");
    ev.persisted = true;
    await act(async () => window.dispatchEvent(ev));
    expect(screen.getByRole("button", { name: /PAY A\$79\.99/ }).disabled).toBe(false);
  });
  it("the membership Subscribe button stays busy while leaving for Stripe", async () => {
    ctx = baseCtx({ soloGatesLive: true });
    await renderProgram("p1");
    openAllAccess();
    const subscribe = await screen.findByRole("button", { name: /start 7-day free trial/i });
    await act(async () => fireEvent.click(subscribe));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledTimes(1));
    expect(subscribe.disabled).toBe(true);
    await act(async () => fireEvent.click(subscribe));
    expect(ctx.startSoloSubscription).toHaveBeenCalledTimes(1);
  });
});

describe("program page before the catalogue arrives", () => {
  it("doesn't say the program isn't available while loading, then shows it", async () => {
    ctx = baseCtx({ soloPrograms: [], soloProgramsLoaded: false });
    const view = await renderProgram("p1");
    expect(screen.queryByText("This program isn't available.")).toBe(null);
    ctx = baseCtx();
    const { default: SoloProgramDetailsScreen } = await import("./SoloProgramDetailsScreen");
    view.rerender(await tree("/solo/program/p1", <SoloProgramDetailsScreen />, "/solo/program/:id"));
    expect(screen.getAllByText("Hypertrophy").length).toBeGreaterThan(0);
  });
  it("still says so once the catalogue has loaded without it", async () => {
    ctx = baseCtx({ soloPrograms: [] });
    await renderProgram("p1");
    expect(screen.getByText("This program isn't available.")).toBeTruthy();
  });
});

describe("back from a website subscription checkout", () => {
  async function renderReturn() {
    return render(await tree("/solo/home?subscribed=plus_yearly", <p>home-page</p>, "/solo/home"));
  }
  it("shows Confirming until the plan reaches the account, then the welcome", async () => {
    const view = await renderReturn();
    expect(screen.getByText("Confirming your membership")).toBeTruthy();
    ctx = baseCtx({ soloTier: "plus" });
    view.rerender(await tree("/solo/home?subscribed=plus_yearly", <p>home-page</p>, "/solo/home"));
    await screen.findByTestId("solo-welcome");
    expect(screen.queryByText("Confirming your membership")).toBe(null);
  });
  it("says the payment is on its way if it takes longer, never asking to pay again", async () => {
    vi.useFakeTimers();
    try {
      await renderReturn();
      await act(async () => vi.advanceTimersByTime(16000));
      expect(screen.getByText(/Payment received — your membership is on its way/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Stripe billing portal return", () => {
  it("?soloTab=profile opens the Profile tab", async () => {
    const { default: SoloShell } = await import("./SoloShell");
    render(await tree("/solo/home?soloTab=profile", <SoloShell />, "/solo/home"));
    expect(screen.getByText("profile-tab")).toBeTruthy();
  });
});

describe("catalogue before it arrives", () => {
  it("doesn't flash 'No programs are published yet' while loading", async () => {
    ctx = baseCtx({ soloPrograms: [], soloProgramsLoaded: false });
    vi.doUnmock("./SoloCatalogueScreen");
    vi.resetModules();
    const { default: SoloCatalogueScreen } = await import("./SoloCatalogueScreen");
    render(await tree("/solo/home", <SoloCatalogueScreen />, "/solo/home"));
    expect(screen.queryByText(/No programs are published yet/)).toBe(null);
  });
});
