import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { BottomSheet, Field, TextInput, PrimaryButton, DangerButton, SecondaryButton } from "../components/ui";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { matchesSearch } from "../lib/search";
import { CLIENT_DARK_BORDER, MEASURE_BLUE } from "../theme";
import { DarkPanel } from "./darkUI";
import { Plus, Search, Apple, Trash2, Download } from "lucide-react";

function emptyFood() {
  // `per` left blank rather than defaulted to "100" so the placeholder
  // (showing "100") stays visibly distinct from a coach having actually
  // typed 100 — same UX as QuickAddFoodSheet's own serving-size field.
  return { name: "", cals: "", protein: "", carbs: "", fat: "", per: "" };
}

export function FoodSheet({ food, open, onClose, showToast }) {
  const { createFood, updateFood, deleteFood } = useApp();
  const [form, setForm] = useState(() => (food ? { ...emptyFood(), ...food, per: food.per ?? "" } : emptyFood()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e) {
    e.preventDefault();
    // Same convention as QuickAddFoodSheet (the client-side equivalent of
    // this form): the macros typed in are for whatever serving size the
    // coach enters here, not always 100g — a real production gap this
    // closes was this form having no serving-size field at all, silently
    // defaulting every coach-added food to "per 100g" regardless of what
    // the coach actually typed the macros for.
    const per = Math.max(1, Math.round(Number(form.per)) || 100);
    const data = {
      name: form.name.trim(),
      cals: Math.max(0, Number(form.cals) || 0),
      protein: Math.max(0, Number(form.protein) || 0),
      carbs: Math.max(0, Number(form.carbs) || 0),
      fat: Math.max(0, Number(form.fat) || 0),
      per,
      defaultQty: per,
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
        <Field label="FOOD NAME">
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Chicken Breast" required />
        </Field>
        <Field label="SERVING SIZE THE MACROS BELOW ARE FOR (GRAMS)" hint="e.g. if the label is 165 kcal per 150g, set this to 150 and calories to 165 — clients logging more or less of this food will scale automatically.">
          <TextInput type="number" min={1} value={form.per} onChange={(e) => set("per", e.target.value)} placeholder="100" />
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

  const filteredCustom = customFoods.filter((f) => matchesSearch(f.name, search));
  const filteredBase = remainingBuiltIn.filter((f) => matchesSearch(f.name, search));

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
        <p className="text-white text-sm">
          {customFoods.length} custom · {remainingBuiltIn.length} built-in not yet imported
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {remainingBuiltIn.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              title="Turns every built-in food into a real, editable entry (fix macros) here in your library"
              className="flex items-center gap-2 bg-white/8 hover:bg-white/15 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Download size={16} /> <span className="hidden sm:inline">{importing ? "IMPORTING…" : "MAKE BUILT-INS EDITABLE"}</span>
            </button>
          )}
          <button
            onClick={() => setEditing({ isNew: true })}
            aria-label="Add food"
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl shrink-0 hover:opacity-90 transition-opacity"
          >
            <Plus size={16} /> <span className="hidden sm:inline">ADD FOOD</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white/8 border rounded-xl px-3 py-2.5 mb-5 md:max-w-sm" style={{ borderColor: CLIENT_DARK_BORDER }}>
        <Search size={16} className="text-white" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search foods"
          className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white"
        />
      </div>

      {filteredCustom.length > 0 && (
        <>
          <p className="text-white text-[11px] font-semibold tracking-wide mb-2">YOUR CUSTOM FOODS</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mb-6">
            {filteredCustom.map((f) => (
              <DarkPanel key={f.id} chamfer className="active:scale-[0.98] transition-transform">
                <div onClick={() => setEditing(f)} className="relative flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.03] transition-colors">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
                  >
                    <Apple size={16} style={{ color: MEASURE_BLUE }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-white text-xs truncate mt-0.5">
                      {f.cals} cal · {f.protein}p / {f.carbs}c / {f.fat}f
                    </p>
                  </div>
                </div>
              </DarkPanel>
            ))}
          </div>
        </>
      )}

      {filteredBase.length > 0 && (
        <p className="text-white text-[11px] font-semibold tracking-wide mb-2">
          BUILT-IN LIBRARY — READ-ONLY UNTIL IMPORTED
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {filteredBase.map((f) => (
          <DarkPanel key={f.id} chamfer>
            <div className="relative flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: CLIENT_DARK_BORDER }}>
                <Apple size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{f.name}</p>
                <p className="text-white text-xs truncate mt-0.5">
                  {f.cals} cal · {f.protein}p / {f.carbs}c / {f.fat}f
                </p>
              </div>
            </div>
          </DarkPanel>
        ))}
        {filteredCustom.length === 0 && filteredBase.length === 0 && (
          <p className="text-white text-xs col-span-full text-center py-6">No foods match.</p>
        )}
      </div>

      {editing && <FoodSheet food={editing.isNew ? null : editing} open={!!editing} onClose={() => setEditing(null)} showToast={showToast} />}
    </div>
  );
}
