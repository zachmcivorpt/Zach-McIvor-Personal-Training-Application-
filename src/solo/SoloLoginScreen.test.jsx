// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SoloLoginScreen from "./SoloLoginScreen";

let mockUseSoloApp;
vi.mock("../lib/SoloAppContext", () => ({
  useSoloApp: () => mockUseSoloApp(),
}));
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ db: { appDesign: {} } }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderLogin({ completed, fetchOnboardingCompletedFromServer }) {
  mockUseSoloApp = () => ({
    soloLogin: vi.fn(),
    soloCurrentUser: { id: "solo-uid-1", onboarding: { completed } },
    soloAppDesign: {},
    fetchOnboardingCompletedFromServer,
  });
  render(
    <MemoryRouter initialEntries={["/solo/login"]}>
      <Routes>
        <Route path="/solo/login" element={<SoloLoginScreen />} />
        <Route path="/solo/home" element={<div>SOLO_HOME</div>} />
        <Route path="/solo/onboarding" element={<div>ONBOARDING</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SoloLoginScreen — post-login redirect", () => {
  // Regression test: soloDb uses persistentLocalCache, so the first
  // soloCurrentUser a login delivers can be a stale, locally-cached
  // document from a previous session on this browser/origin — reading
  // `completed` straight off it was sending an already-completed account
  // back to the questionnaire. The redirect must trust a direct server
  // read over that cached value.
  it("redirects to Home using the server-confirmed completion state, even when the cached context value says incomplete", async () => {
    renderLogin({
      completed: false,
      fetchOnboardingCompletedFromServer: vi.fn().mockResolvedValue(true),
    });
    expect(await screen.findByText("SOLO_HOME")).toBeTruthy();
    expect(screen.queryByText("ONBOARDING")).toBeNull();
  });

  it("redirects to onboarding using the server-confirmed state, even when the cached context value says complete", async () => {
    renderLogin({
      completed: true,
      fetchOnboardingCompletedFromServer: vi.fn().mockResolvedValue(false),
    });
    expect(await screen.findByText("ONBOARDING")).toBeTruthy();
    expect(screen.queryByText("SOLO_HOME")).toBeNull();
  });

  it("falls back to the cached context value if the server read itself fails", async () => {
    renderLogin({
      completed: true,
      fetchOnboardingCompletedFromServer: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect(await screen.findByText("SOLO_HOME")).toBeTruthy();
  });
});
