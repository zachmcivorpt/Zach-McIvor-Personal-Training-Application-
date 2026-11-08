// #201: the suggested program's name on its card is small and at most two lines.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./SoloCatalogueScreen.jsx", import.meta.url), "utf8");
describe("catalogue match card (#201)", () => {
  it("name is 17px and clamped to two lines", () => {
    expect(s).toMatch(/text-\[17px\] font-extrabold uppercase leading-\[1\.1\] line-clamp-2">\{p\.name\}/);
    expect(s).not.toMatch(/text-\[24px\] font-extrabold uppercase/);
  });
});
