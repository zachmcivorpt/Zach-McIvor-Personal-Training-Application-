import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Share2 } from "lucide-react";
import { BottomSheet } from "../components/ui";
import { bodyweightChange, shareCardContent, drawShareCard, loadImage, progressPhotoPair } from "./shareCard";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";

// The APEX gym photo behind the share card's glass.
const SHARE_BACKGROUND = "/brand/gym-dark.jpg";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { SoloArtwork } from "./SoloArtwork";
import { recommendForAnswers } from "./recommendations";
import { programStats, weekRecap } from "./trainingRecap";
import { buildSoloCalendar, addDays, mondayOf, sessionDayLabel } from "./soloCalendar";
import { localDateKey } from "../lib/dateKey";

// Two full-screen moments (#141), solid page colour with large numbers:
//  - SoloProgramCompleteScreen: after the last session of a program — what
//    they did, how much stronger they got, and the next program.
//  - SoloWeekRecapScreen: the Monday recap — last week against the plan,
//    and what's on this week.

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

const kg = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} t` : `${n.toLocaleString()} kg`);

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
  const photos = useMemo(() => progressPhotoPair(soloProgressPhotos || [], startDate, totalWeeks), [soloProgressPhotos, startDate, totalWeeks]);
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
        <Figure value={kg(stats.volume)} label="Total lifted" t={t} />
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
            {[photos.before, photos.after].map((ph, i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "3 / 4", backgroundColor: t.chipBg }}>
                <img src={ph.url} alt={ph.label} className="w-full h-full object-cover" />
                <span className="absolute left-2.5 bottom-2.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "rgba(10,10,11,0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                  {ph.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

// Share (#145): the results card — an APEX gym photo behind frosted glass
// with their numbers and their week 1 / final week progress photos —
// shown in a glass sheet, then the phone's share sheet. Progress photos are
// already on their account; nothing new is uploaded.
function ShareSheet({ open, onClose, card, photos, programName, dark, t }) {
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
      const file = blob ? new File([blob], "apex-program-complete.jpg", { type: "image/jpeg" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: programName ? `${programName} — complete` : "Program complete" });
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
  const { soloWorkoutLogs, soloTrainingPrograms, soloProgramsById, soloContentById, soloCurrentUser, soloCustomSessions } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const todayKey = localDateKey();
  const recap = useMemo(() => {
    const thisMonday = mondayOf(todayKey);
    const byDate = buildSoloCalendar({
      purchases: soloTrainingPrograms || [],
      programsById: soloProgramsById || {},
      contentByProgramId: soloContentById || {},
      workoutLogs: soloWorkoutLogs || [],
      trainingDays: soloCurrentUser?.onboarding?.answers?.trainingDays,
      sessionPlan: soloCurrentUser?.sessionPlan,
      plannedSessions: soloCurrentUser?.plannedSessions,
      customSessions: soloCustomSessions || [],
      fromKey: addDays(thisMonday, -7),
      toKey: addDays(thisMonday, 6),
    });
    return weekRecap({ logs: soloWorkoutLogs || [], byDate, todayKey });
  }, [soloWorkoutLogs, soloTrainingPrograms, soloProgramsById, soloContentById, soloCurrentUser, soloCustomSessions, todayKey]);

  const range = `${new Date(`${recap.lastMonday}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(`${addDays(recap.lastMonday, 6)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  const headline = recap.planned > 0 ? `${recap.plannedDone} of ${recap.planned}` : String(recap.sessionsDone);

  return (
    <Page t={t}>
      <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
        Your week · {range}
      </p>
      <p className={`mt-4 ${SOLO_TYPE.hero}`} data-testid="week-headline">
        {headline}
      </p>
      <p className={`mt-2 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
        {recap.planned > 0 ? "planned sessions done" : recap.sessionsDone === 1 ? "session done" : "sessions done"}
      </p>

      <div className="grid grid-cols-[1fr_1.4fr_0.8fr] gap-x-4 mt-9 border-t" style={{ borderColor: t.panelBorder }}>
        <Figure small value={`${recap.minutes}`} label="Minutes" t={t} />
        <Figure small value={kg(recap.volume)} label={recap.volumeChangePct == null ? "Lifted" : `Lifted · ${recap.volumeChangePct >= 0 ? "+" : ""}${recap.volumeChangePct}%`} t={t} />
        <Figure small value={recap.prs} label="PRs" t={t} accent={recap.prs > 0} />
      </div>

      <div className="mt-7">
        <p className={`${SOLO_TYPE.eyebrow} mb-1`} style={{ color: t.textFaint }}>
          This week
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

      <SoloButton t={t} className="mt-9" onClick={() => navigate("/solo/home", { replace: true, state: { soloTab: "progress" } })}>
        Log this week's check-in
      </SoloButton>
      <SoloTextButton t={t} className="mt-1" onClick={() => navigate("/solo/home", { replace: true })}>
        Done
      </SoloTextButton>
    </Page>
  );
}
