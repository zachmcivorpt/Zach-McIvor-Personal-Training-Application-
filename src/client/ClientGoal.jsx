import React, { useMemo, useState } from "react";
import { ChevronRight, Target } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { createPortal } from "react-dom";
import { GoalPicker } from "../solo/SoloGoalScreen";
import { localDateKey } from "../lib/dateKey";
import { goalTitle, goalProgress, encouragement } from "../solo/goals";

// #248 (owner): the coached client's Progress opens like Train Solo's, with
// their main goal on top ("Set your main goal"). Same goal maths as Train
// Solo (src/solo/goals.js) on the client's own logs, weigh-ins and steps;
// saved on their own user doc (`goal`). Lazy-loaded with Progress.

const tidy = (n) => (n == null ? "–" : (Math.round(n * 10) / 10).toLocaleString("en-AU"));

function glass(dark) {
  return dark
    ? { backgroundColor: "rgba(28,28,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }
    : { backgroundColor: "rgba(255,255,255,0.62)", border: "1px solid rgba(20,19,15,0.08)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" };
}

export default function ClientGoalCard({ goal, logs = [], weighIns = [], bodyMetrics = [], exercises = [], dark, onSave, onLogWeight }) {
  const [open, setOpen] = useState(false);
  const todayKey = localDateKey();
  const progress = useMemo(() => goalProgress(goal, { logs, weighIns, bodyMetrics, todayKey }), [goal, logs, weighIns, bodyMetrics, todayKey]);
  const text = dark ? "#fff" : "#000";
  const muted = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const faint = dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";

  return (
    <div data-testid="client-goal">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold" style={{ color: text }}>Your Goal</h2>
        {progress && !progress.needsWeight && (
          <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: progress.done ? MEASURE_BLUE : faint }}>
            {progress.done ? "Reached" : `${Math.round(progress.pct * 100)}%`}
          </span>
        )}
      </div>
      {goal && progress ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full text-left rounded-2xl px-4 py-3.5" style={{ ...glass(dark), color: text }} aria-label={`${goalTitle(goal)} — change goal`}>
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold flex-1 min-w-0 truncate">{goalTitle(goal)}</span>
            <ChevronRight size={16} color={faint} className="shrink-0" />
          </span>
          <span className="flex items-baseline gap-1.5 mt-2">
            <span className="text-[28px] leading-none font-extrabold tabular-nums" style={progress.done ? { color: MEASURE_BLUE } : undefined} data-testid="client-goal-value">
              {tidy(progress.value)}
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: muted }}>
              / {tidy(progress.of)} {progress.unit}
            </span>
          </span>
          <span className="block h-1.5 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
            <span className="block h-full rounded-full" style={{ width: `${Math.round(progress.pct * 100)}%`, backgroundColor: MEASURE_BLUE }} />
          </span>
          <span className="block text-xs mt-2" style={{ color: progress.done || progress.pct >= 0.75 ? MEASURE_BLUE : muted }}>
            {encouragement(progress)}
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-2.5 rounded-2xl px-3.5 py-3.5 text-left" style={{ ...glass(dark), color: text }}>
          <Target size={17} color={MEASURE_BLUE} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Set your main goal</span>
            <span className="block text-[11px] mt-0.5" style={{ color: muted }}>
              Something to aim at, tracked from what you log
            </span>
          </span>
          <ChevronRight size={16} color={faint} className="shrink-0" />
        </button>
      )}
      <GoalSheet open={open} onClose={() => setOpen(false)} current={goal} logs={logs} weighIns={weighIns} exercises={exercises} dark={dark} onSave={onSave} onLogWeight={onLogWeight} />
    </div>
  );
}

// Train Solo's own goal page (GoalPicker, #248 owner: "exactly the same"),
// full screen over the app, with the client's data and save.
function GoalSheet({ open, onClose, current, logs, weighIns, exercises, dark, onSave, onLogWeight }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto" data-testid="client-goal-page">
      <GoalPicker
        dark={dark}
        current={current}
        exercises={exercises}
        logs={logs}
        weighIns={weighIns}
        onLogWeight={(w) => onLogWeight?.(w)}
        onSave={(goal) => onSave(goal)}
        onLeave={onClose}
      />
    </div>,
    document.body
  );
}
