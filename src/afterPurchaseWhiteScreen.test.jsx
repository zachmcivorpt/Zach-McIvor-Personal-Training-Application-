// @vitest-environment jsdom
//
// #161: a white screen after an iPhone purchase. The native app now loads a
// brand-new web view on the page the member was on and keeps a solid
// "Confirming your membership" screen up until that page shows a real
// screen. Covered here:
//  - "/" sends a member signed in only to Train Solo back into Train Solo
//    (a new web view, or a cold launch, opens "/"; it used to land on the
//    Coaching / Train Solo chooser and the purchase confirmation never ran),
//  - the readiness check the native app runs (taken from
//    ios/ApexCoach/ViewController.swift itself) never counts a loading
//    placeholder as ready, does count the purchase screens and real screens,
//  - SoloAppContext keeps the "signed in to Train Solo" mark in step.
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Routed } from "./App";

let mockUseApp;
vi.mock("./lib/AppContext", () => ({ useApp: () => mockUseApp(), PROFILE_CACHE_KEY: "apexProfileCache" }));
vi.mock("./coach/CoachShell", () => ({ default: () => <div>COACH_SHELL</div> }));
vi.mock("./client/ClientApp", () => ({ default: () => <div>CLIENT_APP</div> }));
vi.mock("./solo/SoloRoutes", () => ({ default: () => <div>SOLO_ROUTES</div> }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const signedOutOfCoaching = () => ({ db: { appDesign: {} }, currentUser: null, sessionLoading: false });

describe("opening the app at / (#161)", () => {
  it("signed in to Train Solo on this phone → straight into Train Solo, not the chooser", async () => {
    localStorage.setItem("apexSoloSignedIn", "1");
    mockUseApp = signedOutOfCoaching;
    render(<MemoryRouter initialEntries={["/"]}><Routed /></MemoryRouter>);
    expect(await screen.findByText("SOLO_ROUTES")).toBeTruthy();
    expect(screen.queryByText("Coaching")).toBe(null);
  });
  it("not signed in to anything → the chooser, as before", async () => {
    mockUseApp = signedOutOfCoaching;
    render(<MemoryRouter initialEntries={["/"]}><Routed /></MemoryRouter>);
    expect(await screen.findByText("Coaching")).toBeTruthy();
  });
  it("a coaching session still wins (coached app unchanged)", async () => {
    localStorage.setItem("apexSoloSignedIn", "1");
    mockUseApp = () => ({ db: { appDesign: {} }, currentUser: { id: "c1", role: "client" }, sessionLoading: false });
    render(<MemoryRouter initialEntries={["/"]}><Routed /></MemoryRouter>);
    expect(await screen.findByText("CLIENT_APP")).toBeTruthy();
  });
});

// The JavaScript the iPhone app runs to decide the page is ready, exactly as
// written in ViewController.swift (Swift's \" unescaped).
function nativeReadyCheck() {
  const swift = readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
  const appReady = swift.match(/\? "(var stage=.*?)"\n/)[1].replace(/\\"/g, '"');
  const wrapper = swift.match(/let js = "(return await new Promise.*?var el=document\.getElementById\('root'\);)" \+ check/)[1];
  return `${wrapper}${appReady}})})})`;
}
async function runCheck(html, portal = "") {
  document.body.innerHTML = `<div id="root">${html}</div>${portal}`;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  const fn = new Function(`return (async () => { ${nativeReadyCheck()} })()`);
  return fn();
}

describe("the native app's 'page is ready' check after a purchase (#161)", () => {
  it("a loading placeholder is NOT ready (it used to uncover onto a near-blank page)", async () => {
    expect(await runCheck('<div data-apex-loading=""></div>')).toBe(0);
  });
  it("an empty page is not ready", async () => {
    expect(await runCheck("")).toBe(0);
  });
  it("the Confirming screen is ready even while the account is still loading underneath", async () => {
    expect(await runCheck('<div data-apex-loading=""></div>', '<div data-testid="solo-purchase-stage"></div>')).toBeGreaterThan(0);
  });
  it("the welcome screen and any real screen are ready", async () => {
    expect(await runCheck("<main>My Training</main>", '<div data-testid="solo-welcome"></div>')).toBeGreaterThan(0);
    expect(await runCheck("<main>My Training</main>")).toBeGreaterThan(0);
  });
  it("both loading placeholders carry the marker", () => {
    expect(readFileSync("src/App.jsx", "utf8")).toMatch(/function SessionLoadingScreen[\s\S]*?data-apex-loading/);
    // Train Solo's loading screen is SoloLaunchScreen (#165).
    expect(readFileSync("src/solo/SoloRoutes.jsx", "utf8")).toMatch(/function SoloSessionLoadingScreen[\s\S]*?<SoloLaunchScreen/);
    expect(readFileSync("src/solo/SoloLaunchScreen.jsx", "utf8")).toMatch(/data-apex-loading/);
  });
});

describe("the native fix itself (ViewController.swift, #161)", () => {
  const swift = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
  it("after every purchase sheet: a solid screen at once, then a brand-new web view on the same page", () => {
    const body = swift().match(/private func purchaseSheetDidFinish\(outcome: \[String: Any\]\?\) \{[\s\S]*?\n {4}\}\n/)[0];
    expect(body).toMatch(/showPurchaseStageCover\(title: bought \? "Confirming your membership"/);
    expect(body).toMatch(/rebuildWebView\(\)/);
    // (#166: or Train Solo Home after Manage Subscriptions)
    expect(swift()).toMatch(/let resume = freshPageURL \?\? currentSitePage\(old\)[\s\S]*?loadSite\(resume\)/);
  });
  it("the old page's own reload can't uncover it, and the reveal waits for a real screen", () => {
    expect(swift()).toMatch(/purchaseCover != nil && !purchaseSheetOpen && !awaitingFreshPage/);
    expect(swift()).toMatch(/pageDrawsFrame\(appReady: true\)/);
  });
});

describe("white screen when coming back to the app (#162)", () => {
  const swift = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
  const fn = (name) => swift().match(new RegExp(`func ${name}\\([\\s\\S]*?\\n {4}\\}\\n`))[0];
  it("a page that says it's drawn is still checked visually on every return", () => {
    expect(fn("checkPageAlive")).toMatch(/if drawn \{[\s\S]*?self\.checkPageVisible\(\)/);
  });
  it("only a real screen (not a loading placeholder) that's one flat colour counts as blank; re-attach, then a new web view", () => {
    const f = fn("checkPageVisible");
    expect(f).toContain("pageDrawsFrame(appReady: true)");
    expect(f).toContain("self.pageLooksBlank");
    expect(f).toContain("self.reattachWebView()");
    expect(f).toContain("self.rebuildWebView()");
    expect(fn("isOneColour")).toMatch(/> 10/);
  });
  it("after a purchase the cover stays until the new page really shows something; then Continue, never white", () => {
    const f = fn("revealAfterPurchase");
    expect(f).toContain("self.pageLooksBlank");
    expect(f).toContain("self.retryFreshPageOrContinue()");
    // Uncovering (and the check after it) moved into uncoverAfterPurchase (#166).
    expect(f).toContain("self.uncoverAfterPurchase()");
    expect(fn("uncoverAfterPurchase")).toContain("self.verifyShownAfterPurchase(generation: self.uncoverGeneration)");
    expect(f).not.toMatch(/tries >= 12 \{[\s\S]{0,120}removePurchaseCover/);
    expect(fn("retryFreshPageOrContinue")).toMatch(/purchaseRebuilds < 2[\s\S]*rebuildWebView\(\)[\s\S]*offerContinue\(\)/);
  });
});

// #163: the #161/#162 build still went white after "Confirming your
// membership" on the owner's phone.
describe("white screen after a purchase, second fix (#163)", () => {
  const swift = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
  const fn = (name) => swift().match(new RegExp(`func ${name}\\([\\s\\S]*?\\n {4}\\}\\n`))[0];
  it("checks what's really on screen (drawHierarchy) once that's confirmed to work on the phone, else WebKit's picture", () => {
    const f = fn("pageLooksBlank");
    expect(f).toMatch(/screenPictureWorks == true, let cg = screenPicture\(\)/);
    expect(f).toContain("takeSnapshot");
    expect(fn("screenPicture")).toContain("drawHierarchy(in:");
    expect(fn("calibrateScreenPicture")).toContain("self.screenPictureWorks = !ViewController.isOneColour(cg)");
  });
  it("the fresh page is made only once the app is active again after Apple's sheet", () => {
    const body = swift().match(/private func purchaseSheetDidFinish\(outcome: \[String: Any\]\?\) \{[\s\S]*?\n {4}\}\n/)[0];
    expect(body).toMatch(/self\.whenAppActive \{[\s\S]*?self\.rebuildWebView\(\)/);
    // The 15 s limit (#183: now a helper armed on every wait) ends in Continue.
    expect(body).toContain("armContinueFallback()");
    expect(fn("armContinueFallback")).toContain("self.offerContinue()");
    expect(body).not.toContain("self.removePurchaseCover()");
  });
  it("the Continue screen opens a fresh page", () => {
    expect(fn("continueAfterPurchase")).toContain("rebuildWebView()");
    expect(fn("offerContinue")).toContain("showContinue: true");
  });
});

describe("the native purchase screen looks like the app's own (#163, owner: logo + blue line)", () => {
  const swift = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
  it("APEX mark, title, line and the thin blue line (#2F8FFF), in Train Solo's colours", () => {
    const f = swift().match(/private func showPurchaseStageCover[\s\S]*?\n {4}\}\n/)[0];
    expect(f).toContain('UIImage(named: dark ? "ApexMarkWhite" : "ApexMarkBlack")');
    expect(f).toMatch(/track\.widthAnchor\.constraint\(equalToConstant: 96\)/);
    expect(f).toMatch(/red: 47\.0 \/ 255\.0, green: 143\.0 \/ 255\.0, blue: 1/);
    expect(f).not.toContain("UIActivityIndicatorView");
  });
  it("the mark images are in the app's image catalogue", () => {
    for (const n of ["Black", "White"]) {
      const json = JSON.parse(readFileSync(`ios/ApexCoach/Assets.xcassets/ApexMark${n}.imageset/Contents.json`, "utf8"));
      expect(json.images[0].filename).toBe(`mark-${n.toLowerCase()}.png`);
    }
  });
});
