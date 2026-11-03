import React, { useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { PrimaryButton } from "../components/ui";
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
      <div className="max-w-md mx-auto px-5 pb-10" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 36px)" }}>
        <img src={t.logo} alt="APEX" className="w-auto mb-10" style={{ height: 19 }} />
        {children}
      </div>
    </div>
  );
}

function Figure({ value, label, t, accent = false, small = false }) {
  return (
    <div className="py-4 min-w-0">
      <p className={`${small ? "text-[26px]" : "text-[34px]"} leading-none font-semibold tracking-[-0.03em] tabular-nums whitespace-nowrap`} style={accent ? { color: MEASURE_BLUE } : undefined}>
        {value}
      </p>
      <p className="text-xs mt-1.5" style={{ color: t.textMuted }}>
        {label}
      </p>
    </div>
  );
}

const kg = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} t` : `${n.toLocaleString()} kg`);

export function SoloProgramCompleteScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { soloWorkoutLogs, soloProgramsById, soloExercises, soloPrograms, soloProgramCategories, soloCurrentUser } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const { purchaseId, programId } = location.state || {};
  const stats = useMemo(() => programStats(soloWorkoutLogs || [], purchaseId), [soloWorkoutLogs, purchaseId]);
  const exercisesById = useMemo(() => Object.fromEntries((soloExercises || []).map((e) => [e.id, e])), [soloExercises]);
  const next = useMemo(
    () => recommendForAnswers(soloPrograms || [], soloProgramCategories || [], soloCurrentUser?.onboarding?.answers || {}, { limit: 1, excludeIds: [programId] }).programs[0] || null,
    [soloPrograms, soloProgramCategories, soloCurrentUser, programId]
  );
  if (!purchaseId) return <Navigate to="/solo/home" replace />;
  const program = soloProgramsById?.[programId];
  const gains = stats.strength.filter((s) => s.pct > 0).slice(0, 3);

  return (
    <Page t={t}>
      <p className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: MEASURE_BLUE }}>
        Program complete
      </p>
      <h1 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em]">{program?.name || "Your program"}</h1>
      <p className="mt-3 text-sm" style={{ color: t.textMuted }}>
        Every session, done. That's the hard part.
      </p>

      <div className="grid grid-cols-2 gap-x-6 mt-8 border-t" style={{ borderColor: t.panelBorder }} data-testid="program-complete-figures">
        <Figure value={stats.sessions} label="Sessions" t={t} />
        <Figure value={`${Math.round(stats.minutes / 60)} h`} label="Training time" t={t} />
        <Figure value={kg(stats.volume)} label="Total lifted" t={t} />
        <Figure value={stats.prs} label="Personal records" t={t} accent={stats.prs > 0} />
      </div>

      {gains.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: t.textFaint }}>
            Stronger
          </p>
          <ul className="border-t" style={{ borderColor: t.panelBorder }}>
            {gains.map((g) => (
              <li key={g.exerciseId} className="flex items-center justify-between py-3 border-b" style={{ borderColor: t.panelBorder }}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{exercisesById[g.exerciseId]?.name || "Lift"}</span>
                  <span className="block text-xs mt-0.5 tabular-nums" style={{ color: t.textMuted }}>
                    Est. max {g.from} → {g.to} kg
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: MEASURE_BLUE }}>
                  +{g.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {next && (
        <button type="button" onClick={() => navigate(`/solo/program/${next.id}`)} className="w-full flex items-center gap-3.5 mt-8 text-left">
          <SoloArtwork program={next} t={t} className="w-12 h-12 rounded-xl shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: t.textMuted }}>
              Up next
            </span>
            <span className="block text-sm font-semibold truncate mt-0.5">{next.name}</span>
          </span>
          <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
        </button>
      )}

      <PrimaryButton dark={dark} className="w-full mt-8" onClick={() => (next ? navigate(`/solo/program/${next.id}`) : navigate("/solo/home", { replace: true }))}>
        {next ? "START YOUR NEXT PROGRAM" : "DONE"}
      </PrimaryButton>
      {next && (
        <button type="button" onClick={() => navigate("/solo/home", { replace: true })} className="w-full text-sm font-semibold py-4" style={{ color: t.textMuted }}>
          Not yet
        </button>
      )}
    </Page>
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
      <p className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: t.textMuted }}>
        Your week · {range}
      </p>
      <p className="mt-3 text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums" data-testid="week-headline">
        {headline}
      </p>
      <p className="mt-2 text-sm" style={{ color: t.textMuted }}>
        {recap.planned > 0 ? "planned sessions done" : recap.sessionsDone === 1 ? "session done" : "sessions done"}
      </p>

      <div className="grid grid-cols-[1fr_1.4fr_0.8fr] gap-x-4 mt-8 border-t" style={{ borderColor: t.panelBorder }}>
        <Figure small value={`${recap.minutes}`} label="Minutes" t={t} />
        <Figure small value={kg(recap.volume)} label={recap.volumeChangePct == null ? "Lifted" : `Lifted · ${recap.volumeChangePct >= 0 ? "+" : ""}${recap.volumeChangePct}%`} t={t} />
        <Figure small value={recap.prs} label="PRs" t={t} accent={recap.prs > 0} />
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: t.textFaint }}>
          This week
        </p>
        {recap.thisWeek.length ? (
          <ul className="border-t" style={{ borderColor: t.panelBorder }}>
            {recap.thisWeek.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-3 border-b text-sm" style={{ borderColor: t.panelBorder }}>
                <span className="font-semibold truncate">{w.title}</span>
                <span className="text-xs shrink-0 ml-3" style={{ color: t.textMuted }}>
                  {sessionDayLabel(w.dateKey, todayKey)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm py-2" style={{ color: t.textMuted }}>
            Nothing planned — build a session or start a program to fill your week.
          </p>
        )}
      </div>

      <PrimaryButton dark={dark} className="w-full mt-8" onClick={() => navigate("/solo/home", { replace: true, state: { soloTab: "progress" } })}>
        LOG THIS WEEK'S CHECK-IN
      </PrimaryButton>
      <button type="button" onClick={() => navigate("/solo/home", { replace: true })} className="w-full text-sm font-semibold py-4" style={{ color: t.textMuted }}>
        Done
      </button>
    </Page>
  );
}
