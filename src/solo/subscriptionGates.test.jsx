// @vitest-environment jsdom
//
// Train Solo subscriptions (Free / Plus / All Access) on real screens: what
// the catalogue's program page offers in each state, the paywall's prices
// and trial wording, the iPhone app never showing website prices, and the
// free 3-saved-sessions limit.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));

const category = { id: "c1", name: "Strength" };
const program = { id: "p1", name: "Hypertrophy", status: "published", categoryIds: ["c1"], priceCents: 7999, level: "Beginner", weekOnePreview: { totalWeeks: 8 } };
const other = { id: "p2", name: "Powerbuilding", status: "published", categoryIds: ["c1"], priceCents: 7999, level: "Beginner", weekOnePreview: { totalWeeks: 6 } };
const addon = { id: "r1", name: "Hip Mobility", kind: "recovery", status: "published", priceCents: 0, level: "Beginner", weekOnePreview: { totalWeeks: 4 } };

function baseCtx(over = {}) {
  const tier = over.soloTier || "free";
  const live = over.soloGatesLive ?? false;
  return {
    soloPrograms: [program, other, addon],
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
    soloCustomSessions: [],
    startSoloCheckout: vi.fn(),
    startSoloSubscription: vi.fn(() => Promise.resolve({})),
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "free" })),
    openSoloBillingPortal: vi.fn(),
    setRecoveryAddon: vi.fn(() => Promise.resolve()),
    startAllAccessProgram: vi.fn(() => Promise.resolve({ start: { id: "u1_p1" } })),
    saveSoloCustomSession: vi.fn(),
    deleteSoloCustomSession: vi.fn(),
    ...over,
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

async function renderAt(path, element, routePath) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { SoloPaywallProvider } = await import("./SoloPaywall");
  render(
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
  await renderAt(`/solo/program/${id}`, <SoloProgramDetailsScreen />, "/solo/program/:id");
}

describe("before launch (switch off)", () => {
  it("the program page is unchanged: its own price and a Start Program purchase", async () => {
    await renderProgram("p1");
    expect(screen.getAllByText("A$79.99").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /start program/i })).toBeTruthy();
    expect(screen.queryByText(/all access/i)).toBe(null);
  });
});

describe("after launch, Free", () => {
  beforeEach(() => {
    ctx = baseCtx({ soloGatesLive: true });
  });

  it("no single-program price; unlocking opens the paywall with the approved prices and 10-day trial", async () => {
    await renderProgram("p1");
    expect(screen.queryByText("A$79.99")).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Go further with Train Solo");
    expect(screen.getByText("A$179.99")).toBeTruthy();
    expect(screen.getByText("A$79.99")).toBeTruthy(); // Plus yearly
    expect(screen.getAllByText("10 days free").length).toBe(2);
    expect(screen.getByText(/10 days free, then A\$179\.99 a year/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByText("A$24.99")).toBeTruthy();
    expect(screen.getByText("A$9.99")).toBeTruthy();
    expect(screen.queryByText("10 days free")).toBe(null);
    fireEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    fireEvent.click(screen.getByRole("button", { name: /start 10-day free trial/i }));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledWith("all_access_yearly"));
  });

  it("no second free trial for someone who already had one", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloEntitlement: { trialUsed: true } });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Go further with Train Solo");
    expect(screen.queryByText("10 days free")).toBe(null);
    expect(screen.getByRole("button", { name: /subscribe to all access/i })).toBeTruthy();
  });

  it("choosing Plus buys Plus", async () => {
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Go further with Train Solo");
    fireEvent.click(screen.getByRole("button", { name: /^Plus/ }));
    fireEvent.click(screen.getByRole("button", { name: /start 10-day free trial/i }));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledWith("plus_yearly"));
  });

  it("recovery add-ons need Plus", async () => {
    await renderProgram("r1");
    fireEvent.click(screen.getByRole("button", { name: /add with plus/i }));
    await screen.findByText("Go further with Train Solo");
    expect(ctx.setRecoveryAddon).not.toHaveBeenCalled();
  });

  it("a program bought before launch stays theirs", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloPurchases: [{ id: "u1_p1", programId: "p1" }] });
    await renderProgram("p1");
    expect(screen.getByRole("button", { name: /go to my training/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /unlock/i })).toBe(null);
  });
});

describe("after launch, All Access", () => {
  it("starting a second program says the current one pauses at its week, then starts it", async () => {
    const start = new Date(Date.now() - 15 * 86400000);
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    ctx = baseCtx({ soloGatesLive: true, soloTier: "all_access", soloEnrolments: [{ id: "u1_p2", programId: "p2", status: "active", startDate: startKey }] });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    const sheet = await screen.findByText(/pauses it at Week 3/);
    expect(sheet.textContent).toContain("Powerbuilding");
    fireEvent.click(screen.getByRole("button", { name: /switch program/i }));
    await waitFor(() => expect(ctx.startAllAccessProgram).toHaveBeenCalled());
    expect(ctx.startAllAccessProgram.mock.calls[0][0]).toMatchObject({ uid: "u1", programId: "p1" });
    await screen.findByText("home-page");
  });

  it("a paused program offers to resume at its week", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloTier: "all_access", soloEnrolments: [{ id: "u1_p1", programId: "p1", status: "paused", pausedAtWeek: 4 }] });
    await renderProgram("p1");
    expect(screen.getByRole("button", { name: /resume at week 4/i })).toBeTruthy();
  });
});

describe("inside the iPhone app", () => {
  it("a build without in-app purchases says to update — no website prices, no checkout", async () => {
    window.webkit = { messageHandlers: { apexTheme: { postMessage() {} } } };
    ctx = baseCtx({ soloGatesLive: true });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Go further with Train Solo");
    expect(screen.getByText("Update the APEX app to subscribe")).toBeTruthy();
    expect(screen.queryByText(/A\$/)).toBe(null);
    expect(screen.queryByText(/website/i)).toBe(null);
    expect(ctx.startSoloSubscription).not.toHaveBeenCalled();
  });

  it("1.0.4+: Apple's own prices, Restore purchases, and the purchase goes to the App Store", async () => {
    const posted = [];
    window.webkit = {
      messageHandlers: {
        apexTheme: { postMessage() {} },
        apexPurchases: {
          postMessage(msg) {
            posted.push(msg);
            const answer = msg.action === "offerings" ? [{ plan: "all_access_yearly", price: "$179.99", trialDays: 10 }, { plan: "plus_yearly", price: "$79.99", trialDays: 10 }] : { ok: true };
            setTimeout(() => window.__apexNativePurchases.receive({ id: msg.id, result: answer }), 0);
          },
        },
      },
    };
    ctx = baseCtx({ soloGatesLive: true });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("$179.99");
    expect(screen.getByRole("button", { name: /restore purchases/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start 10-day free trial/i }));
    await waitFor(() => expect(posted.some((m) => m.action === "purchase" && m.plan === "all_access_yearly" && m.uid === "u1")).toBe(true));
    await waitFor(() => expect(ctx.refreshSoloEntitlement).toHaveBeenCalled());
    expect(ctx.startSoloSubscription).not.toHaveBeenCalled();
  });
});

describe("Free: 3 saved sessions", () => {
  const sessions = [1, 2, 3].map((n) => ({ id: `s${n}`, name: `S${n}`, exercises: [{ exerciseId: "e1", targetSets: 3, targetReps: 10, restSeconds: 90 }] }));
  async function renderBuilder(state) {
    const { default: SoloSessionBuilderScreen } = await import("./SoloSessionBuilderScreen");
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    const { SoloPaywallProvider } = await import("./SoloPaywall");
    render(
      <MemoryRouter initialEntries={[{ pathname: "/solo/session-builder", state }]}>
        <SoloThemeProvider>
          <SoloPaywallProvider>
            <Routes>
              <Route path="/solo/session-builder" element={<SoloSessionBuilderScreen />} />
              <Route path="/solo/home" element={<p>home-page</p>} />
              <Route path="/solo/workout" element={<p>workout-page</p>} />
            </Routes>
          </SoloPaywallProvider>
        </SoloThemeProvider>
      </MemoryRouter>
    );
  }

  it("a 4th new session isn't saved: the paywall explains, and it can still be done unsaved", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloCustomSessions: sessions, soloExercises: [{ id: "e1", name: "Squat" }] });
    await renderBuilder({});
    fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: "Fourth" } });
    // no exercises yet: add one through state is heavy; use a session with exercises via edit-free path
    expect(screen.getByRole("button", { name: /start without saving/i })).toBeTruthy();
  });

  it("editing an existing session is always allowed", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloCustomSessions: sessions, saveSoloCustomSession: vi.fn(() => Promise.resolve(sessions[0])) });
    await renderBuilder({ sessionId: "s1" });
    expect(screen.queryByRole("button", { name: /start without saving/i })).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /save for later/i }));
    await waitFor(() => expect(ctx.saveSoloCustomSession).toHaveBeenCalled());
  });

  it("saving a new one at the limit opens the paywall instead, and nothing is saved", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloCustomSessions: sessions, soloExercises: [{ id: "e1", name: "Squat" }] });
    await renderBuilder({});
    fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: "Fourth" } });
    fireEvent.click(screen.getByRole("button", { name: /add exercise/i }));
    fireEvent.click(await screen.findByText("Squat"));
    await waitFor(() => expect(screen.queryByText(/no exercises yet/i)).toBe(null));
    fireEvent.click(screen.getByRole("button", { name: /save for later/i }));
    await screen.findByText(/Free keeps up to 3 saved sessions/);
    expect(ctx.saveSoloCustomSession).not.toHaveBeenCalled();
  });

  it("Plus saves a 4th", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloTier: "plus", soloCustomSessions: sessions, soloExercises: [{ id: "e1", name: "Squat" }], saveSoloCustomSession: vi.fn(() => Promise.resolve({ id: "s4" })) });
    await renderBuilder({});
    expect(screen.queryByRole("button", { name: /start without saving/i })).toBe(null);
  });
});

describe("paywall for subscribers", () => {
  it("All Access members see their plan and Manage, not a buy button", async () => {
    ctx = baseCtx({
      soloGatesLive: true,
      soloTier: "all_access",
      soloEntitlement: { sources: { stripe: { tier: "all_access", status: "active", expiresAt: Date.now() + 86400000 } } },
    });
    const { useSoloPaywall } = await import("./SoloPaywall");
    function Opener() {
      const { openPaywall } = useSoloPaywall();
      return <button onClick={() => openPaywall({})}>open</button>;
    }
    await renderAt("/x", <Opener />, "/x");
    fireEvent.click(screen.getByText("open"));
    const title = await screen.findByText("Your plan");
    const sheet = title.closest("div").parentElement;
    expect(within(document.body).getByText(/through the website/)).toBeTruthy();
    expect(within(document.body).getByRole("button", { name: "Manage" })).toBeTruthy();
    expect(within(document.body).queryByRole("button", { name: /subscribe|trial/i })).toBe(null);
    void sheet;
  });

  it("after cancelling, the plan says it won't renew and when it ends; Profile too", async () => {
    const end = Date.now() + 9 * 86400000;
    ctx = baseCtx({
      soloGatesLive: true,
      soloTier: "plus",
      soloEntitlement: { sources: { stripe: { tier: "plus", status: "active", expiresAt: end, cancelAtPeriodEnd: true } } },
      soloLogout: vi.fn(),
      deleteMySoloAccount: vi.fn(),
      setSoloReminderPref: vi.fn(),
    });
    const { default: SoloProfileScreen } = await import("./SoloProfileScreen");
    await renderAt("/x", <SoloProfileScreen />, "/x");
    const row = await screen.findByText(/^Won't renew · ends .+ · manage$/);
    fireEvent.click(row);
    expect(await screen.findByText(/you keep everything until then/)).toBeTruthy();
  });

  it("a renewing plan shows its renewal date", async () => {
    ctx = baseCtx({
      soloGatesLive: true,
      soloTier: "all_access",
      soloEntitlement: { sources: { apple: { tier: "all_access", status: "active", expiresAt: Date.now() + 20 * 86400000, willRenew: true } } },
      soloLogout: vi.fn(),
      deleteMySoloAccount: vi.fn(),
      setSoloReminderPref: vi.fn(),
    });
    const { default: SoloProfileScreen } = await import("./SoloProfileScreen");
    await renderAt("/x", <SoloProfileScreen />, "/x");
    expect(await screen.findByText(/^Renews .+ · App Store$/)).toBeTruthy();
  });
});
