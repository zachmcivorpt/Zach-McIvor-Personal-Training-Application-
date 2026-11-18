// @vitest-environment jsdom
// #301 (owner: "exact same style of design with Train Solo only"): Train
// Solo's boxes are the same frosted glass as the coached client app's
// (#299 / #300): see-through fill, a top-down sheen, a lit rim, a wide soft
// shadow and a 26px blur with saturation (+ the -webkit- copy for iOS), in
// both of Train Solo's themes; the shared Card widgets inside Train Solo get
// it through .solo-glass-scope.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { soloGlass, soloGlassVars, SOLO_THEMES } from "./SoloThemeContext";

describe("Train Solo frosted glass (#301)", () => {
  for (const mode of ["light", "dark"]) {
    it(`${mode}: soloGlass has the see-through fill, sheen, lit rim, shadow and blur`, () => {
      const g = soloGlass(SOLO_THEMES[mode]);
      expect(g.backgroundColor).toMatch(/rgba\(.*,\s*0\.5\d*\)/);
      expect(g.backgroundImage).toMatch(/^linear-gradient\(180deg/);
      expect(g.boxShadow).toMatch(/inset 0 1px 0 rgba\(255,255,255/);
      expect(g.border).toMatch(/^1px solid rgba\(255,255,255/);
      expect(g.backdropFilter).toBe("blur(26px) saturate(170%)");
      expect(g.WebkitBackdropFilter).toBe(g.backdropFilter);
      const v = soloGlassVars(SOLO_THEMES[mode]);
      expect(v["--solo-glass-image"]).toBe(g.backgroundImage);
      expect(v["--solo-glass-shadow"]).toBe(g.boxShadow);
    });
  }
  it("the shared Card widgets inside Train Solo get the same sheen, shadow and blur", () => {
    const css = fs.readFileSync("src/index.css", "utf8");
    const rule = css.slice(css.indexOf(".solo-glass-scope .rounded-xl.border"), css.indexOf(".solo-glass-inner"));
    expect(rule).toMatch(/background-image: var\(--solo-glass-image\)/);
    expect(rule).toMatch(/box-shadow: var\(--solo-glass-shadow\)/);
    expect(rule).toMatch(/-webkit-backdrop-filter: blur\(26px\) saturate\(170%\)/);
  });
});
