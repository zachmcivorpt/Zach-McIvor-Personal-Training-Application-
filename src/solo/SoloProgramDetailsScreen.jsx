import React, { useEffect, useMemo, useState } from "react";
import { SoloButton } from "./SoloUI";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Eye, PlayCircle } from "lucide-react";
import { SoloArtwork } from "./SoloArtwork";
import { inIosApp } from "./appShell";
import SoloGlassBox from "./SoloGlassBox";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { visiblePrograms, visibleRecoveryAddons, isRecoveryAddon, formatAudPrice } from "./recommendations";
import { GOAL_OPTIONS, ENVIRONMENT_OPTIONS } from "./programAttributes";
import { BottomSheet } from "../components/ui";
import { ClientThemeContext, ExerciseDetailSheet } from "../client/ClientApp";
import { canUse } from "./soloAccess";
import { SwitchProgramSheet } from "./SoloProgramSwitch";
import { weekInProgram } from "./currentProgram";
import { useSoloPaywall } from "./SoloPaywall";
import { localDateKey } from "../lib/dateKey";

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
  const {
    soloPrograms,
    soloProgramsLoaded,
    soloProgramCategories,
    soloExercises,
    soloCurrentUser,
    soloPurchases,
    startSoloCheckout,
    setRecoveryAddon,
    soloAccess,
    soloGatesLive,
    soloHasAllAccess,
    soloTrainingPrograms,
    soloCurrentProgram,
    soloProgramsById,
    soloContentById,
    switchSoloProgram,
  } = useSoloApp();
  const { openPaywall } = useSoloPaywall();
  const [startOpen, setStartOpen] = useState(false);
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [detailExercise, setDetailExercise] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [addonSaving, setAddonSaving] = useState(false);
  const [addonError, setAddonError] = useState("");

  // Back from Stripe with the browser's back button: this page comes back
  // from the browser's page cache with the button still on "Starting
  // checkout…" (it stays busy while leaving, so a second tap can't start a
  // second checkout — #157).
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) setPurchasing(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Arriving from a scrolled Catalogue would otherwise open this page
  // part-way down, past the hero.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);
  const published = useMemo(() => visiblePrograms(soloPrograms, soloProgramCategories), [soloPrograms, soloProgramCategories]);
  const program = published.find((p) => p.id === id) || visibleRecoveryAddons(soloPrograms).find((p) => p.id === id);
  const ownedPurchase = soloPurchases.find((p) => p.programId === id);
  const owned = !!ownedPurchase;
  // A free recovery add-on: no checkout — it's "added" instead, one at a
  // time, and its sessions fill the customer's program rest days.
  const isAddon = isRecoveryAddon(program);
  const activeAddonId = soloCurrentUser?.recoveryAddon?.programId || null;
  const addonActive = isAddon && activeAddonId === id;
  const otherAddon = isAddon && activeAddonId && activeAddonId !== id ? soloPrograms.find((p) => p.id === activeAddonId) : null;
  const hasStartedProgram = soloPurchases.some((p) => p.startDate);
  // Inside the iOS app a paid program can't be bought (see appShell.js):
  // no price, no checkout — owned programs and free add-ons work as normal.
  const iosApp = inIosApp();
  // After launch single programs aren't sold any more: the catalogue is All
  // Access (owner decision 2026-10-28). Programs already bought stay owned.
  const purchasable = !isAddon && !owned && !iosApp && !soloGatesLive;
  const viaAllAccess = soloGatesLive && !isAddon && !owned;
  // This program as an All Access row (current or archived), if it has one,
  // and the program it would replace (#140: one program at a time).
  const enrolment = (soloTrainingPrograms || []).find((r) => r.programId === id && r.source === "all_access") || null;
  const isCurrent = !!enrolment?.current;
  const resumeWeek = enrolment && !isCurrent && enrolment.started ? enrolment.pausedAtWeek : null;
  const replacing = soloCurrentProgram && soloCurrentProgram.programId !== id ? soloCurrentProgram : null;
  const replacingSummary = replacing
    ? {
        name: soloProgramsById?.[replacing.programId]?.name || "Your current program",
        week:
          replacing.startDate && replacing.startDate <= localDateKey()
            ? weekInProgram(
                replacing,
                soloProgramsById?.[replacing.programId]?.weekOnePreview?.totalWeeks ||
                  (soloContentById?.[replacing.programId]?.phases || []).reduce((n, p) => n + (Number(p.durationWeeks) || 0), 0),
                localDateKey()
              )
            : null,
      }
    : null;
  const addonLocked = isAddon && !canUse("recoveryAddons", soloAccess);

  async function startViaAllAccess(startDate) {
    const plan = await switchSoloProgram({ target: enrolment || { programId: id, source: "all_access" }, startDate });
    setStartOpen(false);
    const enrolmentDocId = plan.enrolments.find((e) => e.fields.status === "active")?.id;
    navigate("/solo/home", { state: { soloTab: "training", openPurchaseId: enrolmentDocId } });
  }

  async function applyAddon(programId) {
    setAddonSaving(true);
    setAddonError("");
    try {
      await setRecoveryAddon(soloCurrentUser.id, programId);
      setReplaceOpen(false);
      if (programId) navigate("/solo/calendar");
    } catch {
      // Was unhandled: the button just came back with nothing said (#157).
      setAddonError("Couldn't update your add-on — check your connection and try again.");
    } finally {
      setAddonSaving(false);
    }
  }
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
    if (inIosApp()) return; // never start a Stripe checkout inside the iOS app
    setPurchasing(true);
    setPurchaseError("");
    let leaving = false;
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
        // Stays "Starting checkout…" while the page leaves: a second tap
        // would start a second checkout (and a second charge) — #157.
        leaving = true;
        window.location.href = result.url;
        return;
      }
      setPurchaseError("Something went wrong starting checkout — please try again.");
    } catch (err) {
      setPurchaseError(err?.message || "Something went wrong starting checkout — please try again.");
    } finally {
      if (!leaving) setPurchasing(false);
    }
  }

  // Opened straight onto this page (a link, a reload): the catalogue hasn't
  // arrived yet, so "isn't available" would flash before the program shows.
  if (!program && !soloProgramsLoaded) {
    return <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg }} />;
  }
  if (!program) {
    return (
      <div className="min-h-dvh w-full flex flex-col items-center justify-center px-6" style={{ backgroundColor: t.bg, color: t.text }}>
        <p className="text-sm mb-4" style={{ color: t.textMuted }}>
          This program isn't available.
        </p>
        <button onClick={() => navigate("/solo/home", { state: { soloTab: "catalogue" } })} className="text-sm font-semibold underline">
          Back to catalogue
        </button>
      </div>
    );
  }

  const glass = soloGlass(t);
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
          className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md"
          style={{ top: "calc(16px + env(safe-area-inset-top,0px))", backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.14)" }}
        >
          <ChevronLeft size={18} color="#fff" />
        </button>
      </div>

      <div className="relative -mt-10 px-3 pb-32 max-w-md mx-auto">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[26px] font-extrabold leading-tight">{program.name}</h1>
          {isAddon && !soloGatesLive && <p className="text-lg font-extrabold whitespace-nowrap mt-1">Free</p>}
          {!isAddon && !iosApp && !soloGatesLive && <p className="text-lg font-extrabold whitespace-nowrap mt-1">{formatAudPrice(program.priceCents)}</p>}
          {!isAddon && viaAllAccess && (
            <p className="text-[10px] font-bold tracking-wider uppercase mt-2.5 whitespace-nowrap" style={{ color: t.textMuted }}>
              All Access
            </p>
          )}
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
            <SoloGlassBox t={t} className="rounded-2xl">
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
            </SoloGlassBox>
          )}

          {isAddon && (
            <p className="mt-3 text-xs leading-relaxed px-1" style={{ color: t.textMuted }}>
              Free add-on. Its sessions are placed on the rest days of the program you're running — week 1 alongside your program's week 1,
              and so on. One recovery add-on can be active at a time.
              {!hasStartedProgram && " Set a start date for one of your programs to see them on your calendar."}
            </p>
          )}

          {!owned && !isAddon && !soloHasAllAccess && (
            <div className="mt-2.5 flex items-center gap-2.5 px-1">
              <Lock size={13} color={t.textFaint} className="shrink-0" />
              <p className="text-xs" style={{ color: t.textFaint }}>
                {viaAllAccess
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, is included with All Access.`
                  : iosApp
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, is part of the full program.`
                  : `The rest of ${day1Label || "Week 1"}, and every other week, unlocks once you own this program.`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-3 pt-3" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))", background: `linear-gradient(to bottom, rgba(0,0,0,0), ${t.bg} 35%)` }}>
        <div className="max-w-md mx-auto">
          {isAddon && addonLocked && !addonActive ? (
            <button
              onClick={() => openPaywall({ tier: "plus", reason: "Recovery add-ons fill your rest days with mobility and recovery sessions — part of Plus." })}
              className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
              style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
            >
              <Lock size={16} /> Add with Plus
            </button>
          ) : viaAllAccess ? (
            soloHasAllAccess ? (
              isCurrent ? (
                <button
                  onClick={() => navigate("/solo/home", { state: { soloTab: "training", openPurchaseId: enrolment.id } })}
                  className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
                  style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
                >
                  <PlayCircle size={18} /> Go to My Training
                </button>
              ) : (
                <button
                  onClick={() => setStartOpen(true)}
                  className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
                  style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
                >
                  <PlayCircle size={18} />
                  {resumeWeek ? `Resume at Week ${resumeWeek}` : "Start program"}
                </button>
              )
            ) : (
              <button
                onClick={() => openPaywall({ tier: "all_access", reason: `${program.name} is included with All Access — along with every other program in the catalogue.` })}
                className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
                style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
              >
                <Lock size={16} /> Unlock with All Access
              </button>
            )
          ) : isAddon ? (
            addonActive ? (
              <button
                onClick={() => applyAddon(null)}
                disabled={addonSaving}
                className="w-full font-bold text-sm py-4 rounded-full disabled:opacity-50"
                style={{ ...soloGlass(t), color: t.text }}
              >
                {addonSaving ? "Removing…" : "Active — remove from my training"}
              </button>
            ) : (
              <button
                onClick={() => (otherAddon ? setReplaceOpen(true) : applyAddon(id))}
                disabled={addonSaving}
                className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full disabled:opacity-50"
                style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
              >
                <PlayCircle size={18} />
                {addonSaving ? "Adding…" : "Add to my training · Free"}
              </button>
            )
          ) : !owned && iosApp ? (
            // Neutral on purpose: no pointer to buying elsewhere (3.1.1).
            <div className="w-full text-center py-3 rounded-full" style={soloGlass(t)}>
              <p className="text-sm font-semibold" style={{ color: t.text }}>
                Not available to buy in the app
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: t.textMuted }}>
                Already own it? You'll find it in My Training.
              </p>
            </div>
          ) : (
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
          )}
          {addonError && !replaceOpen && <p className="text-red-500 text-sm mt-3 text-center">{addonError}</p>}
        </div>
      </div>

      <BottomSheet open={confirmOpen && purchasable} onClose={() => setConfirmOpen(false)} title="Confirm" dark={dark}>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: t.textMuted }}>
          You'll be taken to a secure Stripe checkout to pay {formatAudPrice(program.priceCents)} for "{program.name}". Your program
          unlocks as soon as payment completes.
        </p>
        {purchaseError && <p className="text-red-500 text-sm mb-4">{purchaseError}</p>}
        <SoloButton t={t} className="w-full" onClick={confirmPurchase} disabled={purchasing}>
          {purchasing ? "STARTING CHECKOUT…" : `PAY ${formatAudPrice(program.priceCents)}`}
        </SoloButton>
      </BottomSheet>

      <SwitchProgramSheet
        open={startOpen}
        onClose={() => setStartOpen(false)}
        programName={program?.name || ""}
        resumeWeek={resumeWeek}
        current={replacingSummary}
        onConfirm={startViaAllAccess}
        dark={dark}
        t={t}
      />

      <BottomSheet open={replaceOpen} onClose={() => setReplaceOpen(false)} title="Replace add-on?" dark={dark}>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: t.textMuted }}>
          Only one recovery add-on can run at a time. Replace "{otherAddon?.name}" with "{program.name}"? Sessions you've already completed stay
          in your history.
        </p>
        {addonError && <p className="text-red-500 text-sm mb-4">{addonError}</p>}
        <SoloButton t={t} className="w-full" onClick={() => applyAddon(id)} disabled={addonSaving}>
          {addonSaving ? "REPLACING…" : "REPLACE"}
        </SoloButton>
      </BottomSheet>

      {detailExercise && (
        <ClientThemeContext.Provider value={dark}>
          <ExerciseDetailSheet exercise={detailExercise} logsForClient={[]} onClose={() => setDetailExercise(null)} />
        </ClientThemeContext.Provider>
      )}
    </div>
  );
}
