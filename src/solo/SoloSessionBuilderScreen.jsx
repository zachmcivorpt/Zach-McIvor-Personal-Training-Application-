import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronUp, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { ClientThemeContext, AddExerciseSheet } from "../client/ClientApp";
import { ExerciseThumb, PrimaryButton, SecondaryButton } from "../components/ui";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { newSessionExercise, sessionProblem, customSessionState, REST_OPTIONS, MAX_SESSION_EXERCISES } from "./customSessions";

// Free training: build a session from the exercise library — sets, reps and
// rest for each exercise — save it to reuse, and start it any time
// (customSessions.js). Reached from My Training's "Your Sessions"; editing
// an existing one passes { sessionId } in the route state.
export default function SoloSessionBuilderScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { soloCurrentUser, soloExercises, soloCustomSessions, saveSoloCustomSession, deleteSoloCustomSession } = useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const existing = soloCustomSessions.find((s) => s.id === location.state?.sessionId) || null;

  const [name, setName] = useState(existing?.name || "");
  const [exercises, setExercises] = useState(existing?.exercises || []);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);

  function update(i, patch) {
    setExercises((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }
  function move(i, dir) {
    setExercises((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(andStart) {
    const session = { ...(existing || {}), name, exercises };
    const problem = sessionProblem(session);
    if (problem) return setError(problem);
    setError("");
    setSaving(true);
    try {
      const saved = await saveSoloCustomSession(soloCurrentUser.id, session);
      if (andStart) navigate("/solo/workout", { state: customSessionState(soloCurrentUser.id, saved), replace: true });
      else navigate("/solo/home", { replace: true });
    } catch {
      setSaving(false);
      setError("Couldn't save this session — check your connection and try again.");
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteSoloCustomSession(existing.id);
      navigate("/solo/home", { replace: true });
    } catch {
      setSaving(false);
      setError("Couldn't delete this session — check your connection and try again.");
    }
  }

  const stepper = (label, value, onDown, onUp, display) => (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={onDown} aria-label={`Fewer ${label}`} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: t.chipBg }}>
        <Minus size={13} />
      </button>
      <span className="min-w-[3.2rem] text-center">
        <span className="block text-sm font-bold tabular-nums">{display ?? value}</span>
        <span className="block text-[9px] font-bold tracking-wide uppercase" style={{ color: t.textFaint }}>
          {label}
        </span>
      </span>
      <button type="button" onClick={onUp} aria-label={`More ${label}`} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: t.chipBg }}>
        <Plus size={13} />
      </button>
    </div>
  );

  return (
    <ClientThemeContext.Provider value={dark}>
      <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
        <div className="w-full max-w-md mx-auto px-3 pt-5 pb-28">
          <div className="flex items-center gap-2 mb-5">
            <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={soloGlass(t)}>
              <ChevronLeft size={18} />
            </button>
            <h1 className="text-xl font-extrabold leading-tight">{existing ? "Edit session" : "Build a session"}</h1>
          </div>

          <label htmlFor="session-name" className="block text-[11px] font-bold tracking-wide uppercase mb-1.5" style={{ color: t.textFaint }}>
            Session name
          </label>
          <input
            id="session-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Upper body"
            className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
            style={{ ...soloGlass(t), color: t.text }}
          />

          <p className="text-[11px] font-bold tracking-wide uppercase mt-6 mb-2" style={{ color: t.textFaint }}>
            Exercises{exercises.length > 0 ? ` · ${exercises.length}` : ""}
          </p>
          {exercises.length === 0 ? (
            <p className="text-sm py-6 text-center rounded-2xl" style={{ ...soloGlass(t), color: t.textMuted }}>
              No exercises yet — add your first one below.
            </p>
          ) : (
            <div className="rounded-2xl" style={soloGlass(t)}>
              {exercises.map((ex, i) => {
                const exercise = exercisesById[ex.exerciseId] || { id: ex.exerciseId, name: "Unknown exercise" };
                return (
                  <div key={`${ex.exerciseId}-${i}`} className="px-3.5 py-3" style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}>
                    <div className="flex items-center gap-3">
                      <ExerciseThumb dark={dark} exercise={exercise} size={40} rounded="rounded-lg" className="shrink-0" />
                      <p className="text-sm font-semibold flex-1 min-w-0 truncate">{exercise.name}</p>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${exercise.name} up`} className="w-7 h-7 flex items-center justify-center disabled:opacity-25">
                        <ChevronUp size={16} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === exercises.length - 1} aria-label={`Move ${exercise.name} down`} className="w-7 h-7 flex items-center justify-center disabled:opacity-25">
                        <ChevronDown size={16} />
                      </button>
                      <button type="button" onClick={() => setExercises((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${exercise.name}`} className="w-7 h-7 flex items-center justify-center" style={{ color: t.textMuted }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-2.5">
                      {stepper("Sets", ex.targetSets, () => update(i, { targetSets: Math.max(1, ex.targetSets - 1) }), () => update(i, { targetSets: Math.min(10, ex.targetSets + 1) }))}
                      {stepper("Reps", ex.targetReps, () => update(i, { targetReps: Math.max(1, Number(ex.targetReps) - 1) }), () => update(i, { targetReps: Math.min(100, Number(ex.targetReps) + 1) }))}
                      <select
                        value={ex.restSeconds}
                        onChange={(e) => update(i, { restSeconds: Number(e.target.value) })}
                        aria-label={`Rest for ${exercise.name}`}
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold outline-none"
                        style={{ backgroundColor: t.chipBg, color: t.text, border: `1px solid ${t.panelBorder}` }}
                      >
                        {REST_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r === 0 ? "No rest" : `Rest ${r}s`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {exercises.length < MAX_SESSION_EXERCISES && (
            <button type="button" onClick={() => setAddOpen(true)} className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 mt-2.5 rounded-2xl" style={{ ...soloGlass(t), color: accent }}>
              <Plus size={16} /> Add exercise
            </button>
          )}

          {error && <p className="text-sm text-red-500 text-center mt-4">{error}</p>}

          <div className="mt-6 space-y-2.5">
            <PrimaryButton dark={dark} className="w-full" onClick={() => save(true)} disabled={saving}>
              {saving ? "Saving…" : "Save & start"}
            </PrimaryButton>
            <SecondaryButton dark={dark} className="w-full" onClick={() => save(false)} disabled={saving}>
              Save for later
            </SecondaryButton>
            {existing &&
              (confirmDelete ? (
                <div className="flex gap-2.5">
                  <SecondaryButton dark={dark} className="flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>
                    Keep it
                  </SecondaryButton>
                  <button type="button" onClick={remove} disabled={saving} className="flex-1 rounded-xl text-sm font-bold text-white bg-red-500 py-3 disabled:opacity-50">
                    Delete session
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-semibold text-red-500 py-2">
                  Delete this session
                </button>
              ))}
          </div>
        </div>

        <AddExerciseSheet
          open={addOpen}
          allExercises={soloExercises}
          excludeIds={new Set(exercises.map((e) => e.exerciseId))}
          onClose={() => setAddOpen(false)}
          onConfirm={(exercise) => {
            setExercises((list) => [...list, newSessionExercise(exercise.id)]);
            setAddOpen(false);
          }}
        />
      </div>
    </ClientThemeContext.Provider>
  );
}
