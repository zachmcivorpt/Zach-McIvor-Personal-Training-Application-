import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { APP_STORE_URL, inIosApp } from "./appShell";
import { PENDING_PARTNER_CODE_KEY, normalisePartnerCode } from "./partners";
import { lookUpPartnerCode } from "./partnerStore";

// A friend's invite link, /solo/join/CODE (#234). The code is kept on the
// phone; My Training's Team week joins it once they're signed in (after
// registering and the questionnaire, if they're new).
export default function SoloJoinScreen() {
  const { code: raw } = useParams();
  const code = normalisePartnerCode(raw);
  const navigate = useNavigate();
  const { soloCurrentUser, soloSessionLoading } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
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

  const name = inviter?.firstName || "A friend";
  return (
    <div className="min-h-[100dvh] w-full flex flex-col px-6" style={{ backgroundColor: t.bg, color: t.text, paddingTop: "calc(2rem + env(safe-area-inset-top))", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
      <img src={t.logo} alt="APEX" className="h-[18px] w-auto self-center" />
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
        <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
          Team week
        </p>
        <p className={`${SOLO_TYPE.title} mt-2`}>{inviter === undefined ? "Train together" : `${name} wants to train with you`}</p>
        <p className={`${SOLO_TYPE.body} mt-3`} style={{ color: t.textMuted }}>
          Each week you both hit your sessions, your streak grows. When one of you trains, the other gets a nudge. You only see each other's training days — never weights, body stats or photos.
        </p>
        <p className={`${SOLO_TYPE.eyebrow} mt-8`} style={{ color: t.textMuted }}>
          Invite code
        </p>
        <p className={`${SOLO_TYPE.figure} tracking-[0.18em] mt-2`}>{code}</p>
        <p className={`${SOLO_TYPE.meta} mt-2`} style={{ color: t.textMuted }}>
          In the app: My Training → Team week → enter this code.
        </p>
      </div>
      <div className="max-w-sm w-full mx-auto">
        {!inIosApp() && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-2xl flex items-center justify-center text-[13px] font-bold uppercase tracking-[0.02em]"
            style={{ backgroundColor: t.text, color: t.bg }}
          >
            Get the APEX app
          </a>
        )}
        <SoloTextButton t={t} onClick={() => navigate("/solo/register")}>
          Create an account
        </SoloTextButton>
        <SoloTextButton t={t} onClick={() => navigate("/solo/login")}>
          I already have an account
        </SoloTextButton>
      </div>
    </div>
  );
}
