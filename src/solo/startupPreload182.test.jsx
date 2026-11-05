// @vitest-environment jsdom
//
// #182: the questionnaire's code (loaded separately) is fetched as soon as
// Train Solo opens signed out, so it's there when registration finishes.
// Its own file: it loads Train Solo's routes with stand-ins, and sharing a
// module registry with other tests made such tests fail now and then (#171).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { preload, standIn } = vi.hoisted(() => ({
  preload: vi.fn(() => Promise.resolve()),
  standIn: () => Object.assign(() => null, { preload: () => Promise.resolve() }),
}));
vi.mock("./soloScreens", () => ({
  SoloOnboarding: Object.assign(() => null, { preload }),
  SoloConsultationScreen: standIn(),
  SoloProgramBuilderScreen: standIn(),
  SoloFirstSessionScreen: standIn(),
  SoloActiveRecoveryScreen: standIn(),
  SoloProgramCompleteScreen: standIn(),
  SoloWeekRecapScreen: standIn(),
  SoloWorkoutSessionScreen: standIn(),
  SoloProgramDetailsScreen: standIn(),
  SoloWorkoutSummaryScreen: standIn(),
  SoloSessionBuilderScreen: standIn(),
  SoloProgressScreen: standIn(),
  preloadSoloScreens: () => {},
}));
vi.mock("../lib/SoloAppContext", () => ({
  SoloAppProvider: ({ children }) => children,
  useSoloApp: () => ({
    soloSessionLoading: false,
    soloAuthUser: null,
    soloCurrentUser: null,
    soloBranding: {},
    refreshSoloEntitlement: () => Promise.resolve({}),
    soloTier: "free",
    soloEntitlementReady: false,
  }),
}));
vi.mock("./SoloRegisterScreen", () => ({ default: () => <p>register</p> }));

import SoloRoutes from "./SoloRoutes";

afterEach(cleanup);

describe("questionnaire code fetched ahead of time", () => {
  it("as soon as Train Solo opens signed out (registration leads to it)", async () => {
    render(
      <MemoryRouter initialEntries={["/solo/register"]}>
        <Routes>
          <Route path="/solo/*" element={<SoloRoutes />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("register");
    expect(preload).toHaveBeenCalled();
  });
});
