import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SoloAppProvider, useSoloApp } from "../lib/SoloAppContext";
import SoloRegisterScreen from "./SoloRegisterScreen";
import SoloLoginScreen from "./SoloLoginScreen";
import SoloHomeScreen from "./SoloHomeScreen";
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
// duplicated in both SoloHomeScreen and SoloOnboarding. `?review=1` lets a
// completed user reopen the questionnaire from Home without ever hitting
// this redirect (SoloOnboarding checks the query param itself, not this
// component).
function RequireOnboardingComplete({ children }) {
  const { soloCurrentUser } = useSoloApp();
  if (!soloCurrentUser?.onboarding?.completed) return <Navigate to="/solo/onboarding" replace />;
  return children;
}

// Mounted only for the /solo/* subtree (see App.jsx) — SoloAppProvider,
// and therefore its onAuthStateChanged(soloAuth, ...) listener, never runs
// at all for anyone on a Coaching route. Programs/scheduling/purchases are
// still explicitly out of scope for this phase — SoloHomeScreen stays the
// same placeholder it was in Phase 1, just now gated on having finished
// the Phase 2 onboarding questionnaire first.
export default function SoloRoutes() {
  return (
    <SoloAppProvider>
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
                <SoloHomeScreen />
              </RequireOnboardingComplete>
            </RequireSoloAuth>
          }
        />
        <Route path="*" element={<Navigate to="register" replace />} />
      </Routes>
    </SoloAppProvider>
  );
}
