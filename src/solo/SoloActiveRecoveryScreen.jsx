import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Play, Check } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { localDateKey } from "../lib/dateKey";
import { ACTIVE_RECOVERY_SESSIONS, recoverySessionState, isRecoveryLog } from "./activeRecovery";

// Opened from a calendar rest day's "Active Recovery" entry: the cardio and
// mobility sessions a customer can do on a non-training day. Starting one
// runs it through the normal workout screen; it's logged for today.
export default function SoloActiveRecoveryScreen() {
  const navigate = useNavigate();
  const { soloCurrentUser, soloExercises, soloWorkoutLogs } = useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);
  const todayKey = localDateKey();
  const doneToday = new Set(soloWorkoutLogs.filter((l) => isRecoveryLog(l) && localDateKey(l.date) === todayKey).map((l) => l.dayId));

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="w-full max-w-md mx-auto px-3 pt-5 pb-10">
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={soloGlass(t)}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Active Recovery</h1>
            <p className="text-xs" style={{ color: t.textMuted }}>
              Light cardio or mobility for your rest day.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {ACTIVE_RECOVERY_SESSIONS.map((session) => {
            const done = doneToday.has(session.id);
            return (
              <div key={session.id} className="rounded-2xl p-4" style={soloGlass(t)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
                      {session.kind}
                    </p>
                    <p className="text-base font-bold mt-0.5">{session.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                      {session.duration} · {session.exercises.length} exercises
                    </p>
                  </div>
                </div>
                <p className="text-sm mt-2.5 leading-relaxed" style={{ color: t.textMuted }}>
                  {session.description}
                </p>
                <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `1px solid ${t.panelBorder}` }}>
                  {session.exercises.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate">{exercisesById[row.exerciseId]?.name || "Exercise"}</span>
                      <span className="shrink-0" style={{ color: t.textMuted }}>
                        {row.targetType === "time"
                          ? `${row.targetSets > 1 ? `${row.targetSets} × ` : ""}${row.targetReps >= 60 ? `${Math.round(row.targetReps / 60)} min` : `${row.targetReps}s`}`
                          : `${row.targetSets} × ${row.targetReps}`}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/solo/workout", { state: recoverySessionState(soloCurrentUser.id, session, todayKey) })}
                  className="mt-4 w-full flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-full"
                  style={done ? { ...soloGlass(t), color: t.textMuted } : { backgroundColor: t.text, color: t.bg }}
                >
                  {done ? <Check size={15} /> : <Play size={14} fill="currentColor" />}
                  {done ? "Done today — do it again" : "Start session"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
