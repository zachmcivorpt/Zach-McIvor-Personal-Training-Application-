// @vitest-environment jsdom
//
// Regression coverage for the iOS App Store build's status bar strip. The
// native WKWebView wrapper (ios/ApexCoach/ViewController.swift) pins its
// webview below the safe area and leaves the strip above it (status bar +
// notch) as its own background color — it has no way to know what the page
// is actually showing unless told. NativeStatusBarSync posts that over
// window.webkit.messageHandlers.apexTheme whenever the route changes: dark
// for the coach console, light for everything else (client app,
// login/activate) so fixing the coach's white strip doesn't paint a black
// bar over the client app's light screens.
//
// `edgeToEdge` (added for the login screen's full-bleed gym photo) is a
// separate flag native uses to extend its webview frame up behind the
// status bar/notch instead of pinning below it, scoped to exactly "/login"
// — every other route must keep getting edgeToEdge:false so native's
// normal pinned-below-safe-area frame stays untouched everywhere else.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NativeStatusBarSync } from "./App";

afterEach(() => {
  cleanup();
  delete window.webkit;
});

function renderAt(path) {
  const postMessage = vi.fn();
  window.webkit = { messageHandlers: { apexTheme: { postMessage } } };
  render(
    <MemoryRouter initialEntries={[path]}>
      <NativeStatusBarSync />
    </MemoryRouter>
  );
  return postMessage;
}

describe("NativeStatusBarSync", () => {
  it("posts dark:true, edgeToEdge:false on a coach route", () => {
    expect(renderAt("/coach/clients")).toHaveBeenCalledWith({ dark: true, edgeToEdge: false });
  });

  it("posts dark:false, edgeToEdge:false on the client app route", () => {
    expect(renderAt("/app")).toHaveBeenCalledWith({ dark: false, edgeToEdge: false });
  });

  it("posts dark:false, edgeToEdge:true on the login route", () => {
    expect(renderAt("/login")).toHaveBeenCalledWith({ dark: false, edgeToEdge: true });
  });

  it("posts edgeToEdge:true on the Coaching / Train Solo chooser — same full-bleed photo", () => {
    expect(renderAt("/start")).toHaveBeenCalledWith({ dark: false, edgeToEdge: true });
  });

  it("posts edgeToEdge:false on the activate route — the edge-to-edge frame is login-only", () => {
    expect(renderAt("/activate")).toHaveBeenCalledWith({ dark: false, edgeToEdge: false });
  });

  it("leaves Train Solo routes to SoloThemeProvider, which follows the Solo light/dark toggle", () => {
    expect(renderAt("/solo/home")).not.toHaveBeenCalled();
  });

  it("does not throw in a regular browser with no window.webkit", () => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/coach"]}>
          <NativeStatusBarSync />
        </MemoryRouter>
      )
    ).not.toThrow();
  });
});
