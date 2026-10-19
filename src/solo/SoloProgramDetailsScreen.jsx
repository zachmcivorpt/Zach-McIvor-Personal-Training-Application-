import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Lock, Eye } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { programPhases } from "../lib/AppContext";
import { visiblePrograms, formatAudPrice } from "./recommendations";
import { BottomSheet, PrimaryButton } from "../components/ui";

// The Week 1, Day 1 session's first two real (non-rest) rows — "a
// specific Week 1 session," never invented, never a different week. If
// the program has no phases/days yet (shouldn't happen for a published
// program — the Program Builder blocks publishing without one — but a
// draft viewed directly by its own coach could) this degrades to an empty
// preview rather than throwing.
function getWeek1PreviewRows(program) {
  const phases = programPhases(program);
  const day1 = phases[0]?.days?.[0];
  if (!day1) return { day: null, rows: [] };
  const realRows = (day1.exercises || []).filter((r) => !r.isRest);
  return { day: day1, rows: realRows.slice(0, 2) };
}

function formatSetsReps(row) {
  if (!row.targetSets) return null;
  if (row.targetType === "reps" && row.targetReps) return `${row.targetSets} × ${row.targetReps}`;
  if (row.targetReps) return `${row.targetSets} sets · ${row.targetReps}`;
  return `${row.targetSets} sets`;
}

export default function SoloProgramDetailsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { soloPrograms, soloProgramCategories, soloExercises, soloCurrentUser, soloPurchases, purchaseProgramPlaceholder } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);
  const published = useMemo(() => visiblePrograms(soloPrograms, soloProgramCategories), [soloPrograms, soloProgramCategories]);
  const program = published.find((p) => p.id === id);
  const owned = soloPurchases.some((p) => p.programId === id);
  const phases = programPhases(program);
  const totalWeeks = phases.reduce((a, p) => a + (p.durationWeeks || 0), 0);
  const { day: day1, rows: previewRows } = getWeek1PreviewRows(program);

  async function confirmPlaceholderPurchase() {
    setPurchasing(true);
    try {
      await purchaseProgramPlaceholder(soloCurrentUser.id, program.id, soloPurchases);
      setConfirmOpen(false);
      navigate("/solo/home", { state: { justPurchasedProgramId: program.id } });
    } finally {
      setPurchasing(false);
    }
  }

  if (!program) {
    return (
      <div className="min-h-dvh w-full flex flex-col items-center justify-center px-6" style={{ backgroundColor: t.bg, color: t.text }}>
        <p className="text-sm mb-4" style={{ color: t.textMuted }}>
          This program isn't available.
        </p>
        <button onClick={() => navigate("/solo/home")} className="text-sm font-semibold underline">
          Back to catalogue
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="relative h-52 flex items-center justify-center overflow-hidden" style={{ background: t.coverGradient }}>
        {program.artworkUrl ? (
          <img src={program.artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src={t.logo} alt="" className="h-16 w-auto opacity-90" />
        )}
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute top-5 left-5 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <ChevronLeft size={18} color="#fff" />
        </button>
      </div>

      <div className="px-5 pt-5 pb-28 max-w-md mx-auto">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-extrabold leading-tight">{program.name}</h1>
          <p className="text-lg font-extrabold whitespace-nowrap">{formatAudPrice(program.priceCents)}</p>
        </div>
        <p className="text-xs mt-1.5" style={{ color: t.textMuted }}>
          {program.level} · {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
        </p>
        {program.description && (
          <p className="text-sm mt-3 leading-relaxed" style={{ color: t.textMuted }}>
            {program.description}
          </p>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Eye size={14} color={t.textMuted} />
            <p className="text-[11px] font-bold tracking-wide uppercase" style={{ color: t.textMuted }}>
              Preview — {day1 ? day1.label : "Week 1"}
            </p>
          </div>

          {previewRows.length === 0 ? (
            <p className="text-xs" style={{ color: t.textFaint }}>
              Preview not available yet for this program.
            </p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.panelBorder}` }}>
              {previewRows.map((row, i) => {
                const ex = exercisesById[row.exerciseId];
                const setsReps = formatSetsReps(row);
                return (
                  <div
                    key={row.rowId || i}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ backgroundColor: t.cardBg, borderBottom: i === 0 ? `1px solid ${t.panelBorder}` : "none" }}
                  >
                    <p className="text-sm font-semibold">{ex?.name || "Exercise"}</p>
                    {setsReps && (
                      <p className="text-xs font-semibold" style={{ color: t.textMuted }}>
                        {setsReps}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!owned && (
            <>
              <div
                className="mt-2 rounded-2xl px-4 py-3.5 flex items-center gap-2.5"
                style={{ backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` }}
              >
                <Lock size={14} color={t.textFaint} />
                <p className="text-xs" style={{ color: t.textFaint }}>
                  Rest of {day1 ? day1.label : "Week 1"}, and every other week, unlocks once you own this program.
                </p>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {["Rest of Week 1", "Week 2", totalWeeks > 2 ? `Weeks 3–${totalWeeks}` : null].filter(Boolean).map((label) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, opacity: 0.6 }}
                  >
                    <p className="text-xs font-semibold" style={{ color: t.textMuted }}>
                      {label}
                    </p>
                    <Lock size={13} color={t.textFaint} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 px-5 py-4 backdrop-blur-xl"
        style={{ backgroundColor: t.navBg, borderTop: `1px solid ${t.navBorder}`, paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))" }}
      >
        <div className="max-w-md mx-auto">
          {owned ? (
            <button
              onClick={() => navigate("/solo/home")}
              className="w-full font-extrabold text-sm py-3.5 rounded-full"
              style={{ backgroundColor: t.text, color: t.bg }}
            >
              You own this — go to My Training
            </button>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              className="w-full font-extrabold text-sm py-3.5 rounded-full"
              style={{ backgroundColor: t.text, color: t.bg }}
            >
              Get this program · {formatAudPrice(program.priceCents)}
            </button>
          )}
        </div>
      </div>

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm">
        <p className="text-black/60 text-sm mb-5 leading-relaxed">
          Train Solo purchases aren't live yet — this unlocks "{program.name}" for testing without taking any payment. A real checkout
          replaces this step before launch.
        </p>
        <PrimaryButton className="w-full" onClick={confirmPlaceholderPurchase} disabled={purchasing}>
          {purchasing ? "UNLOCKING…" : "UNLOCK FOR TESTING"}
        </PrimaryButton>
      </BottomSheet>
    </div>
  );
}
