// @vitest-environment jsdom
//
// Recovery add-ons: free kind:"recovery" products. They show "Free", are
// added (not bought) with one active at a time, and never appear among the
// paid, category-listed programs.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { visiblePrograms, visibleRecoveryAddons, recommendPrograms } from "./recommendations";

const setRecoveryAddon = vi.fn(() => Promise.resolve());
const startSoloCheckout = vi.fn();
let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));

const category = { id: "c1", name: "Strength" };
const paid = { id: "p1", name: "Paid Program", status: "published", categoryIds: ["c1"], priceCents: 7999, level: "Beginner", weekOnePreview: { totalWeeks: 4 } };
const addonA = { id: "r1", name: "Hip Mobility", kind: "recovery", status: "published", priceCents: 0, level: "Beginner", weekOnePreview: { totalWeeks: 4 } };
const addonB = { id: "r2", name: "Spine Flow", kind: "recovery", status: "published", priceCents: 0, level: "Beginner", weekOnePreview: { totalWeeks: 4 } };

beforeEach(() => {
  setRecoveryAddon.mockClear();
  ctx = {
    soloPrograms: [paid, addonA, addonB],
    soloProgramCategories: [category],
    soloExercises: [],
    soloCurrentUser: { id: "u1", recoveryAddon: null },
    soloPurchases: [],
    soloBranding: {},
    startSoloCheckout,
    setRecoveryAddon,
  };
});
afterEach(cleanup);

async function renderDetail(id) {
  const { SoloThemeProvider } = await import("./SoloThemeContext");
  const { default: SoloProgramDetailsScreen } = await import("./SoloProgramDetailsScreen");
  render(
    <MemoryRouter initialEntries={[`/solo/program/${id}`]}>
      <SoloThemeProvider>
        <Routes>
          <Route path="/solo/program/:id" element={<SoloProgramDetailsScreen />} />
          <Route path="/solo/calendar" element={<p>calendar-page</p>} />
        </Routes>
      </SoloThemeProvider>
    </MemoryRouter>
  );
}

describe("recovery add-ons", () => {
  it("are kept out of the paid catalogue and recommendations, and listed on their own", () => {
    expect(visiblePrograms(ctx.soloPrograms, [category]).map((p) => p.id)).toEqual(["p1"]);
    expect(visibleRecoveryAddons(ctx.soloPrograms).map((p) => p.id)).toEqual(["r1", "r2"]);
    expect(recommendPrograms([{ ...addonA, categoryIds: ["c1"], goals: ["build_muscle"] }], [category], { primaryGoal: "build_muscle" })).toEqual([]);
  });

  it("shows Free and adds the add-on without any checkout", async () => {
    await renderDetail("r1");
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /add to my training/i }));
    await waitFor(() => expect(setRecoveryAddon).toHaveBeenCalledWith("u1", "r1"));
    expect(startSoloCheckout).not.toHaveBeenCalled();
    await screen.findByText("calendar-page");
  });

  it("asks before replacing the one active add-on", async () => {
    ctx.soloCurrentUser = { id: "u1", recoveryAddon: { programId: "r1" } };
    await renderDetail("r2");
    fireEvent.click(screen.getByRole("button", { name: /add to my training/i }));
    expect(setRecoveryAddon).not.toHaveBeenCalled();
    expect(await screen.findByText(/Only one recovery add-on can run at a time/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^replace$/i }));
    await waitFor(() => expect(setRecoveryAddon).toHaveBeenCalledWith("u1", "r2"));
  });

  it("lets the active add-on be removed", async () => {
    ctx.soloCurrentUser = { id: "u1", recoveryAddon: { programId: "r1" } };
    await renderDetail("r1");
    fireEvent.click(screen.getByRole("button", { name: /remove from my training/i }));
    await waitFor(() => expect(setRecoveryAddon).toHaveBeenCalledWith("u1", null));
  });
});
