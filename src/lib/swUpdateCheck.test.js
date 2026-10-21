// @vitest-environment jsdom
//
// Regression coverage for the verified "fixes aren't appearing" root cause:
// a device that already had the app open before a new deploy only ever
// re-checked for a service-worker update on the app being backgrounded
// (hidden/blur) or a 5-minute timer — never on actually RETURNING to the
// app, which is exactly when someone reopens it specifically to check
// whether a fix landed. Covers the new "check on visible" behavior, that
// it never triggers an immediate reload (the existing anti-flash fix —
// reload only while hidden, or show the banner — must stay intact), the
// overlapping-check guard, the duplicate-listener guard, and that a failed
// update check never produces an unhandled rejection.
//
// setupServiceWorkerUpdateChecks() is only ever meant to be installed once
// per page load (its own defensive guard enforces that — see
// swUpdateCheck.js), and it attaches listeners directly to the shared
// jsdom document/window singletons, which persist across tests in this
// file. So rather than fighting that by reloading the module per test
// (which leaves old listeners attached with no way to remove them), this
// installs it exactly ONCE for the whole suite and drives behavior through
// the one shared mock service worker registration, matching how it's
// actually used in the real app.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServiceWorkerUpdateChecks } from "./swUpdateCheck.js";

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

// Flushes the microtask queue without ever letting a due *timer* (the
// 5-minute poll interval in particular) actually fire — advancing fake
// time by 0ms runs no timer (nothing is due at +0ms) but still flushes
// whatever promise chain is pending (getRegistration -> then -> catch ->
// finally takes a few microtask hops to settle), repeated a few times to
// reliably drain a multi-hop chain.
async function flush() {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
}

describe("setupServiceWorkerUpdateChecks", () => {
  let registration;
  let sw;
  let controllerChangeHandlers;
  let reloadSpy;

  beforeAll(async () => {
    vi.useFakeTimers();
    controllerChangeHandlers = [];
    registration = { update: vi.fn(() => Promise.resolve()) };
    sw = {
      addEventListener: vi.fn((event, handler) => {
        if (event === "controllerchange") controllerChangeHandlers.push(handler);
      }),
      getRegistration: vi.fn(() => Promise.resolve(registration)),
    };
    Object.defineProperty(navigator, "serviceWorker", { value: sw, configurable: true });
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true, configurable: true });

    setupServiceWorkerUpdateChecks();
    await flush();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    setVisibility("visible");
    await flush(); // drain any leftover in-flight state from the previous test
    registration.update.mockClear();
    sw.getRegistration.mockClear();
    reloadSpy.mockClear();
    document.querySelectorAll('div[style*="2147483647"]').forEach((el) => el.remove());
  });

  afterEach(() => {
    registration.update.mockImplementation(() => Promise.resolve());
    sw.getRegistration.mockImplementation(() => Promise.resolve(registration));
  });

  it("a second installation is a no-op (defensive duplicate-listener guard)", async () => {
    const controllerChangeListenersBefore = controllerChangeHandlers.length;
    setupServiceWorkerUpdateChecks();
    await flush();
    expect(registration.update).not.toHaveBeenCalled(); // no second initial check ran
    expect(controllerChangeHandlers.length).toBe(controllerChangeListenersBefore); // no second controllerchange listener added
  });

  // The actual fix this task asks for: a check now runs when the document
  // becomes visible again (reopening the app), not just on hidden/blur.
  it("checks for an update when the document becomes visible again", async () => {
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  // Existing behavior preserved: a check still runs on becoming hidden too.
  it("still checks for an update when the document becomes hidden (existing behavior preserved)", async () => {
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("still checks for an update on window blur (existing behavior preserved)", async () => {
    window.dispatchEvent(new Event("blur"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("still polls every 5 minutes while the app stays open (existing behavior preserved)", async () => {
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  // Prevents overlapping checks: two triggers landing before the first
  // in-flight getRegistration()/update() resolves must not both call
  // update() — only the first should go through.
  it("does not run an overlapping update check while one is already in flight", async () => {
    let resolveUpdate;
    registration.update.mockImplementation(() => new Promise((res) => (resolveUpdate = res)));

    document.dispatchEvent(new Event("visibilitychange")); // starts the in-flight check
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    // A second trigger lands before the first resolves — must be ignored.
    window.dispatchEvent(new Event("blur"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    resolveUpdate();
    await flush();

    // Now that the first has resolved, a new trigger is allowed through.
    window.dispatchEvent(new Event("blur"));
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(2);

    // Resolve this second in-flight check too (mockImplementation above
    // still returns a new pending promise each call) — otherwise it's
    // left dangling past the end of this test, leaking a permanently
    // "checking" state into whichever test runs next.
    resolveUpdate();
    await flush();
  });

  // A failed update check (offline, a flaky network, getRegistration()
  // itself rejecting) must never surface as an unhandled rejection.
  it("never throws or creates an unhandled rejection when the update check fails", async () => {
    sw.getRegistration.mockImplementation(() => Promise.reject(new Error("network down")));
    const unhandled = vi.fn();
    process.once("unhandledRejection", unhandled);

    document.dispatchEvent(new Event("visibilitychange"));
    await flush();

    expect(unhandled).not.toHaveBeenCalled();
  });

  it("the in-flight guard resets even after a failed check, so the next trigger isn't permanently blocked", async () => {
    sw.getRegistration.mockImplementation(() => Promise.reject(new Error("network down")));

    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(sw.getRegistration).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("blur"));
    await flush();
    expect(sw.getRegistration).toHaveBeenCalledTimes(2);
  });

  // The anti-flash fix must stay intact and is untouched by this change:
  // an update becoming available while the app is VISIBLE only shows the
  // banner, never an immediate reload — reload is deferred until the app
  // goes hidden. (The module's own `reloading` latch is one-shot per real
  // page load by design — once a reload is triggered the page is about to
  // unload, so there's no scenario to re-test within one suite run; this
  // is the single, last test in the file for exactly that reason.)
  it("an update landing while visible shows the banner and does not reload immediately, reloading only once hidden", async () => {
    setVisibility("visible");
    controllerChangeHandlers.forEach((h) => h());

    expect(reloadSpy).not.toHaveBeenCalled();
    const banner = [...document.querySelectorAll("div")].find((el) => /new version of APEX is ready/i.test(el.textContent || ""));
    expect(banner).toBeTruthy();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
