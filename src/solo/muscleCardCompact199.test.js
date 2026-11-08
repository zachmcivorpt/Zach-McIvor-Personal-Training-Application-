// #199: the 3D map's muscle card is compact and nearly as wide as the panel.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./SoloMuscleMap.jsx", import.meta.url), "utf8");
describe("muscle card (#199)", () => {
  it("spans the panel (8px in) with tight padding and one-line labels", () => {
    expect(s).toMatch(/className="relative -mt-6 -mx-3 rounded-\[22px\] px-4 py-3"/);
    expect(s).toMatch(/text-\[18px\] font-bold leading-tight tabular-nums/);
    expect(s).toMatch(/uppercase whitespace-nowrap/);
    expect(s).toMatch(/>Est\. max kg</);
    expect(s).not.toMatch(/text-\[22px\] font-bold/);
  });
});
