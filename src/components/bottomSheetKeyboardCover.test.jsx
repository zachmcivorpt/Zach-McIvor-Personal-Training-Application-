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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

// Real production reports (see REGRESSION_TESTS.md #42/#44/#45/#51/#52):
// in a native WKWebView (this app's actual shell, unlike Safari),
// window.visualViewport never fires for the keyboard at all, so the
// shrink-to-fit behavior above has nothing to react to there. This is the
// shared, opt-in fallback (Phase 2 of the audit): a `keyboardSafeScroll`
// prop on BottomSheet itself, so any sheet with a text input gets a
// keyboard-detection-independent scroll spacer "for free" instead of each
// sheet having to reinvent one. Off by default — a sheet with no text
// input, or one that hasn't opted in, is completely unaffected.
describe("BottomSheet's opt-in keyboardSafeScroll spacer", () => {
  afterEach(() => cleanup());

  function spacer() {
    return document.querySelector('[data-testid="keyboard-safe-spacer"]');
  }

  it("renders no spacer when keyboardSafeScroll isn't passed, even with a focused text input", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test">
        <input placeholder="Name" />
      </BottomSheet>
    );
    fireEvent.focus(screen.getByPlaceholderText("Name"));
    expect(spacer()).toBeNull();
  });

  it("renders no spacer before any input is focused, even with keyboardSafeScroll on", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="Name" />
      </BottomSheet>
    );
    expect(spacer()).toBeNull();
  });

  it("reserves scroll room once a text input inside the sheet gains focus", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="Name" />
      </BottomSheet>
    );
    fireEvent.focus(screen.getByPlaceholderText("Name"));
    expect(spacer()).toBeTruthy();
  });

  it("removes the spacer once the input loses focus", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="Name" />
      </BottomSheet>
    );
    const input = screen.getByPlaceholderText("Name");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(spacer()).toBeNull();
  });

  it("does not reserve scroll room for a non-text-entry focus target (e.g. a button)", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <button>Save</button>
      </BottomSheet>
    );
    fireEvent.focus(screen.getByText("Save"));
    expect(spacer()).toBeNull();
  });

  it("keeps the spacer when focus moves between two text inputs in the same sheet (no flicker)", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="First" />
        <input placeholder="Second" />
      </BottomSheet>
    );
    const first = screen.getByPlaceholderText("First");
    const second = screen.getByPlaceholderText("Second");
    fireEvent.focus(first);
    expect(spacer()).toBeTruthy();
    fireEvent.blur(first, { relatedTarget: second });
    fireEvent.focus(second);
    expect(spacer()).toBeTruthy();
  });

  // Real production report (Oct 2026): with a single short search result
  // under "Add to Lunch", the spacer's flat 45vh reserve left a large,
  // visibly empty gap below content that was already fully visible —
  // nothing was actually hidden behind the keyboard to scroll clear of.
  // jsdom reports every element's height as 0, which is indistinguishable
  // from "not laid out yet," so these two tests stub real layout metrics
  // directly to exercise the dynamic-sizing branch (as opposed to the
  // zero-height fallback the tests above are actually exercising).
  function stubLayout(panelHeight, bodyScrollHeight) {
    const panel = document.querySelector(".rounded-t-3xl");
    // The body-content wrapper is always the body div's first child
    // (it wraps `children`; the spacer, if any, is its sibling after it) —
    // present whether or not the spacer itself has rendered yet.
    const body = panel.lastElementChild.firstElementChild;
    Object.defineProperty(panel, "clientHeight", { configurable: true, value: panelHeight });
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: bodyScrollHeight });
    return { panel, body };
  }

  it("reserves no scroll room once real layout shows short content already fits above the keyboard", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="Name" />
        <p>One short result</p>
      </BottomSheet>
    );
    // Panel is 800px tall (keyboard estimate 360px, so 440px visible above
    // it); content is only 120px tall — well within that visible area.
    // Stubbed before focus so the very first layout-effect run (triggered
    // by focus flipping `active` to true) already sees real metrics.
    stubLayout(800, 120);
    fireEvent.focus(screen.getByPlaceholderText("Name"));
    expect(spacer()).toBeNull();
  });

  it("reserves just enough scroll room (not the old flat reserve) once real layout shows content reaching into the keyboard's estimated area", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" keyboardSafeScroll>
        <input placeholder="Name" />
        <p>A long list of results</p>
      </BottomSheet>
    );
    // Panel 800px (keyboard estimate 360px, visible-above 440px); content
    // 700px — reaches 260px into the keyboard's estimated area, so the
    // spacer should be ~260px, not the full 360px keyboard estimate.
    stubLayout(800, 700);
    fireEvent.focus(screen.getByPlaceholderText("Name"));
    const el = spacer();
    expect(el).toBeTruthy();
    const height = Number(el.style.height.replace("px", ""));
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(360);
  });
});
