// #172: `answers || {}` made a new object on every render, so memos that
// depend on the questionnaire answers (the catalogue's recommendations)
// recomputed every time. Train Solo uses one frozen NO_ANSWERS instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["src/solo/SoloCatalogueScreen.jsx", "src/solo/SoloFirstSessionScreen.jsx", "src/solo/onboarding/SoloOnboarding.jsx"];

describe("questionnaire answers fall back to one stable object", () => {
  for (const f of files) {
    it(f, () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/onboarding\?\.answers \|\| \{\}/);
      expect(src).toMatch(/onboarding\?\.answers \|\| NO_ANSWERS/);
      expect(src).toMatch(/const NO_ANSWERS = Object\.freeze\(\{\}\)/);
    });
  }
});
