// @vitest-environment jsdom
//
// Production bug: "Importing a module script failed" when a client's
// already-open tab (running an older bundle) tries to dynamically import()
// a hashed /assets/*.js chunk (CoachShell/ClientApp in App.jsx) that no
// longer exists after a new deploy. ErrorBoundary already caught the thrown
// rejection (no blank page), but had no automatic recovery and no loop
// guard — a manual Reload could re-serve the same stale cached index.html
// and crash again identically. These tests cover the new behavior: exactly
// one automatic reload for this specific error class, then falling back to
// the manual recovery screen if it happens again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Boom({ message }) {
  throw new Error(message);
}

function renderWithThrow(message) {
  return render(
    <ErrorBoundary>
      <Boom message={message} />
    </ErrorBoundary>
  );
}

let reloadSpy;

beforeEach(() => {
  reloadSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("ErrorBoundary — ordinary render errors", () => {
  it("shows the manual recovery screen and does not auto-reload", () => {
    renderWithThrow("TypeError: cannot read properties of undefined");
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe("ErrorBoundary — stale chunk / dynamic import failure", () => {
  it('auto-reloads exactly once for "Importing a module script failed" (WebKit wording)', async () => {
    renderWithThrow("Importing a module script failed");
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    // Holding screen, not the manual error UI — recovery is already in flight.
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it('also recognizes Chrome\'s "failed to fetch dynamically imported module" wording', async () => {
    renderWithThrow("TypeError: Failed to fetch dynamically imported module: https://example.com/assets/index-DhhbY1Lj.js");
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("does not reload a second time if the failure recurs after a prior reload attempt", async () => {
    sessionStorage.setItem("apexStaleChunkReloadAttempted", "1");
    renderWithThrow("Importing a module script failed");
    // Give any async SW-update path a chance to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(reloadSpy).not.toHaveBeenCalled();
    // Falls back to the manual recovery screen instead of looping silently.
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });
});
