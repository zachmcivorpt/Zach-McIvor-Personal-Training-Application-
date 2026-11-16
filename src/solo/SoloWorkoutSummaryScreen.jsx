import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Check, Share2, TrendingUp } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { localDateKey } from "../lib/dateKey";
import { milestoneCrossed } from "./goals";
import { mondayOf } from "./soloCalendar";
import { canUse } from "./soloAccess";
import { usePartners } from "./partnerStore";
import { teamWeekView } from "./partners";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { sessionEntries, summaryPeak, nextTimeTargets, weeklyTargetOf } from "./workoutSummary";
import { ShareSheet } from "./SoloRecapScreens";

const kg = (n) => Math.round(n || 0).toLocaleString("en-AU");

// After a workout (#244): end on the best moment (peak-end). The peak first —
// back after a break, a new PR, a lift that beat last time, else done — then
// what to aim for next time on the main lifts, how this counts towards the
// week (and Team Week, and the goal), and only then a quiet row of stats.
// No calorie estimate: every figure here is the member's own.
export default function SoloWorkoutSummaryScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const { daySession, activeLog, durationMin = 0, savedOffline = false, programComplete = null, logId = null } = location.state || {};
  const { soloCurrentUser, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloExercises, soloAccess } = useSoloApp();
  const uid = soloCurrentUser?.id;
  const { pairs, activity } = usePartners(uid);
  const [shareOpen, setShareOpen] = useState(false);
  const todayKey = localDateKey();

  const view = useMemo(() => {
    const logs = soloWorkoutLogs || [];
    const exercisesById = Object.fromEntries((soloExercises || []).map((e) => [e.id, e]));
    const previousLogs = logs.filter((l) => l.id !== logId);
    const entries = sessionEntries(activeLog);
    const peak = summaryPeak({ entries, previousLogs, exercisesById, todayKey });
    const next = nextTimeTargets({ entries, day: daySession, previousLogs, exercisesById, smart: canUse("suggestedWeights", soloAccess) });
    // This week, counting this session even before the log lands.
    const monday = mondayOf(todayKey);
    const weekDone = previousLogs.filter((l) => localDateKey(new Date(l.date)) >= monday).length + 1;
    const target = weeklyTargetOf(soloCurrentUser);
    const milestone = logId ? milestoneCrossed(soloCurrentUser?.goal, { logs: logs.some((l) => l.id === logId) ? logs : [...logs, { id: logId, date: Date.now(), entries }], weighIns: soloWeighIns || [], bodyMetrics: soloBodyMetrics || [], todayKey }, logId) : null;
    const sets = entries.reduce((n, e) => n + e.sets.length, 0);
    const volume = entries.reduce((n, e) => n + e.sets.reduce((a, s) => a + s.weight * s.reps, 0), 0);
    return { peak, next, weekDone, target, milestone, sets, volume, exercisesById };
  }, [soloWorkoutLogs, soloExercises, logId, activeLog, daySession, soloAccess, soloCurrentUser, soloWeighIns, soloBodyMetrics, todayKey]);

  // Team Week: the partner closest to finishing the week together.
  const team = useMemo(() => {
    const mine = { weeks: { [mondayOf(todayKey)]: { done: view.weekDone, target: view.target } }, target: view.target };
    const rows = pairs.map((p) => {
      const partnerUid = p.members.find((m) => m !== uid);
      const theirs = activity[partnerUid];
      return { name: theirs?.firstName || "your partner", ...teamWeekView({ mine, theirs, todayKey, pairedAt: p.createdAt }) };
    });
    return rows.sort((a, b) => Number(b.metThisWeek) - Number(a.metThisWeek))[0] || null;
  }, [pairs, activity, uid, view.weekDone, view.target, todayKey]);

  // <Navigate> rather than navigate() during render (a side effect React
  // Router warns about) — e.g. reopening this page with no workout state.
  if (!daySession) return <Navigate to="/solo/home" replace />;

  const { peak, next } = view;
  const pr = peak.pr;
  const shareCard = pr
    ? {
        eyebrow: "NEW PERSONAL BEST",
        title: `${pr.name}`,
        figures: [
          { value: pr.set.weight > 0 ? `${pr.set.weight} kg` : `${pr.set.reps}`, label: pr.set.weight > 0 ? "Top set" : "Reps" },
          ...(pr.set.weight > 0 ? [{ value: String(pr.set.reps), label: "Reps" }] : []),
          ...(pr.before && pr.before.weight > 0 && pr.set.weight > pr.before.weight ? [{ value: `+${Math.round((pr.set.weight - pr.before.weight) * 10) / 10} kg`, label: "On last time" }] : []),
        ],
        lifts: [],
        photos: null,
      }
    : null;
  const leftThisWeek = Math.max(0, view.target - view.weekDone);
  const teamLeft = team ? Math.max(0, team.me.target - view.weekDone) + Math.max(0, team.them.target - team.them.done) : 0;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto" style={{ backgroundColor: t.bg, color: t.text }} data-testid="workout-summary">
      <div className="max-w-md mx-auto px-5 pb-10 flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 36px)" }}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ border: `1px solid ${t.panelBorder}`, backgroundColor: t.chipBg }}>
            <Check size={17} strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span className={`block ${SOLO_TYPE.eyebrow}`} style={{ color: t.textMuted }}>
              Workout complete
            </span>
            <span className={`block ${SOLO_TYPE.row} truncate mt-0.5`}>{daySession.label}</span>
          </span>
        </div>
        {savedOffline && (
          <p className={`${SOLO_TYPE.meta} mt-3`} style={{ color: t.textMuted }}>
            No signal — saved on your phone. It will send when you're back online.
          </p>
        )}

        {/* The peak: the first and biggest thing on the page. */}
        <div className="mt-10" data-testid="summary-peak">
          <p className={SOLO_TYPE.eyebrow} style={{ color: MEASURE_BLUE }}>
            {peak.eyebrow}
          </p>
          <h1 className="mt-2 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">{peak.title}</h1>
          {peak.detail && (
            <p className={`${SOLO_TYPE.body} mt-2`} style={{ color: t.textMuted }}>
              {peak.detail}
            </p>
          )}
        </div>

        {next.length > 0 && (
          <div className="mt-7 rounded-2xl px-4 py-3" style={soloGlass(t)} data-testid="summary-next">
            <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
              Next time
            </p>
            {next.map((n, i) => (
              <div key={n.exerciseId} className="flex items-center justify-between gap-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}>
                <span className={`${SOLO_TYPE.row} min-w-0 truncate`}>{n.name}</span>
                <span className="text-[15px] font-semibold tabular-nums shrink-0" style={{ color: MEASURE_BLUE }}>
                  {n.text}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 space-y-1.5" data-testid="summary-progress">
          <p className="flex items-start gap-2 text-[13px] leading-snug">
            <TrendingUp size={14} color={MEASURE_BLUE} className="shrink-0 mt-[3px]" />
            <span>
              <span className="font-semibold">
                {view.weekDone} of {view.target} this week
              </span>
              <span style={{ color: t.textMuted }}>{leftThisWeek === 0 ? " · week done" : ` · ${leftThisWeek} to go`}</span>
            </span>
          </p>
          {team && (
            <p className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: t.textMuted }}>
              <TrendingUp size={14} color={MEASURE_BLUE} className="shrink-0 mt-[3px]" />
              <span>{teamLeft === 0 ? `Team week with ${team.name}: done` : `Team week with ${team.name}: ${teamLeft} to go between you`}</span>
            </p>
          )}
          {view.milestone && (
            <p className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: t.textMuted }}>
              <TrendingUp size={14} color={MEASURE_BLUE} className="shrink-0 mt-[3px]" />
              <span>{view.milestone >= 1 ? "Goal reached." : `Goal: ${Math.round(view.milestone * 100)}% of the way.`}</span>
            </p>
          )}
        </div>

        {/* The quiet facts, last. */}
        <p className={`${SOLO_TYPE.meta} mt-6 pt-4 border-t tabular-nums`} style={{ borderColor: t.panelBorder, color: t.textMuted }} data-testid="summary-stats">
          {durationMin} min · {view.sets} set{view.sets === 1 ? "" : "s"}
          {view.volume > 0 ? ` · ${kg(view.volume)} kg lifted` : ""}
        </p>

        {shareCard && (
          <SoloTextButton t={t} className="mt-4 !w-auto self-start !h-9 flex items-center gap-1.5" onClick={() => setShareOpen(true)}>
            <Share2 size={14} /> Share your PR
          </SoloTextButton>
        )}
        <SoloButton
          t={t}
          className="mt-6"
          onClick={() => (programComplete ? navigate("/solo/program-complete", { replace: true, state: programComplete }) : navigate("/solo/home", { replace: true }))}
        >
          {programComplete ? "See your program" : "Done"}
        </SoloButton>
      </div>
      {shareCard && <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} card={shareCard} photos={null} programName={pr.name} fileName="apex-personal-best.jpg" shareTitle={`New best: ${peak.title}`} dark={dark} t={t} />}
    </div>
  );
}
