import React, { useState } from "react";
import CoachWorkoutLibrary from "./CoachWorkoutLibrary";
import CoachExercises from "./CoachExercises";
import CoachMealLibrary from "./CoachMealLibrary";
import CoachFoodLibrary from "./CoachFoodLibrary";
import CoachHabitLibrary from "./CoachHabitLibrary";
import CoachForms from "./CoachForms";

const LIB_TABS = [
  { id: "workouts", label: "Workouts" },
  { id: "exercises", label: "Exercises" },
  { id: "meals", label: "Meals" },
  { id: "foods", label: "Foods" },
  { id: "habits", label: "Habits" },
  { id: "forms", label: "Forms" },
];

export default function CoachLibrary({ showToast }) {
  const [tab, setTab] = useState("workouts");

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 pt-5 md:px-8 md:pt-8">
        <h1 className="text-black text-2xl font-bold mb-1">Library</h1>
        <p className="text-black/40 text-sm mb-5">Master workouts, exercises, meals, foods, habits and check-in forms — build once, reuse everywhere.</p>
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
          {LIB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-black text-white" : "bg-black/8 text-black/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "workouts" && <CoachWorkoutLibrary showToast={showToast} />}
      {tab === "exercises" && <CoachExercises showToast={showToast} compact />}
      {tab === "meals" && <CoachMealLibrary showToast={showToast} />}
      {tab === "foods" && <CoachFoodLibrary showToast={showToast} />}
      {tab === "habits" && <CoachHabitLibrary showToast={showToast} />}
      {tab === "forms" && <CoachForms showToast={showToast} />}
    </div>
  );
}
