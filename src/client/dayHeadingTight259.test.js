// #259 (owner): the day heading row above the week strip is tight — 13px
// heading, 24px arrow/Today buttons, 6px gap to the strip — on Train Solo's
// My Training and its copy on the coached client Home (kept in step, #256).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe.each([
  ["client Home", "./ClientApp.jsx", "function ClientWeekStrip"],
  ["Train Solo", "../solo/SoloMyTrainingScreen.jsx", "function WeekStrip"],
])("%s day heading row (#259)", (_name, file, start) => {
  const s = src(file);
  const strip = s.slice(s.indexOf(start), s.indexOf(start) + 1600);
  it("is tight", () => {
    expect(strip).toMatch(/justify-between mb-1\.5">\s*<p className="text-\[13px\] font-semibold leading-tight"/);
    expect(strip).toMatch(/text-\[11px\] font-semibold px-2\.5 h-6 rounded-full/);
    expect(strip.match(/w-6 h-6 rounded-full/g)).toHaveLength(2);
    expect(strip).not.toMatch(/w-7 h-7|mb-2\.5|size=\{14\}/);
  });
});
