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

// The signed-out preload is checked in startupPreload182.test.jsx: it loads
// SoloRoutes with stand-ins, which needs its own module registry (#171).
