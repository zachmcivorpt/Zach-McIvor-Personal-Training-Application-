import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, SecondaryButton, DangerButton } from "../components/ui";
import { CreateMealSheet } from "../client/NutritionFeatures";
import { fileToCompressedDataUrl } from "../lib/image";
import { Plus, Utensils, Trash2, Camera, Download } from "lucide-react";

// A meal's photo is attached separately from the ingredient builder (its
// own small upload button on the card) rather than inside CreateMealSheet
// — lets a coach snap/attach a photo for the 200 imported AU meals without
// having to open and re-save the whole ingredient list.
function MealPhotoButton({ meal, showToast }) {
  const { updateMasterMeal } = useApp();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    e.stopPropagation();
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 500, 0.75);
      updateMasterMeal(meal.id, { photoUrl: dataUrl });
      showToast("Photo added");
    } catch {
      showToast("Couldn't read that photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          fileRef.current?.click();
        }}
        disabled={busy}
        className="w-7 h-7 shrink-0 flex items-center justify-center text-black/25 hover:text-black/60 disabled:opacity-40"
        aria-label={`${meal.photoUrl ? "Change" : "Add"} photo for ${meal.name}`}
        title={meal.photoUrl ? "Change photo" : "Add a photo"}
      >
        <Camera size={14} />
      </button>
    </>
  );
}

export default function CoachMealLibrary({ showToast }) {
  const { db, createMasterMeal, updateMasterMeal, deleteMasterMeal, importFitnessMealsAU } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | meal | null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importing, setImporting] = useState(false);
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

  async function handleImportAU() {
    setImporting(true);
    try {
      const { importedCount } = await importFitnessMealsAU();
      showToast(
        importedCount === 0
          ? "Already imported — nothing new to add"
          : `Imported ${importedCount} Australian fitness meal${importedCount === 1 ? "" : "s"} — add photos any time`
      );
    } catch (err) {
      showToast(err.message || "Couldn't import the meal list");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-black/40 text-sm">{meals.length} total · reusable meals suggested to any client</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleImportAU}
            disabled={importing}
            title="Imports 200 common Australian fitness meals (real Coles/Woolworths-style ingredients, computed macros) — add photos afterwards"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 disabled:opacity-50 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Download size={16} /> <span className="hidden sm:inline">{importing ? "IMPORTING…" : "IMPORT 200 AU MEALS"}</span>
          </button>
          <button
            onClick={() => setEditing({ isNew: true })}
            aria-label="New meal"
            className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
          >
            <Plus size={16} /> <span className="hidden sm:inline">NEW MEAL</span>
          </button>
        </div>
      </div>

      {meals.length === 0 ? (
        <Card>
          <p className="text-black/40 text-sm text-center py-6">No meal templates yet — build your first one, or import the AU meal set above.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {meals.map((m) => (
            <Card key={m.id} onClick={() => setEditing(m)}>
              <div className="flex items-center gap-3">
                {m.photoUrl ? (
                  <img src={m.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <Utensils size={16} className="text-blue-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-black font-semibold text-sm truncate">{m.name}</p>
                  <p className="text-black/40 text-xs truncate mt-0.5">
                    {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                  </p>
                </div>
                <MealPhotoButton meal={m} showToast={showToast} />
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
