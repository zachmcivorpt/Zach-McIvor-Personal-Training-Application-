import React, { useEffect, useState } from "react";
import CoachPrograms from "./CoachPrograms";
import CoachWorkoutLibrary from "./CoachWorkoutLibrary";
import CoachExercises from "./CoachExercises";
import CoachMealLibrary from "./CoachMealLibrary";
import CoachFoodLibrary from "./CoachFoodLibrary";
import CoachHabitLibrary from "./CoachHabitLibrary";
import CoachForms from "./CoachForms";
import { DarkPage } from "./darkUI";
import { MEASURE_BLUE } from "../theme";

const LIB_TABS = [
  { id: "programs", label: "Programs" },
  { id: "workouts", label: "Workouts" },
  { id: "exercises", label: "Exercises" },
  { id: "meals", label: "Meals" },
  { id: "foods", label: "Foods" },
  { id: "habits", label: "Habits" },
  { id: "forms", label: "Forms" },
];

export default function CoachLibrary({ showToast, openTab, onOpenTabHandled }) {
  const [tab, setTab] = useState("programs");

  // Lets something outside this screen (e.g. Overview's "Build a program
  // template" quick action) land directly on a specific sub-tab instead of
  // whatever this screen last happened to be showing.
  useEffect(() => {
    if (!openTab) return;
    setTab(openTab);
    onOpenTabHandled?.();
  }, [openTab]);

  return (
    // DarkPage is established ONCE here, at the hub level — the seven
    // sub-pages below render straight into this same dark backdrop rather
    // than each wrapping their own DarkPage (which would double up the
    // mobile top/bottom-bar padding fix DarkPage applies).
    <DarkPage>
      <div className="mb-5">
        <h1 className="text-white text-2xl font-bold mb-1">Library</h1>
        <p className="text-white/40 text-sm mb-5">Programs, master workouts, exercises, meals, foods, habits and check-in forms — build once, reuse everywhere.</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {LIB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
              style={
                tab === t.id
                  ? { backgroundColor: MEASURE_BLUE, color: "#fff" }
                  : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "programs" && <CoachPrograms showToast={showToast} />}
      {tab === "workouts" && <CoachWorkoutLibrary showToast={showToast} />}
      {tab === "exercises" && <CoachExercises showToast={showToast} compact />}
      {tab === "meals" && <CoachMealLibrary showToast={showToast} />}
      {tab === "foods" && <CoachFoodLibrary showToast={showToast} />}
      {tab === "habits" && <CoachHabitLibrary showToast={showToast} />}
      {tab === "forms" && <CoachForms showToast={showToast} />}
    </DarkPage>
  );
}
