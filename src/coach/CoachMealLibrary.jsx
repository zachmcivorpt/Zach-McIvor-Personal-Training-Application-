import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, SecondaryButton, DangerButton } from "../components/ui";
import { CreateMealSheet } from "../client/NutritionFeatures";
import { Plus, Utensils, Trash2 } from "lucide-react";

export default function CoachMealLibrary({ showToast }) {
  const { db, createMasterMeal, updateMasterMeal, deleteMasterMeal } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | meal | null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const meals = db.masterMeals || [];

  function handleSave(data) {
    if (editing?.id) {
      updateMasterMeal(editing.id, data);
      showToast("Meal template updated");
    } else {
      createMasterMeal(data);
      showToast("Meal template created");
    }
    setEditing(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-black/40 text-sm">{meals.length} total · reusable meals suggested to any client</p>
        <button
          onClick={() => setEditing({ isNew: true })}
          aria-label="New meal"
          className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">NEW MEAL</span>
        </button>
      </div>

      {meals.length === 0 ? (
        <Card>
          <p className="text-black/40 text-sm text-center py-6">No meal templates yet — build your first one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {meals.map((m) => (
            <Card key={m.id} onClick={() => setEditing(m)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Utensils size={16} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-black font-semibold text-sm truncate">{m.name}</p>
                  <p className="text-black/40 text-xs truncate mt-0.5">
                    {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(m);
                  }}
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-black/25 hover:text-black/60"
                  aria-label={`Delete ${m.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateMealSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        prefill={editing && !editing.isNew ? editing : null}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center px-6" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-black font-semibold mb-1">Delete "{confirmDelete.name}"?</p>
            <p className="text-black/40 text-sm mb-4">This can't be undone.</p>
            <div className="flex gap-2">
              <SecondaryButton className="flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </SecondaryButton>
              <DangerButton
                className="flex-1"
                onClick={() => {
                  deleteMasterMeal(confirmDelete.id);
                  showToast("Meal template deleted");
                  setConfirmDelete(null);
                }}
              >
                Delete
              </DangerButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
