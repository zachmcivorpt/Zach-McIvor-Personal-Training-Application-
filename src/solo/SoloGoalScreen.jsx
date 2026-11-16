import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { localDateKey } from "../lib/dateKey";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { suggestedGoals, goalTitle, startGoal, goalLiftExercises, bestWeight, latestWeight, parseGoal, liftMilestone } from "./goals";
import { saveSoloGoal, markGoalPromptSeen } from "./goalStore";

const NO_ANSWERS = Object.freeze({});
const tidy = (n) => Math.round(n * 10) / 10;

// How each kind of goal is counted, in a line.
function howCounted(goal, { logs }) {
  switch (goal.type) {
    case "consistency":
      return `Counts every week you train ${goal.perWeek}+ times.`;
    case "bodyweight":
      return "Tracked from your weigh-ins in Progress.";
    case "lift": {
      const best = bestWeight(logs, goal.exerciseId);
      return best > 0 ? `Your best so far: ${tidy(best)} kg.` : "Tracked from your heaviest logged set.";
    }
    case "workouts":
      return "Every session you log counts.";
    case "steps":
      return "Days your steps reach the target, from Apple Health or Progress.";
    default:
      return "";
  }
}

// The numbers a goal can be set to, and how far each tap moves them.
const LIMITS = {
  consistency: { target: [4, 52, 1], perWeek: [2, 6, 1] },
  bodyweight: { target: [1, 40, 0.5] },
  lift: { target: [20, 400, 2.5] },
  workouts: { target: [5, 200, 5] },
  steps: { target: [7, 100, 1], stepTarget: [5000, 20000, 1000] },
};
const FIELD_LABEL = {
  consistency: { target: "Weeks", perWeek: "Sessions a week" },
  bodyweight: { target: "Kg" },
  lift: { target: "Kg" },
  workouts: { target: "Workouts" },
  steps: { target: "Days", stepTarget: "Steps a day" },
};

// Main goal (#236): the first time after the questionnaire (on the way to
// the first session), and from the goal card on Progress (#237) to change it. A
// solid full page like the first-session screen; one goal at a time.
export default function SoloGoalScreen({ firstTime = false, onDone }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { soloCurrentUser, soloExercises, soloWorkoutLogs, soloWeighIns, logSoloWeight } = useSoloApp();
  const { dark } = useSoloTheme();
  const uid = soloCurrentUser?.id;

  // Shown by itself once ever: marked seen as it shows (#142 rule).
  const markedRef = useRef(false);
  useEffect(() => {
    if (firstTime && uid && !markedRef.current) {
      markedRef.current = true;
      markGoalPromptSeen(uid);
    }
  }, [firstTime, uid]);

  function leave() {
    if (onDone) onDone();
    else navigate(location.state?.back || "/solo/home", { replace: true, state: location.state?.backState });
  }

  return (
    <GoalPicker
      firstTime={firstTime}
      dark={dark}
      ready={!!uid}
      current={soloCurrentUser?.goal || null}
      answers={soloCurrentUser?.onboarding?.answers || NO_ANSWERS}
      exercises={soloExercises}
      logs={soloWorkoutLogs}
      weighIns={soloWeighIns}
      onLogWeight={(w) => logSoloWeight(uid, w)}
      onSave={(goal) => saveSoloGoal(uid, goal)}
      onLeave={leave}
    />
  );
}

// The goal page itself (#248): Train Solo's page, also used as-is by the
// coached client app's Progress (src/client/ClientGoal.jsx) with the
// client's own data and save.
export function GoalPicker({ firstTime = false, dark, ready = true, current = null, answers = NO_ANSWERS, exercises: soloExercises, logs: soloWorkoutLogs, weighIns: soloWeighIns, onLogWeight, onSave, onLeave }) {
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const uid = ready;
  const logs = soloWorkoutLogs || [];
  const lifts = useMemo(() => goalLiftExercises(soloExercises || [], logs), [soloExercises, logs]);

  const options = useMemo(() => {
    const list = suggestedGoals({ answers, exercises: soloExercises || [], logs });
    // Their current goal first, with its own numbers.
    if (current && !current.ownText) return [current, ...list.filter((g) => g.type !== current.type)];
    return list;
  }, [answers, soloExercises, logs, current]);

  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState(() => (current?.ownText ? "own" : current?.type || null));
  // Their own goal in their own words (#237): read into a goal the app can
  // track; the numbers can still be changed underneath.
  const [ownText, setOwnText] = useState(() => (current?.ownText ? current.ownText : ""));
  const own = useMemo(() => parseGoal(ownText, { exercises: soloExercises || [], logs, weighIns: soloWeighIns || [] }), [ownText, soloExercises, logs, soloWeighIns]);
  const [weightToday, setWeightToday] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // "own" is their typed goal; anything else is a suggestion, by type.
  const goalOf = (key) => (key === "own" ? (own ? { ...own, ...drafts.own, ownText: ownText.trim() } : null) : { ...options.find((g) => g.type === key), ...drafts[key] });
  const chosen = selected ? goalOf(selected) : null;
  const hasWeight = latestWeight(soloWeighIns || []) != null;

  const leave = onLeave;

  function set(key, field, delta) {
    const g = goalOf(key);
    const [min, max] = LIMITS[g.type][field];
    const next = Math.min(max, Math.max(min, tidy((Number(g[field]) || 0) + delta)));
    setDrafts((d) => ({ ...d, [key]: { ...d[key], [field]: next } }));
  }

  function typeOwn(text) {
    setOwnText(text);
    setDrafts((d) => ({ ...d, own: undefined })); // new words, new numbers
  }

  function pickLift(lift) {
    setDrafts((d) => {
      const best = bestWeight(logs, lift.exerciseId);
      const target = liftMilestone(lift, best);
      return { ...d, lift: { ...d.lift, exerciseId: lift.exerciseId, liftKey: lift.key, liftLabel: lift.label, target } };
    });
  }

  async function save() {
    if (!uid || !chosen) return;
    setBusy(true);
    setError("");
    try {
      const w = Number(weightToday);
      let weighIns = soloWeighIns || [];
      if (chosen.type === "bodyweight" && !hasWeight && w > 20 && w < 400) {
        await onLogWeight(w);
        weighIns = [{ weight: w, date: Date.now() }];
      }
      const keepStart = current && current.type === chosen.type && current.startKey && (chosen.type !== "lift" || current.exerciseId === chosen.exerciseId) && (chosen.type !== "bodyweight" || current.direction === chosen.direction);
      const goal = keepStart ? { ...current, ...chosen } : startGoal(chosen, { logs, weighIns, todayKey: localDateKey() });
      if (selected !== "own") delete goal.ownText;
      await onSave(goal);
      leave();
    } catch {
      setError("Couldn't save your goal — please try again.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!uid) return;
    setBusy(true);
    try {
      await onSave(null);
      leave();
    } catch {
      setError("Couldn't remove your goal — please try again.");
      setBusy(false);
    }
  }

  // The numbers under a chosen goal (a plain function, not a component, so
  // typing in "Your own goal" never loses focus on a re-render).
  function fields(key, g) {
    return (
      <>
                    {key === "lift" && lifts.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {lifts.map((l) => (
                          <button
                            key={l.key}
                            type="button"
                            onClick={() => pickLift(l)}
                            className="h-8 px-3 rounded-full text-[11px] font-bold uppercase tracking-[0.06em]"
                            style={g.liftKey === l.key ? { backgroundColor: t.text, color: t.bg } : { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, color: t.textMuted }}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {g.type === "bodyweight" && (
                      <div className="flex gap-1.5">
                        {["lose", "gain"].map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => setDrafts((d) => ({ ...d, [key]: { ...d[key], direction: dir } }))}
                            className="h-8 px-3 rounded-full text-[11px] font-bold uppercase tracking-[0.06em]"
                            style={(g.direction || "lose") === dir ? { backgroundColor: t.text, color: t.bg } : { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, color: t.textMuted }}
                          >
                            {dir === "lose" ? "Lose" : "Gain"}
                          </button>
                        ))}
                      </div>
                    )}
                    {Object.keys(LIMITS[g.type]).map((field) => (
                      <Stepper key={field} label={FIELD_LABEL[g.type][field]} value={g[field]} onMinus={() => set(key, field, -LIMITS[g.type][field][2])} onPlus={() => set(key, field, LIMITS[g.type][field][2])} t={t} />
                    ))}
                    {g.type === "bodyweight" && !hasWeight && (
                      <label className="flex items-center justify-between gap-3">
                        <span className={SOLO_TYPE.meta} style={{ color: t.textMuted }}>
                          Your weight today (kg)
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={weightToday}
                          onChange={(e) => setWeightToday(e.target.value)}
                          placeholder="–"
                          className="w-24 rounded-xl px-3 py-2 text-[13px] text-right tabular-nums"
                          style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }}
                        />
                      </label>
                    )}
                        </>
    );
  }

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="max-w-md mx-auto px-5 pb-10" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 40px)" }}>
        <img src={t.logo} alt="APEX" className="w-auto mb-12" style={{ height: 16 }} />
        <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
          {firstTime ? "One last thing" : "Your main goal"}
        </p>
        <h1 className={`mt-3 ${SOLO_TYPE.title}`}>{firstTime ? "What are you training for?" : current ? "Change your goal" : "Set your main goal"}</h1>
        <p className={`mt-3 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
          Pick a suggestion or write your own. We'll track it from what you log.
        </p>

        <ul className="mt-8 border-t" style={{ borderColor: t.panelBorder }} data-testid="goal-options">
          {options.map((opt) => {
            const g = goalOf(opt.type);
            const on = selected === opt.type;
            return (
              <li key={opt.type} className="border-b" style={{ borderColor: t.panelBorder }}>
                <button type="button" onClick={() => setSelected(opt.type)} aria-pressed={on} className="w-full flex items-center gap-3 py-3.5 text-left">
                  <Radio on={on} t={t} />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${SOLO_TYPE.row}`}>{goalTitle(g)}</span>
                    <span className={`block ${SOLO_TYPE.meta} mt-0.5`} style={{ color: t.textMuted }}>
                      {howCounted(g, { logs })}
                    </span>
                  </span>
                </button>
                {on && <div className="pb-4 pl-[30px] space-y-3">{fields(opt.type, g)}</div>}
              </li>
            );
          })}
          <li className="border-b" style={{ borderColor: t.panelBorder }} data-testid="goal-own">
            <button type="button" onClick={() => setSelected("own")} aria-pressed={selected === "own"} className="w-full flex items-center gap-3 py-3.5 text-left">
              <Radio on={selected === "own"} t={t} />
              <span className="min-w-0 flex-1">
                <span className={`block ${SOLO_TYPE.row}`}>Your own goal</span>
                <span className={`block ${SOLO_TYPE.meta} mt-0.5`} style={{ color: t.textMuted }}>
                  Write it your way — we'll work out how to track it.
                </span>
              </span>
            </button>
            {selected === "own" && (
              <div className="pb-4 pl-[30px] space-y-3">
                <input
                  value={ownText}
                  onChange={(e) => typeOwn(e.target.value)}
                  placeholder="e.g. Squat 140 kg, lose 6 kg, 4× a week"
                  aria-label="Your own goal"
                  className="w-full rounded-xl px-3.5 py-2.5 text-[13px]"
                  style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }}
                />
                {own ? (
                  <>
                    <div data-testid="goal-own-reading">
                      <p className={SOLO_TYPE.meta} style={{ color: t.textMuted }}>
                        We'll track this as
                      </p>
                      <p className={`${SOLO_TYPE.row} mt-0.5`} style={{ color: MEASURE_BLUE }}>
                        {goalTitle(goalOf("own"))}
                      </p>
                      <p className={`${SOLO_TYPE.meta} mt-0.5`} style={{ color: t.textMuted }}>
                        {howCounted(goalOf("own"), { logs })}
                      </p>
                    </div>
                    {fields("own", goalOf("own"))}
                  </>
                ) : (
                  ownText.trim().length >= 3 && (
                    <p className={SOLO_TYPE.meta} style={{ color: t.textMuted }} data-testid="goal-own-hint">
                      We can't measure that one from what you log yet. Try a lift ("Squat 140 kg"), your weight ("Lose 6 kg"), workouts ("30 workouts"), how often ("4× a week for 10 weeks") or steps ("12k steps a day").
                    </p>
                  )
                )}
              </div>
            )}
          </li>
        </ul>

        {error && <p className="text-xs text-red-500 mt-4">{error}</p>}
        <SoloButton t={t} className="mt-8" onClick={save} disabled={!chosen || busy}>
          {busy ? "Saving…" : current ? "Save goal" : "Set my goal"}
        </SoloButton>
        <SoloTextButton t={t} className="mt-1" onClick={leave} disabled={busy}>
          {firstTime ? "Skip for now" : "Cancel"}
        </SoloTextButton>
        {current && !firstTime && (
          <button type="button" onClick={remove} disabled={busy} className="block mx-auto mt-2 text-[12px] font-semibold text-red-500/80">
            Remove goal
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus, t }) {
  const chip = { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={SOLO_TYPE.meta} style={{ color: t.textMuted }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={onMinus} className="w-9 h-9 rounded-full flex items-center justify-center" style={chip}>
          <Minus size={14} />
        </button>
        <span className="w-16 text-center text-[20px] font-semibold tabular-nums">{Number(value).toLocaleString("en-AU")}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={onPlus} className="w-9 h-9 rounded-full flex items-center justify-center" style={chip}>
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

function Radio({ on, t }) {
  return (
    <span className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center" style={{ border: `1.5px solid ${on ? MEASURE_BLUE : t.textFaint}` }}>
      {on && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />}
    </span>
  );
}
