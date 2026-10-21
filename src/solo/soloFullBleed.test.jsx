// @vitest-environment jsdom
//
// Train Solo's full-bleed photo screens (login, register, questionnaire,
// finish-setup) ask the App Store app for the edge-to-edge frame the
// Coaching login uses, with a dark strip/light icons; every other Solo
// screen keeps the pinned frame and follows the Solo light/dark toggle.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockSoloApp = {};
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => mockSoloApp }));

import { SoloThemeProvider } from "./SoloThemeContext";

afterEach(() => {
  cleanup();
  delete window.webkit;
  mockSoloApp = {};
  localStorage.clear();
});

function lastPostAt(path, { dark = false, soloProfileMissing = false } = {}) {
  localStorage.setItem("soloThemeDark", String(dark));
  mockSoloApp = { soloBranding: { accent: "blue" }, soloProfileMissing };
  const postMessage = vi.fn();
  window.webkit = { messageHandlers: { apexTheme: { postMessage } } };
  render(
    <MemoryRouter initialEntries={[path]}>
      <SoloThemeProvider>
        <div />
      </SoloThemeProvider>
    </MemoryRouter>
  );
  return postMessage.mock.calls.at(-1)?.[0];
}

describe("Train Solo native frame", () => {
  it.each(["/solo/login", "/solo/register", "/solo/onboarding"])("%s runs edge-to-edge with a dark strip, even in Solo light mode", (path) => {
    expect(lastPostAt(path, { dark: false })).toEqual({ dark: true, edgeToEdge: true });
  });
  it("the finish-setup screen (missing profile on /solo/home) is edge-to-edge too", () => {
    expect(lastPostAt("/solo/home", { soloProfileMissing: true })).toEqual({ dark: true, edgeToEdge: true });
  });
  it("ordinary Solo screens keep the pinned frame and follow the Solo theme", () => {
    expect(lastPostAt("/solo/home", { dark: false })).toEqual({ dark: false, edgeToEdge: false });
    expect(lastPostAt("/solo/calendar", { dark: true })).toEqual({ dark: true, edgeToEdge: false });
  });
});
