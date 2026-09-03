import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, BottomSheet, Field, TextInput, PrimaryButton, DangerButton, SecondaryButton } from "../components/ui";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { Plus, Search, Apple, Trash2 } from "lucide-react";

function emptyFood() {
  return { name: "", cals: "", protein: "", carbs: "", fat: "" };
}

function FoodSheet({ food, open, onClose, showToast }) {
  const { createFood, updateFood, deleteFood } = useApp();
  const [form, setForm] = useState(() => (food ? { ...food } : emptyFood()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      cals: Number(form.cals) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
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
  const { db } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | food | null
  const [search, setSearch] = useState("");
  const customFoods = db.customFoods || [];

  const q = search.toLowerCase();
  const filteredCustom = customFoods.filter((f) => f.name.toLowerCase().includes(q));
  const filteredBase = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(q));

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-black/40 text-sm">
          {customFoods.length} custom · {FOOD_DATABASE.length} built-in
        </p>
        <button onClick={() => setEditing({ isNew: true })} aria-label="Add food" className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">ADD FOOD</span>
        </button>
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
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <Apple size={16} className="text-blue-500" />
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
          </div>
        </>
      )}

      <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">BUILT-IN LIBRARY</p>
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
