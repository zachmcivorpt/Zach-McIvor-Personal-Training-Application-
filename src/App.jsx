import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./lib/AppContext";
import { Logo } from "./components/ui";
import LoginScreen from "./auth/LoginScreen";
import ActivateScreen from "./auth/ActivateScreen";
import LegalPage from "./legal/LegalPage";

// CoachShell and ClientApp are each huge route trees (the entire coach
// console / entire client app) — bundling both into the single main chunk
// meant every cold launch had to parse+execute both in full before anything
// could render, even for a client who only ever needs ClientApp. Lazy
// loading means the critical path (auth check → sign in → one of these two)
// only ever fetches/runs the one actually needed.
const CoachShell = lazy(() => import("./coach/CoachShell"));
const ClientApp = lazy(() => import("./client/ClientApp"));

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
      <Route path="/privacy" element={<Navigate to="/legal/privacy-policy" replace />} />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route
        path="/coach/*"
        element={
          <RequireRole role="coach">
            <Suspense fallback={<SessionLoadingScreen />}>
              <CoachShell />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireRole role="client">
            <Suspense fallback={<SessionLoadingScreen />}>
              <ClientApp />
            </Suspense>
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
