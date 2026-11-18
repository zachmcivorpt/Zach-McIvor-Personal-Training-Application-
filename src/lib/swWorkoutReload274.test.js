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

  it("an update while hidden mid-workout waits; it reloads the first time the app is hidden after the workout ends", () => {
    localStorage.clear();
    localStorage.setItem("clientActiveSession_c1", "{}");
    setVisibility("hidden");
    handlers.forEach((h) => h());
    expect(reload).not.toHaveBeenCalled();
    // back to the app and away again, still training
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    // workout finished, then the app is put away
    localStorage.removeItem("clientActiveSession_c1");
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
