import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SOLO_THEMES } from "./SoloThemeContext";

const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Train Solo tab headers (#174)", () => {
  it("the logo is built into the code, not a file the iPhone app can come up empty on", () => {
    expect(SOLO_THEMES.light.logo).toMatch(/^data:image\/png;base64,/);
    expect(SOLO_THEMES.dark.logo).toMatch(/^data:image\/png;base64,/);
  });

  it("all five tabs use the same header (logo, then one title size and position)", () => {
    for (const [file, title] of [
      ["./SoloMyTrainingScreen.jsx", /title=\{firstName \? `Welcome, \$\{firstName\}` : "Welcome"\}/],
      ["./SoloProgressScreen.jsx", /title="Progress"/],
      ["./SoloCalendarScreen.jsx", /title="Calendar"/],
      ["./SoloCatalogueScreen.jsx", /title="Catalogue"/],
      ["./SoloProfileScreen.jsx", /title="Profile"/],
    ]) {
      const s = src(file);
      expect(s, file).toMatch(/<SoloPageHeader/);
      expect(s, file).toMatch(title);
      expect(s, file).not.toMatch(/<h1/);
    }
  });

  it("Welcome is on My Training only, not the Catalogue", () => {
    expect(src("./SoloCatalogueScreen.jsx")).not.toMatch(/Welcome/);
  });
});

describe("Train Solo header spacing (#176)", () => {
  it("logo → title and title → first section are tight", () => {
    const ui = src("./SoloUI.jsx");
    expect(ui).toMatch(/px-3 pt-3 pb-1\.5 \$\{className\}/);
    expect(ui).toMatch(/mt-1\.5 flex items-start/);
    // #203: no visible page titles (screen readers only).
    expect(ui).toMatch(/<h1 className="sr-only">\{title\}<\/h1>/);
    const mt = src("./SoloMyTrainingScreen.jsx");
    expect(mt).toMatch(/max-w-md mx-auto px-3 pb-10">/);
    // #203: the day ("Today, 8th November") sits where the month was, same font.
    expect(mt).toMatch(/<p className="text-sm font-semibold">\{dayHeading\(selectedKey, todayKey\)\}<\/p>/);
    expect(mt).not.toMatch(/\{heading\}<\/h2>/);
  });
});
