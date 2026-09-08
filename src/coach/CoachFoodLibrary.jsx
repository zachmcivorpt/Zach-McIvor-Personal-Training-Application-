import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, BottomSheet, Field, TextInput, PrimaryButton, DangerButton, SecondaryButton } from "../components/ui";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { fileToCompressedDataUrl } from "../lib/image";
import { Plus, Search, Apple, Trash2, Camera, Download } from "lucide-react";

function emptyFood() {
  return { name: "", cals: "", protein: "", carbs: "", fat: "", imageUrl: "" };
}

function FoodSheet({ food, open, onClose, showToast }) {
  const { createFood, updateFood, deleteFood } = useApp();
  const [form, setForm] = useState(() => (food ? { ...emptyFood(), ...food } : emptyFood()));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 500, 0.75);
      set("imageUrl", dataUrl);
    } catch {
      showToast("Couldn't read that photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      cals: Number(form.cals) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      imageUrl: form.imageUrl || "",
    };
    if (food) {
      updateFood(food.id, data);
      showToast("Food updated");
    } else {
      createFood(data);
      showToast("Food added");
    }
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={food ? "Edit Food" : "Add Food"}>
      <form onSubmit={submit} className="space-y-4">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center gap-3 bg-black/5 border border-dashed border-black/15 rounded-xl px-3.5 py-3"
        >
          {form.imageUrl ? (
            <img src={form.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-black/8 flex items-center justify-center shrink-0">
              <Camera size={16} className="text-black/40" />
            </div>
          )}
          <span className="text-black/50 text-sm font-medium">
            {photoBusy ? "Reading photo..." : form.imageUrl ? "Change photo" : "Add a photo"}
          </span>
        </button>
        <Field label="FOOD NAME" hint="Include the serving size, e.g. Chicken Breast (150g)">
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Chicken Breast (150g)" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CALORIES">
            <TextInput type="number" min={0} value={form.cals} onChange={(e) => set("cals", e.target.value)} placeholder="0" required />
          </Field>
          <Field label="PROTEIN (G)">
            <TextInput type="number" min={0} value={form.protein} onChange={(e) => set("protein", e.target.value)} placeholder="0" />
          </Field>
          <Field label="CARBS (G)">
            <TextInput type="number" min={0} value={form.carbs} onChange={(e) => set("carbs", e.target.value)} placeholder="0" />
          </Field>
          <Field label="FAT (G)">
            <TextInput type="number" min={0} value={form.fat} onChange={(e) => set("fat", e.target.value)} placeholder="0" />
          </Field>
        </div>

        <PrimaryButton type="submit" className="w-full">
          {food ? "SAVE CHANGES" : "ADD FOOD"}
        </PrimaryButton>

        {food && (
          <div>
            {!confirmDelete ? (
              <DangerButton type="button" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete food
              </DangerButton>
            ) : (
              <div className="flex gap-2">
                <SecondaryButton type="button" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </SecondaryButton>
                <DangerButton
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    deleteFood(food.id);
                    showToast("Food deleted");
                    onClose();
                  }}
                >
                  Confirm delete
                </DangerButton>
              </div>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}

export default function CoachFoodLibrary({ showToast }) {
  const { db, importBuiltInFoods } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | food | null
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const customFoods = db.customFoods || [];
  const customIds = new Set(customFoods.map((f) => f.id));
  // Once a built-in food is imported it becomes a real, editable customFoods
  // doc with the same id — drop it from the read-only list below so it
  // doesn't show up twice (editable version above, locked version below).
  const remainingBuiltIn = FOOD_DATABASE.filter((f) => !customIds.has(f.id));

  const q = search.toLowerCase();
  const filteredCustom = customFoods.filter((f) => f.name.toLowerCase().includes(q));
  const filteredBase = remainingBuiltIn.filter((f) => f.name.toLowerCase().includes(q));

  async function handleImport() {
    setImporting(true);
    try {
      const { importedCount } = await importBuiltInFoods();
      showToast(
        importedCount === 0
          ? "Already imported — nothing new to add"
          : `Imported ${importedCount} built-in food${importedCount === 1 ? "" : "s"} — now fully editable`
      );
    } catch (err) {
      showToast(err.message || "Couldn't import the built-in foods");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-black/40 text-sm">
          {customFoods.length} custom · {remainingBuiltIn.length} built-in not yet imported
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {remainingBuiltIn.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              title="Turns every built-in food into a real, editable entry (add a photo, fix macros) here in your library"
              className="flex items-center gap-2 bg-black/8 hover:bg-black/15 disabled:opacity-50 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Download size={16} /> <span className="hidden sm:inline">{importing ? "IMPORTING…" : "MAKE BUILT-INS EDITABLE"}</span>
            </button>
          )}
          <button onClick={() => setEditing({ isNew: true })} aria-label="Add food" className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0">
            <Plus size={16} /> <span className="hidden sm:inline">ADD FOOD</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5 mb-5 md:max-w-sm">
        <Search size={16} className="text-black/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search foods"
          className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
        />
      </div>

      {filteredCustom.length > 0 && (
        <>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">YOUR CUSTOM FOODS</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mb-6">
            {filteredCustom.map((f) => (
              <Card key={f.id} onClick={() => setEditing(f)}>
                <div className="flex items-center gap-3">
                  {f.imageUrl ? (
                    <img src={f.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <Apple size={16} className="text-blue-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-black font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-black/40 text-xs truncate mt-0.5">
                      {f.cals} cal · {f.protein}p / {f.carbs}c / {f.fat}f
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {filteredBase.length > 0 && (
        <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">
          BUILT-IN LIBRARY — READ-ONLY UNTIL IMPORTED
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {filteredBase.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/8 flex items-center justify-center shrink-0">
                <Apple size={16} className="text-black/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black font-semibold text-sm truncate">{f.name}</p>
                <p className="text-black/40 text-xs truncate mt-0.5">
                  {f.cals} cal · {f.protein}p / {f.carbs}c / {f.fat}f
                </p>
              </div>
            </div>
          </Card>
        ))}
        {filteredCustom.length === 0 && filteredBase.length === 0 && (
          <p className="text-black/30 text-xs col-span-full text-center py-6">No foods match.</p>
        )}
      </div>

      {editing && <FoodSheet food={editing.isNew ? null : editing} open={!!editing} onClose={() => setEditing(null)} showToast={showToast} />}
    </div>
  );
}
