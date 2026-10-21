import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SoloAppProvider, useSoloApp } from "../lib/SoloAppContext";
import { SoloThemeProvider } from "./SoloThemeContext";
import SoloRegisterScreen from "./SoloRegisterScreen";
import SoloLoginScreen from "./SoloLoginScreen";
import SoloShell from "./SoloShell";
import SoloProgramDetailsScreen from "./SoloProgramDetailsScreen";
import SoloWorkoutSessionScreen from "./SoloWorkoutSessionScreen";
import SoloWorkoutSummaryScreen from "./SoloWorkoutSummaryScreen";
import SoloCalendarScreen from "./SoloCalendarScreen";
import SoloOnboarding from "./onboarding/SoloOnboarding";

function SoloSessionLoadingScreen() {
  return <div className="w-full h-screen flex items-center justify-center bg-[#0A0A0B]" />;
}

function RequireSoloAuth({ children }) {
  const { soloCurrentUser, soloSessionLoading } = useSoloApp();
  if (soloSessionLoading) return <SoloSessionLoadingScreen />;
  if (!soloCurrentUser) return <Navigate to="/solo/register" replace />;
  return children;
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
            path="calendar"
            element={
              <RequireSoloAuth>
                <RequireOnboardingComplete>
                  <SoloCalendarScreen />
                </RequireOnboardingComplete>
              </RequireSoloAuth>
            }
          />
          <Route path="*" element={<Navigate to="register" replace />} />
        </Routes>
      </SoloThemeProvider>
    </SoloAppProvider>
  );
}
