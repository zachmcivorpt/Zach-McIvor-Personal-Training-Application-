// #208: the chooser's logo is crisp and glowing with no clipped reflection
// or faint box, and both buttons are frosted glass.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const start = () => readFileSync("src/solo/StartScreen.jsx", "utf8");

describe("start chooser look (#208)", () => {
  it("uses the crisp glowing mark and no reflection", () => {
    expect(start()).toContain("<LitLogo width={200} crisp />");
    expect(start()).not.toMatch(/LitLogo[^>]*reflection/);
    expect(readFileSync("src/components/LoginHero.jsx", "utf8")).toMatch(/crisp \?[\s\S]*blur\(22px\)[\s\S]*blur\(7px\)/);
  });
  it("both buttons are frosted glass, not a solid white button", () => {
    const s = start();
    expect(s).toMatch(/data-testid="choose-coaching"/);
    expect(s).toMatch(/style=\{GLASS_STRONG\}/);
    expect(s).toMatch(/style=\{GLASS\}/);
    expect(s).not.toMatch(/className="block bg-white text-black/);
  });
  it("the APEX mark file is drawn large enough to stay sharp", () => {
    const png = readFileSync("public/brand/app-logo-dark-mountain.png");
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(1152); // IHDR width
  });
});
