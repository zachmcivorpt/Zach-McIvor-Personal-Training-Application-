import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SoloAppProvider, useSoloApp } from "../lib/SoloAppContext";
import { SoloThemeProvider } from "./SoloThemeContext";
import SoloRegisterScreen from "./SoloRegisterScreen";
import SoloLoginScreen from "./SoloLoginScreen";
import SoloShell from "./SoloShell";
import SoloProgramDetailsScreen from "./SoloProgramDetailsScreen";
import SoloWorkoutSessionScreen from "./SoloWorkoutSessionScreen";
import SoloWorkoutSummaryScreen from "./SoloWorkoutSummaryScreen";
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

// New users must finish the consultation questionnaire before reaching
// home; returning users who already finished it go straight there — the
// one piece of branching logic for this gate, so it lives here rather than
// duplicated in both SoloShell and SoloOnboarding. `?review=1` lets a
// completed user reopen the questionnaire from Home without ever hitting
// this redirect (SoloOnboarding checks the query param itself, not this
// component).
//
// `location.state?.justCompletedOnboarding` is a deliberate, synchronous
// bypass of the Firestore-backed `completed` check below, set only by
// SoloOnboarding's own completing navigate() call. Without it, this
// still depends on soloCurrentUser (populated by SoloAppContext's
// onSnapshot listener on soloUsers/{uid}) having already reflected the
// just-finished answer's write by the exact instant this re-evaluates —
// not guaranteed, since the write's own promise resolving and React
// having committed the resulting context update are two separate async
// events with no ordering guarantee relative to this render. Trusting
// the local nav state for this one transition removes that race
// entirely instead of depending on its timing; every other way of
// reaching these routes (a reload, a deep link, logging back in) still
// goes through the real soloCurrentUser.onboarding.completed check.
//
// Exported (no behavior change) so a test can exercise this guard
// directly — see SoloRoutes.test.jsx.
export function RequireOnboardingComplete({ children }) {
  const { soloCurrentUser } = useSoloApp();
  const location = useLocation();
  if (!soloCurrentUser?.onboarding?.completed && !location.state?.justCompletedOnboarding) {
    return <Navigate to="/solo/onboarding" replace />;
  }
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
          <Route path="*" element={<Navigate to="register" replace />} />
        </Routes>
      </SoloThemeProvider>
    </SoloAppProvider>
  );
}
