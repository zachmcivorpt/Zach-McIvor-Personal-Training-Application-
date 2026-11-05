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

// Screens that are never the first one on a normal open (#182): kept out
// of Train Solo's startup code, which every cold open (and every Stripe
// return) downloads and runs before the first screen. Preloaded with the
// rest once Home is up; the questionnaire also as soon as Train Solo opens
// signed out (it follows registration).
export const SoloOnboarding = lazyScreen(() => import("./onboarding/SoloOnboarding"));
export const SoloConsultationScreen = lazyScreen(() => import("./SoloConsultationScreen"));
export const SoloProgramBuilderScreen = lazyScreen(() => import("./SoloProgramBuilderScreen"));
export const SoloFirstSessionScreen = lazyScreen(() => import("./SoloFirstSessionScreen"));
export const SoloActiveRecoveryScreen = lazyScreen(() => import("./SoloActiveRecoveryScreen"));
export const SoloProgramCompleteScreen = lazyScreen(() => import("./SoloRecapScreens").then((m) => ({ default: m.SoloProgramCompleteScreen })));
export const SoloWeekRecapScreen = lazyScreen(() => import("./SoloRecapScreens").then((m) => ({ default: m.SoloWeekRecapScreen })));

const ALL = [
  SoloProgramDetailsScreen,
  SoloWorkoutSessionScreen,
  SoloWorkoutSummaryScreen,
  SoloSessionBuilderScreen,
  SoloProgressScreen,
  SoloProgramBuilderScreen,
  SoloConsultationScreen,
  SoloProgramCompleteScreen,
  SoloWeekRecapScreen,
  SoloFirstSessionScreen,
  SoloActiveRecoveryScreen,
  SoloOnboarding,
];

let started = false;
export function preloadSoloScreens() {
  if (started) return;
  started = true;
  for (const Screen of ALL) Screen.preload().catch(() => {});
}
