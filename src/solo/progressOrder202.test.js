// #202: Progress opens with the muscle map, then Strength Personal Bests;
// the Estimated Max chart is gone.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
const s = readFileSync(new URL("./SoloProgressScreen.jsx", import.meta.url), "utf8");
describe("Progress order (#202)", () => {
  it("muscle map first, personal bests next, before the timeline", () => {
    const map = s.indexOf("<SoloMuscleMapCard");
    const pbs = s.indexOf("Strength Personal Bests</p>");
    const timeline = s.indexOf("<PerformanceTimelineCard");
    expect(map).toBeGreaterThan(s.indexOf("<SoloPageHeader"));
    expect(map).toBeLessThan(pbs);
    expect(pbs).toBeLessThan(timeline);
  });
  it("no Estimated Max chart", () => {
    expect(s).not.toMatch(/SoloEstMaxChart/);
    expect(existsSync(new URL("./SoloEstMaxChart.jsx", import.meta.url))).toBe(false);
  });
});
