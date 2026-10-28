import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp, PROFILE_CACHE_KEY } from "./lib/AppContext";
import { Logo } from "./components/ui";
import { BG, CLIENT_DARK_BG } from "./theme";
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
const loadCoachShell = () => import("./coach/CoachShell");
const loadClientApp = () => import("./client/ClientApp");
const CoachShell = lazy(loadCoachShell);
const ClientApp = lazy(loadClientApp);
const SoloRoutes = lazy(() => import("./solo/SoloRoutes"));

// The role of whoever was last signed in on this phone (AppContext keeps
// their profile on the phone). Their screen's code starts loading right
// away, alongside Firebase restoring the session, instead of only once the
// session and profile have both loaded — that wait-then-download chain was
// most of a cold open's time on the splash.
const lastRole = (() => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "null")?.role || null;
  } catch {
    return null;
  }
})();
if (lastRole === "coach") loadCoachShell().catch(() => {});
else if (lastRole === "client") loadClientApp().catch(() => {});

// Firebase Auth restores a persisted session asynchronously — on a cold
// launch (most visible tapping an installed PWA icon) there's a brief
// window where we're genuinely still finding out whether someone's
// signed in. Redirecting to /login during that window (as if signed out)
// is what caused a flash of the login screen before immediately bouncing
// back in — the session was never actually lost, the UI just guessed
// wrong while still loading. This splash fills that gap instead.
// A coach's splash is dark like the console it opens into, so a cold open
// doesn't flash white between the dark launch screen and the console.
function SessionLoadingScreen() {
  const dark = lastRole === "coach";
  return (
    <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: dark ? CLIENT_DARK_BG : BG }}>
      <Logo variant="mark" tone={dark ? "white" : "black"} className="w-10 h-10 opacity-25 animate-pulse" />
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
    // index.html paints a coach's page dark before the app loads; clear it
    // once the app is anywhere else so nothing light shows dark behind it.
    if (location.pathname !== "/" && !location.pathname.startsWith("/coach")) {
      document.documentElement.style.backgroundColor = "";
    }
    // Train Solo has its own light/dark toggle, so it posts its own theme
    // from SoloThemeProvider (src/solo/SoloThemeContext.jsx) instead.
    if (location.pathname.startsWith("/solo")) return;
    // The full-bleed photo screens also get a dark strip, so an App Store
    // build that doesn't support the edge-to-edge frame yet shows black
    // above the photo instead of a white bar.
    const fullBleed = location.pathname === "/login" || location.pathname === "/start";
    try {
      window.webkit?.messageHandlers?.apexTheme?.postMessage({
        dark: location.pathname.startsWith("/coach") || fullBleed,
        edgeToEdge: fullBleed,
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
