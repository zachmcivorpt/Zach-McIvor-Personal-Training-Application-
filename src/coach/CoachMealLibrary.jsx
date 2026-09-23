import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, SecondaryButton, DangerButton, BottomSheet, TextArea, PrimaryButton } from "../components/ui";
import { CreateMealSheet } from "../client/NutritionFeatures";
import { fileToCompressedDataUrl } from "../lib/image";
import { matchesSearch } from "../lib/search";
import { Plus, Utensils, Trash2, Camera, Download, Image as ImageIcon, ImageOff, Search } from "lucide-react";

// Coach-facing occasion categories, in display order. A meal can belong to
// more than one (e.g. "Lunch · Dinner"), so it's grouped under every
// category it lists — matching how a coach actually browses ("what's
// dinner-suitable" should include lunch/dinner swing meals too).
const CATEGORY_ORDER = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const CATEGORY_STYLE = {
  Breakfast: { bg: "bg-amber-50", ring: "ring-amber-100", text: "text-amber-600", pill: "bg-amber-50 text-amber-700 border-amber-100" },
  Lunch: { bg: "bg-blue-50", ring: "ring-blue-100", text: "text-blue-600", pill: "bg-blue-50 text-blue-700 border-blue-100" },
  Dinner: { bg: "bg-indigo-50", ring: "ring-indigo-100", text: "text-indigo-600", pill: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  Snacks: { bg: "bg-emerald-50", ring: "ring-emerald-100", text: "text-emerald-600", pill: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  Other: { bg: "bg-black/5", ring: "ring-black/10", text: "text-black/40", pill: "bg-black/5 text-black/50 border-black/10" },
};
function categoryStyle(cat) {
  return CATEGORY_STYLE[cat] || CATEGORY_STYLE.Other;
}
function mealCategories(m) {
  return m.mealTypes?.length > 0 ? m.mealTypes : ["Other"];
}

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
// — lets a coach snap/attach a photo for the imported AU meals without
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
        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-black/60 shadow-sm hover:text-black disabled:opacity-40 transition-colors"
        aria-label={`${meal.photoUrl ? "Change" : "Add"} photo for ${meal.name}`}
        title={meal.photoUrl ? "Change photo" : "Add a photo"}
      >
        <Camera size={14} />
      </button>
    </>
  );
}

export default function CoachMealLibrary({ showToast }) {
  const { db, createMasterMeal, updateMasterMeal, deleteMasterMeal, importFitnessMealsAU, clearAllMealPhotos } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | meal | null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmClearPhotos, setConfirmClearPhotos] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearingPhotos, setClearingPhotos] = useState(false);
  const [importPhotosOpen, setImportPhotosOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const meals = db.masterMeals || [];
  const photoCount = meals.filter((m) => m.photoUrl).length;

  const presentCategories = useMemo(() => {
    const known = CATEGORY_ORDER.filter((cat) => meals.some((m) => m.mealTypes?.includes(cat)));
    const hasOther = meals.some((m) => !m.mealTypes || m.mealTypes.length === 0);
    return hasOther ? [...known, "Other"] : known;
  }, [meals]);

  const searched = useMemo(() => meals.filter((m) => matchesSearch(m.name, search)), [meals, search]);

  const groups = useMemo(() => {
    const cats = activeCategory === "All" ? presentCategories : [activeCategory];
    return cats
      .map((cat) => ({
        key: cat,
        label: cat,
        style: categoryStyle(cat),
        meals: searched.filter((m) => mealCategories(m).includes(cat)),
      }))
      .filter((g) => g.meals.length > 0);
  }, [searched, activeCategory, presentCategories]);

  const totalShown = groups.reduce((n, g) => n + g.meals.length, 0);

  async function handleClearPhotos() {
    setClearingPhotos(true);
    try {
      const { clearedCount } = await clearAllMealPhotos();
      showToast(clearedCount > 0 ? `Cleared ${clearedCount} meal photo${clearedCount === 1 ? "" : "s"}` : "No meal photos to clear");
    } catch (err) {
      showToast(err.message || "Couldn't clear meal photos");
    } finally {
      setClearingPhotos(false);
      setConfirmClearPhotos(false);
    }
  }

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
          ? `Synced AU meal library — added ${importedCount} new, refreshed the rest (your photos are kept)`
          : "Synced AU meal library — names & macros refreshed (your photos are kept)"
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
            title="Imports the full library of common Australian fitness meals, or re-syncs them to the latest names/macros/tags if already imported — your photos are always kept"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 disabled:opacity-50 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Download size={16} /> <span className="hidden sm:inline">{importing ? "SYNCING…" : "SYNC AU MEAL LIBRARY"}</span>
          </button>
          <button
            onClick={() => setImportPhotosOpen(true)}
            title="Paste a Meal Name | photo URL list to bulk-add photos, same as Import Video List for exercises"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ImageIcon size={16} /> <span className="hidden sm:inline">IMPORT PHOTOS</span>
          </button>
          {photoCount > 0 && (
            <button
              onClick={() => setConfirmClearPhotos(true)}
              title="Remove every meal's photo — an escape hatch if a batch of imported photos doesn't work out"
              className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <ImageOff size={16} /> <span className="hidden sm:inline">CLEAR PHOTOS</span>
            </button>
          )}
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
        <>
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5 mb-4 md:max-w-sm">
            <Search size={16} className="text-black/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meals"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>

          <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            <button
              onClick={() => setActiveCategory("All")}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                activeCategory === "All" ? "bg-black text-white border-black" : "bg-white text-black/50 border-black/10 hover:border-black/25"
              }`}
            >
              All <span className="opacity-60 font-semibold">{meals.length}</span>
            </button>
            {presentCategories.map((cat) => {
              const count = meals.filter((m) => mealCategories(m).includes(cat)).length;
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                    active ? "bg-black text-white border-black" : "bg-white text-black/50 border-black/10 hover:border-black/25"
                  }`}
                >
                  {cat} <span className="opacity-60 font-semibold">{count}</span>
                </button>
              );
            })}
          </div>

          {totalShown === 0 ? (
            <Card>
              <p className="text-black/40 text-sm text-center py-6">No meals match "{search}".</p>
            </Card>
          ) : (
            <div className="space-y-9">
              {groups.map((g) => (
                <div key={g.key}>
                  {activeCategory === "All" && (
                    <div className="flex items-center gap-2.5 mb-3.5">
                      <span className={`w-2 h-2 rounded-full ${g.style.text.replace("text-", "bg-")}`} />
                      <h3 className="text-black font-extrabold text-base tracking-tight">{g.label}</h3>
                      <span className="text-black/30 text-sm font-semibold">{g.meals.length}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {g.meals.map((m) => (
                      <div
                        key={`${g.key}-${m.id}`}
                        onClick={() => setEditing(m)}
                        className="group rounded-3xl border border-black/8 bg-white overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-black/5 hover:-translate-y-0.5 hover:border-black/15 transition-all"
                      >
                        <div className={`relative aspect-[4/3] ${categoryStyle(m.mealTypes?.[0]).bg} overflow-hidden`}>
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Utensils size={26} className={categoryStyle(m.mealTypes?.[0]).text} strokeWidth={1.5} />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 flex items-center gap-1.5">
                            <MealPhotoButton meal={m} showToast={showToast} />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(m);
                              }}
                              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-black/60 shadow-sm hover:text-red-500 transition-colors"
                              aria-label={`Delete ${m.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="p-3.5">
                          <p className="text-black font-bold text-sm leading-snug">{m.name}</p>
                          <div className="flex items-center gap-2.5 mt-2 text-xs">
                            <span className="text-black font-bold">{m.cals} kcal</span>
                            <span className="text-black/30">·</span>
                            <span className="text-black/40 font-semibold">
                              P{m.protein} C{m.carbs} F{m.fat}
                            </span>
                          </div>
                          {m.mealTypes?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {m.mealTypes.map((t) => (
                                <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${categoryStyle(t).pill}`}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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

      {confirmClearPhotos && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center px-6" onClick={() => setConfirmClearPhotos(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-black font-semibold mb-1">Clear all {photoCount} meal photo{photoCount === 1 ? "" : "s"}?</p>
            <p className="text-black/40 text-sm mb-4">This can't be undone — every meal will fall back to the placeholder icon until you add photos again.</p>
            <div className="flex gap-2">
              <SecondaryButton className="flex-1" onClick={() => setConfirmClearPhotos(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton className="flex-1" disabled={clearingPhotos} onClick={handleClearPhotos}>
                {clearingPhotos ? "Clearing…" : "Clear all"}
              </DangerButton>
            </div>
          </div>
        </div>
      )}

      <ImportMealPhotosSheet open={importPhotosOpen} onClose={() => setImportPhotosOpen(false)} showToast={showToast} />
    </div>
  );
}
