import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Timer, TrendingUp } from "lucide-react";
import { useClientDark, formatTargetReps } from "../client/ClientApp";
import { ExerciseThumb } from "../components/ui";
import { playTimerDing, unlockTimerAudio } from "./timerAudio";
import { useSoloTheme } from "./SoloThemeContext";
import { suggestNextSet } from "../lib/trainingStats";
import { MEASURE_BLUE } from "../theme";

// A trimmed fork of ClientApp.jsx's ExerciseBlock for Train Solo: same set-
// logging row layout, rest-timer start, and time-based-set row timer, but
// with no exercise-swap button and no editable "note for your coach" —
// there is no coach to swap for or notify in Train Solo. The exercise's
// pre-authored note (exMeta.notes, written by the coach while BUILDING the
// program in the Program Builder) is shown read-only as "PROGRAM NOTES"
// instead of "COACH'S NOTES", since to a Train Solo customer it's part of
// the program they bought, not live coaching.
export default function SoloExerciseBlock({ exMeta, exercise, rows, previousSets = [], onChangeField, onBlurKg, onAddSet, onStartRest, onOpenDetail }) {
  const dark = useClientDark();
  const { accent } = useSoloTheme();
  const isWarmup = (exMeta.section || "main") === "warmup";
  const [expanded, setExpanded] = useState(!isWarmup);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const programNote = exMeta.notes || "";
  const isLongNote = programNote.length > 90;

  const [timerRowIndex, setTimerRowIndex] = useState(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerTickRef = useRef(null);
  const targetSeconds = Number(exMeta.targetReps) || 30;

  useEffect(() => {
    if (timerRowIndex === null) return;
    if (timerRemaining <= 0) {
      playTimerDing();
      onChangeField(timerRowIndex, "reps", String(targetSeconds));
      setTimeout(() => onBlurKg(timerRowIndex), 0);
      setTimerRowIndex(null);
      return;
    }
    timerTickRef.current = setTimeout(() => setTimerRemaining((t) => t - 1), 1000);
    return () => clearTimeout(timerTickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRowIndex, timerRemaining]);

  function startRowTimer(i) {
    unlockTimerAudio();
    setTimerRowIndex(i);
    setTimerRemaining(targetSeconds);
  }
  function stopRowTimer(i) {
    const elapsed = targetSeconds - timerRemaining;
    setTimerRowIndex(null);
    onChangeField(i, "reps", String(Math.max(elapsed, 0)));
    setTimeout(() => onBlurKg(i), 0);
  }

  const isTimeBased = exMeta.targetType === "time";

  return (
    <div className={dark ? "pt-1 pb-5 px-1 border-b border-white/10 last:border-b-0" : "pt-1 pb-5 px-1 border-b border-black/10 last:border-b-0"}>
      <div className="flex items-center gap-3">
        <ExerciseThumb dark={dark} exercise={exercise} width={84} height={56} rounded="rounded-lg" className="shadow-sm" />
        <button type="button" onClick={() => onOpenDetail?.(exercise)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className={dark ? "text-white font-semibold text-[13px] leading-tight" : "text-black font-semibold text-[13px] leading-tight"}>{exercise.name}</p>
            {exMeta.groupType && (
              <span className={dark ? "bg-white/8 text-white/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0" : "bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"}>
                {exMeta.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
              </span>
            )}
          </div>
          <p className={dark ? "text-white/45 text-[11px] mt-0.5" : "text-black/45 text-[11px] mt-0.5"}>
            {exMeta.targetSets} sets × {formatTargetReps(exMeta)}
          </p>
        </button>
        {isWarmup && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={dark ? "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white/40" : "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-black/40"}
          >
            <ChevronDown size={18} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {expanded && programNote && (
        <div className={dark ? "mt-3 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5" : "mt-3 bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-2.5"}>
          <p className={dark ? "text-white/35 text-[10px] font-semibold tracking-wide mb-1" : "text-black/35 text-[10px] font-semibold tracking-wide mb-1"}>PROGRAM NOTES</p>
          <div className="flex items-start gap-2">
            <p className={`${dark ? "text-white/80" : "text-black/80"} text-[14px] leading-snug flex-1 ${!notesExpanded && isLongNote ? "line-clamp-2" : ""}`}>{programNote}</p>
            {isLongNote && (
              <button onClick={() => setNotesExpanded((v) => !v)} className="text-[12px] font-semibold shrink-0" style={{ color: accent }}>
                {notesExpanded ? "See less" : "See more"}
              </button>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <button
          type="button"
          onClick={() => onStartRest(exMeta)}
          className={dark ? "mt-3 w-full flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors" : "mt-3 w-full flex items-center gap-2 bg-black/[0.04] hover:bg-black/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors"}
        >
          <Timer size={14} className={dark ? "text-white/50" : "text-black/50"} />
          <span className={dark ? "text-white/60 text-xs font-medium" : "text-black/60 text-xs font-medium"}>
            Rest {exMeta.restSeconds ?? 90}s between sets
          </span>
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-1.5">
          <div className="grid grid-cols-[22px_minmax(0,1.3fr)_1fr_1fr_16px] gap-2 px-1">
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>SET</span>
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>PREVIOUS</span>
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>{isTimeBased ? "" : "KG"}</span>
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>{isTimeBased ? "SECONDS" : "REPS"}</span>
            <span />
          </div>
          {rows.map((row, i) => {
            // Same "Previous" + double-progression "Try" hint as the
            // coached client's ExerciseBlock (ClientApp.jsx), from this
            // customer's own last logged session of this exercise.
            // Time-based sets are driven by the row timer, so they show
            // the previous time only.
            const prev = previousSets[i];
            const suggestion = isTimeBased ? null : suggestNextSet(prev, exMeta.targetReps);
            return (
            <div key={i} className={`grid grid-cols-[22px_minmax(0,1.3fr)_1fr_1fr_16px] gap-2 px-1 ${isTimeBased ? "items-center" : "items-start"}`}>
              <span className={`${dark ? "text-white/50" : "text-black/50"} text-sm font-semibold ${isTimeBased ? "" : "pt-2"}`}>{i + 1}</span>
              <div className={`min-w-0 ${isTimeBased ? "" : "pt-1"}`}>
                <p className={dark ? "text-white/40 text-[11px] truncate" : "text-black/40 text-[11px] truncate"}>
                  {prev ? (isTimeBased ? `${prev.reps}s` : `${prev.reps} × ${prev.weight} kg`) : "–"}
                </p>
                {suggestion && !row.weight && !row.reps && (
                  <button
                    type="button"
                    onClick={() => {
                      // A bodyweight move's suggestion carries a real logged
                      // 0 kg — leave Kg blank rather than typing a literal 0.
                      if (suggestion.weight > 0) onChangeField(i, "weight", String(suggestion.weight));
                      onChangeField(i, "reps", String(suggestion.reps));
                    }}
                    className="flex items-center gap-1 text-[10px] font-semibold mt-0.5 max-w-full"
                    style={{ color: MEASURE_BLUE }}
                  >
                    <TrendingUp size={10} className="shrink-0" />
                    <span className="truncate">Try {suggestion.reps}{suggestion.weight > 0 ? ` × ${suggestion.weight}kg` : " reps"}</span>
                  </button>
                )}
              </div>
              {isTimeBased ? <span /> : (
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.weight}
                  onChange={(e) => onChangeField(i, "weight", e.target.value)}
                  onBlur={() => onBlurKg(i)}
                  placeholder="0"
                  className={dark ? "w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm text-center outline-none" : "w-full bg-black/5 border border-black/10 rounded-lg px-2.5 py-2 text-black text-sm text-center outline-none"}
                />
              )}
              {isTimeBased ? (
                timerRowIndex === i ? (
                  <button
                    type="button"
                    onClick={() => stopRowTimer(i)}
                    className="w-full rounded-lg px-2.5 py-2 text-sm font-bold text-center"
                    style={{ backgroundColor: accent, color: "#fff" }}
                  >
                    {timerRemaining}s — stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startRowTimer(i)}
                    className={dark ? "w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm text-center" : "w-full bg-black/5 border border-black/10 rounded-lg px-2.5 py-2 text-black text-sm text-center"}
                  >
                    {row.reps ? `${row.reps}s` : "Start"}
                  </button>
                )
              ) : (
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.reps}
                  onChange={(e) => onChangeField(i, "reps", e.target.value)}
                  onBlur={() => onBlurKg(i)}
                  placeholder="0"
                  className={dark ? "w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm text-center outline-none" : "w-full bg-black/5 border border-black/10 rounded-lg px-2.5 py-2 text-black text-sm text-center outline-none"}
                />
              )}
              <div className="flex items-center justify-center">
                {row.completed && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.isPR ? MEASURE_BLUE : "#22C55E" }} />}
              </div>
            </div>
            );
          })}
          <button type="button" onClick={onAddSet} className={dark ? "text-white/40 text-xs font-semibold px-1 pt-1" : "text-black/40 text-xs font-semibold px-1 pt-1"}>
            + Add set
          </button>
        </div>
      )}
    </div>
  );
}
