import React, { useEffect, useMemo, useRef, useState } from "react";
import { SoloButton, SoloTextButton } from "./SoloUI";
import { SoloPurchaseStage } from "./SoloPurchaseScreens";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useSoloPaywall, buyProgramInApp } from "./SoloPaywall";
import { inAppPurchasesAvailable, loadProgramPrices } from "../lib/purchases";
import { localDateKey } from "../lib/dateKey";

// Back from Stripe (#186): how often the server is asked to confirm the
// payment, and how long "Confirming your purchase" may stay up.
let CONFIRM_RETRY_MS = 2500;
let CONFIRM_LIMIT_MS = 15000;
export function setProgramConfirmTimingForTests(retryMs, limitMs) {
  CONFIRM_RETRY_MS = retryMs;
  CONFIRM_LIMIT_MS = limitMs;
}

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
  const location = useLocation();
  const {
    soloPrograms,
    soloProgramsLoaded,
    soloProgramCategories,
    soloExercises,
    soloCurrentUser,
    soloPurchases,
    startSoloCheckout,
    confirmSoloProgramPurchase,
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
  // Single programs are sold to everyone without All Access, before and
  // after subscriptions launch (owner decision 2026-11-07, #186 — replaces
  // "single-program sales stop on launch day"). All Access includes every
  // program, so it's never sold to them. A bought program stays theirs for
  // good, whatever their plan. Never inside the iOS app (3.1.1).
  const purchasable = !isAddon && !owned && !iosApp && !soloHasAllAccess;
  const viaAllAccess = soloGatesLive && !isAddon && !owned;
  // Included with All Access (start / resume it), or — in the iOS app, where
  // single programs can't be bought — unlocked by subscribing to All Access.
  const allAccessButton = viaAllAccess && (soloHasAllAccess || iosApp);

  // Bought in the iPhone app (#189): Apple's own price, only for a program
  // that has an App Store product (apex_solo_program_<id>) — otherwise the
  // app shows no price, as before (3.1.1: never the website's).
  const [applePrice, setApplePrice] = useState(null);
  const [appleBuyOpen, setAppleBuyOpen] = useState(false);
  const [openingStore, setOpeningStore] = useState(false);
  const wantsApplePrice = iosApp && inAppPurchasesAvailable() && !!program && !isAddon && !owned && !soloHasAllAccess;
  useEffect(() => {
    if (!wantsApplePrice) return;
    let live = true;
    loadProgramPrices([id])
      .then((list) => {
        const hit = (Array.isArray(list) ? list : []).find((x) => x.programId === id);
        if (live) setApplePrice(hit?.price || null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wantsApplePrice, id]);
  const appleBuyable = wantsApplePrice && !!applePrice;
  async function buyInApp() {
    setAppleBuyOpen(false);
    // The same calm screen as a membership (#136, #164): painted before
    // Apple's sheet opens, so it's what sits behind it.
    setOpeningStore(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    await buyProgramInApp(id, soloCurrentUser?.id);
  }
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

  // Back from this program's Stripe checkout (#186; success_url /
  // cancel_url in functions createSoloCheckoutSession). Success: the server
  // is asked to confirm the payment at once (it fetches the checkout from
  // Stripe — the page's word is never enough), and "Confirming your
  // purchase" stays up until the purchase reaches the account; then it's
  // theirs. Cancelled: says nothing was charged. The query is removed
  // (replace), so a refresh or Back never replays it.
  const [checkoutReturn, setCheckoutReturn] = useState(null); // confirming | done | slow | cancelled | applePending | appleError
  const [appleNotice, setAppleNotice] = useState("");
  const stopConfirmRef = useRef(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("checkout");
    // After an in-app purchase (#189, SoloPaywallProvider): the outcome.
    const st = location.state || {};
    if (st.programBought || st.programPending || st.programNotice) {
      setCheckoutReturn(st.programBought ? "done" : st.programPending ? "applePending" : "appleError");
      if (st.programNotice) setAppleNotice(st.programNotice);
      const { programBought, programPending, programNotice, ...rest } = st;
      navigate(location.pathname, { replace: true, state: rest });
      return;
    }
    if (status !== "success" && status !== "cancelled") return;
    const sessionId = params.get("session_id");
    navigate(location.pathname, { replace: true, state: location.state });
    if (status === "cancelled") {
      setCheckoutReturn("cancelled");
      return;
    }
    setCheckoutReturn("confirming");
    let stopped = false;
    stopConfirmRef.current = () => {
      stopped = true;
    };
    if (sessionId && confirmSoloProgramPurchase) {
      (async () => {
        for (let i = 0; i < 4 && !stopped; i++) {
          if (i) await new Promise((r) => setTimeout(r, CONFIRM_RETRY_MS));
          if (stopped) return;
          const r = await confirmSoloProgramPurchase(sessionId).catch(() => null);
          if (r?.owned) return; // the purchase listener takes it from here
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.state]);
  useEffect(() => () => stopConfirmRef.current?.(), []);
  useEffect(() => {
    if (checkoutReturn === "confirming" && owned) {
      stopConfirmRef.current?.();
      setCheckoutReturn("done");
    }
  }, [checkoutReturn, owned]);
  // Never left on "Confirming": say the payment is safe and on its way.
  useEffect(() => {
    if (checkoutReturn !== "confirming") return;
    const t = setTimeout(() => {
      stopConfirmRef.current?.();
      setCheckoutReturn((v) => (v === "confirming" ? "slow" : v));
    }, CONFIRM_LIMIT_MS);
    return () => clearTimeout(t);
  }, [checkoutReturn]);


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
      if (result?.includedWithAllAccess) {
        // All Access already includes it (the server's answer, #186).
        setPurchaseError("All Access already includes this program — no need to buy it.");
        return;
      }
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
  // Solid and instant, like the subscription's own (#136, #164): never a
  // blank frame between Stripe and the unlocked program.
  const confirmingStage = checkoutReturn === "confirming" ? <SoloPurchaseStage instant title="Confirming your purchase" detail="One moment." /> : null;
  if (!program && !soloProgramsLoaded) {
    return (
      <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg }}>
        {confirmingStage}
      </div>
    );
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
      {confirmingStage}
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
          {/* Before launch: the price, as before. After: only while it can be
              bought (#186) — not for All Access members, nor once owned. */}
          {appleBuyable && (
            <p className="text-lg font-extrabold whitespace-nowrap mt-1" data-testid="program-price">
              {applePrice}
            </p>
          )}
          {!isAddon && !iosApp && (soloGatesLive ? purchasable : true) && (
            <p className="text-lg font-extrabold whitespace-nowrap mt-1" data-testid="program-price">
              {formatAudPrice(program.priceCents)}
            </p>
          )}
          {!isAddon && !appleBuyable && (allAccessButton || (soloGatesLive && owned)) && (
            <p className="text-[10px] font-bold tracking-wider uppercase mt-2.5 whitespace-nowrap" style={{ color: t.textMuted }} data-testid="program-access-label">
              {owned ? "Owned" : soloHasAllAccess ? "Included" : "All Access"}
            </p>
          )}
        </div>
        {checkoutReturn && checkoutReturn !== "confirming" && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={soloGlass(t)} data-testid="purchase-return-note" role="status">
            <p className="text-sm font-semibold">
              {checkoutReturn === "done"
                ? "It's yours."
                : checkoutReturn === "slow"
                ? "Payment received."
                : checkoutReturn === "applePending"
                ? "Purchase received."
                : checkoutReturn === "appleError"
                ? "The purchase didn't go through."
                : "Checkout cancelled."}
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: t.textMuted }}>
              {checkoutReturn === "done"
                ? `${program.name} is now in My Training — it stays yours for good, whatever plan you're on.`
                : checkoutReturn === "slow"
                ? "Your program unlocks here in a moment. No need to pay again."
                : checkoutReturn === "applePending"
                ? "Apple confirmed it — it unlocks here in a moment. If it doesn't, tap Restore purchases in Profile → Subscription. No need to buy again."
                : checkoutReturn === "appleError"
                ? appleNotice || "Please try again."
                : "You haven't been charged."}
            </p>
          </div>
        )}
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
                {appleBuyable
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, unlocks once you buy it.`
                  : viaAllAccess && iosApp
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, is included with All Access.`
                  : iosApp
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, is part of the full program.`
                  : soloGatesLive
                  ? `The rest of ${day1Label || "Week 1"}, and every other week, unlocks once you buy it — or with All Access.`
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
          ) : appleBuyable ? (
            <button
              onClick={() => setAppleBuyOpen(true)}
              className="w-full flex items-center justify-center gap-2.5 font-bold text-sm py-4 rounded-full"
              style={{ backgroundColor: dark ? "#EDEDEF" : t.text, color: dark ? "#0A0A0B" : t.bg }}
            >
              <PlayCircle size={18} /> Buy · {applePrice}
            </button>
          ) : allAccessButton ? (
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
        {soloGatesLive && (
          <SoloTextButton
            t={t}
            className="mt-1"
            disabled={purchasing}
            onClick={() => {
              setConfirmOpen(false);
              openPaywall({ tier: "all_access", reason: `${program.name} is included with All Access — along with every other program in the catalogue.` });
            }}
          >
            Or get every program with All Access
          </SoloTextButton>
        )}
      </BottomSheet>

      {openingStore && <SoloPurchaseStage instant title="Opening the App Store" detail="Complete your purchase in Apple's window." />}
      <BottomSheet open={appleBuyOpen && appleBuyable} onClose={() => setAppleBuyOpen(false)} title="Buy this program" dark={dark}>
        <div style={{ color: t.text }}>
          <p className="text-sm mb-5 leading-relaxed" style={{ color: t.textMuted }}>
            Buy "{program.name}" through the App Store for {applePrice}. It's yours for good, whatever plan you're on.
          </p>
          <SoloButton t={t} className="w-full" onClick={buyInApp} disabled={openingStore}>
            {`BUY · ${applePrice}`}
          </SoloButton>
          {soloGatesLive && (
            <SoloTextButton
              t={t}
              className="mt-1"
              onClick={() => {
                setAppleBuyOpen(false);
                openPaywall({ tier: "all_access", reason: `${program.name} is included with All Access — along with every other program in the catalogue.` });
              }}
            >
              Or get every program with All Access
            </SoloTextButton>
          )}
        </div>
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
