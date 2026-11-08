// #197: Train Solo's tab bar is docked to the very bottom, edge to edge
// (floating 14px up showed the page underneath it), and the space the
// pages reserve matches its height.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Train Solo tab bar (#197)", () => {
  it("is fixed to the bottom edge, full width, with the home-bar inset inside it", () => {
    const s = src("./SoloShell.jsx");
    expect(s).toMatch(/className="fixed left-0 right-0 bottom-0 z-40 grid grid-cols-5/);
    expect(s).toMatch(/paddingBottom: "env\(safe-area-inset-bottom,0px\)"/);
    expect(s).not.toMatch(/bottom: "calc\(14px/);
  });
  it("pages reserve exactly the bar's height", () => {
    const space = 'const NAV_SPACE = "calc(64px + env(safe-area-inset-bottom,0px))";';
    expect(src("./SoloShell.jsx")).toContain(space);
    expect(src("./SoloCalendarScreen.jsx")).toContain(space);
  });
});
