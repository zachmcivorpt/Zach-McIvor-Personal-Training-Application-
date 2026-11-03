// The Nutrition Goal editor (TDEE calculator + calorie/macro sliders).
// Moved out of CoachClientDetail.jsx (2026-11-03, REGRESSION_TESTS.md #126)
// so the coached client app, which also opens it, doesn't have to load the
// whole coach client screen (and its charts, meal-plan builder and workout
// editor) every time it starts. CoachClientDetail imports it from here.
import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay } from "../components/ui";
import { DEFAULT_NUTRITION_TARGETS, macroGramsSet, adjustMacroPct } from "../lib/nutritionTargets";
import { MEASURE_BLUE } from "../theme";
import { localFirst } from "../lib/offlineWrite";

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary — little/no exercise", mult: 1.2 },
  { key: "light", label: "Light — exercise 1–3 days/week", mult: 1.375 },
  { key: "moderate", label: "Moderate — exercise 3–5 days/week", mult: 1.55 },
  { key: "active", label: "Active — exercise 6–7 days/week", mult: 1.725 },
  { key: "veryActive", label: "Very active — hard training + physical job", mult: 1.9 },
];

// A goal shifts the suggested calorie target off TDEE and shifts the
// suggested macro split with it — a cut leans on more protein to protect
// muscle and satiety in a deficit, a bulk leans on more carbs to fuel the
// extra training volume a surplus is meant to support.
const NUTRITION_GOALS = [
  { key: "cut", label: "Cut", delta: -500, macros: { protein: 40, carbs: 30, fat: 30 } },
  { key: "maintain", label: "Maintain", delta: 0, macros: { protein: 30, carbs: 40, fat: 30 } },
  { key: "bulk", label: "Bulk", delta: 350, macros: { protein: 30, carbs: 45, fat: 25 } },
];

// Mifflin-St Jeor — the standard, well-validated BMR formula. Needs
// age/sex/height (set on the client's Summary tab) and a current weight
// (their latest weigh-in), so it's disabled with a nudge until those exist
// rather than guessing.
function TDEECalculator({ client, latestWeight, onApply }) {
  const [weight, setWeight] = useState(latestWeight || "");
  const [activity, setActivity] = useState("moderate");
  const [goalKey, setGoalKey] = useState("maintain");

  const ready = client.age && client.sex && client.heightCm;
  const w = Number(weight) || 0;
  const level = ACTIVITY_LEVELS.find((l) => l.key === activity);
  const goal = NUTRITION_GOALS.find((g) => g.key === goalKey);
  const bmr = ready && w > 0 ? 10 * w + 6.25 * client.heightCm - 5 * client.age + (client.sex === "Male" ? 5 : -161) : 0;
  const tdee = Math.round((bmr * level.mult) / 25) * 25;
  const suggestedCalories = Math.max(1200, Math.round((tdee + goal.delta) / 25) * 25);

  return (
    <div>
      <p className="text-black text-sm font-semibold mb-3">TDEE Calculator</p>
      {!ready ? (
        <p className="text-black/60 text-xs">Add age, sex and height on the Summary tab to enable this.</p>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2 text-center rounded-xl py-2.5" style={{ backgroundColor: "rgba(10,10,11,0.04)" }}>
            <div>
              <p className="text-black/50 text-[10px]">AGE</p>
              <p className="text-black text-sm font-semibold">{client.age}</p>
            </div>
            <div>
              <p className="text-black/50 text-[10px]">SEX</p>
              <p className="text-black text-sm font-semibold">{client.sex}</p>
            </div>
            <div>
              <p className="text-black/50 text-[10px]">HEIGHT</p>
              <p className="text-black text-sm font-semibold">{client.heightCm}cm</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-black/50 text-[10px] mb-1">CURRENT WEIGHT (KG)</p>
              <input
                type="number"
                min={0}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={latestWeight ? String(latestWeight) : "No weigh-ins yet"}
                className="w-full border rounded-lg px-2.5 py-1.5 text-black text-sm outline-none placeholder:text-black/40"
                style={{ backgroundColor: "#F7F7F8", borderColor: "rgba(10,10,11,0.12)" }}
              />
            </div>
            <div>
              <p className="text-black/50 text-[10px] mb-1">ACTIVITY LEVEL</p>
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className="w-full border rounded-lg px-2.5 py-1.5 text-black text-xs outline-none"
                style={{ backgroundColor: "#F7F7F8", borderColor: "rgba(10,10,11,0.12)" }}
              >
                {ACTIVITY_LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="text-black/50 text-[10px] mb-1">GOAL</p>
            <div className="grid grid-cols-3 gap-1.5">
              {NUTRITION_GOALS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGoalKey(g.key)}
                  className="py-1.5 rounded-lg text-xs font-semibold transition-colors border"
                  style={
                    goalKey === g.key
                      ? { backgroundColor: "#000", color: "#fff", borderColor: "#000" }
                      : { backgroundColor: "#F7F7F8", color: "#0A0A0B", borderColor: "rgba(10,10,11,0.12)" }
                  }
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {w > 0 && (
            <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "rgba(10,10,11,0.04)" }}>
              <p className="text-black/50 text-[10px]">BMR {Math.round(bmr)} kcal · TDEE {tdee} kcal</p>
              <div className="flex items-center justify-between mt-1.5 flex-wrap gap-2">
                <div>
                  <p className="text-black text-lg font-bold leading-none">{suggestedCalories} kcal</p>
                  <p className="text-black/50 text-[11px] mt-1">
                    P {goal.macros.protein}% · C {goal.macros.carbs}% · F {goal.macros.fat}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApply({
                      calories: suggestedCalories,
                      proteinPct: goal.macros.protein,
                      carbsPct: goal.macros.carbs,
                      fatPct: goal.macros.fat,
                    })
                  }
                  className="bg-black text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0 hover:opacity-90"
                >
                  USE THIS
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Full-screen "Nutrition Goal" editor — X / title / Save in the header
// (not a bottom button, matching the reference), a thin top accent line
// and divided rows instead of a boxed card, same premium language as the
// Overview headline stats panel (CoachDashboard.jsx's HeadlineStatColumn).
// `open`/`onClose` make it self-contained: both call sites (the diary's
// "⋯" menu and the graph's own "⋯" menu) just render it directly, no
// BottomSheet wrapper needed.
// Exported — also used from ClientApp.jsx when a coach is in "View as
// Client" mode, so they can still edit the real client's targets from
// inside the client-preview UI rather than losing that action entirely.
export function NutritionTargetsCard({ client, showToast, open, onClose, saveLocalFirst = false }) {
  const { db, updateUser } = useApp();
  const saved = { ...DEFAULT_NUTRITION_TARGETS, ...(client.nutritionTargets || {}) };
  const [calories, setCalories] = useState(saved.calories);
  const [pcts, setPcts] = useState({ protein: saved.proteinPct, carbs: saved.carbsPct, fat: saved.fatPct });
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(client.id);
  const weighIns = (db.weighIns || {})[client.id] || [];
  const latestWeight = weighIns.length ? [...weighIns].sort((a, b) => b.date - a.date)[0].weight : null;

  // Re-seed the draft if the coach switches to a different client.
  if (loadedRef.current !== client.id) {
    loadedRef.current = client.id;
    setCalories(saved.calories);
    setPcts({ protein: saved.proteinPct, carbs: saved.carbsPct, fat: saved.fatPct });
  }

  if (!open) return null;

  const dirty = calories !== saved.calories || pcts.protein !== saved.proteinPct || pcts.carbs !== saved.carbsPct || pcts.fat !== saved.fatPct;
  const grams = macroGramsSet(calories, { proteinPct: pcts.protein, carbsPct: pcts.carbs, fatPct: pcts.fat });

  function setPct(key, value) {
    setPcts((prev) => adjustMacroPct(prev, key, value));
  }

  async function save() {
    setSaving(true);
    try {
      const write = updateUser(client.id, {
        nutritionTargets: { calories, proteinPct: pcts.protein, carbsPct: pcts.carbs, fatPct: pcts.fat },
      });
      // The client app saves on the phone first and closes at once
      // (localFirst, REGRESSION_TESTS.md #126); the coach console waits.
      await (saveLocalFirst ? localFirst(write) : write);
      showToast("Nutrition targets saved");
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't save targets");
    } finally {
      setSaving(false);
    }
  }

  // Three shades of the app's single blue accent rather than a
  // green/amber "traffic light" set — APEX sticks to one accent color
  // (see CLAUDE.md), just varied in depth so the three sliders still
  // read as distinct from each other.
  const MACROS = [
    { key: "protein", label: "Protein", color: MEASURE_BLUE },
    { key: "carbs", label: "Carbs", color: "#1D4ED8" },
    { key: "fat", label: "Fat", color: "#7DB7FF" },
  ];

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[110] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60" aria-label="Close">
            <X size={20} />
          </button>
          <span className="text-black font-semibold">Nutrition Goal</span>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`text-sm font-bold ${!dirty || saving ? "text-black/25" : ""}`}
            style={dirty && !saving ? { color: MEASURE_BLUE } : undefined}
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${MEASURE_BLUE}, transparent)` }} />
            <div className="relative px-5 py-5 max-w-3xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-x-10">
              <TDEECalculator
                client={client}
                latestWeight={latestWeight}
                onApply={({ calories: kcal, proteinPct, carbsPct, fatPct }) => {
                  setCalories(Math.min(4500, Math.max(1200, kcal)));
                  setPcts({ protein: proteinPct, carbs: carbsPct, fat: fatPct });
                }}
              />

              <div>
                <div className="py-3.5 border-b border-black/8">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-black/50 text-xs font-semibold tracking-wide">CALORIES</span>
                    <span className="text-black font-bold text-sm tabular-nums">{calories} kcal</span>
                  </div>
                  <input
                    type="range"
                    min={1200}
                    max={4500}
                    step={25}
                    value={calories}
                    onChange={(e) => setCalories(Number(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>

                {MACROS.map((m) => (
                  <div key={m.key} className="py-3.5 border-b border-black/8">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-black/50 text-xs font-semibold tracking-wide">{m.label.toUpperCase()}</span>
                      <span className="text-black text-sm font-semibold tabular-nums">
                        {pcts[m.key]}% · {grams[m.key]}g
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={pcts[m.key]}
                      onChange={(e) => setPct(m.key, Number(e.target.value))}
                      className="w-full"
                      style={{ accentColor: m.color }}
                    />
                  </div>
                ))}

                <p className="text-black/30 text-[11px] mt-3">Protein + Carbs + Fat always add up to 100% of calories — adjusting one rebalances the others.</p>
              </div>
            </div>
            <div className="h-px mt-2" style={{ background: `linear-gradient(90deg, transparent, ${MEASURE_BLUE}, transparent)` }} />
          </div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}
