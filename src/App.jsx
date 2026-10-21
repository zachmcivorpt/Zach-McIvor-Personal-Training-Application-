import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./lib/AppContext";
import { Logo } from "./components/ui";
import LoginScreen from "./auth/LoginScreen";
import ActivateScreen from "./auth/ActivateScreen";
import LegalPage from "./legal/LegalPage";
import StartScreen from "./solo/StartScreen";

// CoachShell and ClientApp are each huge route trees (the entire coach
// console / entire client app) — bundling both into the single main chunk
// meant every cold launch had to parse+execute both in full before anything
// could render, even for a client who only ever needs ClientApp. Lazy
// loading means the critical path (auth check → sign in → one of these two)
// only ever fetches/runs the one actually needed. SoloRoutes (Train Solo —
// its own SoloAppProvider/Firebase session, see src/lib/SoloAppContext.jsx)
// is lazy for the same reason, and additionally so a Coaching user's bundle
// never even fetches Train Solo's code.
const CoachShell = lazy(() => import("./coach/CoachShell"));
const ClientApp = lazy(() => import("./client/ClientApp"));
const SoloRoutes = lazy(() => import("./solo/SoloRoutes"));

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
  // Was <Navigate to="/login" replace /> — the only behavioral change in
  // this function. A signed-in coach/client still redirects straight to
  // /coach or /app exactly as before (the branch below is untouched); only
  // a genuinely signed-OUT visitor now sees the Coaching/Train Solo choice
  // first. Coaching's own path from /start is an unmodified link to this
  // same /login screen.
  if (!currentUser) return <Navigate to="/start" replace />;
  return <Navigate to={currentUser.role === "coach" ? "/coach" : "/app"} replace />;
}

// The iOS App Store build (ios/ApexCoach/ViewController.swift) wraps this
// whole app in a bare WKWebView pinned below the safe area — the strip
// above it (status bar + notch) is that view's own background color, which
// doesn't automatically track whatever this page is showing. Only the
// coach console is always dark; the client app and the login/activate
// screens are light, so this tells native which one's current rather than
// hardcoding dark everywhere, which would put a black bar over the
// client's light screens. A no-op everywhere else (regular browser,
// Android) since window.webkit only exists inside that WKWebView.
//
// `edgeToEdge` is a separate flag, not folded into `dark`: it tells native
// to extend the webview's own frame up past the status bar/notch instead
// of pinning below it, specifically for the login screen's full-bleed gym
// photo. Scoped to exactly "/login" and "/start" (the Coaching / Train Solo
// chooser, same photo) — every other route keeps native's
// existing pinned-below-safe-area frame untouched. LoginScreen.jsx's own
// `pt-safe` padding (env(safe-area-inset-top), already 0 everywhere this
// isn't true) is what keeps the logo/form clear of the status bar once the
// webview itself extends there.
export function NativeStatusBarSync() {
  const location = useLocation();
  useEffect(() => {
    // Train Solo has its own light/dark toggle, so it posts its own theme
    // from SoloThemeProvider (src/solo/SoloThemeContext.jsx) instead.
    if (location.pathname.startsWith("/solo")) return;
    try {
      window.webkit?.messageHandlers?.apexTheme?.postMessage({
        dark: location.pathname.startsWith("/coach"),
        edgeToEdge: location.pathname === "/login" || location.pathname === "/start",
      });
    } catch {}
  }, [location.pathname]);
  return null;
}

// Exported (only change here — behavior is identical) so a test can render
// it inside its own MemoryRouter at a chosen path, the same way
// nativeStatusBarSync.test.jsx already does for NativeStatusBarSync in
// this file — the real App() default export always mounts its own
// BrowserRouter, which a test can't point at an arbitrary initial path.
export function Routed() {
  return (
    <>
      <NativeStatusBarSync />
      <Routes>
        <Route path="/start" element={<StartScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/activate" element={<ActivateScreen />} />
        <Route path="/privacy" element={<Navigate to="/legal/privacy-policy" replace />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route
          path="/solo/*"
          element={
            <Suspense fallback={<SessionLoadingScreen />}>
              <SoloRoutes />
            </Suspense>
          }
        />
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
    </>
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
