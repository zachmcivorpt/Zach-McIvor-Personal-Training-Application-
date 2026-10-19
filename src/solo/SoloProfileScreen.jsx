import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, AlertTriangle } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { MEASURE_BLUE } from "../theme";
import { programPhases } from "../lib/AppContext";
import { totalWeeksForProgram } from "./weekProgress";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";
import { DeleteAccountSheet } from "../components/ui";

// Adapted from ClientApp.jsx's ProfileScreen: same avatar/name card, sign
// out, legal links and delete-account pattern, but with every coach-
// dependent row removed (Goals/Equipment/Training preferences were set
// during Coaching's own onboarding; Messages/Check-ins/Quick Tips assume a
// coach; Connected devices is WHOOP, a Coaching-only integration) and
// every notification row removed (Train Solo has none, anywhere — see the
// comment below). Nutrition preferences is gone too — no nutrition
// tracking in Train Solo's scope. "My Programs" replaces all of that with
// what's actually relevant here: what this customer owns.
//
// Deliberately nothing notification-related on this screen — no push
// toggle, no permission prompt, no reminder settings. Train Solo has no
// notifications anywhere in its customer experience, confirmed scope for
// this phase; there is nothing here to wire up and nothing to remove.
export default function SoloProfileScreen() {
  const { soloCurrentUser, soloLogout, soloPurchases, soloPrograms, deleteMySoloAccount } = useSoloApp();
  const { dark, toggleSoloTheme } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const flagged = isFlaggedForMedicalReview(soloCurrentUser?.onboarding?.answers || {});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const programsById = useMemo(() => Object.fromEntries(soloPrograms.map((p) => [p.id, p])), [soloPrograms]);

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-5 pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-extrabold">Profile</h1>
        <button
          onClick={toggleSoloTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` }}
        >
          {dark ? <Sun size={15} color={t.text} /> : <Moon size={15} color={t.text} />}
        </button>
      </div>

      <div className="rounded-2xl px-4 py-4 mb-5" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
        <p className="text-sm font-bold">{soloCurrentUser?.name || "there"}</p>
        <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
          {soloCurrentUser?.email}
        </p>
      </div>

      {flagged && (
        <div className="rounded-2xl px-4 py-3.5 mb-5 flex gap-2.5" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
          <AlertTriangle size={16} color={MEASURE_BLUE} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: t.textMuted }}>
            Based on your answers, it's worth checking in with a doctor or allied health professional before training. This isn't a
            diagnosis or medical clearance — just a standard first-pass safety flag.
          </p>
        </div>
      )}

      <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
        My Programs
      </p>
      {soloPurchases.length === 0 ? (
        <p className="text-sm mb-5" style={{ color: t.textMuted }}>
          You don't own any programs yet — browse the Catalogue tab.
        </p>
      ) : (
        <div className="rounded-2xl overflow-hidden mb-5" style={{ border: `1px solid ${t.panelBorder}` }}>
          {soloPurchases.map((purchase, i) => {
            const program = programsById[purchase.programId];
            if (!program) return null;
            const totalWeeks = totalWeeksForProgram(programPhases(program));
            return (
              <div
                key={purchase.id}
                className="px-4 py-3.5"
                style={{ backgroundColor: t.cardBg, borderBottom: i < soloPurchases.length - 1 ? `1px solid ${t.panelBorder}` : "none" }}
              >
                <p className="text-sm font-semibold">{program.name}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                  {program.level} · {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden mb-5" style={{ border: `1px solid ${t.panelBorder}` }}>
        <Link
          to="/solo/onboarding?review=1"
          className="block px-4 py-3.5 text-sm font-semibold"
          style={{ backgroundColor: t.cardBg, borderBottom: `1px solid ${t.panelBorder}` }}
        >
          Review my consultation answers
        </Link>
        <button onClick={soloLogout} className="block w-full text-left px-4 py-3.5 text-sm font-semibold" style={{ backgroundColor: t.cardBg, color: "#EF4444" }}>
          Log out
        </button>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link to="/legal/privacy-policy" className="text-xs font-medium" style={{ color: t.textFaint }}>
          Privacy Policy
        </Link>
        <Link to="/legal/terms-of-service" className="text-xs font-medium" style={{ color: t.textFaint }}>
          Terms of Service
        </Link>
        <button onClick={() => setDeleteOpen(true)} className="text-xs font-medium text-red-500/70">
          Delete account
        </button>
      </div>

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        warning="This permanently deletes your Train Solo account, every program you own, and your workout history. This can't be undone."
        onConfirm={async (password) => {
          await deleteMySoloAccount(password);
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
