import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { SoloButton, SOLO_TYPE } from "./SoloUI";
import { TIER_LABELS } from "./soloAccess";

// Full-screen states around Apple's In-App Purchase sheet (#136). The page
// behind Apple's sheet is this calm, solid screen (no glass, nothing to
// tap), and the reload after the sheet opens on the same screen, so the
// whole purchase reads as one continuous moment: Opening the App Store →
// Apple's sheet → Confirming your membership → Welcome to Plus. Solid
// page colour on purpose: nothing for WebKit to composite while the sheet
// is up (see #134/#135).

// instant: full strength on the first frame, no fade — "Opening the App
// Store" is pictured just before Apple's sheet opens, and a fade caught
// half-way showed the membership sheet through it (#164).
function Shell({ children, label, testId, instant = false }) {
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [shown, setShown] = useState(instant);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
      className={`fixed inset-0 z-[150] flex flex-col${instant ? "" : " transition-opacity duration-300"}`}
      style={{
        backgroundColor: t.bg,
        color: t.text,
        opacity: shown ? 1 : 0,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {children(t, dark)}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

// "Opening the App Store" (before Apple's sheet) and "Confirming your
// membership" (after the reload, while the server is asked).
export function SoloPurchaseStage({ title, detail, instant = false }) {
  return (
    <Shell label={title} testId="solo-purchase-stage" instant={instant}>
      {(t) => (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <img src={t.logo} alt="" aria-hidden="true" className="w-8 h-8 object-contain opacity-90" />
          <p className="mt-8 text-[20px] leading-tight font-semibold tracking-[-0.02em]">{title}</p>
          {detail && (
            <p className={`mt-2 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
              {detail}
            </p>
          )}
          <div className="mt-8 h-[2px] w-24 overflow-hidden rounded-full" style={{ backgroundColor: t.panelBorder }}>
            <div className="h-full w-1/2 rounded-full animate-pulse" style={{ backgroundColor: MEASURE_BLUE }} />
          </div>
        </div>
      )}
    </Shell>
  );
}

const WELCOME_FEATURES = {
  all_access: ["Every program in the catalogue", "New programs as they're released", "Suggested weights for every set", "Build your own multi-week programs"],
  plus: ["Suggested weights for every set", "Build your own multi-week programs", "Full stats, PRs and Apple Health on Progress", "Recovery add-ons and unlimited saved sessions"],
};

// The purchase confirmed by the server: a proper welcome, not a message
// tucked into the paywall.
export function SoloWelcomeScreen({ tier, renewal, note = "", onDone }) {
  const label = TIER_LABELS[tier] || "Train Solo";
  return (
    // instant (#165): it replaces "Confirming your membership" in the same
    // frame; a fade-in showed the page underneath between the two.
    <Shell label={`Welcome to ${label}`} testId="solo-welcome" instant>
      {(t) => (
        <>
          <div className="flex-1 flex flex-col justify-center px-6">
            <img src={t.logo} alt="" aria-hidden="true" className="w-7 h-7 object-contain opacity-90" />
            <p className={`mt-10 ${SOLO_TYPE.eyebrow}`} style={{ color: t.textMuted }}>
              Membership active
            </p>
            <h1 className="mt-3 text-[32px] leading-[1.05] font-semibold tracking-[-0.035em]">
              Welcome to
              <br />
              {label}.
            </h1>
            {renewal && (
              <p className={`mt-3 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
                {renewal}
              </p>
            )}
            {note && (
              <p className={`mt-2 ${SOLO_TYPE.body}`} style={{ color: t.text }} data-testid="solo-welcome-note">
                {note}
              </p>
            )}
            <ul className="mt-10 border-t" style={{ borderColor: t.panelBorder }}>
              {(WELCOME_FEATURES[tier] || []).map((f) => (
                <li key={f} className="flex items-center gap-3 py-3.5 border-b text-[13px]" style={{ borderColor: t.panelBorder }}>
                  <Check size={14} strokeWidth={2} color={MEASURE_BLUE} className="shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="px-6 pb-6 pt-2">
            <SoloButton t={t} onClick={onDone}>
              Start training
            </SoloButton>
          </div>
        </>
      )}
    </Shell>
  );
}
