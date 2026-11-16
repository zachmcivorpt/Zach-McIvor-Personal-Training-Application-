import React, { useMemo, useState } from "react";
import { ChevronRight, Minus, Plus, Target } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { BottomSheet } from "../components/ui";
import { localDateKey } from "../lib/dateKey";
import { suggestedGoals, goalTitle, goalProgress, encouragement, startGoal } from "../solo/goals";

// #248 (owner): the coached client's Progress opens like Train Solo's, with
// their main goal on top ("Set your main goal"). Same goal maths as Train
// Solo (src/solo/goals.js) on the client's own logs, weigh-ins and steps;
// saved on their own user doc (`goal`). Lazy-loaded with Progress.

const tidy = (n) => (n == null ? "–" : (Math.round(n * 10) / 10).toLocaleString("en-AU"));
const STEP = { consistency: 1, bodyweight: 0.5, lift: 2.5, workouts: 5, steps: 1 };
const MIN = { consistency: 4, bodyweight: 1, lift: 20, workouts: 5, steps: 7 };
const MAX = { consistency: 52, bodyweight: 40, lift: 400, workouts: 200, steps: 100 };

function glass(dark) {
  return dark
    ? { backgroundColor: "rgba(28,28,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }
    : { backgroundColor: "rgba(255,255,255,0.62)", border: "1px solid rgba(20,19,15,0.08)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" };
}

export default function ClientGoalCard({ goal, logs = [], weighIns = [], bodyMetrics = [], exercises = [], dark, onSave }) {
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
      <GoalSheet open={open} onClose={() => setOpen(false)} current={goal} logs={logs} weighIns={weighIns} exercises={exercises} dark={dark} onSave={onSave} />
    </div>
  );
}

function GoalSheet({ open, onClose, current, logs, weighIns, exercises, dark, onSave }) {
  const options = useMemo(() => {
    const list = suggestedGoals({ answers: {}, exercises, logs });
    return current ? [current, ...list.filter((g) => g.type !== current.type)] : list;
  }, [current, exercises, logs]);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState(current?.type || null);
  const [busy, setBusy] = useState(false);
  const goalOf = (type) => ({ ...options.find((g) => g.type === type), ...drafts[type] });
  const text = dark ? "#fff" : "#000";
  const muted = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  function bump(type, delta) {
    const g = goalOf(type);
    const next = Math.min(MAX[type], Math.max(MIN[type], Math.round(((Number(g.target) || 0) + delta) * 10) / 10));
    setDrafts((d) => ({ ...d, [type]: { ...d[type], target: next } }));
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      await onSave(startGoal(goalOf(selected), { logs, weighIns }));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={current ? "Change your goal" : "Set your main goal"} dark={dark}>
      <div className="px-4 pb-5 space-y-2.5" style={{ color: text }}>
        <p className="text-xs" style={{ color: muted }}>
          One goal at a time, tracked from what you already log.
        </p>
        {options.map((g) => {
          const d = goalOf(g.type);
          const on = selected === g.type;
          return (
            <div
              key={g.type}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(g.type)}
              className="rounded-2xl px-4 py-3"
              style={{ ...glass(dark), ...(on ? { borderColor: MEASURE_BLUE, boxShadow: `0 0 0 1px ${MEASURE_BLUE}` } : {}) }}
              data-testid={`goal-option-${g.type}`}
            >
              <p className="text-sm font-semibold">{goalTitle(d)}</p>
              {on && (
                <div className="flex items-center gap-3 mt-2.5" onClick={(e) => e.stopPropagation()}>
                  {g.type === "bodyweight" && (
                    <button
                      type="button"
                      onClick={() => setDrafts((x) => ({ ...x, bodyweight: { ...x.bodyweight, direction: d.direction === "gain" ? "lose" : "gain" } }))}
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ border: `1px solid ${MEASURE_BLUE}`, color: MEASURE_BLUE }}
                    >
                      {d.direction === "gain" ? "Gain" : "Lose"}
                    </button>
                  )}
                  <button type="button" aria-label="Less" onClick={() => bump(g.type, -STEP[g.type])} className="w-8 h-8 rounded-full flex items-center justify-center" style={glass(dark)}>
                    <Minus size={14} />
                  </button>
                  <span className="text-lg font-extrabold tabular-nums min-w-[3ch] text-center">{tidy(Number(d.target))}</span>
                  <button type="button" aria-label="More" onClick={() => bump(g.type, STEP[g.type])} className="w-8 h-8 rounded-full flex items-center justify-center" style={glass(dark)}>
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={save}
          disabled={!selected || busy}
          className="w-full mt-2 py-3.5 rounded-full text-sm font-bold uppercase tracking-[0.06em] disabled:opacity-40"
          style={{ backgroundColor: MEASURE_BLUE, color: "#fff" }}
        >
          {busy ? "Saving…" : "Save goal"}
        </button>
      </div>
    </BottomSheet>
  );
}
