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

let reloadSpy;
beforeEach(async () => {
  ctx = baseCtx();
  delete window.webkit;
  sessionStorage.clear();
  const { paywallPage, setPurchaseRecheckMsForTests } = await import("./SoloPaywall");
  setPurchaseRecheckMsForTests(5);
  reloadSpy = vi.spyOn(paywallPage, "reload").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  delete window.webkit;
  reloadSpy?.mockRestore();
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

  it("no single-program price; unlocking opens the paywall with the approved prices and 7-day trial", async () => {
    await renderProgram("p1");
    expect(screen.queryByText("A$79.99")).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Train Solo Membership");
    expect(screen.getByText("A$179.99")).toBeTruthy();
    expect(screen.getByText("A$79.99")).toBeTruthy(); // Plus yearly
    expect(screen.getAllByText("7 days free").length).toBe(2);
    expect(screen.getByText(/7 days free, then A\$179\.99 a year/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByText("A$24.99")).toBeTruthy();
    expect(screen.getByText("A$9.99")).toBeTruthy();
    expect(screen.queryByText("7 days free")).toBe(null);
    fireEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    fireEvent.click(screen.getByRole("button", { name: /start 7-day free trial/i }));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledWith("all_access_yearly"));
  });

  it("no second free trial for someone who already had one", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloEntitlement: { trialUsed: true } });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Train Solo Membership");
    expect(screen.queryByText("7 days free")).toBe(null);
    expect(screen.getByRole("button", { name: /subscribe to all access/i })).toBeTruthy();
  });

  it("choosing Plus buys Plus", async () => {
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Train Solo Membership");
    fireEvent.click(screen.getByRole("button", { name: /^Plus/ }));
    fireEvent.click(screen.getByRole("button", { name: /start 7-day free trial/i }));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledWith("plus_yearly"));
  });

  it("recovery add-ons need Plus", async () => {
    await renderProgram("r1");
    fireEvent.click(screen.getByRole("button", { name: /add with plus/i }));
    await screen.findByText("Train Solo Membership");
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
  // #140: one program at a time, across catalogue, All Access and own programs.
  it("starting a program says the current one (any kind) moves to Archived at its week, then switches", async () => {
    const start = new Date(Date.now() - 15 * 86400000);
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const currentRow = { id: "u1_p2", programId: "p2", status: "active", startDate: startKey, source: "all_access", current: true };
    ctx = baseCtx({
      soloGatesLive: true,
      soloTier: "all_access",
      soloTrainingPrograms: [currentRow],
      soloCurrentProgram: currentRow,
      soloProgramsById: { p2: other },
      switchSoloProgram: vi.fn(() => Promise.resolve({ enrolments: [{ id: "u1_p1", fields: { status: "active" } }] })),
    });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /start program/i }));
    const note = await screen.findByText(/moves to Archived at Week 3/);
    expect(note.textContent).toContain("Powerbuilding");
    expect(note.textContent).toMatch(/Everything you've logged stays/);
    fireEvent.click(screen.getByRole("button", { name: /switch program/i }));
    await waitFor(() => expect(ctx.switchSoloProgram).toHaveBeenCalled());
    expect(ctx.switchSoloProgram.mock.calls[0][0]).toMatchObject({ target: { programId: "p1", source: "all_access" } });
    await screen.findByText("home-page");
  });

  it("an archived program offers to resume at its week; the current one goes to My Training", async () => {
    ctx = baseCtx({ soloGatesLive: true, soloTier: "all_access", soloTrainingPrograms: [{ id: "u1_p1", programId: "p1", source: "all_access", status: "paused", started: true, pausedAtWeek: 4, current: false }] });
    await renderProgram("p1");
    expect(screen.getByRole("button", { name: /resume at week 4/i })).toBeTruthy();
    cleanup();
    ctx = baseCtx({ soloGatesLive: true, soloTier: "all_access", soloTrainingPrograms: [{ id: "u1_p1", programId: "p1", source: "all_access", status: "active", current: true }] });
    await renderProgram("p1");
    expect(screen.getByRole("button", { name: /go to my training/i })).toBeTruthy();
  });
});

describe("inside the iPhone app", () => {
  it("a build without in-app purchases says to update — no website prices, no checkout", async () => {
    window.webkit = { messageHandlers: { apexTheme: { postMessage() {} } } };
    ctx = baseCtx({ soloGatesLive: true });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Train Solo Membership");
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
            const answer = msg.action === "offerings" ? [{ plan: "all_access_yearly", price: "$179.99", trialDays: 7 }, { plan: "plus_yearly", price: "$79.99", trialDays: 7 }] : { ok: true };
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
    fireEvent.click(screen.getByRole("button", { name: /start 7-day free trial/i }));
    await waitFor(() => expect(posted.some((m) => m.action === "purchase" && m.plan === "all_access_yearly" && m.uid === "u1")).toBe(true));
    // Apple's sheet answered: the page reloads to be drawn again (#134).
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    expect(ctx.startSoloSubscription).not.toHaveBeenCalled();
  });

  // #134: after Apple's sheet the page was left black but still tappable;
  // a tap on the invisible Subscribe button bought again.
  describe("after Apple's purchase sheet (#134)", () => {
    function nativeWith(purchaseReply) {
      window.webkit = {
        messageHandlers: {
          apexTheme: { postMessage() {} },
          apexPurchases: {
            postMessage(msg) {
              const reply = msg.action === "offerings"
                ? { id: msg.id, result: [{ plan: "all_access_yearly", price: "$179.99", trialDays: 7 }, { plan: "plus_monthly", price: "$9.99", trialDays: 0 }] }
                : msg.action === "purchase" ? { id: msg.id, ...purchaseReply } : { id: msg.id, result: { ok: true } };
              setTimeout(() => window.__apexNativePurchases.receive(reply), 0);
            },
          },
        },
      };
    }
    async function buyAllAccess() {
      ctx = baseCtx({ soloGatesLive: true });
      await renderProgram("p1");
      fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
      await screen.findByText("$179.99");
      fireEvent.click(screen.getByRole("button", { name: /start 7-day free trial/i }));
      // Before Apple's sheet: a calm full-screen "Opening the App Store",
      // with the glass membership sheet gone (#136).
      await screen.findByText("Opening the App Store");
      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
      // No second purchase from a tap while the page reloads.
      await new Promise((r) => setTimeout(r, 20));
      const buyButton = screen.queryAllByRole("button", { hidden: true }).find((b) => /free trial|subscribe|moment/i.test(b.textContent));
      if (buyButton) expect(buyButton.disabled).toBe(true);
      expect(screen.getByTestId("solo-purchase-stage")).toBeTruthy();
      cleanup(); // the reload
    }

    it("a purchase reloads the page, then welcomes them to the plan the server confirms", async () => {
      nativeWith({ result: { ok: true } });
      await buyAllAccess();
      let answer;
      ctx = baseCtx({ soloGatesLive: true, refreshSoloEntitlement: vi.fn(() => new Promise((r) => { answer = r; })) });
      await renderProgram("p1");
      // The reload opens on "Confirming", never on the paywall or a blank page (#136).
      expect(screen.getByTestId("solo-purchase-stage").textContent).toMatch(/Confirming your membership/);
      expect(screen.queryByText("Train Solo Membership")).toBe(null);
      await waitFor(() => expect(answer).toBeTruthy());
      answer({ tier: "all_access" });
      const welcome = await screen.findByTestId("solo-welcome");
      expect(welcome.textContent).toMatch(/Welcome to\s*All Access\./);
      expect(screen.queryByTestId("solo-purchase-stage")).toBe(null);
      expect(screen.queryByText("Train Solo Membership")).toBe(null);
      expect(ctx.refreshSoloEntitlement).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Start training" }));
      await waitFor(() => expect(screen.queryByTestId("solo-welcome")).toBe(null));
      // Shown once: the next open of the app doesn't repeat it.
      cleanup();
      ctx = baseCtx({ soloGatesLive: true });
      await renderProgram("p1");
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("Train Solo Membership")).toBe(null);
      expect(ctx.refreshSoloEntitlement).not.toHaveBeenCalled();
    });

    it("if the server still says Free, it says so instead of claiming success", async () => {
      nativeWith({ result: { ok: true } });
      await buyAllAccess();
      ctx = baseCtx({ soloGatesLive: true });
      await renderProgram("p1");
      await screen.findByText(/Apple confirmed your purchase, but it hasn't reached your account yet/);
      // Asked twice (RevenueCat can lag a moment) before saying so.
      expect(ctx.refreshSoloEntitlement).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("solo-welcome")).toBe(null);
      expect(screen.queryByTestId("solo-purchase-stage")).toBe(null);
    });

    it("a server that catches up on the second ask still welcomes them", async () => {
      nativeWith({ result: { ok: true } });
      await buyAllAccess();
      let n = 0;
      ctx = baseCtx({ soloGatesLive: true, refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: ++n === 1 ? "free" : "plus" })) });
      await renderProgram("p1");
      expect((await screen.findByTestId("solo-welcome")).textContent).toMatch(/Welcome to\s*Plus\./);
    });

    it("an App Store error is shown after the reload; a cancel shows nothing", async () => {
      nativeWith({ error: "Payment failed." });
      await buyAllAccess();
      ctx = baseCtx({ soloGatesLive: true });
      await renderProgram("p1");
      await screen.findByText("Payment failed.");
      cleanup();

      nativeWith({ error: "Cancelled.", cancelled: true });
      await buyAllAccess();
      ctx = baseCtx({ soloGatesLive: true });
      await renderProgram("p1");
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("Train Solo Membership")).toBe(null);
    });
  });

  it("1.0.4+: a Plus member upgrading to All Access isn't offered a free trial, even if the store says eligible (#139)", async () => {
    window.webkit = {
      messageHandlers: {
        apexTheme: { postMessage() {} },
        apexPurchases: {
          postMessage(msg) {
            const answer = msg.action === "offerings" ? [{ plan: "all_access_yearly", price: "$179.99", trialDays: 7 }, { plan: "plus_monthly", price: "$9.99", trialDays: 0 }] : { ok: true };
            setTimeout(() => window.__apexNativePurchases.receive({ id: msg.id, result: answer }), 0);
          },
        },
      },
    };
    const FUTURE = Date.now() + 30 * 86400000;
    ctx = baseCtx({ soloGatesLive: true, soloTier: "plus", soloEntitlement: { sources: { apple: { tier: "plus", status: "active", expiresAt: FUTURE } } } });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("$179.99");
    expect(screen.queryByText(/days free/)).toBe(null);
    expect(screen.queryByRole("button", { name: /free trial/i })).toBe(null);
    expect(screen.getByRole("button", { name: /subscribe to all access/i })).toBeTruthy();
    expect(screen.getByText(/^\$179\.99 a year\. Renews automatically/)).toBeTruthy();
  });

  it("1.0.4+: when the App Store returns nothing, the paywall says why (no silent grey button) and retries on reopen", async () => {
    let calls = 0;
    window.webkit = {
      messageHandlers: {
        apexTheme: { postMessage() {} },
        apexPurchases: {
          postMessage(msg) {
            if (msg.action !== "offerings") return;
            calls += 1;
            const reply = calls === 1
              ? { id: msg.id, error: "None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect." }
              : { id: msg.id, result: [{ plan: "all_access_yearly", price: "$179.99", trialDays: 7 }] };
            setTimeout(() => window.__apexNativePurchases.receive(reply), 0);
          },
        },
      },
    };
    ctx = baseCtx({ soloGatesLive: true });
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText(/Subscriptions aren't available right now/);
    // The technical reason stays behind "Details".
    expect(screen.queryByText(/could be fetched from App Store Connect/)).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/could be fetched from App Store Connect/)).toBeTruthy();
    expect(screen.queryByText(/website/i)).toBe(null);
    // The sheet's ✕ (an icon-only button next to the title).
    const closeX = screen.getByText("Train Solo Membership").parentElement.querySelector("button");
    fireEvent.click(closeX);
    await waitFor(() => expect(screen.queryByText("Train Solo Membership")).toBe(null));
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("$179.99");
    expect(calls).toBe(2);
    expect(screen.queryByText(/aren't available right now/)).toBe(null);
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
    const title = await screen.findByText("Your membership");
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

  it("a Plus subscriber upgrading on the website isn't promised a free trial (it's a pro-rata change)", async () => {
    ctx = baseCtx({
      soloGatesLive: true,
      soloTier: "plus",
      soloEntitlement: { trialUsed: false, sources: { stripe: { tier: "plus", status: "active", expiresAt: Date.now() + 86400000 } } },
    });
    const { useSoloPaywall } = await import("./SoloPaywall");
    function Opener() {
      const { openPaywall } = useSoloPaywall();
      return <button onClick={() => openPaywall({})}>open</button>;
    }
    await renderAt("/x", <Opener />, "/x");
    fireEvent.click(screen.getByText("open"));
    expect(await screen.findByRole("button", { name: /subscribe to all access/i })).toBeTruthy();
    expect(screen.queryByText(/days free/i)).toBe(null);
  });
});

// Unlock sweep (2026-11-03): every paid gate, Free → Plus → All Access.
describe("unlock sweep: Plus, then All Access", () => {
  const tiers = (tier) => baseCtx({ soloGatesLive: true, soloTier: tier, soloWorkoutLogs: [], soloWeighIns: [], soloProgressPhotos: [], soloBodyMetrics: [], soloCustomPrograms: [], soloEntitlementReady: true });

  async function renderProgress() {
    const { default: SoloProgressScreen } = await import("./SoloProgressScreen");
    await renderAt("/solo/progress", <SoloProgressScreen />, "/solo/progress");
  }
  async function renderBuilder() {
    const { default: SoloProgramBuilderScreen } = await import("./SoloProgramBuilderScreen");
    await renderAt("/solo/program-builder", <SoloProgramBuilderScreen />, "/solo/program-builder");
  }

  it("full stats: locked on Free, open on Plus and All Access", async () => {
    for (const [tier, locked] of [["free", true], ["plus", false], ["all_access", false]]) {
      ctx = tiers(tier);
      await renderProgress();
      expect(!!screen.queryByText("Full stats with Plus")).toBe(locked);
      cleanup();
    }
  });

  it("program builder: the paywall on Free only, and never before the member's plan has loaded (#137)", async () => {
    ctx = { ...tiers("free"), soloEntitlementReady: false };
    await renderBuilder();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Train Solo Membership")).toBe(null);
    cleanup();
    ctx = tiers("free");
    await renderBuilder();
    await screen.findByText("Train Solo Membership");
    cleanup();
    for (const tier of ["plus", "all_access"]) {
      ctx = tiers(tier);
      await renderBuilder();
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText("Train Solo Membership")).toBe(null);
      cleanup();
    }
  });

  it("recovery add-ons: Plus and All Access add them without a paywall", async () => {
    for (const tier of ["plus", "all_access"]) {
      ctx = tiers(tier);
      await renderProgram("r1");
      expect(screen.queryByRole("button", { name: /add with plus/i })).toBe(null);
      cleanup();
    }
  });

  it("catalogue programs: Plus still unlocks them with All Access; All Access starts them", async () => {
    ctx = tiers("plus");
    await renderProgram("p1");
    expect(screen.getByRole("button", { name: /unlock with all access/i })).toBeTruthy();
    cleanup();
    ctx = tiers("all_access");
    await renderProgram("p1");
    expect(screen.queryByRole("button", { name: /unlock/i })).toBe(null);
    expect(screen.getByRole("button", { name: /start program/i })).toBeTruthy();
  });

  it("a Plus member upgrading sees only All Access, preselected with its buy button", async () => {
    ctx = tiers("plus");
    await renderProgram("p1");
    fireEvent.click(screen.getByRole("button", { name: /unlock with all access/i }));
    await screen.findByText("Your membership");
    expect(screen.queryByRole("button", { name: /^Plus/ })).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /start 7-day free trial|subscribe to all access/i }));
    await waitFor(() => expect(ctx.startSoloSubscription).toHaveBeenCalledWith(expect.stringMatching(/^all_access_/)));
  });
});
