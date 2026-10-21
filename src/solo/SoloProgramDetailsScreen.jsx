import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Eye, PlayCircle } from "lucide-react";
import { SoloArtwork } from "./SoloArtwork";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { visiblePrograms, formatAudPrice } from "./recommendations";
import { GOAL_OPTIONS, ENVIRONMENT_OPTIONS } from "./programAttributes";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { ClientThemeContext, ExerciseDetailSheet } from "../client/ClientApp";

const GOAL_LABELS = Object.fromEntries(GOAL_OPTIONS.map((g) => [g.value, g.label]));
const ENVIRONMENT_LABELS = Object.fromEntries(ENVIRONMENT_OPTIONS.map((e) => [e.value, e.label]));

function formatSetsReps(row) {
  if (!row.targetSets) return null;
  if (row.targetType === "reps" && row.targetReps) return `${row.targetSets} × ${row.targetReps}`;
  if (row.targetReps) return `${row.targetSets} sets · ${row.targetReps}`;
  return `${row.targetSets} sets`;
}

export default function SoloProgramDetailsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { soloPrograms, soloProgramCategories, soloExercises, soloCurrentUser, soloPurchases, startSoloCheckout } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [detailExercise, setDetailExercise] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Arriving from a scrolled Catalogue would otherwise open this page
  // part-way down, past the hero.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);
  const published = useMemo(() => visiblePrograms(soloPrograms, soloProgramCategories), [soloPrograms, soloProgramCategories]);
  const program = published.find((p) => p.id === id);
  const ownedPurchase = soloPurchases.find((p) => p.programId === id);
  const owned = !!ownedPurchase;
  // The full phases/days live on the separately-gated soloProgramContent
  // doc, never on this public program object — see
  // AppContext.jsx's computeWeekOnePreview comment. Pre-purchase, this
  // screen only ever reads the small public preview slice the coach's
  // save already computed; it never fetches or has access to the rest.
  const preview = program?.weekOnePreview || { totalWeeks: 0, dayLabel: null, exercises: [], phaseSummaries: [] };
  const totalWeeks = preview.totalWeeks;
  const day1Label = preview.dayLabel;
  const previewRows = preview.exercises || [];
  const phaseSummaries = preview.phaseSummaries || [];

  async function confirmPurchase() {
    setPurchasing(true);
    setPurchaseError("");
    try {
      const result = await startSoloCheckout(program.id);
      if (result?.alreadyOwned) {
        setConfirmOpen(false);
        navigate("/solo/home", {
          state: { soloTab: "training", openPurchaseId: `${soloCurrentUser.id}_${program.id}` },
        });
        return;
      }
      if (result?.url) {
        // Stripe Checkout is a real, separate hosted page — leaving the
        // app entirely is correct here, not a client-side route change.
        // The eventual soloPurchases doc only gets created by the webhook
        // once Stripe confirms payment (see createSoloCheckoutSession /
        // soloStripeWebhook in functions/index.js), so there's nothing to
        // show locally yet; My Training picks it up via its own
        // onSnapshot listener the moment that write lands, same as the
        // old placeholder flow's post-purchase redirect did.
        window.location.href = result.url;
        return;
      }
      setPurchaseError("Something went wrong starting checkout — please try again.");
    } catch (err) {
      setPurchaseError(err?.message || "Something went wrong starting checkout — please try again.");
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

  const glass = {
    backgroundColor: dark ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.62)",
    border: `1px solid ${t.panelBorder}`,
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  };
  const tags = [
    ...(program.goals || []).map((g) => GOAL_LABELS[g] || g),
    ...(program.environments || []).map((e) => ENVIRONMENT_LABELS[e] || e),
  ];

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="relative h-72 overflow-hidden" style={program.artworkUrl ? undefined : { background: t.coverGradient }}>
        {program.artworkUrl ? (
          <>
            <img src={program.artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0) 40%, ${t.bg} 100%)` }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0) 55%, ${t.bg} 100%)` }} />
            <div className="absolute inset-0 flex items-center justify-center pb-6">
              <img src={t.logo} alt="" className="h-20 w-auto opacity-95" />
            </div>
          </>
        )}
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute left-5 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md"
          style={{ top: "calc(16px + env(safe-area-inset-top,0px))", backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.14)" }}
        >
          <ChevronLeft size={18} color="#fff" />
        </button>
      </div>

      <div className="relative -mt-10 px-5 pb-32 max-w-md mx-auto">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[26px] font-extrabold leading-tight">{program.name}</h1>
          <p className="text-lg font-extrabold whitespace-nowrap mt-1">{formatAudPrice(program.priceCents)}</p>
        </div>
        <p className="text-sm mt-1.5" style={{ color: t.textMuted }}>
          {program.level} · {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
        </p>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((label) => (
              <span
                key={label}
                className="text-xs font-semibold px-3.5 py-1.5 rounded-full"
                style={{ backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, color: t.text }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {program.description && (
          <p className="text-sm mt-5 leading-relaxed" style={{ color: t.textMuted }}>
            {program.description}
          </p>
        )}

        {phaseSummaries.length > 0 && (
          <div className="mt-7">
            <p className="text-xs font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textMuted }}>
              Weekly structure
            </p>
            <div className="rounded-2xl overflow-hidden" style={glass}>
              {phaseSummaries.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3.5"
                  style={{ borderBottom: i === phaseSummaries.length - 1 ? "none" : `1px solid ${t.panelBorder}` }}
                >
                  <p className="text-sm font-semibold">{p.name || `Phase ${i + 1}`}</p>
                  <p className="text-xs font-semibold" style={{ color: t.textMuted }}>
                    {p.durationWeeks} week{p.durationWeeks === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7">
          <div className="flex items-center gap-2 mb-2.5">
            <Eye size={15} color={t.textMuted} />
            <p className="text-xs font-bold tracking-wide uppercase" style={{ color: t.textMuted }}>
              Preview — {day1Label || "Week 1"}
            </p>
          </div>

          {previewRows.length === 0 ? (
            <p className="text-xs" style={{ color: t.textFaint }}>
              Preview not available yet for this program.
            </p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={glass}>
              <button
                type="button"
                onClick={() => setPreviewOpen((o) => !o)}
                aria-expanded={previewOpen}
                className="w-full flex items-center gap-3.5 p-2.5 pr-4 text-left"
              >
                <SoloArtwork program={program} t={t} className="w-14 h-14 rounded-xl shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{day1Label || "Week 1"}</p>
                  <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                    Week 1 · Day 1
                  </p>
                </div>
                <ChevronRight size={16} color={t.textFaint} className="shrink-0 transition-transform" style={{ transform: previewOpen ? "rotate(90deg)" : "none" }} />
              </button>
              {previewOpen &&
                previewRows.map((row, i) => {
                  const ex = exercisesById[row.exerciseId];
                  const setsReps = formatSetsReps(row);
                  return (
                    <button
                      key={row.rowId || i}
                      type="button"
                      onClick={() => ex && setDetailExercise(ex)}
                      disabled={!ex}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                      style={{ borderTop: `1px solid ${t.panelBorder}` }}
                    >
                      <p className="text-sm font-semibold">{ex?.name || "Exercise"}</p>
                      {setsReps && (
                        <p className="text-xs font-semibold" style={{ color: t.textMuted }}>
                          {setsReps}
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          )}

          {!owned && (
            <div className="mt-2.5 flex items-center gap-2.5 px-1">
              <Lock size={13} color={t.textFaint} className="shrink-0" />
              <p className="text-xs" style={{ color: t.textFaint }}>
                The rest of {day1Label || "Week 1"}, and every other week, unlocks once you own this program.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 pt-3" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))", background: `linear-gradient(to bottom, rgba(0,0,0,0), ${t.bg} 35%)` }}>
        <div className="max-w-md mx-auto">
          <button
            onClick={() =>
              owned
                ? navigate("/solo/home", { state: { soloTab: "training", openPurchaseId: ownedPurchase?.id } })
                : setConfirmOpen(true)
            }
            className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
            style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
          >
            <PlayCircle size={18} />
            {owned ? "Go to My Training" : "Start Program"}
          </button>
        </div>
      </div>

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm">
        <p className="text-black/60 text-sm mb-5 leading-relaxed">
          You'll be taken to a secure Stripe checkout to pay {formatAudPrice(program.priceCents)} for "{program.name}". Your program
          unlocks as soon as payment completes.
        </p>
        {purchaseError && <p className="text-red-600 text-sm mb-4">{purchaseError}</p>}
        <PrimaryButton className="w-full" onClick={confirmPurchase} disabled={purchasing}>
          {purchasing ? "STARTING CHECKOUT…" : `PAY ${formatAudPrice(program.priceCents)}`}
        </PrimaryButton>
      </BottomSheet>

      {detailExercise && (
        <ClientThemeContext.Provider value={dark}>
          <ExerciseDetailSheet exercise={detailExercise} logsForClient={[]} onClose={() => setDetailExercise(null)} />
        </ClientThemeContext.Provider>
      )}
    </div>
  );
}
