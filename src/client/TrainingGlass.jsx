// Client Training tab, glass design (#271, owner-approved mock-up
// 2026-11-18): see-through glass panels over a soft backdrop, small type,
// MEASURE_BLUE only on what is "now" (today, the current phase, this week,
// today's workout). Light mode is the main mode; dark mode is pure black and
// white (no grey/silver glows). Every figure comes from the client's own
// program, schedule and logs.
import React, { useState } from "react";
import { Calendar, Check, ChevronRight, Eye, Play } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { countExercises, estimateWorkoutMinutes, countWorkoutSets } from "../lib/workoutStats";
import { phaseWeeks, weekDays, trainingGlass } from "./trainingGlass";

function ink(dark) {
  return {
    text: dark ? "#FFFFFF" : "#0A0A0A",
    muted: dark ? "rgba(255,255,255,0.62)" : "rgba(10,10,10,0.6)",
    faint: dark ? "rgba(255,255,255,0.14)" : "rgba(10,10,10,0.1)",
    line: dark ? "rgba(255,255,255,0.14)" : "rgba(10,10,10,0.1)",
  };
}

// The tab's backdrop: light mode gets soft grey/white glows for the glass to
// blur; dark mode stays plain black (owner: no silver accent).
export function TrainingBackdrop({ dark, children }) {
  return (
    <div className="relative" data-testid="training-backdrop">
      {!dark && (
        // Full height, so the last glow fades out instead of stopping on a
        // hard line part-way down the page (#273).
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" data-testid="training-glows">
          <div className="absolute rounded-full" style={{ width: 260, height: 260, left: -80, top: 300, background: "#A1A1AA", opacity: 0.35, filter: "blur(70px)" }} />
          <div className="absolute rounded-full" style={{ width: 240, height: 240, right: -70, top: 560, background: "#A1A1AA", opacity: 0.3, filter: "blur(70px)" }} />
          <div className="absolute rounded-full" style={{ width: 240, height: 220, right: -90, top: 140, background: "#A1A1AA", opacity: 0.3, filter: "blur(70px)" }} />
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

// The Today / Program switch on glass.
export function TrainingSwitch({ tab, onChange, dark }) {
  const c = ink(dark);
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mx-2.5 mt-1 rounded-[14px]" style={trainingGlass(dark)} data-testid="training-switch">
      {["today", "program"].map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={tab === t}
          className="h-[34px] rounded-[10px] text-[12px] capitalize tracking-[0.04em]"
          style={
            tab === t
              ? { backgroundColor: dark ? "rgba(255,255,255,0.16)" : "#FFFFFF", boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "0 1px 3px rgba(0,0,0,0.1)", color: c.text, fontWeight: 600 }
              : { color: c.muted, fontWeight: 500 }
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// This week, Monday–Sunday, today ringed in blue.
export function TrainingWeekStrip({ todayKey, dark }) {
  const c = ink(dark);
  return (
    <div className="mx-2.5 grid grid-cols-7 gap-1" data-testid="training-week-strip">
      {weekDays(todayKey).map(({ key, date, isToday }) => (
        <div
          key={key}
          className="flex flex-col items-center gap-1 py-[7px] rounded-xl"
          data-today={isToday || undefined}
          style={isToday ? { ...trainingGlass(dark), border: `1.5px solid ${MEASURE_BLUE}` } : undefined}
        >
          <span className="text-[9px] font-semibold tracking-[0.1em] uppercase" style={{ color: isToday ? c.text : c.muted }}>
            {date.toLocaleDateString(undefined, { weekday: "short" })}
          </span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: c.text }}>
            {date.getDate()}
          </span>
        </div>
      ))}
    </div>
  );
}

function BlueDotLabel({ children, dark }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: ink(dark).muted }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />
      {children}
    </span>
  );
}

// Today's workout on a glass card: status, name, muscle chips, figures,
// Start/Resume + View, progress while it's under way. Same taps and states
// as TodayWorkoutCard.
export function TrainingTodayCard({ todaySession, activeLog, onStart, onView, onDiscard, completedOnDate = false, dbReady = true, phaseProgress = null, dark }) {
  const c = ink(dark);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!todaySession) {
    return (
      <section className="mx-2.5 rounded-3xl p-5" style={trainingGlass(dark)} aria-label="Today's workout" data-testid="training-today-card">
        <BlueDotLabel dark={dark}>Today</BlueDotLabel>
        <p className="text-[18px] font-semibold mt-2" style={{ color: c.text }}>
          {dbReady ? "No workout scheduled" : "Loading your schedule…"}
        </p>
        {dbReady && (
          <p className="text-[12px] mt-1" style={{ color: c.muted }}>
            Nothing's scheduled for today.
          </p>
        )}
      </section>
    );
  }
  const started = !!activeLog && !completedOnDate;
  const done = completedOnDate && !started;
  const exCount = countExercises(todaySession.exercises);
  const estMin = estimateWorkoutMinutes(todaySession.exercises);
  const completedSets = activeLog ? Object.values(activeLog).flat().filter((s) => s.completed).length : 0;
  const totalSets = countWorkoutSets(todaySession.exercises);
  const status = done ? "Completed" : todaySession.wod ? "Workout of the day" : "Today's focus";
  const stats = [
    { value: exCount, label: "Exercises" },
    { value: estMin, unit: " min", label: "Est. time" },
  ];
  if (phaseProgress && phaseProgress.expected > 0) stats.push({ value: `${phaseProgress.completed}/${phaseProgress.expected}`, label: "Phase" });
  return (
    <section className="mx-2.5 rounded-3xl p-[18px] flex flex-col gap-3.5" style={trainingGlass(dark)} aria-label="Today's workout" data-testid="training-today-card">
      <div className="flex items-center justify-between">
        <BlueDotLabel dark={dark}>{status}</BlueDotLabel>
        {done && <Check size={14} style={{ color: MEASURE_BLUE }} />}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[26px] font-semibold tracking-[-0.01em] leading-none truncate" style={{ color: c.text }}>
          {todaySession.label}
        </h2>
        {(todaySession.muscleGroups || []).length > 0 && (
          <div className="flex flex-wrap gap-[5px]">
            {todaySession.muscleGroups.map((m) => (
              <span key={m} className="px-[9px] py-1 rounded-full text-[10px] font-medium" style={{ border: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.55)", color: c.text }}>
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="grid rounded-[14px]" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.9)"}`, backgroundColor: dark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.45)" }}>
        {stats.map((s, i) => (
          <div key={s.label} className="px-3 py-2.5 flex flex-col gap-0.5" style={i ? { borderLeft: `1px solid ${c.line}` } : undefined}>
            <span className="text-[17px] font-semibold tabular-nums" style={{ color: c.text }}>
              {s.value}
              {s.unit && <span className="text-[11px]">{s.unit}</span>}
            </span>
            <span className="text-[9px] font-semibold tracking-[0.12em] uppercase" style={{ color: c.muted }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {started && (
        <div>
          <div className="flex justify-between text-[11px] mb-1.5" style={{ color: c.muted }}>
            <span>Progress</span>
            <span>
              {completedSets}/{totalSets} sets
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: c.faint }}>
            <div className="h-full rounded-full" style={{ width: `${totalSets ? Math.min(100, (completedSets / totalSets) * 100) : 0}%`, backgroundColor: MEASURE_BLUE }} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        {!done ? (
          <button
            type="button"
            onClick={onStart}
            className="flex-1 h-[46px] rounded-[14px] text-[12px] font-bold tracking-[0.14em] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={dark ? { backgroundColor: "rgba(255,255,255,0.92)", color: "#000000" } : { backgroundColor: "#0A0A0A", color: "#FFFFFF", boxShadow: "0 8px 20px rgba(0,0,0,0.18)" }}
          >
            <Play size={13} fill="currentColor" />
            {started ? "RESUME WORKOUT" : "START WORKOUT"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onView}
            className="flex-1 h-[46px] rounded-[14px] text-[12px] font-bold tracking-[0.14em] flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
            style={{ ...trainingGlass(dark), color: c.text }}
          >
            VIEW <ChevronRight size={14} />
          </button>
        )}
        {!done && (
          <button type="button" onClick={onView} aria-label="View workout" className="w-[46px] h-[46px] rounded-[14px] flex items-center justify-center active:scale-[0.98] transition-transform" style={{ ...trainingGlass(dark), color: c.text }}>
            <Eye size={18} />
          </button>
        )}
      </div>
      {started && onDiscard && (
        <button
          type="button"
          onClick={() => {
            if (confirmDiscard) {
              onDiscard();
              setConfirmDiscard(false);
            } else setConfirmDiscard(true);
          }}
          className="w-full text-center text-[11px] font-medium"
          style={{ color: confirmDiscard ? c.text : c.muted }}
        >
          {confirmDiscard ? "Tap again to discard these sets" : "Not started this — discard progress"}
        </button>
      )}
    </section>
  );
}

function fmtDate(key) {
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The phase on a glass card: blue ring, name, dates, workouts done, a bar
// per week with this week in blue, and Phases in the corner.
export function TrainingPhaseCard({ phase, isCurrent, completion, todayKey, onPhases, dark }) {
  const c = ink(dark);
  const pct = completion?.pct;
  const R = 30;
  const circ = 2 * Math.PI * R;
  const weeks = phaseWeeks(phase.startDate, phase.endDate, todayKey);
  const showWeeks = weeks && weeks.count >= 1 && weeks.count <= 12;
  const left = completion && completion.expected > 0 ? Math.max(0, completion.expected - completion.completed) : null;
  return (
    <section className="relative mx-3.5 rounded-[22px] p-4 flex flex-col gap-4" style={trainingGlass(dark)} aria-label="Current phase" data-testid="training-phase-card">
      <button
        type="button"
        onClick={onPhases}
        className="absolute top-3.5 right-3.5 h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em]"
        style={{ ...trainingGlass(dark), boxShadow: "none", color: c.text }}
      >
        <Calendar size={12} /> PHASES
      </button>
      <div className="flex items-center gap-3.5 pr-20">
        <div className="relative w-[72px] h-[72px] shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={pct != null ? `${pct}% complete` : "No workouts scheduled yet"}>
            <circle cx="36" cy="36" r={R} fill="none" stroke={c.faint} strokeWidth="5" />
            {pct != null && pct > 0 && (
              <circle cx="36" cy="36" r={R} fill="none" stroke={MEASURE_BLUE} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(Math.min(100, pct) / 100) * circ} ${circ}`} transform="rotate(-90 36 36)" />
            )}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[16px] font-semibold tabular-nums" style={{ color: c.text }} data-testid="training-phase-pct">
            {pct != null ? `${pct}%` : "–"}
          </span>
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          {isCurrent && <BlueDotLabel dark={dark}>Current phase</BlueDotLabel>}
          <h2 className="text-[18px] font-semibold leading-tight line-clamp-2" style={{ color: c.text }}>
            {phase.name}
          </h2>
          <p className="text-[11px] font-medium" style={{ color: c.muted }}>
            {fmtDate(phase.startDate)}
            {phase.endDate ? ` – ${fmtDate(phase.endDate)}` : ""}
          </p>
        </div>
      </div>
      {phase.description && (
        <p className="text-[12px] leading-relaxed whitespace-pre-line" style={{ color: c.muted }}>
          {phase.description}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: c.text }}>
          <span data-testid="training-phase-done">{completion && completion.expected > 0 ? `${completion.completed} / ${completion.expected} workouts` : "No workouts scheduled yet"}</span>
          {left != null && <span style={{ color: c.muted }}>{left} to go</span>}
        </div>
        {showWeeks && (
          <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${weeks.count}, minmax(0, 1fr))` }} data-testid="training-phase-weeks">
            {Array.from({ length: weeks.count }, (_, i) => {
              const now = i === weeks.current;
              const past = i < weeks.current;
              return (
                <div key={i} className="flex flex-col gap-1.5" data-now={now || undefined}>
                  <div className="h-1 rounded-sm" style={{ backgroundColor: now ? MEASURE_BLUE : past ? c.text : c.faint }} />
                  <span className="text-[9px] tracking-[0.1em] uppercase" style={{ color: now ? c.text : c.muted, fontWeight: now ? 700 : 600 }}>
                    Wk {i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// One workout in "Workouts in this phase": numbered glass row; today's is
// outlined in blue with a TODAY tag.
export function TrainingWorkoutRow({ index, day, isToday, onClick, dark }) {
  const c = ink(dark);
  const n = countExercises(day.exercises);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2 my-1 rounded-[14px] text-left active:opacity-70 transition-opacity"
      style={{ border: isToday ? `1.5px solid ${MEASURE_BLUE}` : "1.5px solid transparent", color: c.text }}
      data-today={isToday || undefined}
    >
      <span className="w-9 h-9 shrink-0 rounded-[11px] flex items-center justify-center text-[12px] font-semibold tabular-nums" style={{ border: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="truncate">{day.label}</span>
          {isToday && (
            <span className="px-1.5 py-0.5 rounded-[5px] text-[8px] font-bold tracking-[0.12em] shrink-0" style={{ backgroundColor: dark ? "rgba(47,143,255,0.25)" : "rgba(47,143,255,0.12)", color: dark ? "#DBEAFE" : "#1D4ED8" }}>
              TODAY
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium truncate" style={{ color: c.muted }}>
          est. {estimateWorkoutMinutes(day.exercises)} min · {n} exercise{n === 1 ? "" : "s"}
          {day.muscleGroups?.length ? ` · ${day.muscleGroups.join(", ")}` : ""}
        </span>
      </span>
      <ChevronRight size={14} style={{ color: c.muted }} className="shrink-0" />
    </button>
  );
}

// One "Up next" workout from the calendar (#273): the same glass row as
// "Workouts in this phase", with the day in the tile instead of a number.
export function TrainingUpNextRow({ workout, onClick, dark }) {
  const c = ink(dark);
  const d = new Date(workout.date + "T00:00:00");
  const n = countExercises(workout.exercises || []);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2 my-1 rounded-[14px] text-left active:opacity-70 transition-opacity"
      style={{ border: "1.5px solid transparent", color: c.text }}
    >
      <span className="w-9 h-9 shrink-0 rounded-[11px] flex flex-col items-center justify-center leading-none" style={{ border: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)" }}>
        <span className="text-[8px] font-semibold tracking-[0.08em] uppercase" style={{ color: c.muted }}>
          {d.toLocaleDateString(undefined, { weekday: "short" })}
        </span>
        <span className="text-[13px] font-semibold tabular-nums mt-0.5">{d.getDate()}</span>
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold truncate">{workout.label}</span>
        <span className="text-[10px] font-medium truncate" style={{ color: c.muted }}>
          est. {estimateWorkoutMinutes(workout.exercises || [])} min · {n} exercise{n === 1 ? "" : "s"}
        </span>
      </span>
      <ChevronRight size={14} style={{ color: c.muted }} className="shrink-0" />
    </button>
  );
}
