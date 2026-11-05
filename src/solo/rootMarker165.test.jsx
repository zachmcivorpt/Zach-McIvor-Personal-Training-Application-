// @vitest-environment jsdom
//
// #165: the workout screen draws outside #root (a full-screen portal), and
// the iPhone app's alive check (ViewController.pageDrawsFrame) counts
// #root's children — 0 rebuilt the web view on every return mid-workout.
// Its own file (#171): it loads Train Solo's routes with stand-ins, and
// sharing a module registry with other tests made it fail now and then.
import React from "react";
import { readFileSync } from "node:fs";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Screens loaded separately (#182): stand-ins with a no-op preload.
const { standIn } = vi.hoisted(() => ({ standIn: () => Object.assign(() => null, { preload: () => Promise.resolve() }) }));
vi.mock("./soloScreens", () => ({
  SoloOnboarding: standIn(),
  SoloConsultationScreen: standIn(),
  SoloProgramBuilderScreen: standIn(),
  SoloFirstSessionScreen: standIn(),
  SoloActiveRecoveryScreen: standIn(),
  SoloProgramCompleteScreen: standIn(),
  SoloWeekRecapScreen: standIn(),
  SoloWorkoutSessionScreen: () => createPortal(<p>workout screen</p>, document.body),
  SoloProgramDetailsScreen: () => null,
  SoloWorkoutSummaryScreen: () => null,
  SoloSessionBuilderScreen: () => null,
  SoloProgressScreen: () => null,
  preloadSoloScreens: () => {},
}));
vi.mock("../lib/SoloAppContext", () => ({
  SoloAppProvider: ({ children }) => children,
  useSoloApp: () => ({
    soloSessionLoading: false,
    soloAuthUser: { uid: "u1" },
    soloCurrentUser: { id: "u1", onboarding: { completed: true } },
    soloBranding: {},
    refreshSoloEntitlement: () => Promise.resolve({}),
    soloTier: "free",
  }),
}));

import SoloRoutes from "./SoloRoutes";

afterEach(cleanup);

describe("the iPhone app's 'is the page alive?' check during a workout", () => {
  it("finds content in #root even though the workout screen draws outside it (it rebuilt the web view mid-workout)", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    render(
      <MemoryRouter initialEntries={["/solo/workout"]}>
        <Routes>
          <Route path="/solo/*" element={<SoloRoutes />} />
        </Routes>
      </MemoryRouter>,
      { container: root }
    );
    await screen.findByText("workout screen");
    // What ViewController.pageDrawsFrame evaluates: #root's element count.
    expect(document.getElementById("root").childElementCount).toBeGreaterThan(0);
    root.remove();
  });

  it("the native check still reads #root (so the marker is what it sees)", () => {
    const fn = readFileSync("ios/ApexCoach/ViewController.swift", "utf8").match(/private func pageDrawsFrame[\s\S]*?\n {4}\}\n/)[0];
    expect(fn).toMatch(/document\.getElementById\('root'\)/);
    expect(fn).toMatch(/el\.childElementCount/);
  });
});
