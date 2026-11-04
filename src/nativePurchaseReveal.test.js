// #153 / #154: iOS can leave the page undrawn (a white screen with all its
// content there) after Apple's purchase sheet, or any time the app comes
// back. The native app checks for a drawn frame, re-attaches the web view,
// and as a last resort swaps in a brand-new web view (what closing the app
// did). These read the Swift, which can't be compiled here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const swift = readFileSync(new URL("../ios/ApexCoach/ViewController.swift", import.meta.url), "utf8");
const fn = (name) => {
  const start = swift.search(new RegExp(`func ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = swift.slice(start + 10);
  const next = rest.search(/\n    (@objc )?(private )?func /);
  return swift.slice(start, next > -1 ? start + 10 + next : undefined);
};

describe("a drawn frame, not just content", () => {
  it("pageDrawsFrame waits for two animation frames and content, with a time limit", () => {
    const f = fn("pageDrawsFrame");
    expect(f).toMatch(/callAsyncJavaScript\(js/);
    expect(f).toContain("requestAnimationFrame(function(){requestAnimationFrame");
    expect(f).toContain("childElementCount");
    expect(f).toContain("done(false)");
    expect(f).toMatch(/asyncAfter\(deadline: \.now\(\) \+ timeout/);
  });

  it("coming back to the app: no frame → re-attach → still none → a brand-new web view (#154)", () => {
    const f = fn("checkPageAlive");
    expect(f).toContain("pageDrawsFrame");
    expect(f.indexOf("reattachWebView()")).toBeGreaterThan(-1);
    expect(f.indexOf("rebuildWebView()")).toBeGreaterThan(f.indexOf("reattachWebView()"));
    expect(f).not.toContain("evaluateJavaScript"); // the old content-only check
  });

  it("a brand-new web view keeps the same configuration (sign-in, storage), settings and layout", () => {
    const f = fn("rebuildWebView");
    expect(f).toContain("let config = old.configuration");
    expect(f).toContain("webView = makeWebView(config)");
    expect(f).toContain("old.removeFromSuperview()");
    expect(f).toContain("pinWebView()");
    expect(f).toContain("bringSubviewToFront(cover)");
    // ...on the page the member was on, not the front page (#161).
    expect(f).toContain("let resume = freshPageURL ?? currentSitePage(old)");
    expect(f).toContain("loadSite(resume)");
    const make = fn("makeWebView");
    for (const s of ["navigationDelegate = self", "uiDelegate = self", "health.webView = wv", "purchases.webView = wv", "contentInsetAdjustmentBehavior = .never"]) expect(make).toContain(s);
    expect(swift).toContain("webView = makeWebView(config)");
  });
});

describe("after Apple's purchase sheet", () => {
  it("didFinish reveals through the check, never by just removing the cover on a timer", () => {
    const didFinish = swift.slice(swift.indexOf("func webView(_ webView: WKWebView, didFinish"), swift.indexOf("@objc private func handleFCMToken"));
    expect(didFinish).toContain("self.revealAfterPurchase()");
    expect(didFinish).not.toContain("self.removePurchaseCover()");
  });

  // #161 (replaces #153/#154's re-attach-then-check, which still left a
  // white page on TestFlight): after every sheet a solid screen, a brand-new
  // web view, and the screen comes off only once the new page shows a real
  // screen (never a loading placeholder), retried for ~10s.
  it("waits for a real screen on the brand-new page, then the cover comes off", () => {
    const f = fn("revealAfterPurchase");
    expect(f).toContain("pageDrawsFrame(appReady: true)");
    // Uncovering moved into uncoverAfterPurchase (#166).
    expect(f).toContain("self.uncoverAfterPurchase()");
    expect(swift.match(/private func uncoverAfterPurchase\(\) \{[\s\S]*?\n {4}\}\n/)[0]).toContain("self.removePurchaseCover()");
    expect(f).toContain("self.revealAfterPurchase(tries: tries + 1)");
    expect(f).not.toContain("reattachWebView()");
    const done = fn("purchaseSheetDidFinish");
    expect(done).toContain("showPurchaseStageCover(");
    expect(done).toContain("self.rebuildWebView()");
  });

  it("re-attaching keeps edge-to-edge, the keyboard inset and the cover on top", () => {
    const pin = fn("pinWebView");
    expect(pin).toContain("isEdgeToEdge ? webViewTopConstraintEdgeToEdge : webViewTopConstraint");
    expect(pin).toContain("constant: bottomInset");
    const re = fn("reattachWebView");
    expect(re).toContain("view.insertSubview(webView, at: 0)");
    expect(re).toContain("bringSubviewToFront(cover)");
  });
});
