// #209: login area clean-up — no round halo or CSS-blurred copies behind
// the mark (iOS drew their box as a faint square), the glow is a baked
// image, and the background never shows its bottom edge as a grey strip.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hero = () => readFileSync("src/components/LoginHero.jsx", "utf8");

describe("login area clean-up (#209)", () => {
  it("no radial halo and no CSS blur on the mark; the glow is the baked image", () => {
    expect(hero()).not.toMatch(/radial-gradient/);
    expect(hero()).not.toMatch(/filter: "blur/);
    expect(hero()).toMatch(/MOUNTAIN_GLOW = "\/brand\/app-logo-mountain-glow\.png"/);
    expect(readFileSync("public/brand/app-logo-mountain-glow.png").readUInt32BE(16)).toBeGreaterThan(0);
  });
  it("every log-in screen uses the crisp glowing mark", () => {
    expect(readFileSync("src/auth/LoginScreen.jsx", "utf8")).toContain("<LitLogo width={104} crisp />");
    expect(readFileSync("src/solo/SoloLoginScreen.jsx", "utf8")).toContain("<LitLogo width={104} crisp />");
  });
  it("the background is a little taller than the screen, pinned to the top and clipped", () => {
    const bg = readFileSync("src/components/LoginBackground.jsx", "utf8");
    expect(bg).toMatch(/MEDIA_BOX = "absolute top-0 left-0 w-full h-\[103%\] object-top"/);
    expect(bg).toMatch(/fixed inset-0 pointer-events-none overflow-hidden/);
  });
  it("the mark has a new file name, so phones don't keep the old one with the faint box", () => {
    expect(readFileSync("src/lib/appLogo.js", "utf8")).toContain('"/brand/app-logo-dark-mountain-v2.png"');
  });
});
