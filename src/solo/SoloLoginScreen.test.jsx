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

function tree() {
  return (
    <MemoryRouter initialEntries={["/solo/login"]}>
      <Routes>
        <Route path="/solo/login" element={<SoloLoginScreen />} />
        <Route path="/solo/home" element={<div>SOLO_HOME</div>} />
        <Route path="/solo/onboarding" element={<div>ONBOARDING</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderLogin({ completed, fetchOnboardingCompletedFromServer, soloCurrentUser }) {
  mockUseSoloApp = () => ({
    soloLogin: vi.fn(),
    soloCurrentUser: soloCurrentUser || { id: "solo-uid-1", onboarding: { completed } },
    soloAppDesign: {},
    fetchOnboardingCompletedFromServer,
  });
  const result = render(tree());
  return { rerender: () => result.rerender(tree()) };
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

  // Regression test for the "stuck on SIGNING IN…" hang: Firestore's
  // onSnapshot normally fires at least twice for the same logical
  // document (once from local cache, once server-confirmed), and
  // SoloAppContext.jsx builds a brand-new {id, ...data()} object on every
  // emission — so soloCurrentUser's object reference changes even when
  // nothing meaningful did. The redirect effect previously depended on
  // that object, so every re-emission cancelled the in-flight server
  // check and restarted it from scratch; repeated re-emissions (which
  // the check's own getDocFromServer call can itself provoke on the same
  // watched document) could cancel-and-restart it indefinitely, so it
  // never got the chance to finish. Depending on the stable uid instead
  // means repeated same-account reference churn doesn't touch the
  // in-flight check at all.
  it("does not restart the server check when soloCurrentUser is replaced by new (but same-uid) references, even repeatedly", async () => {
    const fetchOnboardingCompletedFromServer = vi.fn(() => new Promise(() => {})); // never resolves — isolates whether churn alone restarts it
    const { rerender } = renderLogin({
      fetchOnboardingCompletedFromServer,
      soloCurrentUser: { id: "solo-uid-1", onboarding: { completed: false } },
    });

    // Several onSnapshot-style re-emissions for the same account: new
    // object reference each time, identical id/content.
    for (let i = 0; i < 4; i++) {
      mockUseSoloApp = () => ({
        soloLogin: vi.fn(),
        soloCurrentUser: { id: "solo-uid-1", onboarding: { completed: false } },
        soloAppDesign: {},
        fetchOnboardingCompletedFromServer,
      });
      rerender();
    }

    expect(fetchOnboardingCompletedFromServer).toHaveBeenCalledTimes(1);
  });
});
