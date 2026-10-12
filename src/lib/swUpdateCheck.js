// Service-worker update-check scheduling — split out of main.jsx purely so
// it's independently testable (jsdom can exercise it without rendering the
// whole app). Behavior preserved from what already shipped: skipWaiting +
// clientsClaim (vite.config.js) make a freshly-deployed service worker take
// over quickly in the background, but that alone never reloads a tab
// that's already open — it just keeps running whatever JS it already
// loaded. Checking for updates on *resume* and reloading immediately used
// to cause a visible flash of stale content (a reload racing the app's own
// resume paint) — the controllerchange handler below still only ever
// auto-reloads while the app is hidden (or shows the "Refresh" banner
// otherwise), exactly as before, so that fix is untouched.
//
// What's new: an update CHECK (never an immediate reload — reloading is
// still gated entirely by controllerchange below) now also runs when the
// app becomes visible again, not just when it's backgrounded/blurred/on
// the 5-minute timer. That closes the one real gap in the existing
// coverage: someone who force-quits and reopens the app specifically to
// see whether a fix that shipped while it was closed is there yet — the
// existing hidden/blur/periodic checks never got a chance to run before
// they started looking.
export function setupServiceWorkerUpdateChecks() {
  if (!('serviceWorker' in navigator)) return;
  // Defensive idempotency guard: this is only ever called once, from
  // main.jsx's top-level module evaluation (which itself only ever runs
  // once per page load, including under React StrictMode — module
  // evaluation isn't double-invoked the way component effects are), but
  // guarding here too means a second call — from a future caller, or a
  // test exercising this twice — can never register a second set of
  // listeners or run two overlapping update-check loops.
  if (setupServiceWorkerUpdateChecks._installed) return;
  setupServiceWorkerUpdateChecks._installed = true;

  let reloading = false;
  const reloadNow = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  function showUpdateBanner() {
    const banner = document.createElement("div");
    banner.setAttribute(
      "style",
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;" +
        "background:#0A0A0B;color:#fff;font:600 14px -apple-system,system-ui,sans-serif;" +
        "padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));" +
        "display:flex;align-items:center;justify-content:space-between;gap:12px;" +
        "box-shadow:0 -4px 16px rgba(0,0,0,0.25);"
    );
    const label = document.createElement("span");
    label.textContent = "A new version of APEX is ready.";
    const button = document.createElement("button");
    button.textContent = "Refresh";
    button.setAttribute(
      "style",
      "background:#2F8FFF;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:700 13px -apple-system,system-ui,sans-serif;flex-shrink:0;"
    );
    button.onclick = reloadNow;
    banner.appendChild(label);
    banner.appendChild(button);
    document.body.appendChild(banner);
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (document.visibilityState === "hidden") {
      reloadNow();
      return;
    }
    showUpdateBanner();
    const reloadWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      document.removeEventListener("visibilitychange", reloadWhenHidden);
      reloadNow();
    };
    document.addEventListener("visibilitychange", reloadWhenHidden);
  });

  // A plain in-flight guard — reg.update() is safe to call concurrently on
  // its own, but the visible/hidden/blur/periodic triggers below can land
  // within milliseconds of each other (e.g. a quick tab-away-and-back), and
  // there's no reason to fire a second network request while the first
  // hasn't resolved yet.
  let checking = false;
  const checkForUpdate = () => {
    if (checking) return;
    checking = true;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      // A failed update check (offline, a flaky network, no registration
      // yet) must never surface as an unhandled rejection or break
      // anything else on the page — there's always another chance at the
      // next trigger.
      .catch(() => {})
      .finally(() => {
        checking = false;
      });
  };

  document.addEventListener("visibilitychange", () => {
    checkForUpdate();
  });
  window.addEventListener("blur", checkForUpdate);
  checkForUpdate();
  // Also poll periodically while the app stays open and in the foreground
  // the whole time — the scenario where neither a hide/visible nor a blur
  // event ever fires to trigger the checks above.
  setInterval(checkForUpdate, 5 * 60 * 1000);
}
