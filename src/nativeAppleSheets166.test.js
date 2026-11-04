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
    expect(body).toMatch(/purchaseSheetDidFinish\(bought: false\)/);
    expect(body).toMatch(/freshPageURL = siteURL\.appendingPathComponent\("solo\/home"\)/);
    expect(fn(vc(), "rebuildWebView")).toMatch(/let resume = freshPageURL \?\? currentSitePage\(old\)/);
    // Cleared once shown, and by a purchase (which reopens the page they were on).
    expect(fn(vc(), "removePurchaseCover")).toMatch(/freshPageURL = nil/);
    expect(fn(vc(), "purchaseSheetDidFinish")).toMatch(/freshPageURL = nil/);
  });
});

describe("waking WebKit (what leaving and reopening the app did)", () => {
  it("posts the window scene's background → foreground notifications WebKit listens for", () => {
    const body = fn(vc(), "wakeWebKit");
    expect(body).toMatch(/webView\?\.window\?\.windowScene/);
    expect(body).toMatch(/UIScene\.didEnterBackgroundNotification, object: scene[\s\S]*UIScene\.willEnterForegroundNotification, object: scene/);
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
