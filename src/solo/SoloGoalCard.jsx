import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Target, TrendingUp } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import SoloGlassBox from "./SoloGlassBox";
import { soloGlass } from "./SoloThemeContext";
import { goalTitle, goalProgress, encouragement } from "./goals";
import { buildInsights, insightForToday } from "./insights";

const tidy = (n) => (n == null ? "–" : (Math.round(n * 10) / 10).toLocaleString("en-AU"));

// My Training's goal and today's insight (#236). Built like the page's
// other sections ("Your Sessions", "Team Week"): bold heading, one glass
// box, a blue line icon. Every figure from their own logs.
export default function SoloGoalCard({ profile, logs, weighIns, bodyMetrics, exercises, todayKey, t }) {
  const navigate = useNavigate();
  const goal = profile?.goal || null;
  const progress = useMemo(() => goalProgress(goal, { logs, weighIns, bodyMetrics, todayKey }), [goal, logs, weighIns, bodyMetrics, todayKey]);
  const exercisesById = useMemo(() => Object.fromEntries((exercises || []).map((e) => [e.id, e])), [exercises]);
  const insight = useMemo(() => insightForToday(buildInsights({ logs, exercisesById, goal, progress, todayKey }), todayKey), [logs, exercisesById, goal, progress, todayKey]);
  const open = () => navigate("/solo/goal", { state: { back: "/solo/home" } });

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold">Your Goal</h2>
        {progress && !progress.needsWeight && (
          <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: progress.done ? MEASURE_BLUE : t.textFaint }}>
            {progress.done ? "Reached" : `${Math.round(progress.pct * 100)}%`}
          </span>
        )}
      </div>
      {goal && progress ? (
        <SoloGlassBox t={t} className="rounded-2xl">
          <button type="button" onClick={open} className="w-full text-left px-4 py-3.5" aria-label={`${goalTitle(goal)} — change goal`}>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold flex-1 min-w-0 truncate">{goalTitle(goal)}</span>
              <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
            </span>
            <span className="flex items-baseline gap-1.5 mt-2">
              <span className="text-[28px] leading-none font-extrabold tabular-nums" style={progress.done ? { color: MEASURE_BLUE } : undefined} data-testid="goal-value">
                {tidy(progress.value)}
              </span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: t.textMuted }}>
                / {tidy(progress.of)} {progress.unit}
              </span>
            </span>
            <span className="block h-1.5 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: t.chipBg }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round(progress.pct * 100)}%`, backgroundColor: MEASURE_BLUE }} />
            </span>
            <span className="block text-xs mt-2" style={{ color: progress.done || progress.pct >= 0.75 ? MEASURE_BLUE : t.textMuted }}>
              {encouragement(progress)}
            </span>
          </button>
        </SoloGlassBox>
      ) : (
        <button type="button" onClick={open} className="w-full flex items-center gap-2.5 rounded-2xl px-3.5 py-3.5 text-left" style={soloGlass(t)}>
          <Target size={17} color={MEASURE_BLUE} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Set your main goal</span>
            <span className="block text-[11px] mt-0.5" style={{ color: t.textMuted }}>
              Something to aim at, tracked from what you log
            </span>
          </span>
          <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
        </button>
      )}
      {insight && (
        <p className="flex items-start gap-2 mt-3 px-1 text-xs leading-relaxed" style={{ color: t.textMuted }} data-testid="solo-insight">
          <TrendingUp size={14} color={MEASURE_BLUE} className="shrink-0 mt-0.5" />
          <span>{insight.text}</span>
        </p>
      )}
    </div>
  );
}
