import React, { useEffect, useRef, useState } from "react";
import { Check, Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { BottomSheet, PrimaryButton, ExerciseThumb } from "../components/ui";
import SoloGlassBox from "./SoloGlassBox";
import { countExercises, countWorkoutSets, estimateWorkoutMinutes } from "../lib/workoutStats";
import { programPhases } from "../lib/AppContext";
import { totalWeeksForProgram } from "./weekProgress";

// Two read-only sheets for My Training: a finished session's full log, and
// an owned program's overview (what it is, what it does for you, and each
// session's main muscles — never the full prescription of sets/reps).

const NON_MUSCLE_CATEGORIES = new Set(["Warm-up", "Cool-down", "Custom", "Other", ""]);

// A session's main muscles: the coach's own muscle groups for that day when
// set, otherwise the muscles its exercises hit most often (each exercise's
// primaryMuscles, falling back to its category).
export function sessionMuscles(day, exercisesById, limit = 4) {
  if (Array.isArray(day?.muscleGroups) && day.muscleGroups.filter(Boolean).length) return day.muscleGroups.filter(Boolean).slice(0, limit);
  const counts = new Map();
  for (const row of day?.exercises || []) {
    if (row.isRest) continue;
    const ex = exercisesById[row.exerciseId];
    if (!ex || ex.category === "Warm-up" || ex.category === "Cool-down") continue;
    const muscles = (ex.primaryMuscles || []).filter(Boolean);
    const names = muscles.length ? muscles : NON_MUSCLE_CATEGORIES.has(ex.category || "") ? [] : [ex.category];
    for (const m of names) {
      const key = m.trim().replace(/^\w/, (c) => c.toUpperCase());
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([m]) => m);
}

const GOAL_BENEFITS = {
  build_muscle: "Build lean muscle with progressive, structured training",
  lose_fat: "Burn body fat while holding on to your strength",
  general_fitness: "Lift your all-round fitness, energy and conditioning",
  get_stronger: "Get measurably stronger on the key lifts",
  sport_performance: "Move faster and more powerfully for your sport",
  health_markers: "Support heart health, mobility and long-term wellbeing",
};

// What the program does for the customer, from what the coach already set
// on it — its goals plus its structure.
export function programBenefits(program, phases) {
  const lines = (program?.goals || []).map((g) => GOAL_BENEFITS[g]).filter(Boolean);
  const weeks = totalWeeksForProgram(phases) || program?.weekOnePreview?.totalWeeks || 0;
  const perWeek = phases[0]?.days?.length || 0;
  if (weeks && perWeek) lines.push(`${perWeek} planned session${perWeek === 1 ? "" : "s"} a week for ${weeks} week${weeks === 1 ? "" : "s"} — nothing to guess`);
  lines.push("Every lift logged and your personal bests tracked automatically");
  return lines;
}

function SectionLabel({ children, t }) {
  return (
    <p className="text-[11px] font-bold tracking-wide uppercase mb-2" style={{ color: t.textFaint }}>
      {children}
    </p>
  );
}

function Figure({ value, unit, label, t }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xl font-extrabold tabular-nums leading-none">
        {value}
        {unit && <span className="text-xs font-bold ml-0.5">{unit}</span>}
      </p>
      <p className="text-[11px] mt-1" style={{ color: t.textFaint }}>
        {label}
      </p>
    </div>
  );
}

function setLine(s) {
  return s.weight > 0 ? `${s.weight} kg × ${s.reps}` : `${s.reps} reps`;
}

export function CompletedSessionSheet({ log, programName, exercisesById, onClose, dark, t }) {
  const entries = log?.entries || [];
  const sets = entries.flatMap((e) => e.sets || []);
  const volume = sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
  const prs = sets.filter((s) => s.isPR).length;
  const meta = [
    log?.date ? new Date(log.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) : null,
    programName && typeof log?.weekNumber === "number" ? `${programName} · Week ${log.weekNumber}` : programName,
  ].filter(Boolean);
  return (
    <BottomSheet open={!!log} onClose={onClose} title={log?.dayLabel || "Session"} wide dark={dark}>
      {log && (
        <div style={{ color: t.text }}>
          <p className="text-xs -mt-1 mb-4" style={{ color: t.textMuted }}>
            {meta.join(" · ")}
          </p>
          <div className="grid grid-cols-4 gap-3 py-4" style={{ borderTop: `1px solid ${t.panelBorder}`, borderBottom: `1px solid ${t.panelBorder}` }}>
            <Figure value={log.durationMin || 0} unit="min" label="Duration" t={t} />
            <Figure value={sets.length} label="Sets" t={t} />
            <Figure value={volume.toLocaleString()} unit="kg" label="Volume" t={t} />
            <Figure value={prs} label={prs === 1 ? "PR" : "PRs"} t={t} />
          </div>
          {entries.length === 0 ? (
            <p className="text-sm py-5" style={{ color: t.textMuted }}>
              No sets were logged for this session.
            </p>
          ) : (
            <div>
              {entries.map((entry, i) => {
                const ex = exercisesById[entry.exerciseId];
                return (
                  <div key={`${entry.exerciseId}-${i}`} className="py-4" style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}>
                    <p className="text-sm font-bold">{ex?.name || "Exercise"}</p>
                    {(ex?.primaryMuscles || []).length > 0 && (
                      <p className="text-[11px] mt-0.5" style={{ color: t.textFaint }}>
                        {ex.primaryMuscles.join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 space-y-1">
                      {(entry.sets || []).map((s, j) => (
                        <div key={j} className="flex items-center gap-3 text-sm">
                          <span className="w-12 text-xs shrink-0" style={{ color: t.textFaint }}>
                            Set {s.setNumber || j + 1}
                          </span>
                          <span className="font-semibold tabular-nums">{setLine(s)}</span>
                          {s.isPR && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MEASURE_BLUE }}>
                              <Trophy size={11} /> PR
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// The overview's header: the program's artwork (or the APEX mark) fading
// into the sheet's own glass rather than sitting in a solid box.
function OverviewHero({ program, t }) {
  const fade = "linear-gradient(to bottom, #000 35%, transparent 100%)";
  return (
    <div className="relative h-36 -mt-2 mb-1 overflow-hidden">
      {program.artworkUrl ? (
        <img src={program.artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ WebkitMaskImage: fade, maskImage: fade }} />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `radial-gradient(closest-side, ${t.glassBg} 0%, transparent 100%)` }}
        >
          <img src={t.logo} alt="" className="h-9 w-auto opacity-80" />
        </div>
      )}
    </div>
  );
}

function MuscleChips({ muscles, className = "" }) {
  if (!muscles.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {muscles.map((m) => (
        <span key={m} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(47,143,255,0.12)", color: MEASURE_BLUE }}>
          {m}
        </span>
      ))}
    </div>
  );
}

// One session's preview: its exercises with their video still (tap to
// play), main muscles and the sets × reps the program sets.
function SessionPreview({ day, phaseName, exercisesById, onBack, dark, t }) {
  const rows = (day.exercises || []).filter((e) => !e.isRest);
  const muscles = sessionMuscles(day, exercisesById);
  return (
    <div>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-semibold mb-4" style={{ color: t.textMuted }}>
        <ChevronLeft size={14} /> All sessions
      </button>
      {phaseName && (
        <p className="text-[11px] font-bold tracking-wide uppercase" style={{ color: t.textFaint }}>
          {phaseName}
        </p>
      )}
      <h3 className="text-2xl font-extrabold leading-tight mt-1">{day.label || "Session"}</h3>
      <MuscleChips muscles={muscles} className="mt-3" />
      <div className="grid grid-cols-3 gap-3 py-4 mt-4 mb-4" style={{ borderTop: `1px solid ${t.panelBorder}`, borderBottom: `1px solid ${t.panelBorder}` }}>
        <Figure value={countExercises(rows)} label="Exercises" t={t} />
        <Figure value={countWorkoutSets(rows)} label="Sets" t={t} />
        <Figure value={`~${estimateWorkoutMinutes(day.exercises)}`} unit="min" label="Est. time" t={t} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: t.textMuted }}>
          No exercises in this session yet.
        </p>
      ) : (
        <SoloGlassBox t={t} className="rounded-2xl">
          {rows.map((row, i) => {
            const ex = exercisesById[row.exerciseId];
            const setsReps = formatSetsReps(row);
            const exMuscles = (ex?.primaryMuscles || []).filter(Boolean);
            return (
              <div key={row.rowId || `${row.exerciseId}-${i}`} className="flex items-center gap-3 p-2.5 pr-4" style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}>
                <ExerciseThumb exercise={ex} size={60} rounded="rounded-xl" dark={dark} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug">{ex?.name || "Exercise"}</p>
                  {(exMuscles.length > 0 || ex?.category) && (
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: t.textFaint }}>
                      {exMuscles.length ? exMuscles.join(" · ") : ex.category}
                    </p>
                  )}
                </div>
                {setsReps && (
                  <p className="text-xs font-bold tabular-nums shrink-0" style={{ color: t.textMuted }}>
                    {setsReps}
                  </p>
                )}
              </div>
            );
          })}
        </SoloGlassBox>
      )}
    </div>
  );
}

function formatSetsReps(row) {
  if (!row.targetSets) return null;
  if (row.targetReps) return `${row.targetSets} × ${row.targetReps}`;
  return `${row.targetSets} sets`;
}

export function ProgramOverviewSheet({ open, onClose, program, content, purchase, exercisesById, onOpenSchedule, dark, t }) {
  const phases = programPhases(content);
  const totalWeeks = totalWeeksForProgram(phases) || program?.weekOnePreview?.totalWeeks || 0;
  const benefits = program ? programBenefits(program, phases) : [];
  const phaseStarts = phases.map((_, i) => 1 + phases.slice(0, i).reduce((sum, p) => sum + (p.durationWeeks || 0), 0));
  const [preview, setPreview] = useState(null); // { day, phaseName }

  const topRef = useRef(null);

  useEffect(() => {
    if (open) setPreview(null);
  }, [open, program?.id]);

  // Opening a session (or going back) starts at the top of the sheet.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [preview]);

  return (
    <BottomSheet open={open} onClose={onClose} title={program?.name} wide dark={dark}>
      <div ref={topRef} />
      {program && preview && (
        <div style={{ color: t.text }}>
          <SessionPreview day={preview.day} phaseName={preview.phaseName} exercisesById={exercisesById} onBack={() => setPreview(null)} dark={dark} t={t} />
        </div>
      )}
      {program && !preview && (
        <div style={{ color: t.text }}>
          <OverviewHero program={program} t={t} />
          <p className="text-xs font-semibold mb-3" style={{ color: t.textMuted }}>
            {[program.level, totalWeeks ? `${totalWeeks} week${totalWeeks === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
          </p>
          {program.description && (
            <p className="text-sm leading-relaxed whitespace-pre-line mb-6" style={{ color: t.textMuted }}>
              {program.description}
            </p>
          )}

          <SectionLabel t={t}>Benefits</SectionLabel>
          <ul className="space-y-2 mb-6">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <Check size={15} color={MEASURE_BLUE} className="shrink-0 mt-0.5" strokeWidth={2.5} />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <SectionLabel t={t}>Sessions</SectionLabel>
          {phases.length === 0 && (
            <p className="text-sm mb-6" style={{ color: t.textMuted }}>
              Sessions are loading…
            </p>
          )}
          {phases.map((phase, pi) => {
            const from = phaseStarts[pi];
            const to = from + (phase.durationWeeks || 0) - 1;
            const days = phase.days || [];
            if (days.length === 0) return null;
            const phaseName = phase.name || `Phase ${pi + 1}`;
            return (
              <div key={phase.id || pi} className="mb-5">
                <p className="text-sm font-bold mb-2">
                  {phaseName}
                  {!/week/i.test(phase.name || "") && (
                    <span className="font-semibold" style={{ color: t.textFaint }}>
                      {" "}
                      · {to > from ? `Weeks ${from}–${to}` : `Week ${from}`}
                    </span>
                  )}
                </p>
                <SoloGlassBox t={t} className="rounded-2xl">
                  {days.map((day, di) => {
                    const muscles = sessionMuscles(day, exercisesById);
                    const n = countExercises(day.exercises);
                    return (
                      <button
                        key={day.id || di}
                        type="button"
                        onClick={() => setPreview({ day, phaseName })}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                        style={di > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{day.label || `Session ${di + 1}`}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: t.textFaint }}>
                            {n} exercise{n === 1 ? "" : "s"}
                          </p>
                          <MuscleChips muscles={muscles} className="mt-2" />
                        </div>
                        <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                      </button>
                    );
                  })}
                </SoloGlassBox>
              </div>
            );
          })}

          <PrimaryButton dark={dark} className="w-full mt-2" onClick={onOpenSchedule}>
            {purchase?.startDate ? "THIS WEEK & SCHEDULE" : "SET START DATE"}
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
