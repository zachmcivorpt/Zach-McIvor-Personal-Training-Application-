// #153: after Apple's purchase sheet the reloaded page could stay undrawn
// (white) until the app was left and reopened. The native app must
// re-attach the web view and check the page drew a frame before taking
// the purchase cover off, and load it fresh once if it didn't.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const swift = readFileSync(new URL("../ios/ApexCoach/ViewController.swift", import.meta.url), "utf8");
const fn = (name) => {
  const start = swift.indexOf(`func ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = swift.indexOf("\n    func ", start + 10);
  const nextPrivate = swift.indexOf("\n    private func ", start + 10);
  const ends = [next, nextPrivate].filter((i) => i > -1);
  return swift.slice(start, ends.length ? Math.min(...ends) : undefined);
};

describe("revealing the page after Apple's purchase sheet", () => {
  it("didFinish reveals through the check, not a fixed timer that just removes the cover", () => {
    const didFinish = swift.slice(swift.indexOf("func webView(_ webView: WKWebView, didFinish"), swift.indexOf("@objc private func handleFCMToken"));
    expect(didFinish).toContain("self.revealAfterPurchase()");
    expect(didFinish).not.toContain("self.removePurchaseCover()");
  });

  it("re-attaches the web view, keeps its constraints, and waits for a drawn frame", () => {
    const reveal = fn("revealAfterPurchase");
    expect(reveal).toContain("webView.removeFromSuperview()");
    expect(reveal).toContain("view.insertSubview(webView, at: 0)");
    expect(reveal).toContain("pinWebView()");
    expect(reveal).toContain("bringSubviewToFront(cover)");
    expect(reveal).toMatch(/callAsyncJavaScript\(js/);
    expect(reveal).toContain("requestAnimationFrame");
    expect(reveal).toContain("self.removePurchaseCover()");
    // Edge-to-edge and the keyboard inset survive the re-attach.
    const pin = fn("pinWebView");
    expect(pin).toContain("isEdgeToEdge ? webViewTopConstraintEdgeToEdge : webViewTopConstraint");
    expect(pin).toContain("constant: bottomInset");
  });

  it("no drawn frame: loads the page fresh once, then gives up showing the cover", () => {
    const failed = fn("pageDidNotDraw");
    expect(failed).toContain("loadSite()");
    expect(failed).toMatch(/purchaseRevealAttempts <= 1/);
    expect(failed).toContain("removePurchaseCover()");
  });
});
