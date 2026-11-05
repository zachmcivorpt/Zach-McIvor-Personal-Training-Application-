// @vitest-environment jsdom
//
// #180: Getting Started for Free members — shown by itself once ever (marked
// seen on the account and the phone the moment it shows), skip or complete
// saved to the account, every step saved, reopened from Profile at any time.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { shouldAutoShowGettingStarted, startStep, gettingStartedKey, GETTING_STARTED_STEPS } from "./gettingStarted";

let ctx;
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ctx }));
vi.mock("./SoloThemeContext", async () => {
  const real = await vi.importActual("./SoloThemeContext");
  return { ...real, useSoloTheme: () => ({ dark: false }) };
});
const { default: SoloGettingStarted } = await import("./SoloGettingStarted");

const profile = { id: "u1", name: "Sam" };
const ready = { profile, tier: "free", entitlementReady: true, listsReady: true, logCount: 0 };

beforeEach(() => {
  localStorage.clear();
  ctx = { soloCurrentUser: profile, saveSoloGettingStarted: vi.fn(() => Promise.resolve()) };
});
afterEach(cleanup);

describe("when it shows by itself", () => {
  it("a brand-new Free member, once their plan and lists have loaded", () => {
    expect(shouldAutoShowGettingStarted(ready)).toBe(true);
    expect(shouldAutoShowGettingStarted({ ...ready, entitlementReady: false })).toBe(false);
    expect(shouldAutoShowGettingStarted({ ...ready, listsReady: false })).toBe(false);
  });

  it("never for Plus / All Access, or a member who has already trained", () => {
    expect(shouldAutoShowGettingStarted({ ...ready, tier: "plus" })).toBe(false);
    expect(shouldAutoShowGettingStarted({ ...ready, tier: "all_access" })).toBe(false);
    expect(shouldAutoShowGettingStarted({ ...ready, logCount: 2 })).toBe(false);
  });

  it("never again once seen — on the account (any phone, reinstall) or on this phone", () => {
    expect(shouldAutoShowGettingStarted({ ...ready, profile: { ...profile, gettingStarted: { seenAt: 1 } } })).toBe(false);
    localStorage.setItem(gettingStartedKey("u1"), "1");
    expect(shouldAutoShowGettingStarted(ready)).toBe(false);
  });

  it("reopens at the saved step if left part-way, from the start once finished", () => {
    expect(startStep({ gettingStarted: { step: 3 } })).toBe(3);
    expect(startStep({ gettingStarted: { step: 3, finishedAt: 1 } })).toBe(0);
    expect(startStep({ gettingStarted: { step: 99 } })).toBe(0);
    expect(startStep({})).toBe(0);
  });
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + (loc.state?.soloTab ? `#${loc.state.soloTab}` : "")}</p>;
}
function renderGuide(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/solo/home"]}>
      <Routes>
        <Route path="*" element={<><SoloGettingStarted open onClose={onClose} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

describe("the guide", () => {
  it("covers sessions, calendar, logging, the exercise library and Progress", () => {
    expect(GETTING_STARTED_STEPS.map((s) => s.id)).toEqual(["session", "calendar", "log", "library", "progress"]);
  });

  it("saves every step to the account, and completing saves finished + completed", () => {
    const onClose = renderGuide();
    expect(screen.getByText("Create a session")).toBeTruthy();
    for (let i = 1; i < GETTING_STARTED_STEPS.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(ctx.saveSoloGettingStarted).toHaveBeenLastCalledWith({ step: i });
    }
    expect(screen.getByText("Track your progress")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start training" }));
    expect(ctx.saveSoloGettingStarted).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "completed", finishedAt: expect.any(Number) }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Skip saves finished + skipped and closes", () => {
    const onClose = renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(ctx.saveSoloGettingStarted).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped", finishedAt: expect.any(Number) }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Try it opens the real screen (Calendar tab) and keeps their place", () => {
    renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Open Calendar/ }));
    expect(screen.getByTestId("where").textContent).toBe("/solo/home#calendar");
    expect(ctx.saveSoloGettingStarted).toHaveBeenLastCalledWith({ step: 1 });
  });

  it("opens where they left off", () => {
    ctx.soloCurrentUser = { ...profile, gettingStarted: { seenAt: 1, step: 2 } };
    renderGuide();
    expect(screen.getByText("Log your workout")).toBeTruthy();
  });
});

describe("wiring", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  it("My Training marks it seen on the account and the phone the moment it shows", () => {
    const s = src("./SoloMyTrainingScreen.jsx");
    expect(s).toMatch(/setStartedOpen\(true\);\s*markSeenOnPhone\(soloCurrentUser\.id\);\s*saveSoloGettingStarted\(\{ seenAt: Date\.now\(\) \}\)/);
    // The programs run-through waits until it's closed.
    expect(s).toMatch(/pendingSwitchId \|\| startedOpen\) return;/);
  });
  it("Profile has a permanent Getting Started row that reopens it", () => {
    const s = src("./SoloProfileScreen.jsx");
    expect(s).toMatch(/onClick=\{\(\) => setStartedOpen\(true\)\}[\s\S]*Getting Started/);
    expect(s).toMatch(/<SoloGettingStarted open=\{startedOpen\}/);
  });
});
