// Coach-side meal plan builder — week-structured, day-tabbed, meal-slot
// editor for assigning a client a structured eating plan built from the
// Meal Library (masterMeals), modeled on Trainerize's own "Meal Plan
// Builder" (day tabs across the top, Breakfast/Lunch/Dinner/Snack drop
// zones, a calorie/macro goal readout for the day). Tap-to-add/remove
// rather than true drag-and-drop — simpler and works the same on a
// coach's phone. Also includes a lightweight "smart" auto-fill engine
// that scores every Meal Library item against the client's own
// calorie/macro targets (no external AI call — this app has no LLM
// integration wired up, so "smart"/"auto-build" here means a real,
// deterministic best-fit match against the library, not generated text).
import React, { useMemo, useState } from "react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay, PrimaryButton, SecondaryButton, TextInput } from "../components/ui";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { X, Plus, Search, Utensils, Trash2, Copy, ClipboardPaste, Sparkles, Wand2, Pencil, Check } from "lucide-react";

const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_WEEKS = 12;
// Rough default share of a day's calories/macros per meal slot — used only
// to give the auto-fill engine a per-slot target to match meals against.
const SLOT_SPLIT = { Breakfast: 0.25, Lunch: 0.35, Dinner: 0.3, Snacks: 0.1 };

function emptyDayMeals() {
  return { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
}

function makeWeekDays(weekIndex) {
  return DAY_NAMES.map((name, i) => ({
    id: `day_${Date.now()}_${weekIndex}_${i}_${Math.random().toString(36).slice(2, 7)}`,
    label: name,
    weekIndex,
    weekdayIndex: i,
    meals: emptyDayMeals(),
  }));
}

// Backfills weekIndex/weekdayIndex (by position, chunks of 7) onto plans
// saved before the week-structure existed, so grouping + relabeling always
// has something sane to work with without needing a separate legacy path.
function withWeekMeta(days) {
  return days.map((d, i) => ({
    weekIndex: d.weekIndex ?? Math.floor(i / 7),
    weekdayIndex: d.weekdayIndex ?? i % 7,
    ...d,
  }));
}

function dayTotals(day, mealsById) {
  const total = { cals: 0, protein: 0, carbs: 0, fat: 0 };
  MEAL_SLOTS.forEach((slot) => {
    (day.meals[slot] || []).forEach((mealId) => {
      const m = mealsById[mealId];
      if (!m) return;
      total.cals += m.cals || 0;
      total.protein += m.protein || 0;
      total.carbs += m.carbs || 0;
      total.fat += m.fat || 0;
    });
  });
  return {
    cals: Math.round(total.cals),
    protein: Math.round(total.protein * 10) / 10,
    carbs: Math.round(total.carbs * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
  };
}

function slotTargets(dayTargets) {
  const out = {};
  Object.entries(SLOT_SPLIT).forEach(([slot, pct]) => {
    out[slot] = {
      calories: Math.round(dayTargets.calories * pct),
      protein: Math.round(dayTargets.protein * pct),
      carbs: Math.round(dayTargets.carbs * pct),
      fat: Math.round(dayTargets.fat * pct),
    };
  });
  return out;
}

// Lower is a better fit. Weighted so calories and protein (the two things
// a coach usually cares most about hitting) matter more than carbs/fat.
function fitScore(meal, target) {
  if (!target || !target.calories) return 0;
  const dCals = Math.abs((meal.cals || 0) - target.calories) / target.calories;
  const dProtein = Math.abs((meal.protein || 0) - target.protein) / Math.max(target.protein, 1);
  const dCarbs = Math.abs((meal.carbs || 0) - target.carbs) / Math.max(target.carbs, 1);
  const dFat = Math.abs((meal.fat || 0) - target.fat) / Math.max(target.fat, 1);
  return dCals * 2 + dProtein * 1.5 + dCarbs + dFat;
}

function matchPct(score) {
  return Math.max(0, Math.min(100, Math.round(100 - score * 35)));
}

function bestMatches(meals, target, n = meals.length) {
  return [...meals]
    .map((meal) => ({ meal, score: fitScore(meal, target) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n);
}

function MealPickerSheet({ open, onClose, onPick, meals, target }) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const filtered = meals.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const ranked = target ? bestMatches(filtered, target) : filtered.map((meal) => ({ meal, score: null }));

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <p className="text-black font-semibold">Add a meal</p>
          <button onClick={onClose} className="text-black/50">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5">
            <Search size={15} className="text-black/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meal library"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>
          {target && (
            <p className="text-black/30 text-[11px] mt-2 flex items-center gap-1">
              <Sparkles size={11} /> Sorted by best match to this slot's target
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {ranked.length === 0 ? (
            <p className="text-black/30 text-sm text-center py-8">
              {meals.length === 0 ? "No meal templates yet — add some in the Meal Library first." : "No meals match."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {ranked.map(({ meal: m, score }) => (
                <button
                  key={m.id}
                  onClick={() => onPick(m.id)}
                  className="w-full flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] rounded-xl px-3 py-2.5 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <Utensils size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-black text-sm font-medium truncate">{m.name}</p>
                    <p className="text-black/40 text-xs">
                      {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                    </p>
                  </div>
                  {score != null && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-black/5 text-black/50">
                      {matchPct(score)}% match
                    </span>
                  )}
                  <Plus size={16} className="text-black/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MealPlanBuilder({ client, onClose, showToast }) {
  const { db, setMealPlan } = useApp();
  const meals = db.masterMeals || [];
  const mealsById = Object.fromEntries(meals.map((m) => [m.id, m]));
  const existing = (db.mealPlans[client.id] || [])[0];
  const [days, setDays] = useState(() => (existing?.days?.length ? withWeekMeta(existing.days) : makeWeekDays(0)));
  const [activeWeek, setActiveWeek] = useState(0);
  const [activeDayId, setActiveDayId] = useState(days[0].id);
  const [pickerSlot, setPickerSlot] = useState(null); // meal slot name currently adding to, or null
  const [clipboard, setClipboard] = useState(null); // copied day's meals object, or null
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const weeksCount = useMemo(() => {
    const idxs = days.map((d) => d.weekIndex ?? 0);
    return idxs.length ? Math.max(...idxs) + 1 : 1;
  }, [days]);

  const daysInActiveWeek = days.filter((d) => (d.weekIndex ?? 0) === activeWeek);
  const activeDay = days.find((d) => d.id === activeDayId) || daysInActiveWeek[0] || days[0];
  const targets = resolveNutritionTargets(client.nutritionTargets);
  const slotT = useMemo(() => slotTargets(targets), [targets]);
  const totals = dayTotals(activeDay, mealsById);

  function selectWeek(w) {
    setActiveWeek(w);
    const firstDay = days.find((d) => (d.weekIndex ?? 0) === w);
    if (firstDay) setActiveDayId(firstDay.id);
    setEditingLabel(false);
  }

  function addWeek() {
    if (weeksCount >= MAX_WEEKS) return;
    const newIndex = weeksCount;
    setDays((list) => [...list, ...makeWeekDays(newIndex)]);
    selectWeek(newIndex);
  }

  function removeLastWeek() {
    if (weeksCount <= 1) return;
    const lastIdx = weeksCount - 1;
    const toRemove = days.filter((d) => (d.weekIndex ?? 0) === lastIdx);
    const hasMeals = toRemove.some((d) => Object.values(d.meals || {}).some((arr) => (arr || []).length > 0));
    if (hasMeals) {
      showToast(`Remove the meals in Week ${lastIdx + 1} before shortening the plan`);
      return;
    }
    setDays((list) => list.filter((d) => (d.weekIndex ?? 0) !== lastIdx));
    if (activeWeek >= lastIdx) selectWeek(lastIdx - 1);
  }

  function updateActiveDay(fn) {
    setDays((list) => list.map((d) => (d.id === activeDay.id ? fn(d) : d)));
  }

  function addMeal(slot, mealId) {
    updateActiveDay((d) => ({ ...d, meals: { ...d.meals, [slot]: [...(d.meals[slot] || []), mealId] } }));
    setPickerSlot(null);
  }

  function removeMeal(slot, index) {
    updateActiveDay((d) => ({ ...d, meals: { ...d.meals, [slot]: d.meals[slot].filter((_, i) => i !== index) } }));
  }

  function quickFillSlot(slot) {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      return;
    }
    const top = bestMatches(meals, slotT[slot], 1)[0];
    if (top) addMeal(slot, top.meal.id);
  }

  function autoBuildDay() {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      return;
    }
    let filled = 0;
    updateActiveDay((d) => {
      const dayMeals = { ...d.meals };
      MEAL_SLOTS.forEach((slot) => {
        if ((dayMeals[slot] || []).length > 0) return;
        const top = bestMatches(meals, slotT[slot], 1)[0];
        if (top) {
          dayMeals[slot] = [top.meal.id];
          filled += 1;
        }
      });
      return { ...d, meals: dayMeals };
    });
    showToast(filled > 0 ? `Auto-filled ${filled} empty slot${filled === 1 ? "" : "s"} for ${activeDay.label}` : `${activeDay.label} already has every slot filled`);
  }

  function autoBuildPlan() {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      return;
    }
    const rotation = { Breakfast: 0, Lunch: 0, Dinner: 0, Snacks: 0 };
    let filled = 0;
    setDays((list) =>
      list.map((day) => {
        const dayMeals = { ...day.meals };
        MEAL_SLOTS.forEach((slot) => {
          if ((dayMeals[slot] || []).length > 0) return;
          const candidates = bestMatches(meals, slotT[slot], 4);
          if (candidates.length === 0) return;
          const pick = candidates[rotation[slot] % candidates.length].meal;
          rotation[slot] += 1;
          dayMeals[slot] = [pick.id];
          filled += 1;
        });
        return { ...day, meals: dayMeals };
      })
    );
    showToast(filled > 0 ? `Auto-built ${filled} meal slot${filled === 1 ? "" : "s"} across the whole plan` : "Every slot in this plan already has a meal");
  }

  function relabelAsWeekdays() {
    setDays((list) => list.map((d) => ({ ...d, label: DAY_NAMES[(d.weekdayIndex ?? 0) % 7] })));
    showToast("Days relabeled Monday–Sunday");
  }

  function startEditLabel() {
    setLabelDraft(activeDay.label);
    setEditingLabel(true);
  }

  function saveLabel() {
    const label = labelDraft.trim() || activeDay.label;
    updateActiveDay((d) => ({ ...d, label }));
    setEditingLabel(false);
  }

  function copyDay() {
    setClipboard(JSON.parse(JSON.stringify(activeDay.meals || {})));
    showToast(`Copied ${activeDay.label} — paste it into any other day`);
  }

  function pasteDay() {
    if (!clipboard) return;
    updateActiveDay((d) => ({ ...d, meals: JSON.parse(JSON.stringify(clipboard)) }));
    showToast(`Pasted into ${activeDay.label}`);
  }

  function publish() {
    setMealPlan(client.id, { days, weeks: weeksCount, startDate: existing?.startDate || new Date().toISOString().slice(0, 10) });
    showToast(`Meal plan saved for ${client.name}`);
    onClose();
  }

  const ring = (label, value, goal) => (
    <div className="text-center">
      <p className="text-black text-lg font-bold tabular-nums">{Math.round(value)}</p>
      <p className="text-black/40 text-[11px]">{label}</p>
      <p className="text-black/25 text-[10px] mt-0.5">Goal: {Math.round(goal)}{label !== "Calories" ? "g" : ""}</p>
    </div>
  );

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[100] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 border-b border-black/8 shrink-0">
          <button onClick={onClose} className="text-black/50 text-sm font-medium">
            Cancel
          </button>
          <span className="text-black font-semibold">Meal Plan Builder</span>
          <button onClick={publish} className="text-black font-bold text-sm">
            Publish
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-black/8 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/5 rounded-xl">
              <button
                type="button"
                onClick={removeLastWeek}
                disabled={weeksCount <= 1}
                className="w-9 h-9 flex items-center justify-center text-black/60 disabled:opacity-30"
              >
                −
              </button>
              <span className="px-2 text-sm font-bold text-black tabular-nums whitespace-nowrap">
                {weeksCount} week{weeksCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={addWeek}
                disabled={weeksCount >= MAX_WEEKS}
                className="w-9 h-9 flex items-center justify-center text-black/60 disabled:opacity-30"
              >
                +
              </button>
            </div>
            <button
              onClick={relabelAsWeekdays}
              title="Rename every day Monday–Sunday automatically"
              className="text-black/40 hover:text-black/70 text-xs font-semibold px-2.5 py-2 rounded-lg"
            >
              Label as Mon–Sun
            </button>
          </div>
          <button
            onClick={autoBuildPlan}
            title="Fill every empty meal slot in the whole plan with the best-fit meal from your library"
            className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shrink-0"
          >
            <Wand2 size={13} /> AUTO-BUILD PLAN
          </button>
        </div>

        {weeksCount > 1 && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-black/8 overflow-x-auto shrink-0">
            {Array.from({ length: weeksCount }, (_, w) => w).map((w) => (
              <button
                key={w}
                onClick={() => selectWeek(w)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  w === activeWeek ? "bg-blue-500 text-white" : "bg-black/5 text-black/50"
                }`}
              >
                Week {w + 1}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/8 overflow-x-auto shrink-0">
          {daysInActiveWeek.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setActiveDayId(d.id);
                setEditingLabel(false);
              }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                d.id === activeDay.id ? "bg-black text-white" : "bg-black/5 text-black/50"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            {editingLabel ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <TextInput
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveLabel()}
                  className="flex-1 min-w-0"
                />
                <button onClick={saveLabel} className="shrink-0 w-9 h-9 flex items-center justify-center bg-black text-white rounded-xl">
                  <Check size={15} />
                </button>
              </div>
            ) : (
              <button onClick={startEditLabel} className="flex items-center gap-1.5 text-black font-semibold text-sm">
                {activeDay.label} <Pencil size={12} className="text-black/30" />
              </button>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={copyDay}
                title="Copy this day's meals"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/5 text-black/50 hover:text-black"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={pasteDay}
                disabled={!clipboard}
                title={clipboard ? "Paste the copied day here" : "Copy a day first"}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/5 text-black/50 hover:text-black disabled:opacity-30"
              >
                <ClipboardPaste size={14} />
              </button>
              <button
                onClick={autoBuildDay}
                title="Fill this day's empty slots with the best-fit meal from your library"
                className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-bold px-3 py-2 rounded-lg"
              >
                <Sparkles size={13} /> AUTO-BUILD DAY
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 bg-black/[0.03] border border-black/8 rounded-2xl p-4 mb-5">
            {ring("Calories", totals.cals, targets.calories)}
            {ring("Protein", totals.protein, targets.protein)}
            {ring("Carbs", totals.carbs, targets.carbs)}
            {ring("Fat", totals.fat, targets.fat)}
          </div>

          <div className="space-y-4">
            {MEAL_SLOTS.map((slot) => (
              <div key={slot}>
                <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">{slot.toUpperCase()}</p>
                <div className="space-y-1.5">
                  {(activeDay.meals[slot] || []).map((mealId, i) => {
                    const m = mealsById[mealId];
                    return (
                      <div key={`${mealId}_${i}`} className="flex items-center gap-3 bg-black/[0.03] rounded-xl px-3 py-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Utensils size={13} className="text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-black text-sm font-medium truncate">{m?.name || "Deleted meal"}</p>
                          {m && (
                            <p className="text-black/40 text-xs">
                              {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                            </p>
                          )}
                        </div>
                        <button onClick={() => removeMeal(slot, i)} className="text-black/25 hover:text-red-500 p-1 shrink-0" aria-label="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPickerSlot(slot)}
                      className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-black/15 rounded-xl py-2.5 text-black/40 text-sm font-medium"
                    >
                      <Plus size={14} /> Add to {slot}
                    </button>
                    <button
                      onClick={() => quickFillSlot(slot)}
                      title="Add the best-fit meal for this slot automatically"
                      className="shrink-0 w-10 flex items-center justify-center border border-dashed border-black/15 rounded-xl text-black/40 hover:text-black"
                    >
                      <Sparkles size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MealPickerSheet
        open={!!pickerSlot}
        onClose={() => setPickerSlot(null)}
        onPick={(mealId) => addMeal(pickerSlot, mealId)}
        meals={meals}
        target={pickerSlot ? slotT[pickerSlot] : null}
      />
    </FullScreenOverlay>
  );
}
