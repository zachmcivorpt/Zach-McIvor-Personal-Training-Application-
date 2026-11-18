// @vitest-environment jsdom
// #285 (owner: "every time I open the nutrition tab it opens this"): Home's
// "Log Nutrition" tile opened Add Food, but the request was kept, so every
// later visit to the Nutrition tab (the screen remounts) opened Add Food
// again. Real ClientApp, real tab bar.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 60000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T19:00:00"));
  try { localStorage.clear(); } catch {}
  const db = new Proxy(
    { users: [{ id: "coach", role: "coach", name: "Zach" }], exercises: [], workoutLogs: { c1: [] }, scheduledWorkouts: { c1: [] }, clientPhases: { c1: [] }, nutritionLogs: { c1: [] }, messages: { c1: [] }, habits: { c1: [] }, challenges: [], groups: [], forms: [], appDesign: {}, customFoods: [], masterMeals: [], savedMeals: { c1: [] } },
    { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? {} : undefined) }
  );
  const base = { currentUser: { id: "c1", name: "John Client", role: "client", status: "active" }, db, dbReady: true, viewingAsClient: false, pendingCoachDate: null, coachUser: null };
  ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? vi.fn(() => Promise.resolve()) : undefined) });
}

const addFoodOpen = () => !!screen.queryByPlaceholderText(/Search foods/i);
const tabBtn = (label) => within(screen.getByTestId("client-tab-bar")).getByRole("button", { name: label });

describe("Log Nutrition opens the main Nutrition tab (#285, #291)", () => {
  it("the tile opens the Nutrition tab (not Add Food); coming back to Nutrition later never opens Add Food", async () => {
    setup();
    const { default: ClientApp } = await import("./ClientApp");
    render(<ClientApp />);
    fireEvent.click(await screen.findByTestId("home-tile-nutrition"));
    await new Promise((r) => setTimeout(r, 50));
    // #291 (owner): the main Nutrition tab, not the Add Food page.
    expect(within(screen.getByTestId("client-tab-bar")).getByRole("button", { name: "Nutrition" }).getAttribute("aria-current")).toBe("page");
    expect(addFoodOpen()).toBe(false);
    // Leave for Home, then open the Nutrition tab normally.
    fireEvent.click(tabBtn("Home"));
    expect(addFoodOpen()).toBe(false);
    fireEvent.click(tabBtn("Nutrition"));
    await new Promise((r) => setTimeout(r, 50));
    expect(addFoodOpen()).toBe(false);
    fireEvent.click(tabBtn("Progress"));
    fireEvent.click(tabBtn("Nutrition"));
    await new Promise((r) => setTimeout(r, 50));
    expect(addFoodOpen()).toBe(false);
  });
});
