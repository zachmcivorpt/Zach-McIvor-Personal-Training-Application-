// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireOnboardingComplete } from "./SoloRoutes";

let mockUseSoloApp;
vi.mock("../lib/SoloAppContext", () => ({
  useSoloApp: () => mockUseSoloApp(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderGuard({ completed, initialEntries }) {
  mockUseSoloApp = () => ({ soloCurrentUser: { onboarding: { completed } } });
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/solo/home"
          element={
            <RequireOnboardingComplete>
              <div>SOLO_HOME</div>
            </RequireOnboardingComplete>
          }
        />
        <Route path="/solo/onboarding" element={<div>ONBOARDING</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireOnboardingComplete", () => {
  it("redirects to onboarding when the account isn't marked completed", () => {
    renderGuard({ completed: false, initialEntries: ["/solo/home"] });
    expect(screen.getByText("ONBOARDING")).toBeTruthy();
    expect(screen.queryByText("SOLO_HOME")).toBeNull();
  });

  it("renders through when the account is marked completed", () => {
    renderGuard({ completed: true, initialEntries: ["/solo/home"] });
    expect(screen.getByText("SOLO_HOME")).toBeTruthy();
  });
});
