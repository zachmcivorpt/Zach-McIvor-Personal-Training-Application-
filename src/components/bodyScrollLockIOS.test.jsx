// @vitest-environment jsdom
//
// Regression coverage for two real, successive production reports on the
// same flow (opening "Add to [meal]" on the Nutrition screen):
//
// 1. The background page was still draggable/scrollable underneath an
//    open sheet. A `position: fixed` body-pin was tried first (the usual
//    iOS fix for `overflow: hidden` alone not being enough), but that
//    caused report #2:
// 2. Dismissing the keyboard while the sheet (with its search box) was
//    open froze the whole page solid — the keyboard resizing the visual
//    viewport forced a recompute of the fixed-position body against it,
//    which this app's actual native shell (a bare WKWebView wrapper, not
//    real mobile Safari) got stuck on.
//
// Fixed by backing out the body-pin entirely (back to plain
// `overflow: hidden`, reference-counted for nested sheets) and instead
// stopping the background from moving with pure CSS, scoped to
// BottomSheet itself: `touch-action: none` on the backdrop (nothing
// there needs to scroll in the first place) and `overscroll-behavior:
// contain` on the sheet's own scrollable content (stops a scroll that
// hits the top/bottom of the list from "chaining" into the page behind
// it). Neither touches body layout, so neither can conflict with the
// keyboard's viewport resize the way the pin did.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BottomSheet, FullScreenOverlay } from "./ui";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("body scroll lock", () => {
  it("sets overflow:hidden on body while a FullScreenOverlay is open, and never pins body position (the frozen-after-keyboard-dismiss regression)", () => {
    const { unmount } = render(<FullScreenOverlay>content</FullScreenOverlay>);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).not.toBe("fixed");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the lock held while ANY nested overlay is still open (reference counted), only releasing on the last one closing", () => {
    const outer = render(<FullScreenOverlay>outer</FullScreenOverlay>);
    const inner = render(<FullScreenOverlay>inner</FullScreenOverlay>);
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();
    expect(document.body.style.overflow).toBe("hidden"); // outer still open

    outer.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("BottomSheet — background can't be dragged/scrolled behind it (iOS)", () => {
  it("marks its backdrop touch-action:none, so a drag starting there can't move the page behind it", () => {
    render(<BottomSheet open onClose={() => {}} title="Test">content</BottomSheet>);
    const backdrop = document.querySelector(".bg-black\\/50");
    expect(backdrop).toBeTruthy();
    expect(backdrop.className).toMatch(/touch-none/);
  });

  it("marks its own scrollable content overscroll-contain, so hitting the top/bottom of the list doesn't chain into the background", () => {
    render(<BottomSheet open onClose={() => {}} title="Test">content</BottomSheet>);
    const scrollArea = document.querySelector(".overflow-y-auto");
    expect(scrollArea).toBeTruthy();
    expect(scrollArea.className).toMatch(/overscroll-contain/);
  });
});
