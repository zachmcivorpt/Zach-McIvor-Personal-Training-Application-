import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Timer, TrendingUp, Play, ArrowRightLeft } from "lucide-react";
import { useClientDark, formatTargetReps } from "../client/ClientApp";
import { ExerciseThumb } from "../components/ui";
import { playTimerDing, unlockTimerAudio } from "./timerAudio";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { MEASURE_BLUE } from "../theme";

// A trimmed fork of ClientApp.jsx's ExerciseBlock for Train Solo: same set-
// logging row layout, rest-timer start, and time-based-set row timer, but
// with no editable "note for your coach" — there is no coach to notify in
// Train Solo. Swapping (onSwap) opens SoloSwapSheet and needs no reason.
// Each set's "Target" comes from soloProgression.js via `targets`, with
// `targetReason` explaining it in one line. The exercise's
// pre-authored note (exMeta.notes, written by the coach while BUILDING the
// program in the Program Builder) is shown read-only as "PROGRAM NOTES"
// instead of "COACH'S NOTES", since to a Train Solo customer it's part of
// the program they bought, not live coaching.
// Long timed targets (an Active Recovery 20-minute walk) read as minutes,
// not "1200s"; short holds keep the plain seconds format.
function formatSeconds(total) {
  const n = Number(total) || 0;
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const sec = n % 60;
  return sec ? `${m}:${String(sec).padStart(2, "0")}` : `${m} min`;
}

export default function SoloExerciseBlock({ exMeta, exercise, rows, previousSets = [], targets = [], targetReason = null, swappedFromName = null, onSwap, onChangeField, onBlurKg, onAddSet, onStartRest, onOpenDetail }) {
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

  // Remaining time is read from the phone's own clock (when the set ends),
  // not counted one tick at a time: ticks get delayed or dropped whenever
  // the phone is busy (a dropping/reconnecting connection, the app being
  // backgrounded), which made the countdown stall and lose seconds. Same
  // approach as the rest timer (restEndAtRef in WorkoutSession).
  const timerEndAtRef = useRef(0);
  useEffect(() => {
    if (timerRowIndex === null) return;
    const tick = () => setTimerRemaining(Math.max(0, Math.ceil((timerEndAtRef.current - performance.now()) / 1000)));
    const onVisible = () => document.visibilityState === "visible" && tick();
    timerTickRef.current = setInterval(tick, 250);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timerTickRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [timerRowIndex]);

  useEffect(() => {
    if (timerRowIndex === null || timerRemaining > 0) return;
    playTimerDing();
    onChangeField(timerRowIndex, "reps", String(targetSeconds));
    setTimeout(() => onBlurKg(timerRowIndex), 0);
    setTimerRowIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRowIndex, timerRemaining]);

  function startRowTimer(i) {
    unlockTimerAudio();
    timerEndAtRef.current = performance.now() + targetSeconds * 1000;
    setTimerRowIndex(i);
    setTimerRemaining(targetSeconds);
  }
  function stopRowTimer(i) {
    const left = Math.max(0, (timerEndAtRef.current - performance.now()) / 1000);
    const elapsed = Math.min(targetSeconds, Math.round(targetSeconds - left));
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
            {exMeta.targetSets} {exMeta.targetSets === 1 ? "set" : "sets"} × {exMeta.targetType === "time" ? formatSeconds(exMeta.targetReps || 30) : formatTargetReps(exMeta)}
          </p>
          {swappedFromName && (
            <p className={dark ? "text-white/35 text-[10px] mt-0.5 truncate" : "text-black/35 text-[10px] mt-0.5 truncate"}>Swapped from {swappedFromName}</p>
          )}
        </button>
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap ${exercise.name}`}
            className={dark ? "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white/50 hover:text-white" : "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-black/50 hover:text-black"}
          >
            <ArrowRightLeft size={16} />
          </button>
        )}
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
        <div className="mt-3 rounded-2xl px-3.5 py-2.5" style={soloGlass(SOLO_THEMES[dark ? "dark" : "light"])}>
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

      {expanded && (exMeta.restSeconds ?? 90) > 0 && (
        // The whole row starts the rest timer (unchanged), with an explicit
        // "Start timer" button on the right so it's obvious it's tappable.
        // Hidden for a 0s rest — there's nothing to time.
        <button
          type="button"
          onClick={() => onStartRest(exMeta)}
          aria-label={`Start ${exMeta.restSeconds ?? 90} second rest timer`}
          className={dark ? "mt-3 w-full flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors" : "mt-3 w-full flex items-center gap-2 bg-black/[0.04] hover:bg-black/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors"}
        >
          <Timer size={14} className={dark ? "text-white/50" : "text-black/50"} />
          <span className={`${dark ? "text-white/60" : "text-black/60"} text-xs font-medium flex-1 text-left`}>
            Rest {exMeta.restSeconds ?? 90}s between sets
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0 text-white" style={{ backgroundColor: accent }}>
            <Play size={10} fill="currentColor" /> Start timer
          </span>
        </button>
      )}

      {expanded && targetReason && !isTimeBased && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug px-1" style={{ color: MEASURE_BLUE }}>
          <TrendingUp size={12} className="shrink-0 mt-px" />
          <span>{targetReason}</span>
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-1.5">
          <div className="grid grid-cols-[22px_minmax(0,1fr)_72px_72px_12px] gap-2 px-1">
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>SET</span>
            <span className={dark ? "text-white/30 text-[10px] font-semibold" : "text-black/30 text-[10px] font-semibold"}>PREVIOUS</span>
            {!isTimeBased && <span className={dark ? "text-white/30 text-[10px] font-semibold text-center" : "text-black/30 text-[10px] font-semibold text-center"}>KG</span>}
            <span className={`${dark ? "text-white/30" : "text-black/30"} text-[10px] font-semibold text-center ${isTimeBased ? "col-span-2" : ""}`}>{isTimeBased ? "SECONDS" : "REPS"}</span>
            <span />
          </div>
          {rows.map((row, i) => {
            // "Previous" from this customer's own last logged session of
            // this exercise, and that set's "Target" (soloProgression.js).
            // Time-based sets are driven by the row timer, so they show
            // the previous time only.
            const prev = previousSets[i];
            const suggestion = isTimeBased ? null : targets[i] || null;
            return (
            <div key={i} className={`grid grid-cols-[22px_minmax(0,1fr)_72px_72px_12px] gap-2 px-1 ${isTimeBased ? "items-center" : "items-start"}`}>
              <span className={`${dark ? "text-white/50" : "text-black/50"} text-sm font-semibold ${isTimeBased ? "" : "pt-2"}`}>{i + 1}</span>
              <div className={`min-w-0 ${isTimeBased ? "" : "pt-1"}`}>
                <p className={dark ? "text-white/40 text-[11px] truncate" : "text-black/40 text-[11px] truncate"}>
                  {prev ? (isTimeBased ? formatSeconds(prev.reps) : `${prev.weight} kg × ${prev.reps}`) : "–"}
                </p>
                {suggestion && !row.weight && !row.reps && (
                  <button
                    type="button"
                    onClick={() => {
                      // A bodyweight move's suggestion carries a real logged
                      // 0 kg — leave Kg blank rather than typing a literal 0.
                      if (suggestion.weight > 0) onChangeField(i, "weight", String(suggestion.weight));
                      onChangeField(i, "reps", String(suggestion.reps));
                      // Same completion step typing + leaving the field does
                      // (marks the set done and checks for a PR) — without it
                      // a Try-filled set was saved but never counted as
                      // completed on the summary, and never flagged as a PR.
                      setTimeout(() => onBlurKg(i), 0);
                    }}
                    className="flex items-center gap-1 text-[10px] font-semibold mt-0.5 max-w-full"
                    style={{ color: MEASURE_BLUE }}
                  >
                    <TrendingUp size={10} className="shrink-0" />
                    <span className="truncate">Target {suggestion.weight > 0 ? `${suggestion.weight} kg × ${suggestion.reps}` : `${suggestion.reps} reps`}</span>
                  </button>
                )}
              </div>
              {!isTimeBased && (
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
                    className="col-span-2 w-full rounded-lg px-2.5 py-2 text-sm font-bold text-center"
                    style={{ backgroundColor: accent, color: "#fff" }}
                  >
                    {formatSeconds(timerRemaining)} — stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startRowTimer(i)}
                    className={dark ? "col-span-2 w-full bg-white/8 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm text-center" : "col-span-2 w-full bg-black/5 border border-black/10 rounded-lg px-2.5 py-2 text-black text-sm text-center"}
                  >
                    {row.reps ? formatSeconds(row.reps) : "Start"}
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
