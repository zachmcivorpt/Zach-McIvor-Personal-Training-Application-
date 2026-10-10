// @vitest-environment jsdom
//
// Regression coverage for a real, repeated production report: the
// on-screen keyboard covered the lower half of an open bottom sheet —
// including the search results list the client was actually trying to
// see (reproduced with "Add to Dinner" > typing "Coffee"). Root cause:
// `position: fixed` in iOS Safari/WKWebView stays anchored to the LAYOUT
// viewport, which does not shrink when the keyboard opens — only the
// VISUAL viewport does (`window.visualViewport`), and the sheet wasn't
// tracking it at all, just stretching over `inset-0` / a static
// `max-h-[88vh]` regardless of how much of that height the keyboard had
// actually covered.
//
// Fixed by tracking `window.visualViewport`'s height/offsetTop live and
// applying them directly to the sheet's wrapper (position + height) and
// its own max-height (88% of the real visible area, not of the full,
// partly-hidden screen) — when visualViewport reports a shorter height
// (keyboard open), the sheet actually shrinks to fit above it instead of
// running underneath it.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BottomSheet } from "./ui";

function makeVisualViewport(height, offsetTop = 0) {
  const listeners = { resize: [], scroll: [] };
  return {
    height,
    offsetTop,
    addEventListener: (type, fn) => listeners[type]?.push(fn),
    removeEventListener: (type, fn) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    _fire(type) {
      listeners[type]?.forEach((fn) => fn());
    },
  };
}

describe("BottomSheet shrinks with the keyboard instead of running underneath it", () => {
  let vv;
  beforeEach(() => {
    vv = makeVisualViewport(800, 0);
    window.visualViewport = vv;
  });
  afterEach(() => {
    cleanup();
    delete window.visualViewport;
  });

  function getSheetPanel() {
    // The sheet panel is the direct sibling of the backdrop, carrying
    // the rounded-t-3xl / max-height styling.
    return document.querySelector(".rounded-t-3xl");
  }

  it("sizes itself against the full visual viewport when no keyboard is open", () => {
    render(<BottomSheet open onClose={() => {}} title="Test">content</BottomSheet>);
    const panel = getSheetPanel();
    expect(panel.style.maxHeight).toBe(`${Math.round(800 * 0.88)}px`);
  });

  it("shrinks to fit above the keyboard once visualViewport reports a shorter height", () => {
    render(<BottomSheet open onClose={() => {}} title="Test">content</BottomSheet>);
    // Simulate the keyboard opening: iOS shrinks the visual viewport
    // height and can offset it from the top of the layout viewport.
    act(() => {
      vv.height = 420;
      vv.offsetTop = 10;
      vv._fire("resize");
    });

    const panel = getSheetPanel();
    expect(panel.style.maxHeight).toBe(`${Math.round(420 * 0.88)}px`);

    const wrapper = panel.parentElement;
    expect(wrapper.style.height).toBe("420px");
    expect(wrapper.style.top).toBe("10px");
  });
});
