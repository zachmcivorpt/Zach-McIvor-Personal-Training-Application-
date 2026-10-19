import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { useSoloApp } from "../lib/SoloAppContext";
import { AlertTriangle } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";

// Still deliberately minimal — proves the registration/login/session
// foundation AND the Phase 2 onboarding questionnaire work end-to-end
// (signed in, soloUsers/{uid} profile loaded, onboarding.completed true —
// enforced by RequireOnboardingComplete in SoloRoutes.jsx, not by this
// screen) without building any of the program/schedule/progress
// functionality that's still explicitly out of scope for this phase.
export default function SoloHomeScreen() {
  const { soloCurrentUser, soloLogout } = useSoloApp();
  const flagged = isFlaggedForMedicalReview(soloCurrentUser?.onboarding?.answers || {});

  return (
    <div className="min-h-dvh w-full bg-[#0A0A0B] flex flex-col items-center justify-center px-6 py-8 gap-4">
      <Logo variant="mark" tone="white" className="h-12 w-auto" />
      <p className="text-white font-bold text-lg">Welcome, {soloCurrentUser?.name || "there"}</p>
      <p className="text-white/50 text-sm text-center max-w-xs">
        Your independent Train Solo account is set up and your consultation is complete. Programs and scheduling come next.
      </p>

      {flagged && (
        <div className="w-full max-w-xs bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 flex gap-2.5">
          <AlertTriangle size={18} color={MEASURE_BLUE} className="shrink-0 mt-0.5" />
          <p className="text-white/70 text-xs leading-relaxed">
            Based on your answers, it's worth checking in with a doctor or allied health professional before training. This isn't a
            diagnosis or medical clearance — just a standard first-pass safety flag.
          </p>
        </div>
      )}

      <Link to="/solo/onboarding?review=1" className="text-white/50 text-sm underline underline-offset-2 mt-2">
        Review my answers
      </Link>
      <button onClick={soloLogout} className="text-white/50 text-sm underline underline-offset-2">
        Log out
      </button>
    </div>
  );
}
