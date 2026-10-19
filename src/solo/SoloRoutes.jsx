import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SoloAppProvider, useSoloApp } from "../lib/SoloAppContext";
import SoloRegisterScreen from "./SoloRegisterScreen";
import SoloLoginScreen from "./SoloLoginScreen";
import SoloHomeScreen from "./SoloHomeScreen";

function SoloSessionLoadingScreen() {
  return <div className="w-full h-screen flex items-center justify-center bg-[#0A0A0B]" />;
}

function RequireSoloAuth({ children }) {
  const { soloCurrentUser, soloSessionLoading } = useSoloApp();
  if (soloSessionLoading) return <SoloSessionLoadingScreen />;
  if (!soloCurrentUser) return <Navigate to="/solo/register" replace />;
  return children;
}

// Mounted only for the /solo/* subtree (see App.jsx) — SoloAppProvider,
// and therefore its onAuthStateChanged(soloAuth, ...) listener, never runs
// at all for anyone on a Coaching route. This is the full route map for
// this phase: registration, login, and a placeholder home screen proving
// the account foundation works. Onboarding/programs/scheduling are
// explicitly out of scope here.
export default function SoloRoutes() {
  return (
    <SoloAppProvider>
      <Routes>
        <Route path="register" element={<SoloRegisterScreen />} />
        <Route path="login" element={<SoloLoginScreen />} />
        <Route
          path="home"
          element={
            <RequireSoloAuth>
              <SoloHomeScreen />
            </RequireSoloAuth>
          }
        />
        <Route path="*" element={<Navigate to="register" replace />} />
      </Routes>
    </SoloAppProvider>
  );
}
