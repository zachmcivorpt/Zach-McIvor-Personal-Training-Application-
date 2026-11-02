import React, { useMemo, useRef, useState } from "react";
import { Search, ScanLine, Camera, Zap, Copy, Plus, Check, ChevronDown, UtensilsCrossed, X } from "lucide-react";
import { BottomSheet } from "../components/ui";
import { NutritionPage } from "./NutritionFeatures";
import { rankFoods } from "../lib/foodSearch";
import { matchesSearch } from "../lib/search";
import { validateNutrition } from "../lib/barcodeLookup";
import { entryAmountLabel } from "../lib/nutritionLog";
import { MEASURE_BLUE, BORDER, CLIENT_DARK_BORDER } from "../theme";

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

// Full-screen Add Food page — where every food gets logged from. Stays open
// after each add (a running tally at the bottom, Done to finish), so a
// three-item breakfast is three taps on one page instead of reopening a
// sheet three times. The meal it logs to is picked in the header and can
// be changed without leaving. All writes go through the callbacks; this
// component only owns the search box, tab and per-row tap state.
export function AddFoodPage({
  open,
  onClose,
  dark = false,
  meal,
  meals,
  onMealChange,
  dateLabel,
  foods,
  afcdFoods,
  frequentFoods,
  historyCounts,
  savedMeals,
  previousMeals,
  addedItems,
  onQuickLog,
  onOpenFood,
  onLogSavedMeal,
  onEditSavedMeal,
  onCreateMeal,
  onCopyMeal,
  onScan,
  onPhotoMeal,
  onQuickAdd,
  renderSavedMealRow,
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("history"); // "history" | "mymeals"
  const [mealMenuOpen, setMealMenuOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [rowState, setRowState] = useState({}); // key -> "busy" | "done"
  const [focused, setFocused] = useState(false);
  // A ref, not just rowState: two taps on the same + in one beat both read
  // the same not-yet-busy state before React re-renders; the ref flips
  // synchronously so the second is dropped (double-logging guard).
  const busyKeys = useRef(new Set());
  const inputRef = useRef(null);

  const q = search.trim();
  const keyOf = (f) => (f.id || f.name || "").toString().toLowerCase();

  const results = useMemo(() => {
    if (!q) return null;
    const mealsMatched = (savedMeals || []).filter((m) => matchesSearch(m?.name, q));
    const main = rankFoods(q, foods, { historyCounts, keyOf });
    if (!main.fuzzy && main.results.length) return { meals: mealsMatched, foods: main.results, afcd: [], fuzzy: false };
    // The Australian Food Composition Database stays a last resort — only
    // searched when APEX's own foods and the client's meals have nothing.
    const afcdRanked = rankFoods(q, afcdFoods);
    if (mealsMatched.length) return { meals: mealsMatched, foods: [], afcd: [], fuzzy: false };
    if (!afcdRanked.fuzzy && afcdRanked.results.length) return { meals: [], foods: [], afcd: afcdRanked.results, fuzzy: false };
    return { meals: [], foods: main.results.slice(0, 30), afcd: afcdRanked.results.slice(0, 10), fuzzy: main.results.length + afcdRanked.results.length > 0 };
    // keyOf is stable in behaviour; recomputed only when inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, foods, afcdFoods, savedMeals, historyCounts]);

  function dismissKeyboard() {
    inputRef.current?.blur();
  }

  async function runRow(key, action) {
    if (busyKeys.current.has(key)) return;
    busyKeys.current.add(key);
    setRowState((s) => ({ ...s, [key]: "busy" }));
    try {
      await action();
      setRowState((s) => ({ ...s, [key]: "done" }));
      // The row stays locked while its ✓ shows: a fast save (or one kept
      // on the phone offline) settles in a moment, and a double-tap's
      // second tap landing just after it must not log the food again.
      // Tapping again once the ✓ clears is a deliberate second serving.
      setTimeout(() => {
        busyKeys.current.delete(key);
        setRowState((s) => ({ ...s, [key]: undefined }));
      }, 1400);
    } catch {
      busyKeys.current.delete(key);
      setRowState((s) => ({ ...s, [key]: undefined }));
    }
  }

  function close() {
    dismissKeyboard();
    setSearch("");
    setTab("history");
    setCopyOpen(false);
    onClose();
  }

  if (!open) return null;

  const muted = dark ? "text-white/45" : "text-black/45";
  const strong = dark ? "text-white" : "text-black";
  const divider = { borderColor: dark ? CLIENT_DARK_BORDER : BORDER };
  const addedCount = (addedItems || []).length;
  const addedCals = (addedItems || []).reduce((a, f) => a + (Number(f.cals) || 0), 0);

  // Plain render helpers (not nested components) so React keeps the same
  // DOM between renders — a nested component type would remount every row
  // on each keystroke and cut off its tap animation.
  function plusButton({ rowKey, label, onClick }) {
    const st = rowState[rowKey];
    return (
      <button
        key={`plus_${rowKey}`}
        onClick={(e) => {
          e.stopPropagation();
          dismissKeyboard();
          runRow(rowKey, onClick);
        }}
        aria-label={label}
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all"
        style={st === "done" ? { backgroundColor: MEASURE_BLUE, color: "#fff" } : { backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", color: MEASURE_BLUE }}
      >
        {st === "done" ? <Check size={18} /> : <Plus size={18} className={st === "busy" ? "opacity-40" : ""} />}
      </button>
    );
  }

  function foodRow({ rowKey, name, sub, onOpen, onPlus, plusLabel }) {
    return (
      <div key={rowKey} className="flex items-center gap-3 px-4 py-3 border-b" style={divider}>
        <button
          onClick={() => {
            dismissKeyboard();
            onOpen();
          }}
          className="flex-1 min-w-0 text-left active:opacity-60 transition-opacity"
        >
          <p className={`text-[15px] font-medium truncate ${strong}`}>{name}</p>
          <p className={`text-[13px] mt-0.5 truncate ${muted}`}>{sub}</p>
        </button>
        {onPlus && plusButton({ rowKey, label: plusLabel, onClick: onPlus })}
      </div>
    );
  }

  const tiles = [
    { key: "scan", icon: ScanLine, label: "Barcode scan", onClick: onScan },
    { key: "photo", icon: Camera, label: "Photo meal", onClick: onPhotoMeal },
    { key: "quick", icon: Zap, label: "Quick add", onClick: onQuickAdd },
    { key: "copy", icon: Copy, label: "Copy meal", onClick: () => setCopyOpen(true) },
  ];

  const mealCopies = (previousMeals || []).filter((p) => p.meal === meal);
  const otherCopies = (previousMeals || []).filter((p) => p.meal !== meal).slice(0, 8);

  return (
    <NutritionPage
      dark={dark}
      z={100}
      onBack={close}
      title={
        <button
          onClick={() => setMealMenuOpen(true)}
          aria-label="Choose meal"
          className="flex flex-col items-center leading-tight active:opacity-60"
        >
          <span className="flex items-center gap-1 text-[17px] font-semibold" style={{ color: MEASURE_BLUE }}>
            {meal} <ChevronDown size={16} />
          </span>
          {dateLabel && <span className={`text-[11px] ${muted}`}>{dateLabel}</span>}
        </button>
      }
      action={
        <button onClick={close} className="px-3 h-10 text-[17px] font-semibold" style={{ color: MEASURE_BLUE }}>
          Done
        </button>
      }
      footer={
        addedCount > 0 && (
          <div className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3" style={divider}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: MEASURE_BLUE }}>
              <Check size={16} color="#fff" />
            </div>
            <p className={`flex-1 text-sm ${strong}`}>
              <span className="font-bold">{addedCount}</span> added · <span className="font-bold tabular-nums">{Math.round(addedCals)}</span> kcal
            </p>
            <button onClick={close} className="px-4 py-2 rounded-full text-sm font-semibold text-white active:scale-95 transition-transform" style={{ backgroundColor: MEASURE_BLUE }}>
              Done
            </button>
          </div>
        )
      }
    >
      <div className="px-3 pt-3" onTouchMove={focused ? dismissKeyboard : undefined}>
        <div className={dark ? "flex items-center gap-2 bg-white/8 rounded-2xl px-3.5 py-3" : "flex items-center gap-2 bg-black/[0.05] rounded-2xl px-3.5 py-3"}>
          <Search size={18} className={muted} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search foods, brands, meals"
            type="search"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") dismissKeyboard();
            }}
            className={`bg-transparent outline-none text-[15px] flex-1 min-w-0 [&::-webkit-search-cancel-button]:appearance-none ${dark ? "text-white placeholder:text-white/30" : "text-black placeholder:text-black/30"}`}
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className={`w-6 h-6 rounded-full flex items-center justify-center ${dark ? "bg-white/15 text-white" : "bg-black/15 text-white"}`}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {!q && (
        <>
          <div className="flex gap-5 px-4 mt-4 border-b" style={divider}>
            {[
              ["history", "History"],
              ["mymeals", "My Meals"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`pb-2.5 text-[15px] font-semibold border-b-2 -mb-px transition-colors ${tab === k ? strong : muted}`}
                style={{ borderColor: tab === k ? (dark ? "#fff" : "#000") : "transparent" }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 px-3 mt-3">
            {tiles.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  dismissKeyboard();
                  t.onClick();
                }}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 active:scale-95 transition-transform"
                style={{
                  backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.62)",
                  border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(20,19,15,0.08)"}`,
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  color: MEASURE_BLUE,
                }}
              >
                <t.icon size={20} />
                <span className="text-[11px] font-semibold leading-tight text-center">{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {q && results && (
        <div className="mt-2">
          {results.fuzzy && <p className={`px-4 pt-2 pb-1 text-xs ${muted}`}>No exact matches — showing close matches for "{q}"</p>}
          {!results.meals.length && !results.foods.length && !results.afcd.length && <p className={`text-sm text-center py-10 ${muted}`}>No matches for "{q}"</p>}
          {results.meals.map((m) => (
            // Search results show kcal only (MyFitnessPal's compact list);
            // the full macro breakdown is on the food page.
            foodRow({
              rowKey: `meal_${m.id}`,
              name: m.name,
              sub: `My Meals · ${m.cals} kcal`,
              onOpen: () => onEditSavedMeal(m),
              onPlus: () => onLogSavedMeal(m),
              plusLabel: `Log ${m.name}`,
            })
          ))}
          {results.foods.map((f) => (
            foodRow({
              rowKey: `food_${f.id}`,
              name: f.name,
              sub: `${f.cals} kcal${f.brand ? ` · ${f.brand}` : ""}`,
              onOpen: () => onOpenFood(f),
              onPlus: () => onQuickLog(f, { asDefault: true }),
              plusLabel: `Log ${f.name}`,
            })
          ))}
          {results.afcd.length > 0 && <p className={`px-4 pt-4 pb-1 text-[10px] tracking-wide ${muted}`}>FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE</p>}
          {results.afcd.map((f) => {
            // Same Atwater/range check a live barcode scan gets — belt and
            // braces on top of afcdFoods.js's own build-time filtering.
            const validation = validateNutrition({ cals: f.cals, protein: f.protein, carbs: f.carbs, fat: f.fat });
            const shaped = { ...f, fromAFCD: true, ...(validation.plausible ? {} : { nutritionSuspect: true, nutritionSuspectReason: validation.reason }) };
            return foodRow({ rowKey: `afcd_${f.id}`, name: f.name, sub: `${f.cals} kcal`, onOpen: () => onOpenFood(shaped) });
          })}
        </div>
      )}

      {!q && tab === "history" && (
        <div className="mt-4">
          <p className={`px-4 pb-1 text-[13px] font-bold tracking-wide ${muted}`}>MOST LOGGED</p>
          {(frequentFoods || []).length === 0 ? (
            <p className={`text-sm text-center py-10 px-6 ${muted}`}>Foods you log will show up here</p>
          ) : (
            frequentFoods.map((r) => {
              const amount = entryAmountLabel(r.entry);
              return foodRow({
                rowKey: `recent_${r.key}`,
                name: r.name,
                sub: `${r.entry.cals} kcal${amount ? ` · ${amount}` : ""} · P${round1(r.entry.protein)} C${round1(r.entry.carbs)} F${round1(r.entry.fat)}`,
                onOpen: () => onOpenFood(null, { entry: r.entry }),
                onPlus: () => onQuickLog(r.entry),
                plusLabel: `Log ${r.name}`,
              });
            })
          )}
        </div>
      )}

      {!q && tab === "mymeals" && (
        <div className="mt-4 px-3">
          <button
            onClick={onCreateMeal}
            className={dark ? "w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-2xl py-3 mb-3 text-sm font-bold" : "w-full flex items-center justify-center gap-2 border border-dashed border-black/15 rounded-2xl py-3 mb-3 text-sm font-bold"}
            style={{ color: MEASURE_BLUE }}
          >
            <Plus size={16} /> Create meal
          </button>
          {(savedMeals || []).length === 0 ? (
            <p className={`text-sm text-center py-6 ${muted}`}>No saved meals yet</p>
          ) : (
            <div className="space-y-2">
              {savedMeals.map((m) => (
                renderSavedMealRow(
                  m,
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button onClick={() => onEditSavedMeal(m)} className="flex-1 min-w-0 flex items-center gap-3 text-left active:opacity-60">
                      {m.photoUrl ? (
                        <img src={m.photoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className={dark ? "w-12 h-12 rounded-xl bg-white/8 flex items-center justify-center shrink-0" : "w-12 h-12 rounded-xl bg-black/[0.04] flex items-center justify-center shrink-0"}>
                          <UtensilsCrossed size={18} className={muted} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={`text-[15px] font-medium truncate ${strong}`}>{m.name}</p>
                        <p className={`text-xs mt-0.5 ${muted}`}>
                          {m.cals} kcal · P{round1(m.protein)} C{round1(m.carbs)} F{round1(m.fat)}
                        </p>
                      </div>
                    </button>
                    {plusButton({ rowKey: `saved_${m.id}`, label: `Log ${m.name}`, onClick: () => onLogSavedMeal(m) })}
                  </div>
                )
              ))}
              <p className={`text-[10px] text-center pt-1 ${muted}`}>Tap a meal to edit it · swipe left to remove it</p>
            </div>
          )}
        </div>
      )}

      {/* Room to scroll the last rows clear of the on-screen keyboard (iOS's
          WKWebView never resizes the page for it) and of the tally bar. */}
      {focused ? <div data-testid="keyboard-safe-spacer" aria-hidden="true" style={{ height: "45vh" }} /> : <div aria-hidden="true" style={{ height: 32 }} />}

      <BottomSheet dark={dark} open={mealMenuOpen} onClose={() => setMealMenuOpen(false)} title="Log to">
        <div className="grid grid-cols-2 gap-2">
          {meals.map((m) => (
            <button
              key={m}
              onClick={() => {
                onMealChange(m);
                setMealMenuOpen(false);
              }}
              className={`text-sm font-semibold py-3.5 rounded-xl active:scale-95 transition-transform ${m === meal ? "text-white" : dark ? "bg-white/8 text-white" : "bg-black/[0.05] text-black"}`}
              style={m === meal ? { backgroundColor: MEASURE_BLUE } : undefined}
            >
              {m}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet dark={dark} open={copyOpen} onClose={() => setCopyOpen(false)} title={`Copy into ${meal}`}>
        {mealCopies.length === 0 && otherCopies.length === 0 ? (
          <p className={`text-sm text-center py-6 ${muted}`}>No meals logged in the last two weeks yet</p>
        ) : (
          <div className="space-y-4">
            {[
              [mealCopies, `PREVIOUS ${meal.toUpperCase()}`],
              [otherCopies, "OTHER MEALS"],
            ].map(([list, heading]) =>
              list.length === 0 ? null : (
                <div key={heading}>
                  <p className={`text-[11px] font-bold tracking-wide mb-1 ${muted}`}>{heading}</p>
                  <div className="divide-y" style={divider}>
                    {list.map((p) => (
                      <div key={`${p.dateKey}_${p.meal}`} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className={`text-[15px] font-semibold ${strong}`}>
                            {p.label} · {p.meal}
                          </p>
                          <p className={`text-xs mt-0.5 truncate ${muted}`}>
                            {Math.round(p.cals)} kcal · {p.items.map((i) => i.name).join(", ")}
                          </p>
                        </div>
                        {plusButton({
                          rowKey: `copy_${p.dateKey}_${p.meal}`,
                          label: `Copy ${p.label} ${p.meal}`,
                          onClick: async () => {
                            await onCopyMeal(p);
                            setCopyOpen(false);
                          },
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </BottomSheet>
    </NutritionPage>
  );
}
