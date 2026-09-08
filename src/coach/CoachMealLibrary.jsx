import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, SecondaryButton, DangerButton, BottomSheet, TextArea, PrimaryButton } from "../components/ui";
import { CreateMealSheet } from "../client/NutritionFeatures";
import { fileToCompressedDataUrl } from "../lib/image";
import { Plus, Utensils, Trash2, Camera, Download, Image as ImageIcon } from "lucide-react";

// Same "paste Name | URL, match by name" bulk pattern as the exercise
// library's Import Video List — for pasting a big batch of sourced meal
// photos in one go instead of one at a time via the per-meal camera button.
function ImportMealPhotosSheet({ open, onClose, showToast }) {
  const { bulkImportMealPhotos } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { matchedCount, unmatched } | null

  function close() {
    setText("");
    setResult(null);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    const raw = text || e.currentTarget.photos?.value || "";
    const pairs = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("|");
        if (i === -1) return null;
        return { name: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
      })
      .filter(Boolean);
    if (pairs.length === 0) {
      showToast("Add at least one line as: Meal Name | photo URL");
      return;
    }
    setBusy(true);
    try {
      const res = await bulkImportMealPhotos(pairs);
      setResult(res);
      if (res.matchedCount > 0) showToast(`Updated ${res.matchedCount} meal${res.matchedCount === 1 ? "" : "s"}`);
    } catch (err) {
      showToast(err.message || "Couldn't import photos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title="Import Meal Photos">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-black/40 text-xs">
          One meal per line: <span className="font-mono text-black/60">Meal Name | photo URL</span>. Names are matched
          exactly (case-insensitive) against your Meal Library.
        </p>
        <TextArea
          rows={10}
          name="photos"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Chicken Breast & Brown Rice with Spinach | https://...\nSalmon & Basmati Rice with Broccoli | https://..."}
          className="font-mono text-xs"
        />
        {result && (
          <div className="bg-black/5 border border-black/10 rounded-xl px-3.5 py-3 text-sm space-y-1.5">
            <p className="text-black font-semibold">
              Matched {result.matchedCount} of {result.matchedCount + result.unmatched.length}
            </p>
            {result.unmatched.length > 0 && (
              <p className="text-black/50 text-xs">No exact name match for: {result.unmatched.join(", ")}</p>
            )}
          </div>
        )}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "IMPORTING…" : "IMPORT PHOTOS"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

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
  const [importPhotosOpen, setImportPhotosOpen] = useState(false);
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
        importedCount > 0
          ? `Synced 200 AU meals — added ${importedCount} new, refreshed the rest (your photos are kept)`
          : "Synced 200 AU meals — names & macros refreshed (your photos are kept)"
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
            onClick={() => setImportPhotosOpen(true)}
            title="Paste a Meal Name | photo URL list to bulk-add photos, same as Import Video List for exercises"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ImageIcon size={16} /> <span className="hidden sm:inline">IMPORT PHOTOS</span>
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
                  {m.mealTypes?.length > 0 && <p className="text-blue-500/70 text-[10px] font-semibold truncate mt-0.5">{m.mealTypes.join(" · ")}</p>}
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
        showMealTypes
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

      <ImportMealPhotosSheet open={importPhotosOpen} onClose={() => setImportPhotosOpen(false)} showToast={showToast} />
    </div>
  );
}
