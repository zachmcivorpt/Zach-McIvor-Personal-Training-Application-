// @vitest-environment jsdom
//
// #138: building a Train Solo session, Add Exercise opened with the
// keyboard already up (search autofocused), and the session page showed
// through the strip between the sheet and the iPhone keyboard (iOS 26's
// floating keyboard has see-through margins). The sheet's surface and
// backdrop now continue below the visible area, and the search waits for
// a tap.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomSheet, SheetSurfaceContext } from "./ui";
import { SURFACE_RAISED, CLIENT_DARK_SURFACE_2 } from "../theme";

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);

function toRgb(hex) {
  const el = document.createElement("div");
  el.style.backgroundColor = hex;
  return el.style.backgroundColor;
}

describe("BottomSheet under the keyboard (#138)", () => {
  it("continues the sheet's own surface below it, in light, dark and Solo glass", () => {
    const { unmount } = render(<BottomSheet open title="t" onClose={() => {}}>body</BottomSheet>);
    let under = screen.getByTestId("sheet-under-keyboard");
    expect(under.className).toContain("top-full");
    expect(under.style.height).toBe("100vh");
    expect(under.style.backgroundColor).toBe(toRgb(SURFACE_RAISED));
    unmount();

    const r2 = render(<BottomSheet open dark title="t" onClose={() => {}}>body</BottomSheet>);
    expect(screen.getByTestId("sheet-under-keyboard").style.backgroundColor).toBe(toRgb(CLIENT_DARK_SURFACE_2));
    r2.unmount();

    const glass = { backgroundColor: "rgba(247, 246, 243, 0.92)", backdropFilter: "blur(28px)" };
    render(
      <SheetSurfaceContext.Provider value={glass}>
        <BottomSheet open title="t" onClose={() => {}}>body</BottomSheet>
      </SheetSurfaceContext.Provider>
    );
    under = screen.getByTestId("sheet-under-keyboard");
    expect(under.style.backgroundColor).toBe("rgba(247, 246, 243, 0.92)");
    expect(under.style.backdropFilter).toBe("blur(28px)");
  });

  it("the backdrop runs on below the visible area too", () => {
    render(<BottomSheet open title="t" onClose={() => {}}>body</BottomSheet>);
    const backdrop = document.querySelector(".touch-none");
    expect(backdrop.style.bottom).toBe("-100vh");
  });

  it("Add Exercise opens with the list, not the keyboard (search isn't focused)", async () => {
    const { AddExerciseSheet } = await import("../client/ClientApp");
    render(
      <AddExerciseSheet open allExercises={[{ id: "e1", name: "Low Row Machine", equipment: "Machine" }]} excludeIds={new Set()} onClose={() => {}} onConfirm={() => {}} />
    );
    const search = screen.getByPlaceholderText("Search exercises");
    expect(document.activeElement).not.toBe(search);
    expect(screen.getByText("Low Row Machine")).toBeTruthy();
  });
});
