// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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

function renderGuard({ completed, initialEntries = ["/solo/home"], fetchOnboardingCompletedFromServer = vi.fn() }) {
  mockUseSoloApp = () => ({
    soloCurrentUser: { id: "solo-uid-1", onboarding: { completed } },
    fetchOnboardingCompletedFromServer,
  });
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
  // A cached `true` is never wrongly restrictive (nothing un-completes an
  // account), so it's trusted immediately with no server round trip —
  // this also proves ordinary navigation to already-unlocked screens
  // doesn't pay a network cost on every visit.
  it("renders through immediately when the cached value already says completed, without checking the server", () => {
    const fetchOnboardingCompletedFromServer = vi.fn();
    renderGuard({ completed: true, fetchOnboardingCompletedFromServer });
    expect(screen.getByText("SOLO_HOME")).toBeTruthy();
    expect(fetchOnboardingCompletedFromServer).not.toHaveBeenCalled();
  });

  // Regression test: soloDb uses persistentLocalCache, so a cached
  // `completed: false` can be stale for an account that genuinely
  // finished onboarding since this browser last cached its profile.
  // The guard must verify against the server rather than redirecting on
  // the cached value alone.
  it("renders through on a stale cached `false` once the server confirms completion", async () => {
    renderGuard({ completed: false, fetchOnboardingCompletedFromServer: vi.fn().mockResolvedValue(true) });
    expect(await screen.findByText("SOLO_HOME")).toBeTruthy();
    expect(screen.queryByText("ONBOARDING")).toBeNull();
  });

  it("redirects to onboarding when the server confirms the account genuinely hasn't completed it", async () => {
    renderGuard({ completed: false, fetchOnboardingCompletedFromServer: vi.fn().mockResolvedValue(false) });
    expect(await screen.findByText("ONBOARDING")).toBeTruthy();
  });

  // Requirement: a failed server read must not be silently treated as
  // "confirmed incomplete" (that would just reproduce the original bug
  // on any network hiccup) — it must show something the user can act on
  // instead of auto-redirecting, and retrying must actually re-check.
  it("shows a retry affordance (not a silent redirect) when the server check fails, and retrying re-checks", async () => {
    const fetchOnboardingCompletedFromServer = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(true);
    renderGuard({ completed: false, fetchOnboardingCompletedFromServer });
    expect(await screen.findByText(/couldn't check your account/i)).toBeTruthy();
    expect(screen.queryByText("ONBOARDING")).toBeNull();
    expect(screen.queryByText("SOLO_HOME")).toBeNull();

    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("SOLO_HOME")).toBeTruthy();
    expect(fetchOnboardingCompletedFromServer).toHaveBeenCalledTimes(2);
  });
});
