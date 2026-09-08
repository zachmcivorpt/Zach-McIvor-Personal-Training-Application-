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
import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay, PrimaryButton, TextInput } from "../components/ui";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { X, Plus, Search, Utensils, Trash2, Copy, ClipboardPaste, Sparkles, Wand2, Pencil, Check, RefreshCw, ArrowRightLeft } from "lucide-react";
import { matchPct, bestMatches, eligibleForSlot } from "../lib/mealMatch";

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
    autoSlots: {},
  }));
}

// Backfills weekIndex/weekdayIndex (by position, chunks of 7) onto plans
// saved before the week-structure existed, so grouping + relabeling always
// has something sane to work with without needing a separate legacy path.
function withWeekMeta(days) {
  return days.map((d, i) => ({
    weekIndex: d.weekIndex ?? Math.floor(i / 7),
    weekdayIndex: d.weekdayIndex ?? i % 7,
    autoSlots: d.autoSlots || {},
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

// Excluded ids/keyword come from the coach's own "meals to use" pre-flight
// picker; usedIds is whatever's already placed elsewhere in that same
// day, so Auto-Build never repeats a meal within one day.
function candidatesForSlot(meals, slot, { excludedIds, keyword, usedIds }) {
  const kw = (keyword || "").toLowerCase().trim();
  return meals.filter((m) => {
    if (excludedIds.has(m.id)) return false;
    if (usedIds.has(m.id)) return false;
    if (!eligibleForSlot(m, slot)) return false;
    if (kw && (m.name.toLowerCase().includes(kw) || (m.ingredients || []).some((i) => i.name.toLowerCase().includes(kw)))) return false;
    return true;
  });
}

function MealPickerSheet({ open, onClose, onPick, meals, target, slot, excludeIds }) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const eligible = meals.filter((m) => !excludeIds?.has(m.id) && eligibleForSlot(m, slot));
  const filtered = eligible.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
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
          <p className="text-black/30 text-[11px] mt-2 flex items-center gap-1">
            <Sparkles size={11} /> {target ? "Sorted by best match — " : ""}already-used-today meals are hidden
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {ranked.length === 0 ? (
            <p className="text-black/30 text-sm text-center py-8">
              {eligible.length === 0 ? "No matching meal templates — add some in the Meal Library first." : "No meals match."}
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

// Pre-flight "which meals are fair game" step before Auto-Build runs —
// lets a coach rule out meals/ingredients they don't want suggested
// (e.g. a client dislikes liver, or the coach just doesn't rate a
// template) before the engine picks anything.
function AutoBuildOptionsSheet({ open, onClose, onRun, meals, excludedIds, setExcludedIds, keyword, setKeyword, scopeLabel }) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const filtered = search ? meals.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())) : meals;

  function toggle(id) {
    setExcludedIds((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <p className="text-black font-semibold">Before we auto-build</p>
          <button onClick={onClose} className="text-black/50">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-3 shrink-0 space-y-3">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">EXCLUDE MEALS CONTAINING</p>
            <TextInput value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. liver, tuna (optional)" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-black/40 text-xs tracking-wide">
              {excludedIds.size > 0 ? `${excludedIds.size} meal${excludedIds.size === 1 ? "" : "s"} excluded` : "All meals eligible"}
            </p>
            {excludedIds.size > 0 && (
              <button onClick={() => setExcludedIds(new Set())} className="text-blue-500 text-xs font-semibold">
                Clear exclusions
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5">
            <Search size={15} className="text-black/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search to uncheck specific meals"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <div className="space-y-1">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-3 py-2 text-left border-b border-black/5 last:border-0"
              >
                <div
                  className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center ${
                    excludedIds.has(m.id) ? "border-black/15 bg-white" : "bg-black border-black"
                  }`}
                >
                  {!excludedIds.has(m.id) && <Check size={12} className="text-white" />}
                </div>
                <span className={`text-sm truncate ${excludedIds.has(m.id) ? "text-black/30 line-through" : "text-black"}`}>{m.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-black/30 text-sm text-center py-6">No meals match.</p>}
          </div>
        </div>
        <div className="px-5 pt-3 pb-5 border-t border-black/8 shrink-0">
          <PrimaryButton className="w-full" onClick={onRun}>
            <Wand2 size={15} /> {scopeLabel}
          </PrimaryButton>
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
  const [movingMeal, setMovingMeal] = useState(null); // { slot, index } currently choosing a new slot for
  const [clipboard, setClipboard] = useState(null); // copied day's meals object, or null
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [excludeKeyword, setExcludeKeyword] = useState("");
  const [optionsScope, setOptionsScope] = useState(null); // "day" | "plan" | null
  const dragRef = useRef(null); // { slot, index } of the row currently being dragged
  // Persists across the whole builder session (not per-day) so calling
  // Auto-Build on day after day cycles through different best-fit meals
  // instead of the identical #1 match every single time.
  const rotationRef = useRef({ Breakfast: 0, Lunch: 0, Dinner: 0, Snacks: 0 });

  const weeksCount = useMemo(() => {
    const idxs = days.map((d) => d.weekIndex ?? 0);
    return idxs.length ? Math.max(...idxs) + 1 : 1;
  }, [days]);

  const daysInActiveWeek = days.filter((d) => (d.weekIndex ?? 0) === activeWeek);
  const activeDay = days.find((d) => d.id === activeDayId) || daysInActiveWeek[0] || days[0];
  const targets = resolveNutritionTargets(client.nutritionTargets);
  const totals = dayTotals(activeDay, mealsById);
  const usedInActiveDay = new Set(MEAL_SLOTS.flatMap((s) => activeDay.meals[s] || []));

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

  // Copies the active week's meals into a brand new week appended to the
  // plan — e.g. build Week 1 once, then repeat it across the rest of a
  // 4-week plan instead of rebuilding each week from scratch.
  function duplicateWeek() {
    if (weeksCount >= MAX_WEEKS) {
      showToast(`Plans can only go up to ${MAX_WEEKS} weeks`);
      return;
    }
    const sourceWeekLabel = activeWeek + 1;
    const newIndex = weeksCount;
    const newDays = daysInActiveWeek.map((d, i) => {
      const wd = d.weekdayIndex ?? i;
      return {
        id: `day_${Date.now()}_${newIndex}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        label: DAY_NAMES[wd % 7],
        weekIndex: newIndex,
        weekdayIndex: wd,
        meals: JSON.parse(JSON.stringify(d.meals)),
        autoSlots: {},
      };
    });
    setDays((list) => [...list, ...newDays]);
    selectWeek(newIndex);
    showToast(`Duplicated Week ${sourceWeekLabel} into new Week ${newIndex + 1}`);
  }

  function updateActiveDay(fn) {
    setDays((list) => list.map((d) => (d.id === activeDay.id ? fn(d) : d)));
  }

  function addMeal(slot, mealId) {
    if (usedInActiveDay.has(mealId)) {
      showToast("That meal's already used elsewhere today");
      return;
    }
    updateActiveDay((d) => ({
      ...d,
      meals: { ...d.meals, [slot]: [...(d.meals[slot] || []), mealId] },
      autoSlots: { ...d.autoSlots, [slot]: false },
    }));
    setPickerSlot(null);
  }

  function removeMeal(slot, index) {
    updateActiveDay((d) => ({
      ...d,
      meals: { ...d.meals, [slot]: d.meals[slot].filter((_, i) => i !== index) },
      autoSlots: { ...d.autoSlots, [slot]: false },
    }));
  }

  function moveMeal(fromSlot, index, toSlot) {
    if (fromSlot === toSlot) {
      setMovingMeal(null);
      return;
    }
    updateActiveDay((d) => {
      const mealId = d.meals[fromSlot][index];
      if ((d.meals[toSlot] || []).includes(mealId)) {
        showToast(`Already in ${toSlot} today`);
        return d;
      }
      return {
        ...d,
        meals: {
          ...d.meals,
          [fromSlot]: d.meals[fromSlot].filter((_, i) => i !== index),
          [toSlot]: [...(d.meals[toSlot] || []), mealId],
        },
        autoSlots: { ...d.autoSlots, [fromSlot]: false, [toSlot]: false },
      };
    });
    setMovingMeal(null);
  }

  // "Remaining budget" targeting: instead of matching every slot to a
  // fixed % share of the day (which lets each slot's own miss compound
  // into the day's total being way off target), each pick chases
  // whatever's actually left of the daily target after every OTHER slot
  // already assigned — so the day's total genuinely converges on the
  // client's real calories/macros instead of 4 independently-approximate
  // slots.
  function remainingTarget(day, excludeSlots) {
    const other = dayTotals(
      { meals: Object.fromEntries(MEAL_SLOTS.map((s) => [s, excludeSlots.includes(s) ? [] : day.meals[s] || []])) },
      mealsById
    );
    return {
      calories: Math.max(0, targets.calories - other.cals),
      protein: Math.max(0, targets.protein - other.protein),
      carbs: Math.max(0, targets.carbs - other.carbs),
      fat: Math.max(0, targets.fat - other.fat),
    };
  }

  function quickFillSlot(slot) {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      return;
    }
    const usedIds = new Set(MEAL_SLOTS.flatMap((s) => activeDay.meals[s] || []));
    const target = remainingTarget(activeDay, [slot]);
    const candidates = candidatesForSlot(meals, slot, { excludedIds, keyword: excludeKeyword, usedIds });
    const top = bestMatches(candidates, target, 1)[0];
    if (top) addMeal(slot, top.meal.id);
    else showToast(`No eligible ${slot} meal found — check your exclusions or Meal Library tags`);
  }

  function regenerateSlot(slot) {
    if (meals.length === 0) return;
    const usedIds = new Set(MEAL_SLOTS.filter((s) => s !== slot).flatMap((s) => activeDay.meals[s] || []));
    const target = remainingTarget(activeDay, [slot]);
    const candidates = candidatesForSlot(meals, slot, { excludedIds, keyword: excludeKeyword, usedIds });
    if (candidates.length === 0) {
      showToast(`No other eligible ${slot} meal to swap in`);
      return;
    }
    const ranked = bestMatches(candidates, target);
    const idx = rotationRef.current[slot] % ranked.length;
    rotationRef.current[slot] += 1;
    const pick = ranked[idx].meal;
    updateActiveDay((d) => ({ ...d, meals: { ...d.meals, [slot]: [pick.id] }, autoSlots: { ...d.autoSlots, [slot]: true } }));
  }

  // Fills every empty slot AND rerolls every slot already marked auto —
  // so calling this again on an already-built day is exactly "regenerate":
  // manual picks are never touched, only auto-generated ones cycle to a
  // fresh best-fit option. Processes slots in order, subtracting each
  // pick from the running remaining budget so the LAST slot filled is
  // chasing whatever's truly left — the day's total ends up matching the
  // client's actual daily target, not just each slot hitting its own
  // isolated 25/35/30/10% slice.
  function fillDay(day) {
    const nextMeals = { ...day.meals };
    const nextAuto = { ...(day.autoSlots || {}) };
    const usedIds = new Set();
    const toFill = [];
    MEAL_SLOTS.forEach((slot) => {
      const isAuto = day.autoSlots?.[slot];
      const isEmpty = (day.meals[slot] || []).length === 0;
      if (!isAuto && !isEmpty) (day.meals[slot] || []).forEach((id) => usedIds.add(id));
      else toFill.push(slot);
    });

    let remaining = remainingTarget(day, toFill);
    let shareLeft = toFill.reduce((sum, s) => sum + SLOT_SPLIT[s], 0);
    let changed = 0;
    toFill.forEach((slot) => {
      const share = shareLeft > 0 ? SLOT_SPLIT[slot] / shareLeft : 0;
      const target = {
        calories: Math.max(0, remaining.calories * share),
        protein: Math.max(0, remaining.protein * share),
        carbs: Math.max(0, remaining.carbs * share),
        fat: Math.max(0, remaining.fat * share),
      };
      shareLeft -= SLOT_SPLIT[slot];
      const candidates = candidatesForSlot(meals, slot, { excludedIds, keyword: excludeKeyword, usedIds });
      if (candidates.length === 0) return;
      const ranked = bestMatches(candidates, target);
      const idx = rotationRef.current[slot] % ranked.length;
      rotationRef.current[slot] += 1;
      const pick = ranked[idx].meal;
      nextMeals[slot] = [pick.id];
      nextAuto[slot] = true;
      usedIds.add(pick.id);
      changed += 1;
      remaining = {
        calories: remaining.calories - (pick.cals || 0),
        protein: remaining.protein - (pick.protein || 0),
        carbs: remaining.carbs - (pick.carbs || 0),
        fat: remaining.fat - (pick.fat || 0),
      };
    });
    return { day: { ...day, meals: nextMeals, autoSlots: nextAuto }, changed };
  }

  function runAutoBuildDay() {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      setOptionsScope(null);
      return;
    }
    const { day: nextDay, changed } = fillDay(activeDay);
    setDays((list) => list.map((d) => (d.id === activeDay.id ? nextDay : d)));
    setOptionsScope(null);
    showToast(changed > 0 ? `Built ${changed} slot${changed === 1 ? "" : "s"} for ${activeDay.label}` : `Nothing eligible to fill for ${activeDay.label} — check your exclusions`);
  }

  function runAutoBuildPlan() {
    if (meals.length === 0) {
      showToast("Add some meals to your Meal Library first");
      setOptionsScope(null);
      return;
    }
    let total = 0;
    setDays((list) =>
      list.map((d) => {
        const { day: nextDay, changed } = fillDay(d);
        total += changed;
        return nextDay;
      })
    );
    setOptionsScope(null);
    showToast(total > 0 ? `Built ${total} meal slot${total === 1 ? "" : "s"} across the whole plan` : "Nothing eligible to fill — check your exclusions");
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
    updateActiveDay((d) => ({ ...d, meals: JSON.parse(JSON.stringify(clipboard)), autoSlots: {} }));
    showToast(`Pasted into ${activeDay.label}`);
  }

  function publish() {
    setMealPlan(client.id, { days, weeks: weeksCount, startDate: existing?.startDate || new Date().toISOString().slice(0, 10) });
    showToast(`Meal plan saved for ${client.name}`);
    onClose();
  }

  const dayHasAuto = MEAL_SLOTS.some((s) => activeDay.autoSlots?.[s]);

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
            <button
              onClick={duplicateWeek}
              disabled={weeksCount >= MAX_WEEKS}
              title="Copy this week's meals into a brand new week"
              className="flex items-center gap-1 text-black/40 hover:text-black/70 disabled:opacity-30 text-xs font-semibold px-2.5 py-2 rounded-lg"
            >
              <Copy size={12} /> Duplicate Week
            </button>
          </div>
          <button
            onClick={() => setOptionsScope("plan")}
            title="Fill every empty slot in the whole plan, and reroll any already auto-built ones, with the best-fit meals from your library"
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
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
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
                onClick={() => setOptionsScope("day")}
                title={dayHasAuto ? "Reroll this day's auto-built slots (manual picks are left alone)" : "Fill this day's empty slots with the best-fit meal from your library"}
                className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-bold px-3 py-2 rounded-lg"
              >
                {dayHasAuto ? <RefreshCw size={13} /> : <Sparkles size={13} />} {dayHasAuto ? "REGENERATE DAY" : "AUTO-BUILD DAY"}
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
              <div
                key={slot}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragRef.current) moveMeal(dragRef.current.slot, dragRef.current.index, slot);
                  dragRef.current = null;
                }}
              >
                <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">{slot.toUpperCase()}</p>
                <div className="space-y-1.5">
                  {(activeDay.meals[slot] || []).map((mealId, i) => {
                    const m = mealsById[mealId];
                    return (
                      <div
                        key={`${mealId}_${i}`}
                        draggable
                        onDragStart={() => {
                          dragRef.current = { slot, index: i };
                        }}
                        className="flex items-center gap-3 bg-black/[0.03] rounded-xl px-3 py-2.5"
                      >
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
                        {activeDay.autoSlots?.[slot] && (
                          <button
                            onClick={() => regenerateSlot(slot)}
                            title="Swap for a different suggestion"
                            className="text-black/25 hover:text-black p-1 shrink-0"
                            aria-label="Regenerate"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setMovingMeal({ slot, index: i })}
                          title="Move to a different slot"
                          className="text-black/25 hover:text-black p-1 shrink-0"
                          aria-label="Move"
                        >
                          <ArrowRightLeft size={13} />
                        </button>
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
        target={pickerSlot ? remainingTarget(activeDay, [pickerSlot]) : null}
        slot={pickerSlot}
        excludeIds={usedInActiveDay}
      />

      <AutoBuildOptionsSheet
        open={!!optionsScope}
        onClose={() => setOptionsScope(null)}
        onRun={optionsScope === "day" ? runAutoBuildDay : runAutoBuildPlan}
        meals={meals}
        excludedIds={excludedIds}
        setExcludedIds={setExcludedIds}
        keyword={excludeKeyword}
        setKeyword={setExcludeKeyword}
        scopeLabel={optionsScope === "day" ? `BUILD ${activeDay.label.toUpperCase()}` : "AUTO-BUILD PLAN"}
      />

      {movingMeal && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center px-6" onClick={() => setMovingMeal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <p className="text-black font-semibold mb-3">Move to...</p>
            <div className="space-y-1.5">
              {MEAL_SLOTS.filter((s) => s !== movingMeal.slot).map((s) => (
                <button
                  key={s}
                  onClick={() => moveMeal(movingMeal.slot, movingMeal.index, s)}
                  className="w-full text-left bg-black/5 hover:bg-black/10 rounded-xl px-3.5 py-2.5 text-sm font-medium text-black"
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={() => setMovingMeal(null)} className="w-full text-center text-black/40 text-sm font-medium mt-3">
              Cancel
            </button>
          </div>
        </div>
      )}
    </FullScreenOverlay>
  );
}
