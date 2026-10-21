// @vitest-environment jsdom
//
// Train Solo makes its bottom sheets frosted glass through BottomSheet's
// optional surface (SheetSurfaceContext). This locks in that every sheet
// OUTSIDE Train Solo — the coach console and the coached client app, which
// never provide that context — keeps exactly its original solid fill.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomSheet, SheetSurfaceContext } from "./ui";
import { SURFACE_RAISED, CLIENT_DARK_SURFACE_2 } from "../theme";

afterEach(cleanup);

function panelOf(text) {
  // The text sits directly in the sheet body; its parent is the panel.
  return screen.getByText(text).parentElement;
}

function toRgb(hex) {
  const el = document.createElement("div");
  el.style.backgroundColor = hex;
  return el.style.backgroundColor;
}

describe("BottomSheet surface", () => {
  it("keeps the original solid light fill when no surface is provided", () => {
    render(<BottomSheet open title="t" onClose={() => {}}>light-body</BottomSheet>);
    expect(panelOf("light-body").style.backgroundColor).toBe(toRgb(SURFACE_RAISED));
    expect(panelOf("light-body").style.backdropFilter).toBe("");
  });

  it("keeps the original solid dark fill when no surface is provided", () => {
    render(<BottomSheet open dark title="t" onClose={() => {}}>dark-body</BottomSheet>);
    expect(panelOf("dark-body").style.backgroundColor).toBe(toRgb(CLIENT_DARK_SURFACE_2));
  });

  it("uses the provided surface only inside a SheetSurfaceContext (Train Solo)", () => {
    render(
      <SheetSurfaceContext.Provider value={{ backgroundColor: "rgba(1, 2, 3, 0.5)", backdropFilter: "blur(28px)" }}>
        <BottomSheet open title="t" onClose={() => {}}>solo-body</BottomSheet>
      </SheetSurfaceContext.Provider>
    );
    expect(panelOf("solo-body").style.backgroundColor).toBe("rgba(1, 2, 3, 0.5)");
    expect(panelOf("solo-body").style.backdropFilter).toBe("blur(28px)");
  });
});
