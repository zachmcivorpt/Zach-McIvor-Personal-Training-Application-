import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, ScanLine, X, Check, Plus, Minus, Trash2, UtensilsCrossed } from "lucide-react";
import { Card, Pill, BottomSheet, FullScreenOverlay, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton } from "../components/ui";
import { FOOD_DATABASE, scaleFood } from "../lib/foodDatabase";
import { lookupBarcode } from "../lib/barcodeLookup";
import { fileToCompressedDataUrl } from "../lib/image";

/* ============================================================================
   FOOD QUANTITY PICKER — pick how many grams of a food-database item was
   eaten, scaling its per-100g macros live. Shared by every place a food gets
   picked from the database (main food log, photo-meal builder, saved meals).
============================================================================ */

export function FoodQuantitySheet({ food, onClose, onConfirm }) {
  const [grams, setGrams] = useState(100);

  useEffect(() => {
    if (food) setGrams(food.defaultQty || 100);
  }, [food]);

  if (!food) return null;
  const scaled = scaleFood(food, grams);

  return (
    <BottomSheet open={!!food} onClose={onClose} title={food.name}>
      <p className="text-black/40 text-xs text-center mb-4">How much did you have?</p>
      <div className="flex items-center justify-center gap-4 mb-5">
        <button
          onClick={() => setGrams((g) => Math.max(0, g - 10))}
          className="w-10 h-10 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"
        >
          <Minus size={16} />
        </button>
        <div className="text-center">
          <input
            type="number"
            value={grams}
            onChange={(e) => setGrams(Math.max(0, +e.target.value))}
            className="w-24 text-center text-3xl font-bold text-black outline-none bg-transparent"
          />
          <p className="text-black/40 text-xs mt-0.5 tracking-wide">GRAMS</p>
        </div>
        <button
          onClick={() => setGrams((g) => g + 10)}
          className="w-10 h-10 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-5">
        {[food.defaultQty, food.defaultQty * 2, Math.round(food.defaultQty / 2)]
          .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
          .map((v) => (
            <button
              key={v}
              onClick={() => setGrams(v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                grams === v ? "bg-black text-white" : "bg-black/8 text-black/60"
              }`}
            >
              {v}g
            </button>
          ))}
      </div>

      <div className="bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-5">
        {[
          ["Cals", scaled.cals],
          ["Protein", `${scaled.protein}g`],
          ["Carbs", `${scaled.carbs}g`],
          ["Fat", `${scaled.fat}g`],
        ].map(([l, v]) => (
          <div key={l} className="text-center">
            <p className="text-black font-bold text-sm">{v}</p>
            <p className="text-black/40 text-[10px] mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      <PrimaryButton className="w-full" disabled={grams <= 0} onClick={() => onConfirm(scaled)}>
        <Check size={16} /> ADD
      </PrimaryButton>
    </BottomSheet>
  );
}

/* ============================================================================
   BARCODE SCANNER — real camera + a live decode against Open Food Facts
============================================================================ */

// Product barcode formats only (skips QR/DataMatrix/etc. detection work,
// which speeds up recognition) and opts into the browser's native
// BarcodeDetector API where available — much faster and more reliable
// than the JS-only decoder html5-qrcode falls back to otherwise.
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

export function BarcodeScanSheet({ open, onClose, onAdd }) {
  const [status, setStatus] = useState("scanning"); // scanning | looking-up | error
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const elId = "barcode-scanner-region";

  useEffect(() => {
    if (!open) return;
    setStatus("scanning");
    setError("");
    const scanner = new Html5Qrcode(elId, {
      verbose: false,
      formatsToSupport: BARCODE_FORMATS,
      useBarCodeDetectorIfSupported: true,
    });
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        { fps: 20, qrbox: { width: 280, height: 130 }, disableFlip: true },
        async (decodedText) => {
          if (stopped) return;
          stopped = true;
          try {
            await scanner.stop();
          } catch {
            // already stopped
          }
          setStatus("looking-up");
          try {
            const food = await lookupBarcode(decodedText);
            onAdd(food);
          } catch (err) {
            setError(err.message);
            setStatus("error");
          }
        },
        () => {
          // per-frame "no code found yet" callback — expected, ignore
        }
      )
      .catch((err) => {
        setError(err?.message?.includes("Permission") ? "Camera permission denied — allow camera access to scan." : "Couldn't start the camera.");
        setStatus("error");
      });

    return () => {
      stopped = true;
      scanner.stop().catch(() => {});
      scanner.clear();
    };
  }, [open]);

  if (!open) return null;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[95] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <span className="text-black font-semibold">Scan Barcode</span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-black/60">
            <X size={20} />
          </button>
        </div>

        {status === "scanning" && (
          <>
            <div className="px-5">
              <div id={elId} className="w-full rounded-2xl overflow-hidden bg-white" />
            </div>
            <p className="text-black/40 text-sm text-center mt-4 px-8">Point your camera at a product barcode</p>
          </>
        )}

        {status === "looking-up" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-2 border-black/20 border-t-black rounded-full animate-spin mb-4" />
            <p className="text-black/50 text-sm">Looking up product...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-black font-semibold mb-2">Couldn't complete that scan</p>
            <p className="text-black/40 text-sm mb-6">{error}</p>
            <SecondaryButton onClick={onClose} className="px-8">
              Close
            </SecondaryButton>
          </div>
        )}
      </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   PHOTO MEAL — attach a reference photo, then build the meal by hand.
   There's no safe way to run real food-photo recognition from a public
   static site (it would mean shipping an API key in the client bundle), so
   this keeps the photo purely as a personal reference image and lets the
   client enter ingredients/macros themselves — same builder as Create Meal.
============================================================================ */

export function PhotoEstimateSheet({ open, onClose, onAdd, onSaveAsMeal }) {
  const [status, setStatus] = useState("pick"); // pick | build
  const [photoUrl, setPhotoUrl] = useState(null);
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
  const [pendingFood, setPendingFood] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStatus("pick");
      setPhotoUrl(null);
      setName("");
      setIngredients([]);
      setSearch("");
      setManualOpen(false);
    }
  }, [open]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 900, 0.78);
      setPhotoUrl(dataUrl);
    } catch {
      // bad file — still let them log the meal, just without a photo
    }
    setStatus("build");
  }

  const totals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const filtered = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  function addIngredient(food) {
    setIngredients((list) => [...list, { ...food, id: `ing_${Math.random().toString(36).slice(2, 8)}` }]);
    setSearch("");
  }

  function addManual() {
    if (!manual.name.trim()) return;
    addIngredient({ ...manual });
    setManual({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
    setManualOpen(false);
  }

  function removeIngredient(id) {
    setIngredients((list) => list.filter((i) => i.id !== id));
  }

  function buildResult() {
    return { name: name.trim() || "Meal photo", ingredients, photoUrl, ...totals };
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Log a Meal Photo">
      {status === "pick" && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 bg-black/5 border border-dashed border-black/15 rounded-2xl py-10"
          >
            <Camera size={28} className="text-black/40" />
            <span className="text-black/60 text-sm font-medium">Take or choose a photo of your meal</span>
          </button>
          <div className="flex items-start gap-2 mt-4 bg-black/[0.03] rounded-xl p-3">
            <UtensilsCrossed size={14} className="text-black/30 shrink-0 mt-0.5" />
            <p className="text-black/30 text-[11px] leading-relaxed">
              We'll keep the photo as a reference — add the ingredients yourself below and we'll total up the macros.
            </p>
          </div>
        </div>
      )}

      {status === "build" && (
        <div>
          {photoUrl && <img src={photoUrl} alt="Your meal" className="w-full h-40 object-cover rounded-2xl mb-4" />}

          <Field label="MEAL NAME">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lunch" />
          </Field>

          {ingredients.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {ingredients.map((ing) => (
                <div key={ing.id} className="flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5">
                  <div>
                    <p className="text-black text-sm font-medium">{ing.name}</p>
                    <p className="text-black/40 text-xs">
                      {ing.cals} kcal · P{ing.protein} C{ing.carbs} F{ing.fat}
                    </p>
                  </div>
                  <button onClick={() => removeIngredient(ing.id)} className="w-7 h-7 flex items-center justify-center text-black/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4">
            {[
              ["Cals", totals.cals],
              ["Protein", `${totals.protein}g`],
              ["Carbs", `${totals.carbs}g`],
              ["Fat", `${totals.fat}g`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className="text-black font-bold text-sm">{v}</p>
                <p className="text-black/40 text-[10px] mt-0.5">{l}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className="text-black/40 text-xs tracking-wide mb-2">ADD INGREDIENT</p>
            <div className="flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search foods"
                className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
              />
            </div>
            {search && (
              <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                {filtered.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setPendingFood(f);
                      setSearch("");
                    }}
                    className="w-full flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"
                  >
                    <span className="text-black text-sm">{f.name}</span>
                    <span className="text-black/40 text-xs">{f.cals} kcal / 100g</span>
                  </button>
                ))}
              </div>
            )}

            {!manualOpen ? (
              <button
                onClick={() => setManualOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 rounded-xl bg-black/[0.03]"
              >
                <Plus size={13} /> Add a custom ingredient
              </button>
            ) : (
              <div className="bg-black/[0.03] rounded-xl p-3 space-y-2">
                <TextInput
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  placeholder="Ingredient name"
                  className="text-sm"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  {["cals", "protein", "carbs", "fat"].map((k) => (
                    <input
                      key={k}
                      type="number"
                      value={manual[k]}
                      onChange={(e) => setManual((m) => ({ ...m, [k]: +e.target.value }))}
                      placeholder={k}
                      className="bg-black/5 rounded-lg text-center text-black text-xs py-2 outline-none placeholder:text-black/25 placeholder:capitalize"
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <SecondaryButton className="flex-1 !py-2" onClick={() => setManualOpen(false)}>
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton className="flex-1 !py-2" onClick={addManual}>
                    Add
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>

          <PrimaryButton className="w-full mt-5" disabled={ingredients.length === 0} onClick={() => onAdd(buildResult())}>
            <Check size={16} /> ADD TO TODAY
          </PrimaryButton>
          {onSaveAsMeal && (
            <SecondaryButton
              className="w-full mt-2.5"
              disabled={!name.trim() || ingredients.length === 0}
              onClick={() => onSaveAsMeal(buildResult())}
            >
              <UtensilsCrossed size={15} /> ALSO SAVE AS A MEAL
            </SecondaryButton>
          )}
        </div>
      )}

      <FoodQuantitySheet
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          addIngredient(scaled);
          setPendingFood(null);
        }}
      />
    </BottomSheet>
  );
}

/* ============================================================================
   CREATE MEAL — build a reusable meal from ingredients, save it
============================================================================ */

export function CreateMealSheet({ open, onClose, onSave, prefill }) {
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
  const [pendingFood, setPendingFood] = useState(null);

  useEffect(() => {
    if (open) {
      setName(prefill?.name || "");
      setIngredients(prefill?.ingredients?.map((i) => ({ ...i, id: i.id || `ing_${Math.random().toString(36).slice(2, 8)}` })) || []);
      setSearch("");
      setManualOpen(false);
    }
  }, [open, prefill]);

  const totals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const filtered = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  function addIngredient(food) {
    setIngredients((list) => [...list, { ...food, id: `ing_${Math.random().toString(36).slice(2, 8)}` }]);
    setSearch("");
  }

  function addManual() {
    if (!manual.name.trim()) return;
    addIngredient({ ...manual });
    setManual({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
    setManualOpen(false);
  }

  function removeIngredient(id) {
    setIngredients((list) => list.filter((i) => i.id !== id));
  }

  function save() {
    if (!name.trim() || ingredients.length === 0) return;
    onSave({ name: name.trim(), ingredients, ...totals });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Create Meal">
      <Field label="MEAL NAME">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My go-to breakfast" />
      </Field>

      {ingredients.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5">
              <div>
                <p className="text-black text-sm font-medium">{ing.name}</p>
                <p className="text-black/40 text-xs">
                  {ing.cals} kcal · P{ing.protein} C{ing.carbs} F{ing.fat}
                </p>
              </div>
              <button onClick={() => removeIngredient(ing.id)} className="w-7 h-7 flex items-center justify-center text-black/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4">
        {[
          ["Cals", totals.cals],
          ["Protein", `${totals.protein}g`],
          ["Carbs", `${totals.carbs}g`],
          ["Fat", `${totals.fat}g`],
        ].map(([l, v]) => (
          <div key={l} className="text-center">
            <p className="text-black font-bold text-sm">{v}</p>
            <p className="text-black/40 text-[10px] mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-black/40 text-xs tracking-wide mb-2">ADD INGREDIENT</p>
        <div className="flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
          />
        </div>
        {search && (
          <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setPendingFood(f);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"
              >
                <span className="text-black text-sm">{f.name}</span>
                <span className="text-black/40 text-xs">{f.cals} kcal / 100g</span>
              </button>
            ))}
          </div>
        )}

        {!manualOpen ? (
          <button
            onClick={() => setManualOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 rounded-xl bg-black/[0.03]"
          >
            <Plus size={13} /> Add a custom ingredient
          </button>
        ) : (
          <div className="bg-black/[0.03] rounded-xl p-3 space-y-2">
            <TextInput
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              placeholder="Ingredient name"
              className="text-sm"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {["cals", "protein", "carbs", "fat"].map((k) => (
                <input
                  key={k}
                  type="number"
                  value={manual[k]}
                  onChange={(e) => setManual((m) => ({ ...m, [k]: +e.target.value }))}
                  placeholder={k}
                  className="bg-black/5 rounded-lg text-center text-black text-xs py-2 outline-none placeholder:text-black/25 placeholder:capitalize"
                />
              ))}
            </div>
            <div className="flex gap-2">
              <SecondaryButton className="flex-1 !py-2" onClick={() => setManualOpen(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton className="flex-1 !py-2" onClick={addManual}>
                Add
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>

      <PrimaryButton className="w-full mt-5" disabled={!name.trim() || ingredients.length === 0} onClick={save}>
        <Check size={16} /> SAVE MEAL
      </PrimaryButton>

      <FoodQuantitySheet
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          addIngredient(scaled);
          setPendingFood(null);
        }}
      />
    </BottomSheet>
  );
}

/* ============================================================================
   SAVED MEALS — the client's personal meal library, one-tap logging
============================================================================ */

export function SavedMealsSection({ meals, onCreateNew, onLog, onDelete }) {
  const [logging, setLogging] = useState(null); // meal being logged (choosing category)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const categories = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-workout", "Post-workout"];

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-black font-semibold">My Meals</p>
        <button onClick={onCreateNew} className="text-black/60 text-xs font-semibold flex items-center gap-1">
          <Plus size={13} /> New
        </button>
      </div>

      {meals.length === 0 ? (
        <p className="text-black/30 text-sm">Save meals you eat often for one-tap logging.</p>
      ) : (
        <div className="space-y-2">
          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-black/5 rounded-xl px-3.5 py-2.5">
              {m.photoUrl && (
                <img src={m.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0" onClick={() => setConfirmDelete(m)}>
                <p className="text-black text-sm font-medium truncate">{m.name}</p>
                <p className="text-black/40 text-xs">
                  {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                </p>
              </div>
              <button
                onClick={() => setLogging(m)}
                className="w-8 h-8 shrink-0 rounded-full bg-black text-white flex items-center justify-center"
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomSheet open={!!logging} onClose={() => setLogging(null)} title={`Log "${logging?.name}"`}>
        <p className="text-black/40 text-sm mb-4">Add to which meal today?</p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => {
                onLog(logging, c);
                setLogging(null);
              }}
              className="bg-black/8 text-black text-sm font-semibold py-3.5 rounded-xl"
            >
              {c}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={confirmDelete?.name}>
        {confirmDelete && (
          <div>
            <div className="space-y-1.5 mb-4">
              {confirmDelete.ingredients.map((ing, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-black/70">{ing.name}</span>
                  <span className="text-black/40">{ing.cals} kcal</span>
                </div>
              ))}
            </div>
            <DangerButton
              className="w-full"
              onClick={() => {
                onDelete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              <Trash2 size={14} /> Delete this meal
            </DangerButton>
          </div>
        )}
      </BottomSheet>
    </Card>
  );
}
