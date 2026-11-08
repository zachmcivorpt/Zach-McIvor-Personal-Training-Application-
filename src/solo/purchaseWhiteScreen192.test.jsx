// #192 White screen after "Confirming your purchase" in the iPhone app.
//
// After Apple's sheet the iPhone app takes its cover off as soon as the page
// draws "Confirming your purchase", then looked at the screen only at 1.2,
// 3 and 6 s. The page goes on to "It's yours" / the welcome / "Purchase
// received" when the server confirms (up to ~10 s), and then to My Training:
// a page that stopped being drawn at any of those moments was left white.
// Now: looked at until 20 s, and every screen change in the minute after a
// purchase is looked at too. Loading placeholders (data-apex-loading) are
// allowed to be plain and are never mistaken for a white page.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vc = () => readFileSync("ios/ApexCoach/ViewController.swift", "utf8");
const fn = (src, name) => src.match(new RegExp(`(?:private |static )*func ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n {4}\\}\\n`))[0];

describe("after the purchase cover comes off (#192)", () => {
  it("the screen is looked at until 20 s, past the server's confirmation", () => {
    const v = fn(vc(), "verifyShownAfterPurchase");
    const delays = v.match(/for delay in \[([^\]]+)\]/)[1].split(",").map(Number);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(20);
    expect(delays).toEqual(expect.arrayContaining([1.2, 3, 6, 10, 15, 20]));
  });

  it("every screen change in the minute after a purchase is looked at too", () => {
    expect(fn(vc(), "uncoverAfterPurchase")).toMatch(/self\.lastUncoverAt = Date\(\)/);
    const handler = fn(vc(), "userContentController");
    expect(handler).toMatch(
      /if let at = lastUncoverAt, Date\(\)\.timeIntervalSince\(at\) < 60, purchaseCover == nil \{[\s\S]*checkShownAfterPurchase\(generation: generation, label: "new screen"\)/
    );
    // Train Solo reports every route change through apexTheme.
    const theme = readFileSync("src/solo/SoloThemeContext.jsx", "utf8");
    expect(theme).toMatch(/apexTheme\?\.postMessage[\s\S]*\}, \[dark, pathname, fullBleed\]\);/);
  });

  it("a white screen found then brings the cover back and shows the page again (twice at most, then Continue)", () => {
    const check = fn(vc(), "checkShownAfterPurchase");
    expect(check).toMatch(/pageLooksBlank[\s\S]*recoverIfBlankAfterPurchase\(blank, generation: generation, label: label\)/);
    const r = fn(vc(), "recoverIfBlankAfterPurchase");
    expect(r).toMatch(/guard blank else \{ return \}\s*\n\s*uncoverGeneration \+= 1\s*\n\s*showPurchaseStageCover/);
    expect(r).toMatch(/if verifyRecoveries >= 2 \{ return offerContinue\(\) \}/);
    expect(r).toMatch(/armContinueFallback\(\)\s*\n\s*wakeWebKit\(\)\s*\n\s*revealAfterPurchase\(tries: 1\)/);
    expect(r).toMatch(/PurchaseTrace\.log\(/);
  });

  it("a loading placeholder is never mistaken for a white page", () => {
    const check = fn(vc(), "checkShownAfterPurchase");
    expect(check).toMatch(/evaluateJavaScript\("!!document\.querySelector\('\[data-apex-loading\]'\)"\)[\s\S]*== true \{[\s\S]*return\s*\n\s*\}[\s\S]*pageLooksBlank/);
    // The plain holding screens the page can show then are marked.
    expect(readFileSync("src/solo/SoloProgramDetailsScreen.jsx", "utf8")).toMatch(
      /if \(!program && !soloProgramsLoaded\) \{[\s\S]*?data-apex-loading=""[\s\S]*?\{confirmingStage\}/
    );
    expect(readFileSync("src/ErrorBoundary.jsx", "utf8")).toMatch(/if \(this\.state\.recovering\) \{[\s\S]*?data-apex-loading=""/);
  });
});
