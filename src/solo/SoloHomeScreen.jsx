import React from "react";
import { Logo } from "../components/ui";
import { useSoloApp } from "../lib/SoloAppContext";

// Deliberately minimal — proves the registration/login/session foundation
// works end-to-end (signed in, soloUsers/{uid} profile loaded) without
// building any of the onboarding/program/schedule/progress functionality
// that's explicitly out of scope for this phase.
export default function SoloHomeScreen() {
  const { soloCurrentUser, soloLogout } = useSoloApp();

  return (
    <div className="min-h-dvh w-full bg-[#0A0A0B] flex flex-col items-center justify-center px-6 py-8 gap-4">
      <Logo variant="mark" tone="white" className="h-12 w-auto" />
      <p className="text-white font-bold text-lg">Welcome, {soloCurrentUser?.name || "there"}</p>
      <p className="text-white/50 text-sm text-center max-w-xs">
        Your independent Train Solo account is set up. Onboarding, programs and scheduling come next.
      </p>
      <button onClick={soloLogout} className="text-white/50 text-sm underline underline-offset-2 mt-4">
        Log out
      </button>
    </div>
  );
}
