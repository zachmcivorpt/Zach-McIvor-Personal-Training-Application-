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
import { BottomSheet, FullScreenOverlay, PrimaryButton, SessionIntelligenceCard } from "../components/ui";
import { getBestEverStats, estimate1RM, getPreviousSets } from "../lib/AppContext";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlassVars, soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";
import SoloExerciseBlock from "./SoloExerciseBlock";
import SoloSwapSheet from "./SoloSwapSheet";
import { isBarbell, workingWeight, platesPerSide, warmupSets } from "./liftHelpers";
import { programFinished } from "./trainingRecap";
import { planExerciseTargets, isStalled, targetReasonText } from "./soloProgression";
import { canUse } from "./soloAccess";
import { useSoloPaywall } from "./SoloPaywall";
import { isCustomSessionLog } from "./customSessions";
import { scheduleRestNotification, cancelRestNotification } from "../lib/restNotification";
import { playTimerDing, armRestTimerAudio, unlockTimerAudio } from "./timerAudio";
import { SOLO_TYPE, SoloButton, SoloTextButton } from "./SoloUI";
import { loadWorkoutDraft, saveWorkoutDraft, clearWorkoutDraft, draftSessionKey, draftHasWork } from "./workoutDraft";

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
  const { soloCurrentUser, soloExercises, soloWorkoutLogs, logSoloWorkout, soloAccess, setSoloProgramSwap, soloContentById } = useSoloApp();
  const { openPaywall } = useSoloPaywall();
  // Suggested weights are a Plus feature once subscriptions launch.
  const showTargets = canUse("suggestedWeights", soloAccess);
  const { dark } = useSoloTheme();

  const uid = soloCurrentUser?.id || null;
  // A workout left unfinished on this phone (#157): reopening /solo/workout
  // without a session (the page was rebuilt, or Resume on My Training)
  // carries on with it; starting the same session again restores its sets.
  const [initialDraft] = useState(() => loadWorkoutDraft(uid));
  const sessionInfo = location.state?.day ? location.state : initialDraft?.sessionInfo || location.state; // { purchaseId, programId, phaseId, dayId, weekNumber, day }
  const restored = initialDraft && initialDraft.key === draftSessionKey(sessionInfo) ? initialDraft : null;
  // A free session the customer built (or a quick, empty one) — logged
  // under `${uid}_custom` (see customSessions.js), never against a program.
  const isCustom = isCustomSessionLog(sessionInfo);

  const [activeLog, setActiveLog] = useState(() => restored?.activeLog || {});
  const [extraExercises, setExtraExercises] = useState(() => restored?.extraExercises || []);
  // Swapped exercises: original exerciseId → the exerciseId done instead.
  // A program's sessions open with the swaps kept for it (#141).
  const savedSwaps = !isCustom && sessionInfo?.purchaseId ? soloCurrentUser?.programSwaps?.[sessionInfo.purchaseId] || null : null;
  const [swaps, setSwaps] = useState(() => ({ ...(savedSwaps || {}), ...(restored?.swaps || {}) }));
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
  const startedAtRef = useRef(restored?.startedAt || Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Set once the workout is saved or discarded, so the draft isn't written back.
  const closedRef = useRef(false);

  // Every change is kept on the phone as it's typed; nothing entered = no draft.
  useEffect(() => {
    if (!uid || !sessionInfo?.day || closedRef.current) return;
    if (draftHasWork({ activeLog, extraExercises })) saveWorkoutDraft(uid, { sessionInfo, activeLog, extraExercises, swaps, startedAt: startedAtRef.current });
    else clearWorkoutDraft(uid, sessionInfo);
  }, [uid, sessionInfo, activeLog, extraExercises, swaps]);

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
      <div className="min-h-dvh w-full flex items-center justify-center" style={{ backgroundColor: dark ? "#0A0A0B" : "#FFFFFF" }}>
        <button onClick={() => navigate("/solo/home")} className={dark ? "text-white text-sm font-semibold underline" : "text-black text-sm font-semibold underline"}>
          Back to My Training
        </button>
      </div>
    );
  }

  const { day, dayId, weekNumber, purchaseId } = sessionInfo;
  const t = SOLO_THEMES[dark ? "dark" : "light"];

  // Opened straight onto this page (no screen behind it): leave to My Training.
  function leaveSession() {
    if (location.key === "default") navigate("/solo/home", { replace: true });
    else navigate(-1);
  }
  // Cancel with sets entered asks first — one tap used to throw them all away.
  function handleCancel() {
    if (draftHasWork({ activeLog, extraExercises })) setConfirmLeave(true);
    else leaveSession();
  }
  function discardWorkout() {
    closedRef.current = true;
    clearWorkoutDraft(uid, sessionInfo);
    leaveSession();
  }
  const firstBarbellId = exercisesForSession.find((m) => (m.section || "main") === "main" && isBarbell(exercisesById[m.exerciseId]))?.exerciseId || null;

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
  function swapExercise(exMeta, exercise, remember = false) {
    const original = exMeta.swappedFrom || exMeta.exerciseId;
    const backToPlan = exercise.id === original;
    setSwaps((prev) => {
      const next = { ...prev };
      if (backToPlan) delete next[original];
      else next[original] = exercise.id;
      return next;
    });
    setSwapFor(null);
    // Kept for the rest of the program, or a kept swap undone (#141).
    if (!isCustom && purchaseId && soloCurrentUser?.id && setSoloProgramSwap) {
      if (remember && !backToPlan) setSoloProgramSwap(soloCurrentUser.id, purchaseId, original, exercise.id).catch(() => {});
      else if (backToPlan && savedSwaps?.[original]) setSoloProgramSwap(soloCurrentUser.id, purchaseId, original, null).catch(() => {});
    }
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
    let savedOffline = false;
    try {
      savedOffline = !!(await logSoloWorkout(soloCurrentUser.id, { purchaseId, dayId, weekNumber, dayLabel: day.label, entries, durationMin }))?.queued;
    } catch {
      // Previously silent — the button just reverted, so a failed save
      // looked like nothing happened and the customer could leave thinking
      // it was logged.
      setFinishing(false);
      setSaveError("Couldn't save this workout — check your connection and tap Complete Workout again.");
      return;
    }
    closedRef.current = true;
    clearWorkoutDraft(uid, sessionInfo);
    // The last session of a program: the summary leads on to the
    // program-complete moment (#141).
    const programId = sessionInfo.programId;
    const isProgramSession = !isCustom && programId && !String(purchaseId).endsWith("_recovery");
    const programComplete =
      isProgramSession && programFinished(soloWorkoutLogs, purchaseId, soloContentById?.[programId]?.phases || [], { weekNumber, dayId })
        ? { purchaseId, programId }
        : null;
    navigate("/solo/workout-summary", { state: { daySession: day, activeLog, durationMin, savedOffline, programComplete }, replace: true });
  }

  return (
    <ClientThemeContext.Provider value={dark}>
      <FullScreenOverlay>
        <div className={`${dark ? "fixed inset-0 z-[90] bg-black flex flex-col" : "fixed inset-0 z-[90] bg-white flex flex-col"} solo-glass-scope`} style={soloGlassVars(SOLO_THEMES[dark ? "dark" : "light"])}>
          <div className={dark ? "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5"}>
            <div className="w-[60px]" />
            <h1 className={dark ? "text-white font-bold text-[17px] truncate px-2" : "text-black font-bold text-[17px] truncate px-2"}>{day.label}</h1>
            <button onClick={handleCancel} disabled={finishing} className={dark ? "text-white/60 text-sm font-medium" : "text-black/60 text-sm font-medium"}>
              Cancel
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 pb-28">
            <SessionIntelligenceCard exercises={exercisesForSession} exercisesById={exercisesById} logsForClient={soloWorkoutLogs} dark={dark} />
            {!showTargets && soloWorkoutLogs.length > 0 && (
              <button
                type="button"
                onClick={() => openPaywall({ tier: "plus", reason: "Plus works out what to lift next for every set, from what you did last time." })}
                className={dark ? "w-full text-left text-xs text-white/60 px-1.5" : "w-full text-left text-xs text-black/60 px-1.5"}
              >
                Want a target weight for every set? <span className="font-bold underline underline-offset-2">Get suggested weights with Plus</span>
              </button>
            )}
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
                    const targets = showTargets ? planExerciseTargets(previousSets, exMeta.targetReps, rows.length, { stalled: isStalled(soloWorkoutLogs, exMeta.exerciseId) }) : [];
                    // Barbell lifts get plates; the first one gets warm-up sets too (#141).
                    const work = isBarbell(exercise) && (exMeta.section || "main") === "main" ? workingWeight({ targets, rows, previousSets }) : 0;
                    const liftHelp = work > 20 ? { work, plates: platesPerSide(work), warmup: exMeta.exerciseId === firstBarbellId ? warmupSets(work) : [] } : null;
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
                        liftHelp={liftHelp}
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
            onPick={(exercise, remember) => swapExercise(swapFor, exercise, remember)}
            canRemember={!isCustom}
            originalExercise={swapFor?.swappedFrom ? exercisesById[swapFor.swappedFrom] || null : null}
          />

          {detailExercise && <ExerciseDetailSheet exercise={detailExercise} logsForClient={soloWorkoutLogs} onClose={() => setDetailExercise(null)} />}

          {/* Cancel with sets entered (#157). An in-page sheet: WKWebView has no confirm(). */}
          <BottomSheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this workout?" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
            <div style={{ color: t.text }}>
              <p className={`${SOLO_TYPE.body} mb-5`} style={{ color: t.textMuted }}>
                Your sets are kept on this phone. Resume it from My Training, or discard it.
              </p>
              <SoloButton t={t} onClick={leaveSession}>
                Resume later
              </SoloButton>
              <button type="button" onClick={discardWorkout} className="w-full h-11 mt-1 text-[12px] font-bold uppercase" style={{ color: "#EF4444" }}>
                Discard workout
              </button>
              <SoloTextButton t={t} onClick={() => setConfirmLeave(false)}>
                Keep logging
              </SoloTextButton>
            </div>
          </BottomSheet>

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
