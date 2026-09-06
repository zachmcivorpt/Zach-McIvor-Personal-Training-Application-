import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./lib/AppContext";
import { Logo } from "./components/ui";
import LoginScreen from "./auth/LoginScreen";
import ActivateScreen from "./auth/ActivateScreen";
import CoachShell from "./coach/CoachShell";
import ClientApp from "./client/ClientApp";
import PrivacyPolicy from "./PrivacyPolicy";

// Firebase Auth restores a persisted session asynchronously — on a cold
// launch (most visible tapping an installed PWA icon) there's a brief
// window where we're genuinely still finding out whether someone's
// signed in. Redirecting to /login during that window (as if signed out)
// is what caused a flash of the login screen before immediately bouncing
// back in — the session was never actually lost, the UI just guessed
// wrong while still loading. This splash fills that gap instead.
function SessionLoadingScreen() {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-white">
      <Logo variant="mark" tone="black" className="w-10 h-10 opacity-25 animate-pulse" />
    </div>
  );
}

function RequireRole({ role, children }) {
  const { currentUser, sessionLoading } = useApp();
  if (sessionLoading) return <SessionLoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== role) return <Navigate to={currentUser.role === "coach" ? "/coach" : "/app"} replace />;
  return children;
}

function RootRedirect() {
  const { currentUser, sessionLoading } = useApp();
  if (sessionLoading) return <SessionLoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={currentUser.role === "coach" ? "/coach" : "/app"} replace />;
}

function Routed() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/activate" element={<ActivateScreen />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route
        path="/coach/*"
        element={
          <RequireRole role="coach">
            <CoachShell />
          </RequireRole>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireRole role="client">
            <ClientApp />
          </RequireRole>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AppProvider>
  );
}
