// #260 (owner): Nutrition's Today / My Meal Guide switch sits clear of the
// logo (12px gap), not right under it.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("Nutrition's switch has a gap below the logo (#260)", () => {
  const s = readFileSync(new URL("./ClientApp.jsx", import.meta.url), "utf8");
  expect(s).toMatch(/<TabHeader label="Nutrition" dark=\{dark\} \/>\s*\{\/\*[^*]*\*\/\}\s*<div className="flex gap-2 px-2\.5 mt-3 mb-4" data-testid="nutrition-tab-switch">/);
});
