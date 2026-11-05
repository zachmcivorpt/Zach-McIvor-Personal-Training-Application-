// #166: after cancelling in Apple's Manage Subscriptions sheet the app was a
// white screen; after a purchase the page stayed white until the member left
// the app and came back. The page was there but WebKit had stopped drawing
// it: Apple's sheets freeze it, and only "the app came back to the front"
// unfreezes it (WebKit ApplicationStateTracker → _applicationWillEnterForeground).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vc = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
const bridge = () => readFileSync("ios/ApexCoach/PurchasesBridge.swift", "utf8");
const fn = (src, name) => src.match(new RegExp(`private func ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n {4}\\}\\n`))[0];

describe("Apple's Manage Subscriptions sheet (cancelling)", () => {
  it("covers the page before the sheet and hands over to the app when it closes (it had no protection)", () => {
    const manage = bridge().match(/case "manage":[\s\S]*?default:/)[0];
    expect(manage).toMatch(/coverPageForSheet[\s\S]*?cover\(show\)/);
    expect(manage).toMatch(/showManageSubscriptions[\s\S]*?self\.manageSheetFinished\?\(\)/);
    expect(vc()).toMatch(/purchases\.manageSheetFinished = \{ \[weak self\] in self\?\.manageSheetDidFinish\(\) \}/);
  });

  it("then a fresh page on Train Solo Home, revealed only once really drawn", () => {
    const body = fn(vc(), "manageSheetDidFinish");
    expect(body).toMatch(/purchaseSheetDidFinish\(outcome: nil\)/);
    expect(body).toMatch(/freshPageURL = siteURL\.appendingPathComponent\("solo\/home"\)/);
    expect(fn(vc(), "rebuildWebView")).toMatch(/let resume = freshPageURL \?\? currentSitePage\(old\)/);
    // Cleared once shown, and by a purchase (which reopens the page they were on).
    expect(fn(vc(), "removePurchaseCover")).toMatch(/freshPageURL = nil/);
    expect(fn(vc(), "purchaseSheetDidFinish")).toMatch(/freshPageURL = nil/);
  });
});

describe("waking WebKit (what leaving and reopening the app did)", () => {
  it("posts only 'came to the front' — never a fake 'entered background', which froze the whole app black (#173)", () => {
    const body = fn(vc(), "wakeWebKit");
    expect(body).toMatch(/wv\.window\?\.windowScene/);
    expect(body).toMatch(/UIScene\.willEnterForegroundNotification, object: scene/);
    // Nowhere in the app: a fake background signal is heard by all of UIKit.
    expect(vc()).not.toMatch(/didEnterBackgroundNotification|willResignActiveNotification/);
  });

  it("also nudges the web view's size and asks the page to repaint (#173)", () => {
    const body = fn(vc(), "wakeWebKit");
    expect(body).toMatch(/bottom\.constant = constant - 1[\s\S]*layoutIfNeeded[\s\S]*bottom\.constant = constant/);
    expect(body).toMatch(/evaluateJavaScript\(/);
  });

  it("wakes the page as the purchase cover comes off and twice just after (#173)", () => {
    const body = fn(vc(), "uncoverAfterPurchase");
    expect(body).toMatch(/self\.wakeWebKit\(\)\s*\n(\s*PurchaseTrace\.log\([^\n]*\)\s*\n)?\s*self\.removePurchaseCover\(\)/);
    expect(body).toMatch(/\[0\.5, 1\.5\][\s\S]*wakeWebKit/);
  });

  it("runs before every 'is it drawn?' decision after Apple's sheets, and before replacing a blank page on return", () => {
    const reveal = fn(vc(), "revealAfterPurchase");
    expect(reveal).toMatch(/if tries == 0 \{ wakeWebKit\(\) \}/);
    // A blank page is woken and checked again before another rebuild.
    expect(reveal).toMatch(/if blank \{[\s\S]*?self\.wakeWebKit\(\)[\s\S]*?stillBlank[\s\S]*?retryFreshPageOrContinue/);
    expect(fn(vc(), "verifyShownAfterPurchase")).toMatch(/self\.wakeWebKit\(\)/);
    expect(fn(vc(), "checkPageVisible")).toMatch(/self\.wakeWebKit\(\)\s*\n\s*self\.reattachWebView\(\)/);
  });
});

describe("Apple's sheet still up after a cancel (#175, #177)", () => {
  it("a fresh page is made once the app is active and Apple's sheet is no longer on screen", () => {
    const body = fn(vc(), "whenAppActive");
    expect(body).toMatch(/applicationState == \.active && sheetGone/);
    // A dismissed, windowless controller left presented doesn't count (#177).
    expect(body).toMatch(/sheet == nil \|\| sheet\?\.view\.window == nil \|\| sheet\?\.isBeingDismissed == true/);
  });

  it("the Continue fallback is armed when the sheet closes, never only after the fresh page (#177: One moment stuck)", () => {
    const body = fn(vc(), "purchaseSheetDidFinish");
    // The 15s limit (a helper since #183) ends in Continue…
    expect(fn(vc(), "armContinueFallback")).toMatch(/asyncAfter\(deadline: \.now\(\) \+ 15\)[\s\S]*self\.awaitingFreshPage = false\s*\n\s*self\.offerContinue\(\)/);
    // …and is armed straight away, not nested inside the wait for the app / sheet.
    const wait = body.slice(body.indexOf("self.whenAppActive"), body.indexOf("armContinueFallback()"));
    expect(wait).toMatch(/self\.rebuildWebView\(\)\s*\n\s*\}\s*\n\s*\}\s*\n\s*\}/);
  });

  it("uncovering never waits on presentedViewController (it could wait for good)", () => {
    expect(fn(vc(), "uncoverAfterPurchase")).not.toMatch(/presentedViewController/);
  });
});
