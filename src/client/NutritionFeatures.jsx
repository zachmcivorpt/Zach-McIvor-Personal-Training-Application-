import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, ScanLine, X, Check, Plus, Minus, Trash2, Sparkles, UtensilsCrossed } from "lucide-react";
import { Card, Pill, BottomSheet, FullScreenOverlay, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton } from "../components/ui";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { lookupBarcode } from "../lib/barcodeLookup";
import { estimateMealFromPhoto } from "../lib/nutritionVision";

/* ============================================================================
   BARCODE SCANNER — real camera + a live decode against Open Food Facts
============================================================================ */

export function BarcodeScanSheet({ open, onClose, onAdd }) {
  const [status, setStatus] = useState("scanning"); // scanning | looking-up | result | error
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);
  const elId = "barcode-scanner-region";

  useEffect(() => {
    if (!open) return;
    setStatus("scanning");
    setError("");
    setResult(null);
    const scanner = new Html5Qrcode(elId, { verbose: false });
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
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
            setResult(food);
            setStatus("result");
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
      <div className="fixed inset-0 z-[95] bg-[#0A0A0B] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <span className="text-white font-semibold">Scan Barcode</span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-white/60">
            <X size={20} />
          </button>
        </div>

        {status === "scanning" && (
          <>
            <div className="px-5">
              <div id={elId} className="w-full rounded-2xl overflow-hidden bg-black" />
            </div>
            <p className="text-white/40 text-sm text-center mt-4 px-8">Point your camera at a product barcode</p>
          </>
        )}

        {status === "looking-up" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-white/50 text-sm">Looking up product...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-white font-semibold mb-2">Couldn't complete that scan</p>
            <p className="text-white/40 text-sm mb-6">{error}</p>
            <SecondaryButton onClick={onClose} className="px-8">
              Close
            </SecondaryButton>
          </div>
        )}

        {status === "result" && result && (
          <div className="flex-1 px-5 flex flex-col justify-center">
            <Card>
              <p className="text-white font-semibold">{result.name}</p>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {[
                  ["Cals", result.cals],
                  ["Protein", `${result.protein}g`],
                  ["Carbs", `${result.carbs}g`],
                  ["Fat", `${result.fat}g`],
                ].map(([l, v]) => (
                  <div key={l} className="text-center bg-white/5 rounded-xl py-2.5">
                    <p className="text-white font-bold text-sm">{v}</p>
                    <p className="text-white/40 text-[10px] mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
            </Card>
            <PrimaryButton className="w-full mt-4" onClick={() => onAdd(result)}>
              <Check size={16} /> ADD THIS ITEM
            </PrimaryButton>
            <SecondaryButton className="w-full mt-2.5" onClick={onClose}>
              Cancel
            </SecondaryButton>
          </div>
        )}
      </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   PHOTO ESTIMATE — simulated ingredient/macro estimate from a meal photo
============================================================================ */

export function PhotoEstimateSheet({ open, onClose, onAdd, onSaveAsMeal }) {
  const [status, setStatus] = useState("pick"); // pick | analyzing | result
  const [estimate, setEstimate] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStatus("pick");
      setEstimate(null);
    }
  }, [open]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("analyzing");
    const result = await estimateMealFromPhoto(file);
    setEstimate(result);
    setStatus("result");
  }

  function updateIngredient(i, patch) {
    setEstimate((est) => {
      const ingredients = est.ingredients.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing));
      const totals = ingredients.reduce(
        (a, ing) => ({ cals: a.cals + ing.cals, protein: a.protein + ing.protein, carbs: a.carbs + ing.carbs, fat: a.fat + ing.fat }),
        { cals: 0, protein: 0, carbs: 0, fat: 0 }
      );
      return { ...est, ingredients, ...totals };
    });
  }

  function removeIngredient(i) {
    setEstimate((est) => {
      const ingredients = est.ingredients.filter((_, idx) => idx !== i);
      const totals = ingredients.reduce(
        (a, ing) => ({ cals: a.cals + ing.cals, protein: a.protein + ing.protein, carbs: a.carbs + ing.carbs, fat: a.fat + ing.fat }),
        { cals: 0, protein: 0, carbs: 0, fat: 0 }
      );
      return { ...est, ingredients, ...totals };
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Photo Estimate">
      {status === "pick" && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 bg-white/5 border border-dashed border-white/15 rounded-2xl py-10"
          >
            <Camera size={28} className="text-white/40" />
            <span className="text-white/60 text-sm font-medium">Take or choose a photo of your meal</span>
          </button>
          <div className="flex items-start gap-2 mt-4 bg-white/[0.03] rounded-xl p-3">
            <Sparkles size={14} className="text-white/30 shrink-0 mt-0.5" />
            <p className="text-white/30 text-[11px] leading-relaxed">
              This gives a smart estimate you can edit before saving — full photo-accurate recognition needs a connected vision
              model, which isn't wired up yet.
            </p>
          </div>
        </div>
      )}

      {status === "analyzing" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
          <p className="text-white/50 text-sm">Analyzing photo...</p>
        </div>
      )}

      {status === "result" && estimate && (
        <div>
          <p className="text-white font-semibold text-lg mb-1">{estimate.name}</p>
          <p className="text-white/30 text-xs mb-4">Estimated — tap any value to adjust</p>

          <div className="space-y-2 mb-4">
            {estimate.ingredients.map((ing, i) => (
              <div key={ing.id} className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <TextInput
                    value={ing.name}
                    onChange={(e) => updateIngredient(i, { name: e.target.value })}
                    className="!py-1.5 !bg-transparent !border-0 !px-0 font-medium flex-1"
                  />
                  <button onClick={() => removeIngredient(i)} className="w-7 h-7 shrink-0 flex items-center justify-center text-white/30">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["cals", "protein", "carbs", "fat"].map((k) => (
                    <input
                      key={k}
                      type="number"
                      value={ing[k]}
                      onChange={(e) => updateIngredient(i, { [k]: +e.target.value })}
                      className="bg-white/5 rounded-lg text-center text-white text-xs py-1.5 outline-none"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white/8 rounded-2xl p-4 grid grid-cols-4 gap-2 mb-4">
            {[
              ["Cals", estimate.cals],
              ["Protein", `${estimate.protein}g`],
              ["Carbs", `${estimate.carbs}g`],
              ["Fat", `${estimate.fat}g`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className="text-white font-bold text-sm">{v}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{l}</p>
              </div>
            ))}
          </div>

          <PrimaryButton className="w-full" onClick={() => onAdd(estimate)}>
            <Check size={16} /> ADD TO TODAY
          </PrimaryButton>
          {onSaveAsMeal && (
            <SecondaryButton className="w-full mt-2.5" onClick={() => onSaveAsMeal(estimate)}>
              <UtensilsCrossed size={15} /> ALSO SAVE AS A MEAL
            </SecondaryButton>
          )}
        </div>
      )}
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
            <div key={ing.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3.5 py-2.5">
              <div>
                <p className="text-white text-sm font-medium">{ing.name}</p>
                <p className="text-white/40 text-xs">
                  {ing.cals} kcal · P{ing.protein} C{ing.carbs} F{ing.fat}
                </p>
              </div>
              <button onClick={() => removeIngredient(ing.id)} className="w-7 h-7 flex items-center justify-center text-white/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4">
        {[
          ["Cals", totals.cals],
          ["Protein", `${totals.protein}g`],
          ["Carbs", `${totals.carbs}g`],
          ["Fat", `${totals.fat}g`],
        ].map(([l, v]) => (
          <div key={l} className="text-center">
            <p className="text-white font-bold text-sm">{v}</p>
            <p className="text-white/40 text-[10px] mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-white/40 text-xs tracking-wide mb-2">ADD INGREDIENT</p>
        <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5 mb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30"
          />
        </div>
        {search && (
          <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => addIngredient(f)}
                className="w-full flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
              >
                <span className="text-white text-sm">{f.name}</span>
                <span className="text-white/40 text-xs">{f.cals} kcal</span>
              </button>
            ))}
          </div>
        )}

        {!manualOpen ? (
          <button
            onClick={() => setManualOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-white/50 text-xs font-medium py-2.5 rounded-xl bg-white/[0.03]"
          >
            <Plus size={13} /> Add a custom ingredient
          </button>
        ) : (
          <div className="bg-white/[0.03] rounded-xl p-3 space-y-2">
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
                  className="bg-white/5 rounded-lg text-center text-white text-xs py-2 outline-none placeholder:text-white/25 placeholder:capitalize"
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
        <p className="text-white font-semibold">My Meals</p>
        <button onClick={onCreateNew} className="text-white/60 text-xs font-semibold flex items-center gap-1">
          <Plus size={13} /> New
        </button>
      </div>

      {meals.length === 0 ? (
        <p className="text-white/30 text-sm">Save meals you eat often for one-tap logging.</p>
      ) : (
        <div className="space-y-2">
          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3.5 py-2.5">
              <div className="flex-1 min-w-0" onClick={() => setConfirmDelete(m)}>
                <p className="text-white text-sm font-medium truncate">{m.name}</p>
                <p className="text-white/40 text-xs">
                  {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                </p>
              </div>
              <button
                onClick={() => setLogging(m)}
                className="w-8 h-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center"
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomSheet open={!!logging} onClose={() => setLogging(null)} title={`Log "${logging?.name}"`}>
        <p className="text-white/40 text-sm mb-4">Add to which meal today?</p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => {
                onLog(logging, c);
                setLogging(null);
              }}
              className="bg-white/8 text-white text-sm font-semibold py-3.5 rounded-xl"
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
                  <span className="text-white/70">{ing.name}</span>
                  <span className="text-white/40">{ing.cals} kcal</span>
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
