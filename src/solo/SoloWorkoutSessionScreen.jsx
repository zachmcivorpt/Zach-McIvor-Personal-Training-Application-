import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  ClientThemeContext,
  RestBar,
  ExerciseDetailSheet,
  AddExerciseSheet,
  sectionedExercises,
} from "../client/ClientApp";
import { FullScreenOverlay, PrimaryButton, SessionIntelligenceCard } from "../components/ui";
import { getBestEverStats, estimate1RM, getPreviousSets } from "../lib/AppContext";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlassVars } from "./SoloThemeContext";
import SoloExerciseBlock from "./SoloExerciseBlock";
import SoloSwapSheet from "./SoloSwapSheet";
import { planExerciseTargets, isStalled, targetReasonText } from "./soloProgression";
import { isCustomSessionLog } from "./customSessions";
import { scheduleRestNotification, cancelRestNotification } from "../lib/restNotification";
import { playTimerDing, armRestTimerAudio, unlockTimerAudio } from "./timerAudio";

// Train Solo's own workout session — adapted from ClientApp.jsx's
// WorkoutSession for a customer with no coach: reuses RestBar,
// ExerciseDetailSheet, AddExerciseSheet and sectionedExercises directly
// (all already prop-driven, exported from ClientApp.jsx for exactly this
// reuse — see the comments on each there), but swaps ExerciseBlock for
// SoloExerciseBlock (Program Notes instead of Coach's Notes, no exercise-
// swap-and-notify-your-coach feature) and drops the session-note screen
// entirely (it was explicitly "only visible to your coach," which doesn't
// apply here). ClientThemeContext.Provider below is what makes the reused
// Coaching components honor Train Solo's own light/dark toggle instead of
// that context's dark-by-default fallback.
export default function SoloWorkoutSessionScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { soloCurrentUser, soloExercises, soloWorkoutLogs, logSoloWorkout } = useSoloApp();
  const { dark } = useSoloTheme();

  const sessionInfo = location.state; // { purchaseId, programId, phaseId, dayId, weekNumber, day }
  // A free session the customer built (or a quick, empty one) — logged
  // under `${uid}_custom` (see customSessions.js), never against a program.
  const isCustom = isCustomSessionLog(sessionInfo);

  const [activeLog, setActiveLog] = useState({});
  const [extraExercises, setExtraExercises] = useState([]);
  // Swapped exercises: original exerciseId → the exerciseId done instead.
  const [swaps, setSwaps] = useState({});
  const [swapFor, setSwapFor] = useState(null); // the exMeta being swapped
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [detailExercise, setDetailExercise] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [resting, setResting] = useState(false);
  const [restTime, setRestTime] = useState(90);
  const [restTotal, setRestTotal] = useState(90);
  const restEndAtRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);
  // Declared unconditionally, above the `if (!sessionInfo?.day) return` guard
  // below — same reasoning as WorkoutEditor.jsx's own identical comment:
  // every hook in this component must run on every render regardless of
  // which branch ends up rendering, so none can sit after a conditional
  // return.
  const exercisesForSession = useMemo(
    () =>
      (sessionInfo?.day?.exercises || [])
        .filter((exMeta) => !exMeta.isRest)
        .concat(extraExercises)
        .map((exMeta) => (swaps[exMeta.exerciseId] ? { ...exMeta, exerciseId: swaps[exMeta.exerciseId], swappedFrom: exMeta.exerciseId } : exMeta)),
    [sessionInfo?.day, extraExercises, swaps]
  );

  // The lock-screen "Rest's up" alert (iPhone app) only stays pending while
  // resting — Skip, the timer ending, or leaving the session cancels it.
  useEffect(() => {
    if (!resting) cancelRestNotification();
  }, [resting]);
  useEffect(() => () => cancelRestNotification(), []);

  useEffect(() => {
    if (!resting) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((restEndAtRef.current - Date.now()) / 1000));
      setRestTime(remaining);
      if (remaining <= 0) {
        setResting(false);
        playTimerDing();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [resting]);

  useEffect(() => {
    document.addEventListener("pointerdown", armRestTimerAudio);
    return () => document.removeEventListener("pointerdown", armRestTimerAudio);
  }, []);

  if (!sessionInfo?.day) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center" style={{ backgroundColor: dark ? "#0A0A0B" : "#F5F4F1" }}>
        <button onClick={() => navigate("/solo/home")} className={dark ? "text-white text-sm font-semibold underline" : "text-black text-sm font-semibold underline"}>
          Back to My Training
        </button>
      </div>
    );
  }

  const { day, dayId, weekNumber, purchaseId } = sessionInfo;

  function rowsFor(exMeta) {
    const existing = activeLog[exMeta.exerciseId] || [];
    const count = Math.max(exMeta.targetSets, existing.length);
    const out = [];
    for (let i = 0; i < count; i++) out.push(existing[i] || { setNumber: i + 1, weight: "", reps: "", completed: false });
    return out;
  }
  function setField(exerciseId, idx, field, value) {
    setActiveLog((prev) => {
      const arr = [...(prev[exerciseId] || [])];
      while (arr.length <= idx) arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [exerciseId]: arr };
    });
  }
  function addSet(exMeta) {
    setActiveLog((prev) => {
      const arr = [...(prev[exMeta.exerciseId] || [])];
      while (arr.length < exMeta.targetSets) arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      return { ...prev, [exMeta.exerciseId]: arr };
    });
  }
  // Reads the row from the LATEST state (functional update), not this
  // render's `activeLog`: the Try suggestion and the timed-set timer both
  // fill a row and then call this straight away, before a re-render — a
  // closure-captured `activeLog` still saw the row empty, so those sets were
  // saved but never marked completed (summary undercounted them, no PRs).
  function handleBlurKg(exMeta, idx) {
    const { bestScore, bestSet, maxWeight } = getBestEverStats(soloWorkoutLogs, exMeta.exerciseId);
    setActiveLog((prev) => {
      const row = (prev[exMeta.exerciseId] || [])[idx];
      if (!row) return prev;
      const reps = parseInt(row.reps, 10);
      if (!reps || isNaN(reps)) return prev;
      const weight = row.weight === "" || row.weight == null ? 0 : parseFloat(row.weight);
      if (isNaN(weight)) return prev;
      const score = weight > 0 ? estimate1RM(weight, reps) : reps;
      const isPR = !bestSet || weight > maxWeight || score > bestScore;
      const nextSets = [...(prev[exMeta.exerciseId] || [])];
      nextSets[idx] = { ...nextSets[idx], completed: true, isPR };
      return { ...prev, [exMeta.exerciseId]: nextSets };
    });
  }
  function handleStartRest(exMeta) {
    unlockTimerAudio();
    const rest = exMeta.restSeconds ?? 90;
    restEndAtRef.current = Date.now() + rest * 1000;
    setRestTime(rest);
    setRestTotal(rest);
    setResting(true);
    scheduleRestNotification(rest, exercisesById[exMeta.exerciseId]?.name);
  }
  function swapExercise(exMeta, exercise) {
    const original = exMeta.swappedFrom || exMeta.exerciseId;
    setSwaps((prev) => {
      const next = { ...prev };
      if (exercise.id === original) delete next[original];
      else next[original] = exercise.id;
      return next;
    });
    setSwapFor(null);
  }
  function addExtraExercise(exercise) {
    setExtraExercises((prev) => [
      ...prev,
      { exerciseId: exercise.id, targetSets: 3, targetReps: 10, targetType: "reps", targetRIR: 2, restSeconds: 90, section: "main" },
    ]);
    setAddExerciseOpen(false);
  }

  async function handleFinish() {
    const durationMin = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));
    const entries = Object.entries(activeLog)
      .map(([exerciseId, sets]) => ({
        exerciseId,
        sets: (sets || [])
          .filter((s) => s.reps !== "" && s.reps != null && !isNaN(Number(s.reps)))
          .map((s, i) => ({
            setNumber: i + 1,
            weight: s.weight !== "" && s.weight != null && !isNaN(Number(s.weight)) ? Number(s.weight) : 0,
            reps: Number(s.reps),
            completed: true,
            isPR: !!s.isPR,
          })),
      }))
      .filter((e) => e.sets.length > 0);

    if (isCustom && entries.length === 0) {
      setSaveError("Log at least one set before completing this session.");
      return;
    }
    setFinishing(true);
    setSaveError("");
    try {
      await logSoloWorkout(soloCurrentUser.id, { purchaseId, dayId, weekNumber, dayLabel: day.label, entries, durationMin });
    } catch {
      // Previously silent — the button just reverted, so a failed save
      // looked like nothing happened and the customer could leave thinking
      // it was logged.
      setFinishing(false);
      setSaveError("Couldn't save this workout — check your connection and tap Complete Workout again.");
      return;
    }
    navigate("/solo/workout-summary", { state: { daySession: day, activeLog, durationMin }, replace: true });
  }

  return (
    <ClientThemeContext.Provider value={dark}>
      <FullScreenOverlay>
        <div className={`${dark ? "fixed inset-0 z-[90] bg-black flex flex-col" : "fixed inset-0 z-[90] bg-white flex flex-col"} solo-glass-scope`} style={soloGlassVars(SOLO_THEMES[dark ? "dark" : "light"])}>
          <div className={dark ? "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5"}>
            <div className="w-[60px]" />
            <h1 className={dark ? "text-white font-bold text-[17px] truncate px-2" : "text-black font-bold text-[17px] truncate px-2"}>{day.label}</h1>
            <button onClick={() => navigate(-1)} disabled={finishing} className={dark ? "text-white/60 text-sm font-medium" : "text-black/60 text-sm font-medium"}>
              Cancel
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 pb-28">
            <SessionIntelligenceCard exercises={exercisesForSession} exercisesById={exercisesById} logsForClient={soloWorkoutLogs} dark={dark} />
            {sectionedExercises(exercisesForSession).map((group) => (
              <div key={group.key}>
                {group.showHeader && (
                  <p className={dark ? "text-white text-[15px] font-extrabold tracking-wide mb-2.5 mt-2 pb-1.5 border-b border-white/15" : "text-black text-[15px] font-extrabold tracking-wide mb-2.5 mt-2 pb-1.5 border-b border-black/15"}>{group.label.toUpperCase()}</p>
                )}
                <div className="space-y-4">
                  {group.items.map(({ exMeta, i }) => {
                    const exercise = exercisesById[exMeta.exerciseId] || { id: exMeta.exerciseId, name: "Unknown exercise" };
                    const rows = rowsFor(exMeta);
                    const previousSets = getPreviousSets(soloWorkoutLogs, exMeta.exerciseId);
                    const targets = planExerciseTargets(previousSets, exMeta.targetReps, rows.length, { stalled: isStalled(soloWorkoutLogs, exMeta.exerciseId) });
                    return (
                      <SoloExerciseBlock
                        key={(exMeta.swappedFrom || exMeta.exerciseId) + i}
                        exMeta={exMeta}
                        exercise={exercise}
                        rows={rows}
                        previousSets={previousSets}
                        targets={targets}
                        targetReason={targetReasonText(targets.find(Boolean), exMeta.targetReps)}
                        swappedFromName={exMeta.swappedFrom ? exercisesById[exMeta.swappedFrom]?.name || "the planned exercise" : null}
                        onSwap={() => setSwapFor(exMeta)}
                        onChangeField={(idx, field, value) => setField(exMeta.exerciseId, idx, field, value)}
                        onBlurKg={(idx) => handleBlurKg(exMeta, idx)}
                        onAddSet={() => addSet(exMeta)}
                        onStartRest={handleStartRest}
                        onOpenDetail={(ex) => setDetailExercise(ex)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAddExerciseOpen(true)}
              className={dark ? "w-full flex items-center justify-center gap-2 text-white font-semibold text-sm py-3" : "w-full flex items-center justify-center gap-2 text-black font-semibold text-sm py-3"}
            >
              <Plus size={16} />
              Add Exercise
            </button>
            {saveError && <p className="text-sm text-red-500 text-center">{saveError}</p>}
            <PrimaryButton dark={dark} className="w-full" onClick={handleFinish} disabled={finishing}>
              {finishing ? "Saving…" : "Complete Workout"}
            </PrimaryButton>
          </div>

          <AddExerciseSheet
            open={addExerciseOpen}
            allExercises={soloExercises}
            excludeIds={new Set(exercisesForSession.map((e) => e.exerciseId))}
            onClose={() => setAddExerciseOpen(false)}
            onConfirm={addExtraExercise}
          />

          <SoloSwapSheet
            exercise={swapFor ? exercisesById[swapFor.exerciseId] || { id: swapFor.exerciseId, name: "exercise" } : null}
            allExercises={soloExercises}
            excludeIds={new Set(exercisesForSession.map((e) => e.exerciseId).filter((id) => id !== swapFor?.swappedFrom))}
            onClose={() => setSwapFor(null)}
            onPick={(exercise) => swapExercise(swapFor, exercise)}
          />

          {detailExercise && <ExerciseDetailSheet exercise={detailExercise} logsForClient={soloWorkoutLogs} onClose={() => setDetailExercise(null)} />}

          {resting && (
            <RestBar
              restTime={restTime}
              restTotal={restTotal}
              onAdd15={() => {
                restEndAtRef.current += 15000;
                setRestTime((t) => t + 15);
                setRestTotal((t) => t + 15);
                scheduleRestNotification((restEndAtRef.current - Date.now()) / 1000);
              }}
              onSkip={() => setResting(false)}
            />
          )}
        </div>
      </FullScreenOverlay>
    </ClientThemeContext.Provider>
  );
}
