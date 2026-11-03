import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ImagePlus, Share2 } from "lucide-react";
import { bodyweightChange, shareCardContent, drawShareCard, loadImage } from "./shareCard";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
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
  const { soloWorkoutLogs, soloProgramsById, soloExercises, soloPrograms, soloProgramCategories, soloCurrentUser, soloWeighIns, soloTrainingPrograms } = useSoloApp();
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
  if (!purchaseId) return <Navigate to="/solo/home" replace />;
  const program = soloProgramsById?.[programId];
  const gains = stats.strength.filter((s) => s.pct > 0).slice(0, 5);
  const card = shareCardContent({ programName: program?.name, stats, bodyweight, exercisesById });

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

      <ShareResults card={card} programName={program?.name} t={t} />

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

// "Share your results" (#144): their own photo behind their numbers, as one
// image they can post. The photo stays on the phone — it's only drawn into
// the card, never uploaded.
function ShareResults({ card, programName, t }) {
  const canvasRef = useRef(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const cardKey = JSON.stringify(card);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [photo, logo] = await Promise.all([loadImage(photoUrl), loadImage(SOLO_THEMES.dark.logo)]);
      if (cancelled || !canvasRef.current) return;
      if (drawShareCard(canvasRef.current, card, { photo, logo })) {
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
  }, [photoUrl, cardKey]);

  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setHint("");
    setPhotoUrl(URL.createObjectURL(file));
  }

  async function share() {
    setHint("");
    const canvas = canvasRef.current;
    if (!canvas?.toBlob) return setHint("Press and hold the image to save it.");
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
    <div className="mt-9" data-testid="share-results">
      <p className={`${SOLO_TYPE.eyebrow} mb-3`} style={{ color: t.textFaint }}>
        Share your results
      </p>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      {preview ? (
        <img src={preview} alt="Your results card" className="w-full rounded-2xl" style={{ aspectRatio: "4 / 5", objectFit: "cover" }} />
      ) : (
        <div className="w-full rounded-2xl" style={{ aspectRatio: "4 / 5", backgroundColor: "#0A0A0B" }} />
      )}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <label className="h-12 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-bold uppercase tracking-[0.02em] cursor-pointer" style={{ border: `1px solid ${t.panelBorder}`, color: t.text }}>
          <ImagePlus size={15} />
          {photoUrl ? "Change photo" : "Add photo"}
          <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} aria-label={photoUrl ? "Change photo" : "Add photo"} />
        </label>
        <SoloButton t={t} onClick={share} disabled={busy}>
          <Share2 size={15} /> Share
        </SoloButton>
      </div>
      {hint && (
        <p className={`${SOLO_TYPE.meta} mt-2 text-center`} style={{ color: t.textMuted }}>
          {hint}
        </p>
      )}
    </div>
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
