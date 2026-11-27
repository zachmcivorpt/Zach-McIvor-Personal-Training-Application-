// @vitest-environment jsdom
// #274: a new release must never reload the app by itself while a workout
// is open on the phone (coached session or Train Solo draft) — hiding the
// app between sets (phone locked, music app) used to reload it mid-session.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setupServiceWorkerUpdateChecks, workoutInProgress } from "./swUpdateCheck.js";

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("no update reload during a workout (#274)", () => {
  const handlers = [];
  const reload = vi.fn();
  beforeAll(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { addEventListener: (e, h) => e === "controllerchange" && handlers.push(h), getRegistration: () => Promise.resolve(null) },
      configurable: true,
    });
    Object.defineProperty(window, "location", { value: { reload }, writable: true, configurable: true });
    setupServiceWorkerUpdateChecks();
  });

  it("knows a workout is open from what's saved on the phone", () => {
    localStorage.clear();
    expect(workoutInProgress()).toBe(false);
    localStorage.setItem("clientActiveSession_c1", "{}");
    expect(workoutInProgress()).toBe(true);
    localStorage.clear();
    localStorage.setItem("apexSoloWorkoutDraft:u1", "{}");
    expect(workoutInProgress()).toBe(true);
  });

  it("an update never reloads on hide (#328); after 8 h away it waits while a workout is open (#274)", () => {
    localStorage.clear();
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    handlers.forEach((h) => h()); // update lands while hidden
    expect(reload).not.toHaveBeenCalled();
    // back after 9 h, mid-workout: still no reload
    localStorage.setItem("clientActiveSession_c1", "{}");
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    // workout finished; another short trip away: still no reload
    localStorage.removeItem("clientActiveSession_c1");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 60 * 1000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    // away overnight with no workout: applied on return
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
