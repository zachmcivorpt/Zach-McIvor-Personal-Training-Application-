import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Logo } from "../components/ui";
import { estimateCalories } from "../client/ClientApp";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";

// Adapted from ClientApp.jsx's WorkoutSummary, with the nutrition/protein
// "next objective" card removed — Train Solo has no nutrition tracking in
// scope, so that section would either be invented or wrong. estimateCalories
// itself is reused as-is (exported from ClientApp.jsx) rather than
// duplicated, so the two apps' calorie estimate never drifts apart.

export default function SoloWorkoutSummaryScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dark } = useSoloTheme();
  const { daySession, activeLog, durationMin = 0 } = location.state || {};

  if (!daySession) {
    navigate("/solo/home", { replace: true });
    return null;
  }

  const allSets = Object.values(activeLog || {})
    .flat()
    .filter((s) => s.completed);
  const totalVolume = allSets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
  const totalSets = allSets.length;
  const prCount = allSets.filter((s) => s.isPR).length;
  const calories = estimateCalories(totalVolume, durationMin);

  return (
    <div
      className={`fixed inset-0 z-[90] flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10 ${dark ? "bg-black" : "bg-white"}`}
    >
      <Logo variant="mark" tone={dark ? "white" : "black"} className="h-8 w-auto opacity-70 mb-6" />
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 ${dark ? "bg-white/10 border border-white/15" : "bg-black/10 border border-black/15"}`}>
        <Check size={36} className={dark ? "text-white" : "text-black"} strokeWidth={3} />
      </div>
      <p className={`text-xs tracking-widest font-semibold ${dark ? "text-white/40" : "text-black/40"}`}>WORKOUT COMPLETE</p>
      <h2 className={`text-3xl font-bold mt-1 ${dark ? "text-white" : "text-black"}`}>{daySession.label}</h2>
      <p className={`text-4xl font-bold tabular-nums mt-6 ${dark ? "text-white" : "text-black"}`}>{durationMin} min</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-6">
        <div className="rounded-2xl p-4" style={soloGlass(SOLO_THEMES[dark ? "dark" : "light"])}>
          <p className={`text-xl font-bold ${dark ? "text-white" : "text-black"}`}>{totalSets}</p>
          <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>Sets completed</p>
        </div>
        <div className="rounded-2xl p-4" style={soloGlass(SOLO_THEMES[dark ? "dark" : "light"])}>
          <p className={`text-xl font-bold ${dark ? "text-white" : "text-black"}`}>{totalVolume.toLocaleString()} kg</p>
          <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>Total volume</p>
        </div>
        <div className="rounded-2xl p-4" style={soloGlass(SOLO_THEMES[dark ? "dark" : "light"])}>
          <p className={`text-xl font-bold ${dark ? "text-white" : "text-black"}`}>{calories}</p>
          <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>Calories burned</p>
        </div>
        <div className="rounded-2xl p-4" style={soloGlass(SOLO_THEMES[dark ? "dark" : "light"])}>
          <p className={`text-xl font-bold ${dark ? "text-white" : "text-black"}`}>{prCount} new</p>
          <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>Personal records</p>
        </div>
      </div>

      <button
        onClick={() => navigate("/solo/home", { replace: true })}
        className={`w-full max-w-sm mt-8 font-bold py-4 rounded-2xl ${dark ? "bg-white text-black" : "bg-black text-white"}`}
      >
        DONE
      </button>
    </div>
  );
}
