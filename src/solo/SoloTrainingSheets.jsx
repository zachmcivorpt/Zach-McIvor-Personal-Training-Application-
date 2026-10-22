import React from "react";
import { Check, Trophy } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { SoloArtwork } from "./SoloArtwork";
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

export function ProgramOverviewSheet({ open, onClose, program, content, purchase, exercisesById, onOpenSchedule, dark, t }) {
  const phases = programPhases(content);
  const totalWeeks = totalWeeksForProgram(phases) || program?.weekOnePreview?.totalWeeks || 0;
  const benefits = program ? programBenefits(program, phases) : [];
  const phaseStarts = phases.map((_, i) => 1 + phases.slice(0, i).reduce((sum, p) => sum + (p.durationWeeks || 0), 0));
  return (
    <BottomSheet open={open} onClose={onClose} title={program?.name} wide dark={dark}>
      {program && (
        <div style={{ color: t.text }}>
          <SoloArtwork program={program} t={t} className="w-full h-32 rounded-2xl mb-4" />
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
            return (
              <div key={phase.id || pi} className="mb-5">
                <p className="text-sm font-bold mb-1">
                  {phase.name || `Phase ${pi + 1}`}
                  {!/week/i.test(phase.name || "") && (
                    <span className="font-semibold" style={{ color: t.textFaint }}>
                      {" "}
                      · {to > from ? `Weeks ${from}–${to}` : `Week ${from}`}
                    </span>
                  )}
                </p>
                <div>
                  {days.map((day, di) => {
                    const muscles = sessionMuscles(day, exercisesById);
                    const n = (day.exercises || []).filter((e) => !e.isRest).length;
                    return (
                      <div key={day.id || di} className="py-3" style={{ borderTop: `1px solid ${t.panelBorder}` }}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold truncate">{day.label || `Session ${di + 1}`}</p>
                          <p className="text-[11px] shrink-0 tabular-nums" style={{ color: t.textFaint }}>
                            {n} exercise{n === 1 ? "" : "s"}
                          </p>
                        </div>
                        {muscles.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {muscles.map((m) => (
                              <span key={m} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(47,143,255,0.12)", color: MEASURE_BLUE }}>
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
