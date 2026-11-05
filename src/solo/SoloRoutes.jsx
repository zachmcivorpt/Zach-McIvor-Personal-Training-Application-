import React, { Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SoloAppProvider, useSoloApp } from "../lib/SoloAppContext";
import { SoloThemeProvider, useSoloTheme } from "./SoloThemeContext";
import SoloLaunchScreen from "./SoloLaunchScreen";
import SoloRegisterScreen from "./SoloRegisterScreen";
import SoloLoginScreen from "./SoloLoginScreen";
import SoloShell from "./SoloShell";
import SoloFinishSetupScreen from "./SoloFinishSetupScreen";
import { SoloPaywallProvider } from "./SoloPaywall";
import {
  SoloProgramDetailsScreen,
  SoloWorkoutSessionScreen,
  SoloWorkoutSummaryScreen,
  SoloSessionBuilderScreen,
  SoloOnboarding,
  SoloConsultationScreen,
  SoloProgramBuilderScreen,
  SoloFirstSessionScreen,
  SoloActiveRecoveryScreen,
  SoloProgramCompleteScreen,
  SoloWeekRecapScreen,
} from "./soloScreens";

// Was a plain black screen whatever the member's light/dark choice — the
// black flash on every launch (#165).
function SoloSessionLoadingScreen() {
  const { dark } = useSoloTheme();
  return <SoloLaunchScreen dark={dark} />;
}

function RequireSoloAuth({ children }) {
  const { soloAuthUser, soloCurrentUser, soloSessionLoading, soloProfileMissing } = useSoloApp();
  if (soloSessionLoading) return <SoloSessionLoadingScreen />;
  if (soloAuthUser && soloProfileMissing) return <SoloFinishSetupScreen />;
  if (!soloCurrentUser) return <Navigate to="/solo/register" replace />;
  return children;
}

// The questionnaire is loaded separately (#182). Signed out (register /
// sign in) or not through it yet: fetch its code now, so it's here the
// moment registration finishes.
function PreloadOnboarding() {
  const { soloAuthUser, soloCurrentUser, soloProfileMissing } = useSoloApp();
  const needed = soloAuthUser === null || !!soloProfileMissing || (!!soloCurrentUser && !soloCurrentUser.onboarding?.completed);
  useEffect(() => {
    if (needed) SoloOnboarding.preload().catch(() => {});
  }, [needed]);
  return null;
}

function SoloOnboardingCheckFailed({ onRetry }) {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-4 bg-[#0A0A0B] px-6 text-center">
      <p className="text-white/60 text-sm">Couldn't check your account — check your connection.</p>
      <button type="button" onClick={onRetry} className="text-white text-sm font-semibold underline underline-offset-2">
        Try again
      </button>
    </div>
  );
}

// New users must finish the consultation questionnaire before reaching
// home; returning users who already finished it go straight there — the
// one piece of branching logic for this gate, so it lives here rather than
// duplicated in both SoloShell and SoloOnboarding. `?review=1` lets a
// completed user reopen the questionnaire from Home without ever hitting
// this redirect (SoloOnboarding checks the query param itself, not this
// component).
//
// soloDb uses persistentLocalCache (see firebase.js), so the cached
// soloCurrentUser this reads can be stale — specifically, it can read
// `completed: false` for an account that genuinely finished onboarding
// after this browser/device last cached its profile, which bounced a
// legitimately-completed account back to the questionnaire. A cached
// `true` is never wrongly restrictive (there's no path that un-completes
// an account), so it's trusted immediately with no extra round trip —
// only a cached `false` gets verified against the server before deciding,
// so normal navigation between already-unlocked screens stays instant.
// A failed verification shows an explicit retry affordance rather than
// silently assuming incomplete (which would risk the same false
// redirect) or silently assuming complete (which would bypass the real
// check) — either guess could be wrong, so this asks instead of guessing.
//
// Exported (no behavior change) so a test can exercise this guard
// directly — see SoloRoutes.test.jsx.
export function RequireOnboardingComplete({ children }) {
  const { soloCurrentUser, fetchOnboardingCompletedFromServer } = useSoloApp();
  const cachedCompleted = !!soloCurrentUser?.onboarding?.completed;
  const [serverCompleted, setServerCompleted] = useState(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cachedCompleted) return;
    let cancelled = false;
    setCheckFailed(false);
    fetchOnboardingCompletedFromServer(soloCurrentUser.id)
      .then((completed) => {
        if (!cancelled) setServerCompleted(completed);
      })
      .catch(() => {
        if (!cancelled) setCheckFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cachedCompleted, soloCurrentUser?.id, fetchOnboardingCompletedFromServer, attempt]);

  if (cachedCompleted) return children;
  if (checkFailed) return <SoloOnboardingCheckFailed onRetry={() => setAttempt((n) => n + 1)} />;
  if (serverCompleted === null) return <SoloSessionLoadingScreen />;
  if (!serverCompleted) return <Navigate to="/solo/onboarding" replace />;
  return children;
}

// Mounted only for the /solo/* subtree (see App.jsx) — SoloAppProvider,
// and therefore its onAuthStateChanged(soloAuth, ...) listener, never runs
// at all for anyone on a Coaching route. "home" is the three-tab shell
// (Catalogue/My Training/Profile — see SoloShell.jsx); program/:id is a
// full-screen drill-down pushed from a catalogue card.
export default function SoloRoutes() {
  return (
    <SoloAppProvider>
      <SoloThemeProvider>
        <SoloPaywallProvider>
        {/* Keeps #root non-empty on every Train Solo screen (#165). The
            workout screen draws outside #root (a full-screen portal), and
            the iPhone app's alive check (ViewController.pageDrawsFrame)
            counts #root's children: 0 read as a dead page, so every return
            to the app mid-workout re-attached and then REBUILT the web view
            — a full reload that dropped the workout screen. */}
        <span hidden aria-hidden="true" data-apex-page="solo" />
        <PreloadOnboarding />
        {/* Screens loaded separately (soloScreens.js): almost always already
            here; if not, the launch screen in the member's own colours. */}
        <Suspense fallback={<SoloSessionLoadingScreen />}>
        <Routes>
          <Route path="register" element={<SoloRegisterScreen />} />
          <Route path="login" element={<SoloLoginScreen />} />
          <Route
            path="onboarding"
            element={
              <RequireSoloAuth>
                <SoloOnboarding />
              </RequireSoloAuth>
            }
          />
          <Route
            path="program-complete"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloProgramCompleteScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="week"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloWeekRecapScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="first-session"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloFirstSessionScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="home"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloShell />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="program/:id"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloProgramDetailsScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="workout"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloWorkoutSessionScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="workout-summary"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloWorkoutSummaryScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="session-builder"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloSessionBuilderScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="program-builder"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloProgramBuilderScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          {/* The calendar is a tab now (#171): older links open it there. */}
          <Route path="calendar" element={<Navigate to="/solo/home" replace state={{ soloTab: "calendar" }} />} />
          <Route
            path="recovery"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloActiveRecoveryScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route
            path="consultation"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloConsultationScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route path="*" element={<Navigate to="register" replace />} />
        </Routes>
        </Suspense>
        </SoloPaywallProvider>
      </SoloThemeProvider>
    </SoloAppProvider>
  );
}
