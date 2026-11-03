import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { BottomSheet, ExerciseThumb } from "../components/ui";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { swapCandidates, primaryMuscleOf } from "./exerciseSwap";

// Swap one exercise in a Train Solo session for another from the library
// (exerciseSwap.js picks the candidates). One tap swaps — there's no coach
// to explain it to.
export default function SoloSwapSheet({ exercise, allExercises, excludeIds, onClose, onPick, canRemember = false, originalExercise = null }) {
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [search, setSearch] = useState("");
  const [sameMuscle, setSameMuscle] = useState(true);
  const [sameEquipment, setSameEquipment] = useState(false);
  // Use the swap in every later session of this program (#141).
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (exercise) {
      setSearch("");
      setSameMuscle(true);
      setSameEquipment(false);
      setRemember(true);
    }
  }, [exercise]);

  const muscle = primaryMuscleOf(exercise);
  const options = exercise ? swapCandidates(exercise, allExercises, { search, sameMuscle, sameEquipment, excludeIds }) : [];

  const chip = (on) =>
    on
      ? { backgroundColor: accent, borderColor: accent, color: "#fff" }
      : { borderColor: t.panelBorder, color: t.textMuted };

  return (
    <BottomSheet dark={dark} open={!!exercise} onClose={onClose} title={`Swap ${exercise?.name || "exercise"}`}>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3" style={{ backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` }}>
        <Search size={16} color={t.textFaint} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="bg-transparent outline-none text-sm flex-1"
          style={{ color: t.text }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {muscle && (
          <button type="button" onClick={() => setSameMuscle((v) => !v)} aria-pressed={sameMuscle} className="px-3 py-1.5 rounded-full text-xs font-semibold border" style={chip(sameMuscle)}>
            Same muscle group
          </button>
        )}
        {exercise?.equipment && (
          <button type="button" onClick={() => setSameEquipment((v) => !v)} aria-pressed={sameEquipment} className="px-3 py-1.5 rounded-full text-xs font-semibold border" style={chip(sameEquipment)}>
            Same equipment
          </button>
        )}
      </div>
      {canRemember && (
        <label className="flex items-center justify-between gap-3 py-2.5 mb-2 border-y text-sm" style={{ borderColor: t.panelBorder, color: t.text }}>
          <span>
            Keep this swap for the rest of the program
            <span className="block text-xs mt-0.5" style={{ color: t.textMuted }}>
              Off: just for today
            </span>
          </span>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-5 h-5 shrink-0" style={{ accentColor: accent }} aria-label="Keep this swap for the rest of the program" />
        </label>
      )}
      {originalExercise && (
        <button type="button" onClick={() => onPick(originalExercise, false)} className="w-full text-left text-sm font-semibold py-2 mb-1" style={{ color: accent }}>
          Back to {originalExercise.name} (as planned)
        </button>
      )}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {options.map((e) => (
          <button key={e.id} type="button" onClick={() => onPick(e, canRemember && remember)} className="w-full flex items-center gap-3 p-2 rounded-xl text-left active:scale-[0.98] transition-transform">
            <ExerciseThumb dark={dark} exercise={e} size={48} rounded="rounded-lg" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate" style={{ color: t.text }}>
                {e.name}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: t.textMuted }}>
                {[primaryMuscleOf(e), e.equipment].filter(Boolean).join(" · ")}
              </p>
            </div>
          </button>
        ))}
        {options.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: t.textFaint }}>
            No matching exercises — try turning a filter off.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
