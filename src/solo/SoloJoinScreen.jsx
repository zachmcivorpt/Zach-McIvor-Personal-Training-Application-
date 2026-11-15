import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { AuthButton as PrimaryButton } from "../auth/authUi";
import { EchoHeading, LitLogo, START_CHOOSER } from "../components/LoginHero";
import { SoloBackgroundFrame } from "./SoloBackground";
import { APP_STORE_URL, inIosApp } from "./appShell";
import { PENDING_PARTNER_CODE_KEY, normalisePartnerCode } from "./partners";
import { lookUpPartnerCode } from "./partnerStore";

// A friend's invite link, /solo/join/CODE (#234). Built exactly like the
// Train Solo log-in screens (SoloLoginScreen: the same frame, Back, lit
// logo, echo heading, buttons). The code is kept on the phone; My
// Training's Team week joins it once they're signed in (after registering
// and the questionnaire, if they're new).
export default function SoloJoinScreen() {
  const { code: raw } = useParams();
  const code = normalisePartnerCode(raw);
  const navigate = useNavigate();
  const { soloCurrentUser, soloSessionLoading, soloAppDesign } = useSoloApp();
  const [inviter, setInviter] = useState(undefined);

  useEffect(() => {
    if (!code) return;
    try {
      localStorage.setItem(PENDING_PARTNER_CODE_KEY, code);
    } catch {
      /* private mode: they can still type the code */
    }
    lookUpPartnerCode(code)
      .then((r) => setInviter(r))
      .catch(() => setInviter(null));
  }, [code]);

  if (!code) return <Navigate to="/solo/home" replace />;
  if (!soloSessionLoading && soloCurrentUser) return <Navigate to="/solo/home" replace />;

  const name = inviter?.firstName;
  return (
    <SoloBackgroundFrame appDesign={soloAppDesign}>
      <Link to={START_CHOOSER} className="flex items-center gap-1 text-white/50 text-sm font-medium">
        <ChevronLeft size={16} /> Back
      </Link>

      <div className="flex justify-center pt-6 pb-10">
        <LitLogo width={104} crisp />
      </div>

      <div className="w-full max-w-sm mx-auto">
        <EchoHeading size={28} className="mb-2">
          Train Together
        </EchoHeading>
        <p className="text-white/50 text-sm text-center mb-6">
          {name ? `${name} invited you to train together.` : "You've been invited to train together."} Both hit your sessions each week to keep the streak alive. You see each other's training days and can train each other's sessions — never weights, body stats or photos.
        </p>

        <p className="text-white/50 text-[11px] font-bold tracking-wide uppercase text-center">Invite code</p>
        <p className="text-white text-[28px] font-extrabold tabular-nums tracking-[0.18em] text-center mt-1 mb-6">{code}</p>

        <PrimaryButton
          type="button"
          className="w-full !rounded-full"
          onClick={() => (inIosApp() ? navigate("/solo/register") : window.location.assign(APP_STORE_URL))}
        >
          {inIosApp() ? "CREATE AN ACCOUNT" : "GET THE APEX APP"} <ChevronRight size={18} />
        </PrimaryButton>

        {!inIosApp() && (
          <p className="text-center text-white/50 text-sm mt-6">
            In the app, enter the code in My Training → Team Week. Or{" "}
            <Link to="/solo/register" className="text-white font-semibold underline underline-offset-2">
              create an account here
            </Link>
          </p>
        )}
        <p className="text-center text-white/50 text-sm mt-4">
          Already have an account?{" "}
          <Link to="/solo/login" className="text-white font-semibold underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </SoloBackgroundFrame>
  );
}
