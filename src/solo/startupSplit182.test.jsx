// @vitest-environment jsdom
//
// #182 Train Solo startup: screens that are never the first one on a normal
// open (questionnaire, consultation, program builder, recaps, first
// session, recovery) load separately from Train Solo's startup code and are
// preloaded once Home is up; the questionnaire as soon as Train Solo opens
// signed out.
import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

describe("Train Solo startup code", () => {
  const LAZY = ["SoloOnboarding", "SoloConsultationScreen", "SoloProgramBuilderScreen", "SoloFirstSessionScreen", "SoloActiveRecoveryScreen", "SoloRecapScreens"];

  it("SoloRoutes imports none of the rarely-first screens directly", () => {
    const src = readFileSync("src/solo/SoloRoutes.jsx", "utf8");
    for (const name of LAZY) expect(src).not.toMatch(new RegExp(`from "\\./(onboarding/)?${name}"`));
  });

  it("each split screen resolves to the real component, and preloading fetches them all", async () => {
    const screens = await import("./soloScreens");
    const pairs = [
      [screens.SoloOnboarding, () => import("./onboarding/SoloOnboarding").then((m) => m.default)],
      [screens.SoloConsultationScreen, () => import("./SoloConsultationScreen").then((m) => m.default)],
      [screens.SoloProgramBuilderScreen, () => import("./SoloProgramBuilderScreen").then((m) => m.default)],
      [screens.SoloFirstSessionScreen, () => import("./SoloFirstSessionScreen").then((m) => m.default)],
      [screens.SoloActiveRecoveryScreen, () => import("./SoloActiveRecoveryScreen").then((m) => m.default)],
      [screens.SoloProgramCompleteScreen, () => import("./SoloRecapScreens").then((m) => m.SoloProgramCompleteScreen)],
      [screens.SoloWeekRecapScreen, () => import("./SoloRecapScreens").then((m) => m.SoloWeekRecapScreen)],
    ];
    const spies = pairs.map(([Screen]) => vi.spyOn(Screen, "preload"));
    screens.preloadSoloScreens();
    spies.forEach((s) => expect(s).toHaveBeenCalled());
    for (const [Screen, real] of pairs) {
      spies.forEach((s) => s.mockRestore());
      const mod = await Screen.preload();
      expect(mod.default).toBe(await real());
    }
  }, 30000);
});

describe("questionnaire code fetched ahead of time", () => {
  it("as soon as Train Solo opens signed out (registration leads to it)", async () => {
    vi.resetModules();
    const preload = vi.fn(() => Promise.resolve());
    vi.doMock("./soloScreens", () => {
      const standIn = () => Object.assign(() => null, { preload: () => Promise.resolve() });
      return {
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
      };
    });
    vi.doMock("../lib/SoloAppContext", () => ({
      SoloAppProvider: ({ children }) => children,
      useSoloApp: () => ({ soloSessionLoading: false, soloAuthUser: null, soloCurrentUser: null, soloBranding: {}, refreshSoloEntitlement: () => Promise.resolve({}), soloTier: "free", soloEntitlementReady: false }),
    }));
    vi.doMock("./SoloRegisterScreen", () => ({ default: () => <p>register</p> }));
    const { render, screen, cleanup } = await import("@testing-library/react");
    const { MemoryRouter, Route, Routes } = await import("react-router-dom");
    const { default: SoloRoutes } = await import("./SoloRoutes");
    render(
      <MemoryRouter initialEntries={["/solo/register"]}>
        <Routes>
          <Route path="/solo/*" element={<SoloRoutes />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("register");
    expect(preload).toHaveBeenCalled();
    cleanup();
    vi.doUnmock("./soloScreens");
    vi.doUnmock("../lib/SoloAppContext");
    vi.doUnmock("./SoloRegisterScreen");
  });
});
