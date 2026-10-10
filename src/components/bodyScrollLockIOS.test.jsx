// @vitest-environment jsdom
//
// Regression coverage for a real production report: a client could still
// scroll the page BEHIND an open bottom sheet (reproduced opening "Add to
// Lunch" on the Nutrition screen). Root cause: the body scroll lock only
// ever set `document.body.style.overflow = "hidden"`. That's enough on
// desktop and Android Chrome, but iOS Safari/WKWebView's touch-driven
// scrolling ignores the body's own overflow rule as long as some ancestor
// further down the tree is independently scrollable — true of nearly
// every screen in this app — so the background stayed fully scrollable
// under an "open" sheet on exactly the platform this app ships on. Fixed
// by additionally pinning the body with `position: fixed` (the
// iOS-reliable technique), restoring the original scroll position when
// the last lock releases.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FullScreenOverlay } from "./ui";

afterEach(() => {
  cleanup();
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
});

describe("body scroll lock (iOS-reliable)", () => {
  it("pins the body with position:fixed while a FullScreenOverlay is open, not just overflow:hidden", () => {
    const { unmount } = render(<FullScreenOverlay>content</FullScreenOverlay>);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the original scroll position on unlock", () => {
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
    const scrollToSpy = [];
    window.scrollTo = (x, y) => scrollToSpy.push([x, y]);

    const { unmount } = render(<FullScreenOverlay>content</FullScreenOverlay>);
    expect(document.body.style.top).toBe("-420px");
    unmount();
    expect(scrollToSpy).toContainEqual([0, 420]);
  });

  it("keeps the lock held while ANY nested overlay is still open (reference counted), only releasing on the last one closing", () => {
    const outer = render(<FullScreenOverlay>outer</FullScreenOverlay>);
    const inner = render(<FullScreenOverlay>inner</FullScreenOverlay>);
    expect(document.body.style.position).toBe("fixed");

    inner.unmount();
    expect(document.body.style.position).toBe("fixed"); // outer still open

    outer.unmount();
    expect(document.body.style.position).toBe("");
  });
});
