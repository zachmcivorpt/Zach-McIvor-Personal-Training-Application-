import React, { useMemo, useState } from "react";
import { useApp } from "../lib/AppContext";
import { TextInput, TextArea, Select } from "../components/ui";
import { X, Plus, Trash2, ChevronUp, ChevronDown, Search, Video, Dumbbell } from "lucide-react";

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];
const REST_PRESETS = [30, 45, 60, 90, 120, 180, 240];

function formatRest(seconds) {
  if (seconds >= 60) {
    const min = seconds / 60;
    return `${min} min`;
  }
  return `${seconds} sec`;
}

function newRow(exerciseId) {
  return { exerciseId, targetSets: 3, targetReps: 10, targetRIR: 2, restSeconds: 90, notes: "" };
}

// Full-screen desktop editor for one workout (a "day"): instructions +
// an exercise table on the left, a searchable exercise picker on the right.
// Used both for a client's own phase workouts and the shared program
// template library, so sets/reps/RIR/rest/notes only need building once.
export default function WorkoutEditor({ open, day, exercises, onClose, onSave }) {
  const { createExercise } = useApp();
  const [label, setLabel] = useState(day?.label || "");
  const [instructions, setInstructions] = useState(day?.instructions || "");
  const [muscleGroups, setMuscleGroups] = useState((day?.muscleGroups || []).join(", "));
  const [rows, setRows] = useState(day?.exercises || []);
  const [search, setSearch] = useState("");
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", category: "", equipment: "Barbell" });

  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const filtered = useMemo(
    () =>
      exercises
        .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, search]
  );

  if (!open) return null;

  function updateRow(i, patch) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRow(i) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function moveRow(i, dir) {
    setRows((r) => {
      const next = [...r];
      const j = i + dir;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addExercise(exerciseId) {
    setRows((r) => [...r, newRow(exerciseId)]);
  }
  function addCustomExercise() {
    if (!customForm.name.trim()) return;
    const ex = createExercise({
      name: customForm.name.trim(),
      category: customForm.category.trim() || "Custom",
      equipment: customForm.equipment,
      difficulty: "Intermediate",
      primaryMuscles: [],
    });
    addExercise(ex.id);
    setCustomForm({ name: "", category: "", equipment: "Barbell" });
    setAddCustomOpen(false);
  }
  function save() {
    onSave({
      ...day,
      label: label.trim() || "Untitled workout",
      instructions,
      muscleGroups: muscleGroups.split(",").map((s) => s.trim()).filter(Boolean),
      exercises: rows,
    });
  }

  return (
    <div className="fixed inset-0 z-[95] bg-[#0A0A0B] flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/40 text-sm font-medium shrink-0">Workout:</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Workout name"
            className="bg-transparent outline-none text-white font-bold text-lg min-w-0 border-b border-transparent focus:border-white/20"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={save} className="bg-white text-black text-sm font-bold px-5 py-2.5 rounded-xl">
            SAVE
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/8 text-white/60">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left: instructions + exercise table */}
        <div className="flex-1 overflow-y-auto px-6 py-5 border-r border-white/8">
          <p className="text-white/40 text-[11px] font-semibold tracking-wide mb-2">INSTRUCTIONS</p>
          <TextArea
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="(Optional) A short summary of this workout or general cues, e.g. rest times / overall focus for the client."
            className="mb-3"
          />
          <TextInput
            value={muscleGroups}
            onChange={(e) => setMuscleGroups(e.target.value)}
            placeholder="Muscle groups (comma separated) — e.g. Chest, Shoulders, Triceps"
            className="text-sm mb-6"
          />

          <p className="text-white/40 text-[11px] font-semibold tracking-wide mb-3">
            EXERCISES {rows.length > 0 && `(${rows.length})`}
          </p>

          {rows.length === 0 && (
            <div className="border border-dashed border-white/12 rounded-2xl py-10 text-center">
              <p className="text-white/30 text-sm">No exercises yet — add some from the library on the right.</p>
            </div>
          )}

          <div className="space-y-2.5">
            {rows.map((row, i) => {
              const ex = exercisesById[row.exerciseId];
              return (
                <div key={i} className="bg-white/[0.03] border border-white/8 rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-white/30 disabled:opacity-20 hover:text-white/60">
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => moveRow(i, 1)}
                        disabled={i === rows.length - 1}
                        className="text-white/30 disabled:opacity-20 hover:text-white/60"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                      {ex?.videoUrl ? <Video size={15} className="text-white/60" /> : <Dumbbell size={15} className="text-white/40" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{ex?.name || "Unknown exercise"}</p>
                      {ex && <p className="text-white/35 text-[11px] truncate">{ex.equipment} · {ex.category}</p>}
                    </div>
                    <button onClick={() => removeRow(i)} className="w-7 h-7 shrink-0 flex items-center justify-center text-white/30 hover:text-white/60">
                      <X size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <p className="text-white/30 text-[10px] mb-1">SETS</p>
                      <input
                        type="number"
                        min={1}
                        value={row.targetSets}
                        onChange={(e) => updateRow(i, { targetSets: +e.target.value })}
                        className="w-full bg-white/5 rounded-lg text-center text-white text-sm py-1.5 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-white/30 text-[10px] mb-1">REPS</p>
                      <input
                        type="number"
                        min={1}
                        value={row.targetReps}
                        onChange={(e) => updateRow(i, { targetReps: +e.target.value })}
                        className="w-full bg-white/5 rounded-lg text-center text-white text-sm py-1.5 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-white/30 text-[10px] mb-1">REST</p>
                      <select
                        value={row.restSeconds ?? 90}
                        onChange={(e) => updateRow(i, { restSeconds: +e.target.value })}
                        className="w-full bg-white/5 rounded-lg text-center text-white text-sm py-1.5 outline-none appearance-none"
                      >
                        {REST_PRESETS.map((s) => (
                          <option key={s} value={s}>
                            {formatRest(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <p className="text-white/30 text-[10px] mb-1">TARGET RIR (REPS IN RESERVE)</p>
                    <div className="flex gap-1.5">
                      {RIR_OPTIONS.map((v) => (
                        <button
                          key={v}
                          onClick={() => updateRow(i, { targetRIR: v })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                            (row.targetRIR ?? 2) === v ? "bg-white text-black" : "bg-white/8 text-white/50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    value={row.notes || ""}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="Cue or note for this exercise (tempo, form reminder...)"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 mt-2.5 text-white text-xs outline-none placeholder:text-white/25"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* right: exercise picker */}
        <div className="w-[380px] shrink-0 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 mb-3">
            <Search size={15} className="text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for an exercise"
              className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30"
            />
          </div>

          {!addCustomOpen ? (
            <button onClick={() => setAddCustomOpen(true)} className="text-white/60 text-xs font-semibold flex items-center gap-1.5 mb-4">
              <Plus size={13} /> Add custom exercise
            </button>
          ) : (
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3 space-y-2 mb-4">
              <TextInput
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Exercise name"
                className="text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  value={customForm.category}
                  onChange={(e) => setCustomForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Category"
                  className="text-sm"
                />
                <Select value={customForm.equipment} onChange={(e) => setCustomForm((f) => ({ ...f, equipment: e.target.value }))}>
                  {["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Band"].map((eq) => (
                    <option key={eq}>{eq}</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAddCustomOpen(false)} className="flex-1 bg-white/8 text-white text-xs font-semibold py-2 rounded-lg">
                  Cancel
                </button>
                <button onClick={addCustomExercise} className="flex-1 bg-white text-black text-xs font-bold py-2 rounded-lg">
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((ex) => (
              <button
                key={ex.id}
                onClick={() => addExercise(ex.id)}
                className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/8 rounded-xl p-3 text-left transition-colors"
              >
                <div className="w-full aspect-square rounded-lg bg-white/8 flex items-center justify-center mb-2">
                  {ex.videoUrl ? <Video size={20} className="text-white/50" /> : <Dumbbell size={20} className="text-white/35" />}
                </div>
                <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{ex.name}</p>
                <p className="text-white/35 text-[10px] mt-0.5">{ex.equipment}</p>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-white/30 text-xs col-span-2 text-center py-6">No exercises match.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
