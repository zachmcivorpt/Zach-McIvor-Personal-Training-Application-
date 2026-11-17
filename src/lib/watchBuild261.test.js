// #261: the Apple Watch app is switched on for 1.0.5. Codemagic must build
// from project-watch.yml, and the iPhone and Watch versions must match.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const versions = (txt) => [...txt.matchAll(/(?:CFBundleShortVersionString|MARKETING_VERSION): "([\d.]+)"/g)].map((m) => m[1]);

describe("Apple Watch build (#261)", () => {
  it("Codemagic builds the Watch app in", () => {
    expect(read("codemagic.yaml")).toMatch(/APEX_WATCH: "true"/);
  });
  it("iPhone and Watch apps are both 1.0.5", () => {
    const all = [...versions(read("ios/project.yml")), ...versions(read("ios/project-watch.yml"))];
    expect(all.length).toBe(4);
    expect(new Set(all)).toEqual(new Set(["1.0.5"]));
  });
});
