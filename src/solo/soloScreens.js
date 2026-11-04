import { lazy } from "react";

// Train Solo screens that reuse the coached client app's components (and so
// pull in its code and food database, ~0.7 MB) load separately from the
// launch path (#165): opening the app used to download and run all of that
// before the first Train Solo screen. They're fetched quietly once Train
// Solo is on screen (preloadSoloScreens), so moving to them stays instant.
//
// Once a screen's code is here it's handed to React synchronously, so it
// shows at once with no loading frame in between.
export function lazyScreen(load) {
  let loaded = null;
  let pending = null;
  const preload = () =>
    (pending ||= load().then(
      (mod) => (loaded = mod),
      (err) => {
        pending = null;
        throw err;
      }
    ));
  const Screen = lazy(() => (loaded ? { then: (resolve) => resolve(loaded) } : preload()));
  Screen.preload = preload;
  return Screen;
}

export const SoloProgramDetailsScreen = lazyScreen(() => import("./SoloProgramDetailsScreen"));
export const SoloWorkoutSessionScreen = lazyScreen(() => import("./SoloWorkoutSessionScreen"));
export const SoloWorkoutSummaryScreen = lazyScreen(() => import("./SoloWorkoutSummaryScreen"));
export const SoloSessionBuilderScreen = lazyScreen(() => import("./SoloSessionBuilderScreen"));
export const SoloProgressScreen = lazyScreen(() => import("./SoloProgressScreen"));

const ALL = [SoloProgramDetailsScreen, SoloWorkoutSessionScreen, SoloWorkoutSummaryScreen, SoloSessionBuilderScreen, SoloProgressScreen];

let started = false;
export function preloadSoloScreens() {
  if (started) return;
  started = true;
  for (const Screen of ALL) Screen.preload().catch(() => {});
}
