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
  it("posts dark:true on a coach route", () => {
    expect(renderAt("/coach/clients")).toHaveBeenCalledWith({ dark: true });
  });

  it("posts dark:false on the client app route", () => {
    expect(renderAt("/app")).toHaveBeenCalledWith({ dark: false });
  });

  it("posts dark:false on the login route", () => {
    expect(renderAt("/login")).toHaveBeenCalledWith({ dark: false });
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
