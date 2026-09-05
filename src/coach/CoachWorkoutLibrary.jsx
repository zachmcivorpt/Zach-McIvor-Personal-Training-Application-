import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card } from "../components/ui";
import WorkoutEditor from "./WorkoutEditor";
import { countExercises } from "../lib/workoutStats";
import { Plus, Dumbbell, Trash2 } from "lucide-react";

export default function CoachWorkoutLibrary({ showToast }) {
  const { db, createMasterWorkout, updateMasterWorkout, deleteMasterWorkout } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | workout | null
  const workouts = db.masterWorkouts || [];

  function handleSave(day) {
    if (editing?.id) {
      updateMasterWorkout(editing.id, day);
      showToast("Workout template updated");
    } else {
      createMasterWorkout(day);
      showToast("Workout template created");
    }
    setEditing(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-black/40 text-sm">{workouts.length} total · reusable building blocks for any program</p>
        <button
          onClick={() => setEditing({ isNew: true })}
          aria-label="New workout"
          className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">NEW WORKOUT</span>
        </button>
      </div>

      {workouts.length === 0 ? (
        <Card>
          <p className="text-black/40 text-sm text-center py-6">No workout templates yet — build your first one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {workouts.map((w) => (
            <Card key={w.id} onClick={() => setEditing(w)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Dumbbell size={16} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-black font-semibold text-sm truncate">{w.label}</p>
                  <p className="text-black/40 text-xs truncate mt-0.5">
                    {countExercises(w.exercises)} exercise{countExercises(w.exercises) === 1 ? "" : "s"}
                    {w.muscleGroups?.length ? ` · ${w.muscleGroups.join(", ")}` : ""}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMasterWorkout(w.id);
                    showToast("Workout template deleted");
                  }}
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-black/25 hover:text-black/60"
                  aria-label={`Delete ${w.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <WorkoutEditor open={!!editing} day={editing.isNew ? null : editing} exercises={db.exercises} onClose={() => setEditing(null)} onSave={handleSave} showToast={showToast} />
      )}
    </div>
  );
}
