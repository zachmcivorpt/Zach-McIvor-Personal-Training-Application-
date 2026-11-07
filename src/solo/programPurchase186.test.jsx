// @vitest-environment jsdom
//
// #186 Single program purchases alongside Free / Plus / All Access, on the
// real program page and Catalogue:
//  - Free and Plus members see a program's own price and can buy it (before
//    and after subscriptions launch); All Access members see it included.
//  - Back from Stripe: "Confirming your purchase" while the server confirms
//    the payment with Stripe, then "It's yours"; never unlocked by the page
//    alone. Slow confirmation and an abandoned checkout say so plainly.
//  - A bought program stays the member's whatever their plan.
//  - The iPhone app never shows a price or a Pay button (3.1.1).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("../lib/appleHealth", () => ({ useAppleHealthSync: () => {} }));
vi.mock("../lib/firebase", () => ({ soloDb: {} }));

const category = { id: "c1", name: "Strength" };
const program = { id: "p1", name: "Hypertrophy", status: "published", categoryIds: ["c1"], priceCents: 7499, level: "Beginner", weekOnePreview: { totalWeeks: 8 } };
const other = { id: "p2", name: "Powerbuilding", status: "published", categoryIds: ["c1"], priceCents: 7499, level: "Intermediate", weekOnePreview: { totalWeeks: 8 } };
const FAR = Date.now() + 30 * 86400000;

function baseCtx(over = {}) {
  const tier = over.soloTier || "free";
  const live = over.soloGatesLive ?? true;
  const hasAll = live && tier === "all_access";
  return {
    soloPrograms: [program, other],
    soloProgramsLoaded: true,
    soloProgramCategories: [category],
    soloExercises: [],
    soloCurrentUser: { id: "u1", recoveryAddon: null, onboarding: { completed: true, answers: {} } },
    soloAuthUser: { uid: "u1" },
    soloPurchases: [],
    soloEnrolments: [],
    soloTrainingPrograms: [],
    soloBranding: {},
    soloEntitlement: hasAll ? { sources: { stripe: { tier: "all_access", status: "active", expiresAt: FAR } } } : null,
    soloEntitlementReady: true,
    soloTier: tier,
    soloGatesLive: live,
    soloHasAllAccess: hasAll,
    soloAccess: { tier, live },
    soloAppDesign: {},
    startSoloCheckout: vi.fn(() => Promise.resolve({ url: "https://checkout.stripe.test/p1" })),
    confirmSoloProgramPurchase: vi.fn(() => Promise.resolve({ owned: true, programId: "p1" })),
    startSoloSubscription: vi.fn(() => Promise.resolve({})),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier })),
    openSoloBillingPortal: vi.fn(),
    switchSoloProgram: vi.fn(),
    setRecoveryAddon: vi.fn(),
    ...over,
  };
}
const ownedP1 = [{ id: "u1_p1", soloUserId: "u1", programId: "p1", refunded: false, startDate: null }];

let where;
function Where() {
  const loc = useLocation();
  where = loc.pathname + loc.search;
  return null;
}

beforeEach(async () => {
  ctx = baseCtx();
  delete window.webkit;
  const { setProgramConfirmTimingForTests } = await import("./SoloProgramDetailsScreen");
  setProgramConfirmTimingForTests?.(5, 15000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.webkit;
});

async function tree(entry) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  const { default: SoloProgramDetailsScreen } = await import("./SoloProgramDetailsScreen");
  return (
    <MemoryRouter initialEntries={[entry]}>
      <SoloThemeProvider>
        <SoloPaywallProvider>
          <Where />
          <Routes>
            <Route path="/solo/program/:id" element={<SoloProgramDetailsScreen />} />
            <Route path="/solo/home" element={<p>home-page</p>} />
          </Routes>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}
const renderProgram = async (entry = "/solo/program/p1") => render(await tree(entry));

describe("buying a single program (#186)", () => {
  it("a Free member after launch sees the program's price and pays for it through one Stripe checkout", async () => {
    await renderProgram();
    expect(screen.getByTestId("program-price").textContent).toBe("A$74.99");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    const pay = screen.getByRole("button", { name: "PAY A$74.99" });
    await act(async () => fireEvent.click(pay));
    expect(ctx.startSoloCheckout).toHaveBeenCalledWith("p1");
    // Stays busy while leaving for Stripe: a second tap starts nothing.
    const busy = screen.getByRole("button", { name: "STARTING CHECKOUT…" });
    expect(busy.disabled).toBe(true);
    await act(async () => fireEvent.click(busy));
    expect(ctx.startSoloCheckout).toHaveBeenCalledTimes(1);
  });
  it("a Plus member can buy it too, or choose All Access instead", async () => {
    ctx = baseCtx({ soloTier: "plus" });
    await renderProgram();
    expect(screen.getByTestId("program-price").textContent).toBe("A$74.99");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    expect(screen.getByRole("button", { name: "PAY A$74.99" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /or get every program with all access/i }));
    await screen.findByText("Your membership");
  });
  it("before launch, single programs are sold exactly as before", async () => {
    ctx = baseCtx({ soloGatesLive: false });
    await renderProgram();
    expect(screen.getByTestId("program-price").textContent).toBe("A$74.99");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    expect(screen.getByRole("button", { name: "PAY A$74.99" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /or get every program/i })).toBe(null);
  });
  it("the server says All Access already includes it: no checkout, said plainly", async () => {
    ctx = baseCtx({ startSoloCheckout: vi.fn(() => Promise.resolve({ includedWithAllAccess: true })) });
    await renderProgram();
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "PAY A$74.99" })));
    expect(screen.getByText(/All Access already includes this program/)).toBeTruthy();
  });
});

describe("All Access members (#186)", () => {
  it("see every program included: no price, no Pay, start it straight away", async () => {
    ctx = baseCtx({ soloTier: "all_access" });
    await renderProgram();
    expect(screen.queryByTestId("program-price")).toBe(null);
    expect(screen.getByTestId("program-access-label").textContent).toBe("Included");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    expect(screen.queryByRole("button", { name: /^PAY /})).toBe(null);
  });
  it("when All Access ends, unbought programs show their price again; a bought one stays theirs", async () => {
    ctx = baseCtx({ soloTier: "free", soloPurchases: ownedP1 });
    await renderProgram("/solo/program/p1");
    expect(screen.queryByTestId("program-price")).toBe(null);
    expect(screen.getByTestId("program-access-label").textContent).toBe("Owned");
    expect(screen.getByRole("button", { name: /go to my training/i })).toBeTruthy();
    cleanup();
    await renderProgram("/solo/program/p2");
    expect(screen.getByTestId("program-price").textContent).toBe("A$74.99");
  });
});

describe("back from Stripe (#186)", () => {
  it("paid: Confirming at once, the server confirms with Stripe, then it's theirs — and the address is cleaned", async () => {
    const view = await renderProgram("/solo/program/p1?checkout=success&session_id=cs_test_9");
    expect(screen.getByText("Confirming your purchase")).toBeTruthy();
    await waitFor(() => expect(ctx.confirmSoloProgramPurchase).toHaveBeenCalledWith("cs_test_9"));
    await waitFor(() => expect(where).toBe("/solo/program/p1"));
    // Unlocked only when the purchase reaches the account (server-written).
    expect(screen.getByText("Confirming your purchase")).toBeTruthy();
    ctx = { ...ctx, soloPurchases: ownedP1 };
    view.rerender(await tree("/solo/program/p1"));
    await screen.findByText("It's yours.");
    expect(screen.queryByText("Confirming your purchase")).toBe(null);
    expect(screen.getByRole("button", { name: /go to my training/i })).toBeTruthy();
  });
  it("the page's word alone never unlocks it: no purchase from the server, no 'It's yours'", async () => {
    ctx = baseCtx({ confirmSoloProgramPurchase: vi.fn(() => Promise.resolve({ owned: false, pending: true })) });
    await renderProgram("/solo/program/p1?checkout=success&session_id=cs_test_9");
    await waitFor(() => expect(ctx.confirmSoloProgramPurchase.mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(screen.queryByText("It's yours.")).toBe(null);
    expect(screen.queryByRole("button", { name: /go to my training/i })).toBe(null);
  });
  it("a slow confirmation never leaves them on 'Confirming': payment received, no need to pay again", async () => {
    const { setProgramConfirmTimingForTests } = await import("./SoloProgramDetailsScreen");
    setProgramConfirmTimingForTests?.(5, 60);
    ctx = baseCtx({ confirmSoloProgramPurchase: vi.fn(() => new Promise(() => {})) });
    await renderProgram("/solo/program/p1?checkout=success&session_id=cs_test_9");
    await screen.findByText("Payment received.");
    expect(screen.getByText(/No need to pay again/)).toBeTruthy();
    expect(screen.queryByText("Confirming your purchase")).toBe(null);
  });
  it("abandoned checkout: back on the program, nothing charged", async () => {
    await renderProgram("/solo/program/p1?checkout=cancelled");
    await screen.findByText("Checkout cancelled.");
    expect(screen.getByText("You haven't been charged.")).toBeTruthy();
    await waitFor(() => expect(where).toBe("/solo/program/p1"));
    expect(ctx.confirmSoloProgramPurchase).not.toHaveBeenCalled();
  });
  it("a plain visit asks nothing of the server", async () => {
    await renderProgram();
    await act(async () => {});
    expect(ctx.confirmSoloProgramPurchase).not.toHaveBeenCalled();
    expect(screen.queryByTestId("purchase-return-note")).toBe(null);
  });
});

describe("in the iPhone app (#186, 3.1.1)", () => {
  beforeEach(() => {
    window.webkit = { messageHandlers: { apexTheme: { postMessage() {} } } };
  });
  it("no price and no Pay: after launch, All Access is the way in; before launch, a neutral note", async () => {
    await renderProgram();
    expect(screen.queryByTestId("program-price")).toBe(null);
    expect(screen.getByRole("button", { name: /unlock with all access/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^PAY /})).toBe(null);
    cleanup();
    ctx = baseCtx({ soloGatesLive: false });
    await renderProgram();
    expect(screen.getByText("Not available to buy in the app")).toBeTruthy();
  });
  it("a program bought on the website is there in the app at once", async () => {
    ctx = baseCtx({ soloPurchases: ownedP1 });
    await renderProgram();
    expect(screen.getByRole("button", { name: /go to my training/i })).toBeTruthy();
  });
});

describe("Catalogue cards (#186)", () => {
  async function renderCatalogue() {
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    const { SoloPaywallProvider } = await import("./SoloPaywall");
    const { default: SoloCatalogueScreen } = await import("./SoloCatalogueScreen");
    render(
      <MemoryRouter>
        <SoloThemeProvider>
          <SoloPaywallProvider>
            <SoloCatalogueScreen />
          </SoloPaywallProvider>
        </SoloThemeProvider>
      </MemoryRouter>
    );
  }
  it("Free / Plus: each program's own price; a bought one says Owned", async () => {
    ctx = baseCtx({ soloTier: "plus", soloPurchases: ownedP1 });
    await renderCatalogue();
    expect(screen.getByText("Owned")).toBeTruthy();
    expect(screen.getAllByText("A$74.99").length).toBeGreaterThanOrEqual(1);
  });
  it("All Access: no prices, every program Included", async () => {
    ctx = baseCtx({ soloTier: "all_access" });
    await renderCatalogue();
    expect(screen.queryByText("A$74.99")).toBe(null);
    expect(screen.getAllByText("Included").length).toBeGreaterThanOrEqual(2);
  });
});
