// @vitest-environment jsdom
//
// #191 Single programs bought in the iPhone app: Apple's own price for a
// program with an App Store product, Buy → "Opening the App Store" → Apple's
// sheet → reload → "Confirming your purchase" → the program's page, "It's
// yours" once the server has recorded it. No product → no price (as before).
import React from "react";
import { readFileSync } from "node:fs";
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

function baseCtx(over = {}) {
  const tier = over.soloTier || "free";
  const live = over.soloGatesLive ?? true;
  return {
    soloPrograms: [program, other],
    soloProgramsLoaded: true,
    soloProgramCategories: [category],
    soloExercises: [],
    soloCurrentUser: { id: "u1", onboarding: { completed: true, answers: {} } },
    soloAuthUser: { uid: "u1" },
    soloPurchases: [],
    soloEnrolments: [],
    soloTrainingPrograms: [],
    soloBranding: {},
    soloEntitlement: null,
    soloEntitlementReady: true,
    soloTier: tier,
    soloGatesLive: live,
    soloHasAllAccess: live && tier === "all_access",
    soloAccess: { tier, live },
    soloAppDesign: {},
    startSoloCheckout: vi.fn(),
    confirmSoloProgramPurchase: vi.fn(),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier })),
    switchSoloProgram: vi.fn(),
    setRecoveryAddon: vi.fn(),
    ...over,
  };
}

let posted;
let reloadSpy;
function iphoneApp(prices = [{ programId: "p1", price: "A$79.99" }]) {
  posted = [];
  window.webkit = {
    messageHandlers: {
      apexTheme: { postMessage() {} },
      apexPurchases: {
        postMessage(msg) {
          posted.push(msg);
          const answer = msg.action === "programPrices" ? { result: prices.filter((p) => msg.programIds.includes(p.programId)) } : msg.action === "buyProgram" ? { result: { ok: true } } : { result: [] };
          setTimeout(() => window.__apexNativePurchases.receive({ id: msg.id, ...answer }), 0);
        },
      },
    },
  };
}

let where;
function Where() {
  const loc = useLocation();
  where = loc.pathname;
  return null;
}

beforeEach(async () => {
  ctx = baseCtx();
  localStorage.clear();
  const { paywallPage, setPurchaseRecheckMsForTests, setProgramConfirmTriesForTests } = await import("./SoloPaywall");
  setPurchaseRecheckMsForTests(5);
  setProgramConfirmTriesForTests?.(2);
  reloadSpy = vi.spyOn(paywallPage, "reload").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  delete window.webkit;
  reloadSpy?.mockRestore();
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

describe("buying a single program in the iPhone app (#191)", () => {
  it("shows Apple's own price and buys it through Apple's sheet, then reloads to show the outcome", async () => {
    iphoneApp();
    render(await tree("/solo/program/p1"));
    expect((await screen.findByTestId("program-price")).textContent).toBe("A$79.99");
    expect(posted.find((m) => m.action === "programPrices").programIds).toEqual(["p1"]);
    fireEvent.click(screen.getByRole("button", { name: /buy · a\$79\.99/i }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "BUY · A$79.99" })));
    expect(screen.getByText("Opening the App Store")).toBeTruthy();
    await waitFor(() => expect(posted.some((m) => m.action === "buyProgram" && m.programId === "p1" && m.uid === "u1")).toBe(true));
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem("apexSoloPurchaseOutcome"))).toMatchObject({ ok: true, kind: "program", programId: "p1" });
  });
  it("no App Store product for this program: no price, as before", async () => {
    iphoneApp([]);
    ctx = baseCtx({ soloGatesLive: false });
    render(await tree("/solo/program/p1"));
    await act(async () => {});
    expect(screen.queryByTestId("program-price")).toBe(null);
    expect(screen.getByText("Not available to buy in the app")).toBeTruthy();
  });
  it("All Access or already owned: never offered", async () => {
    iphoneApp();
    ctx = baseCtx({ soloTier: "all_access" });
    render(await tree("/solo/program/p1"));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /buy ·/i })).toBe(null);
    expect(posted.some((m) => m.action === "programPrices")).toBe(false);
  });
});

describe("after Apple's sheet: the reloaded page (#191)", () => {
  it("'Confirming your purchase' until the server records it, then the program's page says it's yours", async () => {
    iphoneApp();
    localStorage.setItem("apexSoloPurchaseOutcome", JSON.stringify({ ok: true, kind: "program", programId: "p1", at: Date.now() }));
    const view = render(await tree("/solo/home"));
    expect(screen.getByText("Confirming your purchase")).toBeTruthy();
    await waitFor(() => expect(ctx.refreshSoloEntitlement).toHaveBeenCalled());
    // The server's purchase record arrives (syncApple → soloPurchases).
    ctx = { ...ctx, soloPurchases: [{ id: "u1_p1", soloUserId: "u1", programId: "p1", refunded: false }] };
    view.rerender(await tree("/solo/home"));
    await waitFor(() => expect(where).toBe("/solo/program/p1"));
    await screen.findByText("It's yours.");
    expect(screen.queryByText("Confirming your purchase")).toBe(null);
    expect(localStorage.getItem("apexSoloPurchaseOutcome")).toBe(null);
  });
  it("not on the account yet after the checks: says so on the program's page, never asks to buy again", async () => {
    iphoneApp();
    localStorage.setItem("apexSoloPurchaseOutcome", JSON.stringify({ ok: true, kind: "program", programId: "p1", at: Date.now() }));
    render(await tree("/solo/home"));
    await screen.findByText("Purchase received.");
    expect(where).toBe("/solo/program/p1");
    expect(screen.getByText(/Restore purchases/)).toBeTruthy();
  });
  it("Apple refused it: the program's page says why", async () => {
    iphoneApp();
    localStorage.setItem("apexSoloPurchaseOutcome", JSON.stringify({ error: "Your purchase is waiting for approval. Your membership starts as soon as it's approved.", kind: "program", programId: "p1", at: Date.now() }));
    render(await tree("/solo/home"));
    await screen.findByText("The purchase didn't go through.");
    expect(screen.getByText(/waiting for approval/)).toBeTruthy();
  });
  it("cancelled on Apple's sheet: nothing shown, nothing left over", async () => {
    iphoneApp();
    localStorage.setItem("apexSoloPurchaseOutcome", JSON.stringify({ cancelled: true, kind: "program", programId: "p1", at: Date.now() }));
    render(await tree("/solo/home"));
    await act(async () => {});
    expect(screen.getByText("home-page")).toBeTruthy();
    expect(localStorage.getItem("apexSoloPurchaseOutcome")).toBe(null);
  });
});

describe("Catalogue in the iPhone app (#191)", () => {
  it("Apple's price on a program with a product; none on one without", async () => {
    iphoneApp([{ programId: "p1", price: "A$79.99" }]);
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
    await screen.findAllByText("A$79.99");
    expect(screen.queryByText("A$74.99")).toBe(null); // never the website's price
  });
});

describe("the iPhone side (PurchasesBridge.swift, #191)", () => {
  const bridge = () => readFileSync("ios/ApexCoach/PurchasesBridge.swift", "utf8");
  it("prices and buys apex_solo_program_<id> products, with the same cover and hand-back as a membership", () => {
    const b = bridge();
    expect(b).toMatch(/static let programPrefix = "apex_solo_program_"/);
    expect(b).toMatch(/case "programPrices":[\s\S]*case "buyProgram":/);
    expect(b).toMatch(/Purchases\.shared\.getProducts\(ids\)/);
    expect(b).toMatch(/Purchases\.shared\.purchase\(product: product\)/);
    expect(b).toMatch(/var outcome: \[String: Any\] = \["kind": "program", "programId": programId\]/);
    expect(b).toMatch(/if let cover = self\.coverPageForSheet \{ cover\(showSheet\) \}/);
    expect(readFileSync("ios/ApexCoach/ViewController.swift", "utf8")).toMatch(/isProgram \? "Confirming your purchase" : "Confirming your membership"/);
  });
});
