import React from "react";
import LoginBackground from "../components/LoginBackground";

// Reuses the exact same coach-configured background
// (settings/appDesign.loginBackgroundUrl, public read) and overlay
// gradient as LoginScreen.jsx itself — not a separate Train Solo setting,
// per the explicit "no duplicate setting" requirement. Falls back to the
// same plain #0A0A0B LoginScreen falls back to when no background has
// been set at all. Shared by every Train Solo screen that's meant to look
// like "the login experience" — StartScreen, SoloLoginScreen,
// SoloRegisterScreen, and the consultation questionnaire — so there is
// exactly one place this logic lives, not one copy per screen.
function SoloBackgroundLayer({ appDesign }) {
  if (!appDesign?.loginBackgroundUrl) return null;
  return (
    <>
      <LoginBackground appDesign={appDesign} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
    </>
  );
}

// Every full-screen Train Solo entry state renders its content through
// this frame — the background/overlay sits at z-0, the screen's actual
// content at z-10 above it.
//
// The top padding adds the status-bar/notch height (env(safe-area-inset-top),
// 0 everywhere except the App Store app's edge-to-edge frame), so content
// stays clear of it while the photo runs up behind it.
export function SoloBackgroundFrame({ appDesign, className = "flex flex-col px-6 py-8", children }) {
  return (
    <div
      className={`min-h-dvh w-full relative overflow-hidden bg-[#0A0A0B] ${className}`}
      style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))" }}
    >
      <SoloBackgroundLayer appDesign={appDesign} />
      <div className="relative z-10 flex flex-col flex-1 w-full">{children}</div>
    </div>
  );
}
