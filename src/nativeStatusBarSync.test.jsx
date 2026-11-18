// @vitest-environment jsdom
//
// Regression coverage for the iOS App Store build's status bar strip. The
// native WKWebView wrapper (ios/ApexCoach/ViewController.swift) pins its
// webview below the safe area and leaves the strip above it (status bar +
// notch) as its own background color — it has no way to know what the page
// is actually showing unless told. NativeStatusBarSync posts that over
// window.webkit.messageHandlers.apexTheme whenever the route changes: dark
// for the coach console, light for login/activate (the client app and Train Solo post their own, #277),
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
  it("#292: a coach's launch screen on \"/\" gets a dark strip (it stayed white), a client's doesn't", () => {
    localStorage.setItem("apexProfileCache", JSON.stringify({ uid: "c", role: "coach" }));
    document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
    expect(renderAt("/")).toHaveBeenCalledWith({ dark: true, edgeToEdge: false });
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#090909");
    cleanup();
    localStorage.setItem("apexProfileCache", JSON.stringify({ uid: "x", role: "client" }));
    expect(renderAt("/")).toHaveBeenCalledWith({ dark: false, edgeToEdge: false });
    localStorage.removeItem("apexProfileCache");
  });

  it("posts dark:true, edgeToEdge:false on a coach route", () => {
    expect(renderAt("/coach/clients")).toHaveBeenCalledWith({ dark: true, edgeToEdge: false });
  });

  it("leaves the client app route to the client app's own theme (#277)", () => {
    expect(renderAt("/app")).not.toHaveBeenCalled();
  });

  it("posts dark:true, edgeToEdge:true on the login route", () => {
    expect(renderAt("/login")).toHaveBeenCalledWith({ dark: true, edgeToEdge: true });
  });

  it("posts edgeToEdge:true on the Coaching / Train Solo chooser — same full-bleed photo", () => {
    expect(renderAt("/start")).toHaveBeenCalledWith({ dark: true, edgeToEdge: true });
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
