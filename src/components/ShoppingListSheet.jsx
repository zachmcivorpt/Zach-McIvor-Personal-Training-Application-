// A screenshot-friendly weekly shopping list generated live from a
// client's meal plan — shown to both the client (Nutrition tab, right
// next to "My Meal Plan") and the coach (client's Nutrition panel). It's
// computed on every open from the plan's current data, never stored, so
// it's automatically up to date the instant a coach creates or edits a
// plan — nothing to regenerate by hand.
import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { buildShoppingList, weeksCountOf, currentWeekIndex, daysInWeek, CATEGORY_ORDER } from "../lib/shoppingList";

const CATEGORY_ICONS = {
  "Meat & Poultry": "🥩",
  Seafood: "🐟",
  "Dairy & Eggs": "🥚",
  "Fruit & Veg": "🥦",
  "Grains & Bread": "🍞",
  "Pantry & Nuts": "🥜",
  "Treats & Snacks": "🍫",
  Other: "🛒",
};

export function ShoppingListSheet({ open, onClose, plan, mealsById, clientName, dark = false }) {
  const [week, setWeek] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  if (!open || !plan) return null;

  const weeksCount = weeksCountOf(plan.days);
  const activeWeek = week != null ? week : currentWeekIndex(plan.startDate, weeksCount);
  const weekDays = daysInWeek(plan.days, activeWeek);
  const items = buildShoppingList(weekDays, mealsById);
  const grouped = {};
  items.forEach((it) => {
    (grouped[it.category] = grouped[it.category] || []).push(it);
  });

  function toggle(id) {
    setChecked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectWeek(w) {
    setWeek(w);
    setChecked(new Set());
  }

  const sheetBg = dark ? "#141414" : "#FFFFFF";
  // The header stays a fixed dark bar regardless of the sheet's own theme —
  // same "always-dark kicker" treatment as the rest bar / PR toast.
  const headerBg = "bg-black";
  const headerText = "text-white";
  const headerMuted = "text-white/50";
  const headerMutedHover = "hover:text-white";
  const divider = dark ? "border-white/8" : "border-black/8";
  const primaryText = dark ? "text-white" : "text-black";
  const muted40 = dark ? "text-white/40" : "text-black/40";
  const muted30 = dark ? "text-white/30" : "text-black/30";
  const muted25 = dark ? "text-white/25" : "text-black/25";
  const rowBg = dark ? "bg-white/[0.06]" : "bg-black/[0.03]";
  const inactiveWeekPill = dark ? "bg-white/8 text-white/50" : "bg-black/5 text-black/50";

  return (
    <div className="fixed inset-0 z-[140] bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[88vh] flex flex-col overflow-hidden"
        style={{ backgroundColor: sheetBg }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${headerBg} ${headerText} px-5 pt-6 pb-5 shrink-0 relative`}>
          <button onClick={onClose} className={`absolute top-4 right-4 ${headerMuted} ${headerMutedHover}`}>
            <X size={20} />
          </button>
          <p className={`${headerMuted} text-[11px] font-semibold tracking-widest uppercase`}>Weekly Shopping List</p>
          <p className={`${headerText} text-xl font-bold mt-1`}>{clientName ? `${clientName}'s Groceries` : "Groceries"}</p>
          <p className={`${headerMuted} text-xs mt-1.5`}>
            {weeksCount > 1 ? `Week ${activeWeek + 1} of ${weeksCount}` : "This week's plan"} · {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>

        {weeksCount > 1 && (
          <div className={`flex items-center gap-2 px-5 py-3 border-b ${divider} overflow-x-auto shrink-0`}>
            {Array.from({ length: weeksCount }, (_, w) => w).map((w) => (
              <button
                key={w}
                onClick={() => selectWeek(w)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  w === activeWeek ? "bg-blue-500 text-white" : inactiveWeekPill
                }`}
              >
                Week {w + 1}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className={`${muted30} text-sm text-center py-10`}>No meals assigned this week yet.</p>
          ) : (
            <div className="space-y-5">
              {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
                <div key={cat}>
                  <p className={`${muted40} text-[11px] font-bold tracking-wide mb-2 flex items-center gap-1.5`}>
                    <span>{CATEGORY_ICONS[cat]}</span> {cat.toUpperCase()}
                  </p>
                  <div className="space-y-1.5">
                    {grouped[cat].map((it) => {
                      const isChecked = checked.has(it.id);
                      return (
                        <button
                          key={it.id}
                          onClick={() => toggle(it.id)}
                          className={`w-full flex items-center gap-3 ${rowBg} rounded-xl px-3.5 py-2.5 text-left`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center ${
                              isChecked ? (dark ? "bg-white border-white" : "bg-black border-black") : dark ? "border-white/20" : "border-black/20"
                            }`}
                          >
                            {isChecked && <Check size={12} className={dark ? "text-black" : "text-white"} />}
                          </div>
                          <p className={`flex-1 min-w-0 text-sm truncate ${isChecked ? `${muted30} line-through` : primaryText}`}>{it.name}</p>
                          <p className={`text-xs font-bold shrink-0 ${isChecked ? muted25 : "text-blue-500"}`}>{it.qtyLabel}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`px-5 py-3 border-t ${divider} shrink-0 text-center`}>
          <p className={`${muted25} text-[10px] tracking-wide`}>GENERATED FROM YOUR MEAL PLAN · APEX COACHING</p>
        </div>
      </div>
    </div>
  );
}
