// #211: members are never told to dig through iPhone Settings to manage a
// subscription. In the app, Manage opens Apple's own sheet; without the
// in-app bridge it goes straight to Apple's subscriptions page.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const paywall = () => readFileSync("src/solo/SoloPaywall.jsx", "utf8");

describe("Manage subscription wording (#211)", () => {
  it("no 'iPhone Settings → your name → Subscriptions' instructions anywhere in Train Solo's membership screens", () => {
    expect(paywall()).not.toMatch(/iPhone Settings/);
    expect(readFileSync("src/solo/SoloProfileScreen.jsx", "utf8")).not.toMatch(/Settings → your name/);
  });
  it("without the in-app bridge, Manage opens Apple's own subscriptions page", () => {
    const s = paywall();
    expect(s).toContain('APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions"');
    expect(s).toMatch(/else \{[\s\S]*?window\.location\.href = APPLE_SUBSCRIPTIONS_URL;/);
  });
  it("the plan small print says Manage or cancel from Profile, in the app too", () => {
    expect(paywall()).toContain('{" Manage or cancel any time from Profile."}');
  });
});
