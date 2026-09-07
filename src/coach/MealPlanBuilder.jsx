// Coach-side meal plan builder — day-tabbed, meal-slot editor for
// assigning a client a structured eating plan built from the Meal
// Library (masterMeals), modeled on Trainerize's own "Meal Plan Builder"
// (day tabs across the top, Breakfast/Lunch/Dinner/Snack drop zones, a
// calorie/macro goal readout for the day). Tap-to-add/remove rather than
// true drag-and-drop — simpler and works the same on a coach's phone.
import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay, PrimaryButton, SecondaryButton, TextInput } from "../components/ui";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { X, Plus, Search, Utensils, Trash2 } from "lucide-react";

const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

function emptyDay(n) {
  return { id: `day_${Date.now()}_${n}`, label: `Day ${n}`, meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] } };
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
  return total;
}

function MealPickerSheet({ open, onClose, onPick, meals }) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const filtered = meals.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

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
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {filtered.length === 0 ? (
            <p className="text-black/30 text-sm text-center py-8">
              {meals.length === 0 ? "No meal templates yet — add some in the Meal Library first." : "No meals match."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((m) => (
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
  const [days, setDays] = useState(() => (existing?.days?.length ? existing.days : [emptyDay(1)]));
  const [activeDayId, setActiveDayId] = useState(days[0].id);
  const [pickerSlot, setPickerSlot] = useState(null); // meal slot name currently adding to, or null

  const activeDay = days.find((d) => d.id === activeDayId) || days[0];
  const targets = resolveNutritionTargets(client.nutritionTargets);
  const totals = dayTotals(activeDay, mealsById);

  function addDay() {
    const next = emptyDay(days.length + 1);
    setDays((d) => [...d, next]);
    setActiveDayId(next.id);
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

  function publish() {
    setMealPlan(client.id, days);
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

        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/8 overflow-x-auto shrink-0">
          {days.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDayId(d.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                d.id === activeDay.id ? "bg-black text-white" : "bg-black/5 text-black/50"
              }`}
            >
              {d.label}
            </button>
          ))}
          <button onClick={addDay} className="shrink-0 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black/50">
            <Plus size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
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
                  <button
                    onClick={() => setPickerSlot(slot)}
                    className="w-full flex items-center justify-center gap-1.5 border border-dashed border-black/15 rounded-xl py-2.5 text-black/40 text-sm font-medium"
                  >
                    <Plus size={14} /> Add to {slot}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MealPickerSheet open={!!pickerSlot} onClose={() => setPickerSlot(null)} onPick={(mealId) => addMeal(pickerSlot, mealId)} meals={meals} />
    </FullScreenOverlay>
  );
}
