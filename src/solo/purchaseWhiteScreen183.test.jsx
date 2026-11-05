// @vitest-environment jsdom
//
// #183 White screen after a successful purchase in the iPhone app.
//
// 1. The "is the page really showing?" checks after Apple's sheet used
//    WebKit's own picture whenever the screen picture hadn't been confirmed
//    earlier in that launch — and WebKit's picture shows the page even when
//    the screen is white (#163). Now confirmed just before Apple's sheet,
//    while "Opening the App Store" is on screen.
// 2. The fresh page learned about the purchase only from the old page's own
//    code, which WebKit had frozen: it opened with no Confirming / Welcome.
//    Now the iPhone app hands Apple's answer to the fresh page itself.
// 3. After the cover came off the page was checked once (1.2 s); the welcome
//    comes later. Now three times.
// 4. Every step is recorded on the phone (Profile → Purchase log, test
//    accounts) so a device report says which step failed.
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.setConfig({ testTimeout: 20000 });

const vc = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
const bridge = () => readFileSync("ios/ApexCoach/PurchasesBridge.swift", "utf8");
const fn = (src, name) => src.match(new RegExp(`(?:private |static )*func ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n {4}\\}\\n`))[0];

// The JavaScript the iPhone app injects into the fresh page, taken from the
// Swift itself, with Swift's interpolations filled in.
function injectedScript(outcome, nonce = "nonce-1") {
  const body = fn(vc(), "outcomeScript");
  const literal = body.match(/return "([\s\S]*)"\n/)[1];
  return literal.replace("\\(json)", JSON.stringify(outcome)).replace("\\(nonce)", nonce);
}

describe("the screen check is trusted after Apple's sheet (#183)", () => {
  it("is confirmed just before the sheet, while 'Opening the App Store' is on screen", () => {
    const cover = fn(vc(), "coverPageForPurchase");
    expect(cover.indexOf("calibrateBeforeSheet()")).toBeGreaterThan(-1);
    expect(cover.indexOf("calibrateBeforeSheet()")).toBeLessThan(cover.indexOf("takeSnapshot"));
  });
  it("only a picture that shows something proves it; a flat picture never turns the check off", () => {
    const cal = fn(vc(), "calibrateBeforeSheet");
    expect(cal).toMatch(/screenPictureWorks != true, let cg = screenPicture\(\), !ViewController\.isOneColour\(cg\)/);
    expect(cal).toMatch(/screenPictureWorks = true/);
    expect(cal).not.toMatch(/screenPictureWorks = false/);
  });
  it("every blank check still goes through the screen picture once it's confirmed", () => {
    expect(fn(vc(), "pageLooksBlank")).toMatch(/screenPictureWorks == true, let cg = screenPicture\(\)/);
  });
});

describe("Apple's answer goes to the fresh page directly (#183)", () => {
  it("the purchase sheet hands over what Apple answered, with the plan's tier", () => {
    const b = bridge();
    expect(b).toMatch(/var sheetFinished: \(\(\[String: Any\]\) -> Void\)\?/);
    expect(b).toMatch(/plan\.hasPrefix\("all_access"\) \? "all_access" : "plus"/);
    expect(b).toMatch(/outcome\["cancelled"\] = true/);
    expect(b).toMatch(/outcome\["error"\] = PurchasesBridge\.message\(for: error\)/);
    expect(b).toMatch(/outcome\["ok"\] = true/);
    expect(b).toMatch(/self\.sheetFinished\?\(outcome\)/);
    expect(vc()).toMatch(/purchases\.sheetFinished = \{ \[weak self\] outcome in self\?\.purchaseSheetDidFinish\(outcome: outcome\) \}/);
  });
  it("kept until the fresh page has shown it, injected before the page's code runs, then removed", () => {
    expect(fn(vc(), "purchaseSheetDidFinish")).toMatch(/pendingOutcomeJSON = json/);
    const rebuild = fn(vc(), "rebuildWebView");
    expect(rebuild).toMatch(/if let json = pendingOutcomeJSON[\s\S]*addUserScript\([\s\S]*outcomeScript\(json\), injectionTime: \.atDocumentStart, forMainFrameOnly: true/);
    expect(rebuild.indexOf("addUserScript")).toBeLessThan(rebuild.indexOf("webView = makeWebView(config)"));
    const remove = fn(vc(), "removePurchaseCover");
    expect(remove).toMatch(/pendingOutcomeJSON = nil/);
    expect(remove).toMatch(/removeAllUserScripts\(\)/);
    // A new sheet starts clean; Manage Subscriptions has no purchase answer.
    expect(fn(vc(), "coverPageForPurchase")).toMatch(/pendingOutcomeJSON = nil/);
    expect(fn(vc(), "manageSheetDidFinish")).toMatch(/purchaseSheetDidFinish\(outcome: nil\)/);
  });
  it("a payment waiting for approval is said plainly", () => {
    const m = fn(bridge(), "message");
    expect(m).toMatch(/ErrorCode\.paymentPendingError\.rawValue/);
    expect(m).toMatch(/waiting for approval/);
  });

  describe("the injected script (run as the fresh page would)", () => {
    beforeEach(() => localStorage.clear());
    it("puts Apple's answer where the page looks for it, timed now", () => {
      new Function(injectedScript({ ok: true, tier: "plus" }))();
      const saved = JSON.parse(localStorage.getItem("apexSoloPurchaseOutcome"));
      expect(saved).toMatchObject({ ok: true, tier: "plus" });
      expect(Date.now() - saved.at).toBeLessThan(1000);
    });
    it("replaces a stale answer the frozen old page left (e.g. an earlier cancel)", () => {
      localStorage.setItem("apexSoloPurchaseOutcome", JSON.stringify({ cancelled: true, tier: "plus", at: Date.now() }));
      new Function(injectedScript({ ok: true, tier: "all_access" }))();
      expect(JSON.parse(localStorage.getItem("apexSoloPurchaseOutcome"))).toMatchObject({ ok: true, tier: "all_access" });
    });
    it("only once per purchase: a later load after the page finished with it doesn't bring it back", () => {
      new Function(injectedScript({ ok: true, tier: "plus" }, "n-42"))();
      localStorage.removeItem("apexSoloPurchaseOutcome"); // the page's flow finished
      new Function(injectedScript({ ok: true, tier: "plus" }, "n-42"))();
      expect(localStorage.getItem("apexSoloPurchaseOutcome")).toBe(null);
    });
  });
});

describe("after the cover comes off (#183)", () => {
  it("the page is checked at 1.2 s, 3 s and 6 s, each for this uncover only", () => {
    const v = fn(vc(), "verifyShownAfterPurchase");
    expect(v).toMatch(/for delay in \[1\.2, 3\.0, 6\.0\]/);
    expect(v).toMatch(/self\.uncoverGeneration == generation/);
    expect(v).toMatch(/guard blank else \{ return \}[\s\S]*showPurchaseStageCover[\s\S]*revealAfterPurchase\(tries: 1\)/);
    // Checks that keep disagreeing can't cover and uncover in a loop: twice, then Continue.
    expect(v).toMatch(/if self\.verifyRecoveries >= 2 \{ return self\.offerContinue\(\) \}\s*\n\s*self\.verifyRecoveries \+= 1/);
    expect(fn(vc(), "coverPageForPurchase")).toMatch(/verifyRecoveries = 0/);
    expect(fn(vc(), "continueAfterPurchase")).toMatch(/verifyRecoveries = 0/);
    expect(fn(vc(), "uncoverAfterPurchase")).toMatch(/self\.uncoverGeneration \+= 1\s*\n\s*self\.verifyShownAfterPurchase\(generation: self\.uncoverGeneration\)/);
  });
});

describe("every step is recorded on the phone (#183)", () => {
  it("from the sheet to the cover coming off, including every check's answer and which check was used", () => {
    expect(fn(vc(), "coverPageForPurchase")).toMatch(/PurchaseTrace\.start\(/);
    for (const name of ["purchaseSheetDidFinish", "rebuildWebView", "revealAfterPurchase", "uncoverAfterPurchase", "retryFreshPageOrContinue", "offerContinue", "verifyShownAfterPurchase"]) {
      expect(fn(vc(), name), name).toMatch(/PurchaseTrace\.log\(/);
    }
    expect(fn(vc(), "revealAfterPurchase")).toMatch(/screen blank \\\(blank\) \(\\\(self\.pictureCheckName\)\)/);
    expect(bridge()).toMatch(/case "trace":\s*\n\s*reply\(id, result: PurchaseTrace\.lines\(\)\)/);
  });
});

// The web half, end to end: the old page never saved the result (WebKit
// froze it); the fresh page gets it from the iPhone app and goes Confirming →
// Welcome → Start training → Train Solo Home.
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));

function baseCtx(over = {}) {
  return {
    soloAuthUser: { uid: "u1" },
    soloCurrentUser: { id: "u1" },
    soloBranding: {},
    soloEntitlement: null,
    soloEntitlementReady: true,
    soloTier: "free",
    soloGatesLive: true,
    soloAccess: { tier: "free", live: true },
    refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "plus" })),
    ...over,
  };
}

let where;
function Where() {
  where = useLocation().pathname;
  return null;
}

describe("the fresh page after a purchase whose old page never saved the result", () => {
  beforeEach(async () => {
    localStorage.clear();
    ctx = baseCtx();
    window.webkit = { messageHandlers: { apexPurchases: { postMessage: () => {} } } };
    const { setPurchaseRecheckMsForTests } = await import("./SoloPaywall");
    setPurchaseRecheckMsForTests(5);
  });
  afterEach(() => {
    cleanup();
    delete window.webkit;
  });

  async function openFreshPage(path) {
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    const { SoloPaywallProvider } = await import("./SoloPaywall");
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SoloThemeProvider>
          <SoloPaywallProvider>
            <Where />
            <Routes>
              <Route path="/solo/program/:id" element={<p>program-page</p>} />
              <Route path="/solo/home" element={<p>home-page</p>} />
            </Routes>
          </SoloPaywallProvider>
        </SoloThemeProvider>
      </MemoryRouter>
    );
  }

  it("Confirming at once, then the welcome for the plan the server confirms, then Train Solo Home", async () => {
    new Function(injectedScript({ ok: true, tier: "plus" }))();
    await openFreshPage("/solo/program/p1");
    expect(screen.getByText("Confirming your membership")).toBeTruthy();
    await screen.findByTestId("solo-welcome");
    expect(ctx.refreshSoloEntitlement).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start training/i }));
    await waitFor(() => expect(where).toBe("/solo/home"));
    expect(screen.queryByTestId("solo-welcome")).toBe(null);
    expect(localStorage.getItem("apexSoloPurchaseOutcome")).toBe(null);
  });

  it("a slow sandbox confirmation: keeps asking, and says so honestly if it still hasn't arrived — never a blank page", async () => {
    ctx = baseCtx({ refreshSoloEntitlement: vi.fn(() => Promise.resolve({ tier: "free" })) });
    new Function(injectedScript({ ok: true, tier: "plus" }))();
    await openFreshPage("/solo/home");
    expect(screen.getByText("Confirming your membership")).toBeTruthy();
    await screen.findByText(/hasn't reached your account yet/);
    expect(ctx.refreshSoloEntitlement.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("home-page")).toBeTruthy();
  });

  it("a payment waiting for approval opens the membership sheet saying so", async () => {
    new Function(injectedScript({ error: "Your purchase is waiting for approval. Your membership starts as soon as it's approved.", tier: "plus" }))();
    await openFreshPage("/solo/home");
    await screen.findByText(/waiting for approval/);
    expect(screen.queryByText("Confirming your membership")).toBe(null);
  });

  it("a cancel shows the page as it was, with nothing left over", async () => {
    new Function(injectedScript({ cancelled: true, tier: "plus" }))();
    await openFreshPage("/solo/home");
    await act(async () => {});
    expect(screen.getByText("home-page")).toBeTruthy();
    expect(screen.queryByText("Confirming your membership")).toBe(null);
    expect(localStorage.getItem("apexSoloPurchaseOutcome")).toBe(null);
  });
});
