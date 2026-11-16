import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Share2, TrendingUp } from "lucide-react";
import { BottomSheet } from "../components/ui";
import { bodyweightChange, shareCardContent, drawShareCard, loadImage, progressPhotoPair, photoLabel } from "./shareCard";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";

// The APEX gym photo behind the share card's glass.
const SHARE_BACKGROUND = "/brand/gym-dark.jpg";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { SoloArtwork } from "./SoloArtwork";
import { recommendForAnswers } from "./recommendations";
import { programStats, weekRecap, reviewWeek } from "./trainingRecap";
import { goalTitle, goalProgress, encouragement } from "./goals";
import { buildInsights, strengthGains, weeksTrainedInARow, reviewHeadline, weeklyFocus } from "./insights";
import { comebacksIn } from "./workoutSummary";
import { buildSoloCalendar, addDays, sessionDayLabel } from "./soloCalendar";
import { localDateKey } from "../lib/dateKey";

// Two full-screen moments (#141), solid page colour with large numbers:
//  - SoloProgramCompleteScreen: after the last session of a program — what
//    they did, how much stronger they got, and the next program.
//  - SoloWeekRecapScreen: the weekly review (Sunday push, #236) — the week
//    against the plan, stronger lifts, consistency, goal, insights, next
//    week's focus and what's on.

function Page({ children, t }) {
  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="max-w-md mx-auto px-5 pb-10" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 40px)" }}>
        <img src={t.logo} alt="APEX" className="w-auto mb-12" style={{ height: 16 }} />
        {children}
      </div>
    </div>
  );
}

function Figure({ value, label, t, accent = false, small = false }) {
  return (
    <div className="py-5 min-w-0">
      <p className={`${small ? "text-[22px] leading-none font-semibold tracking-[-0.03em] tabular-nums" : SOLO_TYPE.figure} whitespace-nowrap`} style={accent ? { color: MEASURE_BLUE } : undefined}>
        {value}
      </p>
      <p className={`${SOLO_TYPE.meta} mt-2`} style={{ color: t.textMuted }}>
        {label}
      </p>
    </div>
  );
}

// Total lifted: the full figure, unit in the label ("176,240" / "Kg lifted"),
// never tonnes ("176 t" read as unclear, #151).
const kg = (n) => Math.round(n || 0).toLocaleString("en-AU");

export function SoloProgramCompleteScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { soloWorkoutLogs, soloProgramsById, soloExercises, soloPrograms, soloProgramCategories, soloCurrentUser, soloWeighIns, soloTrainingPrograms, soloProgressPhotos, soloContentById } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const { purchaseId, programId } = location.state || {};
  const stats = useMemo(() => programStats(soloWorkoutLogs || [], purchaseId), [soloWorkoutLogs, purchaseId]);
  const exercisesById = useMemo(() => Object.fromEntries((soloExercises || []).map((e) => [e.id, e])), [soloExercises]);
  const next = useMemo(
    () => recommendForAnswers(soloPrograms || [], soloProgramCategories || [], soloCurrentUser?.onboarding?.answers || {}, { limit: 1, excludeIds: [programId] }).programs[0] || null,
    [soloPrograms, soloProgramCategories, soloCurrentUser, programId]
  );
  const startDate = (soloTrainingPrograms || []).find((r) => r.id === purchaseId)?.startDate || null;
  const bodyweight = useMemo(() => bodyweightChange(soloWeighIns || [], startDate), [soloWeighIns, startDate]);
  const totalWeeks = (soloContentById?.[programId]?.phases || []).reduce((n, p) => n + (Number(p.durationWeeks) || 0), 0) || Number(soloProgramsById?.[programId]?.weekOnePreview?.totalWeeks) || 0;
  const defaultPhotos = useMemo(() => progressPhotoPair(soloProgressPhotos || [], startDate, totalWeeks), [soloProgressPhotos, startDate, totalWeeks]);
  // They can swap either photo for any progress photo they've taken (#145).
  const [chosen, setChosen] = useState({ before: null, after: null });
  const [pickSlot, setPickSlot] = useState(null); // "before" | "after" while choosing
  const allPhotos = useMemo(() => [...(soloProgressPhotos || [])].filter((p) => p?.url).sort((a, b) => Number(new Date(b.date)) - Number(new Date(a.date))), [soloProgressPhotos]);
  const photos = useMemo(() => {
    if (!defaultPhotos) return null;
    const slot = (key) => {
      const p = chosen[key] && allPhotos.find((x) => x.id === chosen[key]);
      return p ? { id: p.id, url: p.url, label: photoLabel(p, startDate, totalWeeks) } : defaultPhotos[key];
    };
    return { before: slot("before"), after: slot("after") };
  }, [defaultPhotos, chosen, allPhotos, startDate, totalWeeks]);
  const [shareOpen, setShareOpen] = useState(false);
  if (!purchaseId) return <Navigate to="/solo/home" replace />;
  const program = soloProgramsById?.[programId];
  const gains = stats.strength.filter((s) => s.pct > 0).slice(0, 5);
  const card = shareCardContent({ programName: program?.name, stats, bodyweight, exercisesById, photos });

  return (
    <Page t={t}>
      <p className={SOLO_TYPE.eyebrow} style={{ color: MEASURE_BLUE }}>
        Program complete
      </p>
      <h1 className={`mt-3 ${SOLO_TYPE.title}`}>{program?.name || "Your program"}</h1>
      <p className={`mt-2 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
        Every session, done. That's the hard part.
      </p>

      <div className="grid grid-cols-2 gap-x-6 mt-9 border-t" style={{ borderColor: t.panelBorder }} data-testid="program-complete-figures">
        <Figure value={stats.sessions} label="Sessions" t={t} />
        <Figure value={`${Math.round(stats.minutes / 60)} h`} label="Training time" t={t} />
        <Figure value={kg(stats.volume)} label="Kg lifted" t={t} />
        <Figure value={stats.prs} label="Personal records" t={t} accent={stats.prs > 0} />
      </div>

      {bodyweight && (
        <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }} data-testid="program-complete-bodyweight">
          <span className="min-w-0">
            <span className={`block ${SOLO_TYPE.row}`}>Bodyweight</span>
            <span className={`block ${SOLO_TYPE.meta} mt-0.5 tabular-nums`} style={{ color: t.textMuted }}>
              {bodyweight.from} → {bodyweight.to} kg
            </span>
          </span>
          <span className="text-[16px] font-semibold tabular-nums">
            {bodyweight.change > 0 ? "+" : bodyweight.change < 0 ? "−" : ""}
            {Math.abs(bodyweight.change)} kg
          </span>
        </div>
      )}

      {photos && (
        // Week 1 and the final week, side by side (#145).
        <div className="mt-7" data-testid="program-complete-photos">
          <p className={`${SOLO_TYPE.eyebrow} mb-3`} style={{ color: t.textFaint }}>
            Progress
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["before", photos.before],
              ["after", photos.after],
            ].map(([slot, ph]) => (
              <button
                type="button"
                key={slot}
                onClick={() => setPickSlot(slot)}
                aria-label={`Change the ${slot === "before" ? "first" : "latest"} photo`}
                className="relative rounded-2xl overflow-hidden text-left"
                style={{ aspectRatio: "3 / 4", backgroundColor: t.chipBg }}
              >
                <img src={ph.url} alt={ph.label} className="w-full h-full object-cover" />
                <span className="absolute left-2.5 bottom-2.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "rgba(10,10,11,0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                  {ph.label}
                </span>
              </button>
            ))}
          </div>
          <p className={`${SOLO_TYPE.meta} mt-2`} style={{ color: t.textMuted }}>
            Tap a photo to choose another.
          </p>
        </div>
      )}
      <PhotoPickerSheet
        open={!!pickSlot}
        onClose={() => setPickSlot(null)}
        title={pickSlot === "after" ? "Choose your latest photo" : "Choose your first photo"}
        photos={allPhotos}
        selectedId={pickSlot ? photos?.[pickSlot]?.id : null}
        labelOf={(p) => photoLabel(p, startDate, totalWeeks)}
        onPick={(p) => {
          setChosen((c) => ({ ...c, [pickSlot]: p.id }));
          setPickSlot(null);
        }}
        dark={dark}
        t={t}
      />

      {gains.length > 0 && (
        <div className="mt-7">
          <p className={`${SOLO_TYPE.eyebrow} mb-1`} style={{ color: t.textFaint }}>
            Stronger
          </p>
          <ul className="border-t" style={{ borderColor: t.panelBorder }}>
            {gains.map((g) => (
              <li key={g.exerciseId} className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }}>
                <span className="min-w-0">
                  <span className={`block ${SOLO_TYPE.row} truncate`}>{exercisesById[g.exerciseId]?.name || "Lift"}</span>
                  <span className={`block ${SOLO_TYPE.meta} mt-0.5 tabular-nums`} style={{ color: t.textMuted }}>
                    Est. max {g.from} → {g.to} kg
                  </span>
                </span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: MEASURE_BLUE }}>
                  +{g.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SoloButton t={t} className="mt-8" style={{ backgroundColor: "transparent", color: t.text, border: `1px solid ${t.panelBorder}` }} onClick={() => setShareOpen(true)}>
        <Share2 size={15} /> Share your results
      </SoloButton>
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} card={card} photos={photos} programName={program?.name} dark={dark} t={t} />

      {next && (
        <button type="button" onClick={() => navigate(`/solo/program/${next.id}`)} className="w-full flex items-center gap-3.5 mt-8 text-left">
          <SoloArtwork program={next} t={t} className="w-11 h-11 rounded-xl shrink-0" />
          <span className="min-w-0 flex-1">
            <span className={`block ${SOLO_TYPE.eyebrow}`} style={{ color: t.textMuted }}>
              Up next
            </span>
            <span className={`block ${SOLO_TYPE.row} truncate mt-1`}>{next.name}</span>
          </span>
          <ChevronRight size={15} strokeWidth={1.75} color={t.textFaint} className="shrink-0" />
        </button>
      )}

      <SoloButton t={t} className="mt-9" onClick={() => (next ? navigate(`/solo/program/${next.id}`) : navigate("/solo/home", { replace: true }))}>
        {next ? "Start your next program" : "Done"}
      </SoloButton>
      {next && (
        <SoloTextButton t={t} className="mt-1" onClick={() => navigate("/solo/home", { replace: true })}>
          Not yet
        </SoloTextButton>
      )}
    </Page>
  );
}

// Choosing a different progress photo for the card (#145): every photo
// they've taken, newest first, labelled with its program week.
function PhotoPickerSheet({ open, onClose, title, photos, selectedId, labelOf, onPick, dark, t }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      <div style={{ color: t.text }}>
        <div className="grid grid-cols-3 gap-1.5" data-testid="photo-picker">
          {photos.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onPick(p)}
              aria-pressed={p.id === selectedId}
              aria-label={labelOf(p)}
              className="relative rounded-xl overflow-hidden"
              style={{ aspectRatio: "3 / 4", backgroundColor: t.chipBg, outline: p.id === selectedId ? `2px solid ${MEASURE_BLUE}` : "none", outlineOffset: -2 }}
            >
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <span className="absolute left-1.5 bottom-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "rgba(10,10,11,0.5)" }}>
                {labelOf(p)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

// Share (#145): the results card — an APEX gym photo behind frosted glass
// with their numbers and their week 1 / final week progress photos —
// shown in a glass sheet, then the phone's share sheet. Progress photos are
// already on their account; nothing new is uploaded.
export function ShareSheet({ open, onClose, card, photos, programName, fileName = "apex-program-complete.jpg", shareTitle, dark, t }) {
  const canvasRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const cardKey = JSON.stringify(card);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHint("");
    (async () => {
      const [background, logo, before, after] = await Promise.all([
        loadImage(SHARE_BACKGROUND),
        loadImage(SOLO_THEMES.dark.logo),
        loadImage(photos?.before?.url),
        loadImage(photos?.after?.url),
      ]);
      if (cancelled || !canvasRef.current) return;
      if (drawShareCard(canvasRef.current, card, { background, logo, before, after })) {
        try {
          setPreview(canvasRef.current.toDataURL("image/jpeg", 0.9));
        } catch {
          setPreview(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardKey, photos?.before?.url, photos?.after?.url]);

  async function share() {
    setHint("");
    const canvas = canvasRef.current;
    if (!canvas?.toBlob) return setHint("Press and hold the image to save or share it.");
    setBusy(true);
    try {
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      const file = blob ? new File([blob], fileName, { type: "image/jpeg" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle || (programName ? `${programName} — complete` : "Program complete") });
      } else {
        setHint("Press and hold the image to save or share it.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setHint("Press and hold the image to save or share it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Share your results" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      {/* Sheets open outside the page: give their text the theme colour, or it falls back to black (dark mode, #146). */}
      <div style={{ color: t.text }}>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <div data-testid="share-card" className="w-full rounded-2xl overflow-hidden" style={{ aspectRatio: "4 / 5", backgroundColor: "#0A0A0B" }}>
        {preview && <img src={preview} alt="Your results card" className="w-full h-full object-cover" />}
      </div>
      <SoloButton t={t} className="mt-4" onClick={share} disabled={busy}>
        <Share2 size={15} /> Share
      </SoloButton>
      {hint && (
        <p className={`${SOLO_TYPE.meta} mt-2 text-center`} style={{ color: t.textMuted }}>
          {hint}
        </p>
      )}
      </div>
    </BottomSheet>
  );
}

export function SoloWeekRecapScreen() {
  const navigate = useNavigate();
  const { soloWorkoutLogs, soloTrainingPrograms, soloProgramsById, soloContentById, soloCurrentUser, soloCustomSessions, soloExercises, soloWeighIns, soloBodyMetrics } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const todayKey = localDateKey();
  const recap = useMemo(() => {
    const { reviewMonday, nextMonday } = reviewWeek(todayKey);
    const byDate = buildSoloCalendar({
      purchases: soloTrainingPrograms || [],
      programsById: soloProgramsById || {},
      contentByProgramId: soloContentById || {},
      workoutLogs: soloWorkoutLogs || [],
      trainingDays: soloCurrentUser?.onboarding?.answers?.trainingDays,
      sessionPlan: soloCurrentUser?.sessionPlan,
      plannedSessions: soloCurrentUser?.plannedSessions,
      customSessions: soloCustomSessions || [],
      fromKey: reviewMonday,
      toKey: addDays(nextMonday, 6),
    });
    return weekRecap({ logs: soloWorkoutLogs || [], byDate, todayKey });
  }, [soloWorkoutLogs, soloTrainingPrograms, soloProgramsById, soloContentById, soloCurrentUser, soloCustomSessions, todayKey]);

  // The rest of the review (#236): what got stronger, how consistent, the
  // goal, the best insights and one focus for next week — all from their logs.
  const review = useMemo(() => {
    const logs = soloWorkoutLogs || [];
    const exercisesById = Object.fromEntries((soloExercises || []).map((e) => [e.id, e]));
    const weekEnd = addDays(recap.lastMonday, 7);
    const goal = soloCurrentUser?.goal || null;
    const progress = goalProgress(goal, { logs, weighIns: soloWeighIns || [], bodyMetrics: soloBodyMetrics || [], todayKey });
    const shown = new Set(["prs"]); // already a figure above
    return {
      gains: strengthGains(logs, exercisesById, recap.lastMonday, weekEnd).slice(0, 3),
      streak: weeksTrainedInARow(logs, addDays(recap.lastMonday, 6)),
      comebacks: comebacksIn(logs, recap.lastMonday, weekEnd),
      goal,
      progress,
      insights: buildInsights({ logs, exercisesById, goal, progress, todayKey }).filter((i) => !shown.has(i.id)).slice(0, 2),
      focus: weeklyFocus({ recap, goal, progress, nextPlanned: recap.thisWeek.length }),
    };
  }, [recap, soloWorkoutLogs, soloExercises, soloCurrentUser?.goal, soloWeighIns, soloBodyMetrics, todayKey]);

  const range = `${new Date(`${recap.lastMonday}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(`${addDays(recap.lastMonday, 6)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  const headline = recap.planned > 0 ? `${recap.plannedDone} of ${recap.planned}` : String(recap.sessionsDone);
  const nextLabel = recap.thisMonday > todayKey ? "Next week" : "This week";

  return (
    <Page t={t}>
      <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
        Weekly review · {range}
      </p>
      <h1 className={`mt-3 ${SOLO_TYPE.title}`} data-testid="week-title">
        {reviewHeadline(recap)}
      </h1>
      <p className={`mt-6 ${SOLO_TYPE.hero}`} data-testid="week-headline">
        {headline}
      </p>
      <p className={`mt-2 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
        {recap.planned > 0 ? "planned sessions done" : recap.sessionsDone === 1 ? "session done" : "sessions done"}
      </p>

      <div className="grid grid-cols-[1fr_1.4fr_0.8fr] gap-x-4 mt-9 border-t" style={{ borderColor: t.panelBorder }}>
        <Figure small value={`${recap.minutes}`} label="Minutes" t={t} />
        <Figure small value={kg(recap.volume)} label={recap.volumeChangePct == null ? "Kg lifted" : `Kg lifted · ${recap.volumeChangePct >= 0 ? "+" : ""}${recap.volumeChangePct}%`} t={t} />
        <Figure small value={recap.prs} label="PRs" t={t} accent={recap.prs > 0} />
      </div>
      {review.streak > 0 && (
        <div className="flex items-center justify-between py-3 border-y" style={{ borderColor: t.panelBorder }} data-testid="week-consistency">
          <span className={SOLO_TYPE.row}>Consistency</span>
          <span className="text-[16px] font-semibold tabular-nums">
            {review.streak} week{review.streak === 1 ? "" : "s"} in a row
          </span>
        </div>
      )}

      {review.comebacks.map((c) => (
        // #244: coming back after a break is worth saying out loud.
        <div key={c.dateKey} className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }} data-testid="week-comeback">
          <span className={SOLO_TYPE.row}>Comeback</span>
          <span className="text-[13px] tabular-nums" style={{ color: t.textMuted }}>
            {new Date(`${c.dateKey}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long" })}, after {c.gap} days off
          </span>
        </div>
      ))}

      {review.gains.length > 0 && (
        <div className="mt-7" data-testid="week-stronger">
          <p className={`${SOLO_TYPE.eyebrow} mb-1`} style={{ color: t.textFaint }}>
            Stronger
          </p>
          <ul className="border-t" style={{ borderColor: t.panelBorder }}>
            {review.gains.map((g) => (
              <li key={g.exerciseId} className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }}>
                <span className="min-w-0">
                  <span className={`block ${SOLO_TYPE.row} truncate`}>{g.name}</span>
                  <span className={`block ${SOLO_TYPE.meta} mt-0.5 tabular-nums`} style={{ color: t.textMuted }}>
                    Est. max {g.from} → {g.to} kg
                  </span>
                </span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: MEASURE_BLUE }}>
                  +{g.gain} kg
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.goal && review.progress && (
        <div className="mt-7" data-testid="week-goal">
          <p className={`${SOLO_TYPE.eyebrow} mb-3`} style={{ color: t.textFaint }}>
            Your goal
          </p>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`${SOLO_TYPE.row} min-w-0 truncate`}>{goalTitle(review.goal)}</span>
            <span className="text-[16px] font-semibold tabular-nums shrink-0" style={review.progress.done ? { color: MEASURE_BLUE } : undefined}>
              {review.progress.needsWeight ? "–" : `${Math.round(review.progress.pct * 100)}%`}
            </span>
          </div>
          <span className="block h-1.5 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: t.chipBg }}>
            <span className="block h-full rounded-full" style={{ width: `${Math.round(review.progress.pct * 100)}%`, backgroundColor: MEASURE_BLUE }} />
          </span>
          <p className={`${SOLO_TYPE.meta} mt-2`} style={{ color: t.textMuted }}>
            {encouragement(review.progress)}
          </p>
        </div>
      )}

      {review.insights.length > 0 && (
        <ul className="mt-7 space-y-2.5" data-testid="week-insights">
          {review.insights.map((i) => (
            <li key={i.id} className={`flex items-start gap-2.5 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
              <TrendingUp size={15} color={MEASURE_BLUE} className="shrink-0 mt-[3px]" />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}

      {review.focus && (
        <div className="mt-8 pt-5 border-t" style={{ borderColor: t.panelBorder }} data-testid="week-focus">
          <p className={SOLO_TYPE.eyebrow} style={{ color: MEASURE_BLUE }}>
            Next week's focus
          </p>
          <p className="mt-2 text-[16px] leading-snug font-semibold">{review.focus}</p>
        </div>
      )}

      <div className="mt-7">
        <p className={`${SOLO_TYPE.eyebrow} mb-1`} style={{ color: t.textFaint }}>
          {nextLabel}
        </p>
        {recap.thisWeek.length ? (
          <ul className="border-t" style={{ borderColor: t.panelBorder }}>
            {recap.thisWeek.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }}>
                <span className={`${SOLO_TYPE.row} truncate`}>{w.title}</span>
                <span className={`${SOLO_TYPE.meta} shrink-0 ml-3`} style={{ color: t.textMuted }}>
                  {sessionDayLabel(w.dateKey, todayKey)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${SOLO_TYPE.body} py-2`} style={{ color: t.textMuted }}>
            Nothing planned — build a session or start a program to fill your week.
          </p>
        )}
      </div>

      {/* No check-in button (#239, owner): Train Solo has no check-ins. */}
      <SoloButton t={t} className="mt-9" onClick={() => navigate("/solo/home", { replace: true })}>
        Done
      </SoloButton>
    </Page>
  );
}
