import React, { useMemo, useState } from "react";
import { useApp } from "../lib/AppContext";
import { TextInput, TextArea, Select, ExerciseThumb } from "../components/ui";
import { X, Plus, GripVertical, Search, Video, Dumbbell, Link2, RefreshCw, Ungroup, Edit3, Play, Hand, Copy, Trash2 } from "lucide-react";
import { ExerciseSheet } from "./CoachExercises";
import { parseVideoUrl } from "../lib/video";

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];
const REST_PRESETS = [0, 30, 45, 60, 90, 120, 180, 240];
const GROUP_LABELS = { superset: "SUPERSET", circuit: "CIRCUIT" };
const GROUP_ICONS = { superset: Link2, circuit: RefreshCw };
const SECTIONS = [
  { key: "warmup", label: "Warm-up", hint: "Dynamic stretches & activation" },
  { key: "main", label: "Main Session", hint: "" },
  { key: "cooldown", label: "Cool-down", hint: "Static stretches" },
];

function formatRest(seconds) {
  if (seconds === 0) return "None";
  if (seconds >= 60) {
    const min = seconds / 60;
    return `${min} min`;
  }
  return `${seconds} sec`;
}

function newRow(exerciseId, section = "main") {
  return {
    exerciseId,
    section,
    targetSets: 3,
    targetReps: 10,
    targetType: "reps",
    targetRIR: 2,
    restSeconds: 90,
    notes: "",
    groupId: null,
    groupType: null,
    // When this exercise entered the program — used to flag exercises
    // that have sat unchanged for a long stretch (see staleExerciseWeeks
    // in CoachClientDetail.jsx). Meaningless on master library templates,
    // but stamped everywhere newRow() is used for consistency.
    addedAt: Date.now(),
  };
}

// A standalone rest marker between exercises — no exerciseId/sets/reps,
// just a rest period. Every consumer of a day's `exercises` array that
// counts exercises or sums duration must skip these (see countExercises
// above); anything that only reads a specific exercise by id already
// ignores rows with no exerciseId and is unaffected.
function newRestRow(section = "main") {
  return { isRest: true, section, restSeconds: 90 };
}

// Full-screen desktop editor for one workout (a "day"): instructions +
// an exercise table on the left, a searchable exercise picker on the right.
// Used both for a client's own phase workouts and the shared program
// template library, so sets/reps/RIR/rest/notes only need building once.
export default function WorkoutEditor({ open, day, exercises, onClose, onSave, showToast }) {
  const { createExercise } = useApp();
  const [label, setLabel] = useState(day?.label || "");
  const [instructions, setInstructions] = useState(day?.instructions || "");
  const [muscleGroups, setMuscleGroups] = useState((day?.muscleGroups || []).join(", "));
  const [rows, setRows] = useState(day?.exercises || []);
  const [search, setSearch] = useState("");
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", category: "", equipment: "Barbell" });
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [mobilePanel, setMobilePanel] = useState("editor"); // "editor" | "picker" — mobile-only tab switch
  const [addSection, setAddSection] = useState("main"); // which section new exercises from the picker land in
  const [editingExercise, setEditingExercise] = useState(null); // exercise being edited inline (name/video/etc.)

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
  function removeRows(indices) {
    const toRemove = new Set(indices);
    setRows((r) => r.filter((_, idx) => !toRemove.has(idx)));
    setSelected(new Set());
  }
  function duplicateRows(indices) {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length === 0) return;
    setRows((r) => {
      const insertAt = sorted[sorted.length - 1] + 1;
      const clones = sorted.map((i) => ({ ...r[i], groupId: null, groupType: null }));
      return [...r.slice(0, insertAt), ...clones, ...r.slice(insertAt)];
    });
    setSelected(new Set());
  }
  function addRest() {
    setRows((r) => {
      const insertAt = selected.size > 0 ? Math.max(...selected) + 1 : r.length;
      return [...r.slice(0, insertAt), newRestRow(addSection), ...r.slice(insertAt)];
    });
  }
  function handleDragStart(i) {
    setDragIndex(i);
  }
  function handleDragOver(e, i) {
    e.preventDefault();
    if (overIndex !== i) setOverIndex(i);
  }
  function handleDrop(i) {
    setRows((r) => {
      if (dragIndex === null || dragIndex === i) return r;
      const next = [...r];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(null);
    setOverIndex(null);
  }
  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }
  function toggleSelected(i) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function toggleSelectAll(indices) {
    setSelected((s) => (indices.length > 0 && indices.every((i) => s.has(i)) ? new Set() : new Set(indices)));
  }
  function groupSelected(type) {
    const indexSet = new Set([...selected].filter((i) => !rows[i]?.isRest));
    const indices = [...indexSet].sort((a, b) => a - b);
    if (indices.length < 2) return;
    const groupId = `grp_${Date.now()}`;
    setRows((r) => {
      // move every selected row to be contiguous, right after the first one
      const chosen = indices.map((i) => r[i]);
      const rest = r.filter((_, i) => !indexSet.has(i));
      const insertAt = indices[0];
      const next = [...rest.slice(0, insertAt), ...chosen.map((row) => ({ ...row, groupId, groupType: type })), ...rest.slice(insertAt)];
      return next;
    });
    setSelected(new Set());
  }
  function ungroup(groupId) {
    setRows((r) => r.map((row) => (row.groupId === groupId ? { ...row, groupId: null, groupType: null } : row)));
  }
  function addExercise(exerciseId) {
    setRows((r) => [...r, newRow(exerciseId, addSection)]);
    setMobilePanel("editor");
  }
  async function addCustomExercise() {
    if (!customForm.name.trim()) return;
    try {
      const ex = await createExercise({
        name: customForm.name.trim(),
        category: customForm.category.trim() || "Custom",
        equipment: customForm.equipment,
        difficulty: "Intermediate",
        primaryMuscles: [],
      });
      addExercise(ex.id);
      setCustomForm({ name: "", category: "", equipment: "Barbell" });
      setAddCustomOpen(false);
    } catch (err) {
      showToast?.(err.message || "Couldn't add that exercise");
    }
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

  const allIndices = rows.map((_, i) => i);
  const allChecked = rows.length > 0 && rows.every((_, i) => selected.has(i));

  return (
    <div className="fixed inset-0 z-[95] bg-white flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3.5 border-b border-black/8 shrink-0 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <span className="hidden sm:inline text-black/40 text-sm font-medium shrink-0">Workout:</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Workout name"
            className="bg-transparent outline-none text-black font-bold text-base md:text-lg min-w-0 flex-1 border-b border-transparent focus:border-black/20"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={save} className="bg-black text-white text-sm font-bold px-4 md:px-5 py-2.5 rounded-xl">
            SAVE
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/8 text-black/60">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* mobile panel switch */}
      <div className="md:hidden flex gap-2 px-4 py-2.5 border-b border-black/8 shrink-0">
        <button
          onClick={() => setMobilePanel("editor")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${mobilePanel === "editor" ? "bg-black text-white" : "bg-black/8 text-black/60"}`}
        >
          Editor {rows.length > 0 && `(${rows.length})`}
        </button>
        <button
          onClick={() => setMobilePanel("picker")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${mobilePanel === "picker" ? "bg-black text-white" : "bg-black/8 text-black/60"}`}
        >
          Add Exercises
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left: instructions + exercise table */}
        <div
          className={`${
            mobilePanel === "picker" ? "hidden" : "flex-1"
          } md:block md:flex-1 overflow-y-auto px-4 md:px-6 py-5 md:border-r border-black/8`}
        >
          <p className="text-black/40 text-[11px] font-semibold tracking-wide mb-2">INSTRUCTIONS</p>
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

          <p className="text-black/40 text-[11px] font-semibold tracking-wide mb-2">
            EXERCISES {rows.length > 0 && `(${rows.length})`}
          </p>

          {/* toolbar: select-all, superset/circuit grouping, duplicate/delete, add rest */}
          {rows.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => toggleSelectAll(allIndices)}
                className="w-4 h-4 accent-black shrink-0 mr-1"
                aria-label="Select all rows"
              />
              <button
                onClick={() => groupSelected("superset")}
                disabled={selected.size < 2}
                className="flex items-center gap-1 bg-black/8 hover:bg-black/15 text-black/70 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
              >
                <Link2 size={11} /> SUPERSET
              </button>
              <button
                onClick={() => groupSelected("circuit")}
                disabled={selected.size < 2}
                className="flex items-center gap-1 bg-black/8 hover:bg-black/15 text-black/70 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
              >
                <RefreshCw size={11} /> CIRCUIT
              </button>
              <button
                onClick={() => duplicateRows([...selected])}
                disabled={selected.size === 0}
                className="w-7 h-7 flex items-center justify-center text-black/50 hover:text-black rounded-lg hover:bg-black/8 disabled:opacity-30"
                aria-label="Duplicate selected"
              >
                <Copy size={13} />
              </button>
              <button
                onClick={() => removeRows([...selected])}
                disabled={selected.size === 0}
                className="w-7 h-7 flex items-center justify-center text-black/50 hover:text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-30"
                aria-label="Delete selected"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={addRest}
                className="ml-auto flex items-center gap-1.5 bg-black text-white text-[11px] font-bold px-3 py-1.5 rounded-lg"
              >
                <Hand size={12} /> ADD REST
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
              <p className="text-black/30 text-sm mb-3">No exercises yet — add some from the library on the right.</p>
              <button onClick={addRest} className="inline-flex items-center gap-1.5 bg-black/8 text-black/60 text-xs font-bold px-3 py-1.5 rounded-lg">
                <Hand size={12} /> ADD REST
              </button>
            </div>
          ) : (
            <>
              {/* column header, desktop only */}
              <div className="hidden md:grid grid-cols-[20px_1fr_64px_1fr_104px_20px] gap-3 px-1 mb-1.5">
                <span />
                <span className="text-black/30 text-[10px] font-bold tracking-wide">EXERCISE NAME</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide">SETS</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide">TARGET</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide">REST PERIOD</span>
                <span />
              </div>

              {SECTIONS.map((section) => {
                const sectionRows = rows.map((row, i) => ({ row, i })).filter(({ row }) => (row.section || "main") === section.key);
                if (rows.length > 0 && sectionRows.length === 0 && section.key !== "main") return null;
                return (
                  <div key={section.key} className="mb-6">
                    {rows.some((r) => (r.section || "main") !== "main") && (
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-black/40 text-[11px] font-bold tracking-wide">
                          {section.label.toUpperCase()} {sectionRows.length > 0 && `(${sectionRows.length})`}
                        </p>
                        {section.hint && <p className="text-black/25 text-[10px]">{section.hint}</p>}
                      </div>
                    )}
                    {sectionRows.length === 0 ? (
                      rows.some((r) => (r.section || "main") !== "main") && (
                        <p className="text-black/25 text-xs mb-2">No {section.label.toLowerCase()} exercises yet.</p>
                      )
                    ) : (
                      <div className="space-y-2 md:space-y-0.5">
                        {sectionRows.map(({ row, i }) => {
                          const ex = row.isRest ? null : exercisesById[row.exerciseId];
                          const GroupIcon = row.groupType ? GROUP_ICONS[row.groupType] : null;
                          return (
                            <div
                              key={i}
                              onDragOver={(e) => handleDragOver(e, i)}
                              onDrop={() => handleDrop(i)}
                              className={overIndex === i && dragIndex !== null && dragIndex !== i ? "border-t-2 border-black/40" : ""}
                            >
                              {row.groupType && (
                                <div className="flex items-center gap-1.5 mt-2 mb-1">
                                  <GroupIcon size={11} className="text-black/50" />
                                  <span className="text-black/50 text-[10px] font-bold tracking-wide">{GROUP_LABELS[row.groupType]}</span>
                                  <button onClick={() => ungroup(row.groupId)} className="text-black/30 hover:text-black/60 flex items-center gap-0.5 text-[10px]">
                                    <Ungroup size={11} /> Ungroup
                                  </button>
                                </div>
                              )}

                              {row.isRest ? (
                                <div
                                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                                    dragIndex === i ? "opacity-40" : "bg-amber-50 border border-amber-200/70"
                                  }`}
                                >
                                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} className="w-4 h-4 shrink-0 accent-black" />
                                  <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
                                    <Hand size={13} className="text-white" />
                                  </div>
                                  <p className="text-black/60 font-semibold text-sm flex-1">Rest</p>
                                  <select
                                    value={row.restSeconds ?? 90}
                                    onChange={(e) => updateRow(i, { restSeconds: +e.target.value })}
                                    className="bg-white border border-amber-200 rounded-lg text-center text-black text-sm py-1.5 px-2 outline-none w-24 shrink-0"
                                  >
                                    {REST_PRESETS.map((s) => (
                                      <option key={s} value={s}>
                                        {formatRest(s)}
                                      </option>
                                    ))}
                                  </select>
                                  <div
                                    draggable
                                    onDragStart={() => handleDragStart(i)}
                                    onDragEnd={handleDragEnd}
                                    className="text-black/25 hover:text-black/50 shrink-0 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical size={16} />
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`bg-black/[0.03] border rounded-2xl p-3.5 md:rounded-xl md:p-2 transition-colors md:grid md:grid-cols-[20px_1fr_64px_1fr_104px_20px] md:gap-3 md:items-center ${
                                    dragIndex === i ? "opacity-40" : "border-black/8"
                                  }`}
                                >
                                  {/* checkbox — own column on desktop, inline on mobile */}
                                  <div className="hidden md:flex items-center justify-center">
                                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} className="w-4 h-4 accent-black" />
                                  </div>

                                  {/* name + thumb — on mobile this row also carries its own checkbox/drag/edit;
                                      on desktop those three are hidden here since they get their own grid columns */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={selected.has(i)}
                                      onChange={() => toggleSelected(i)}
                                      className="w-4 h-4 shrink-0 accent-black md:hidden"
                                    />
                                    <div
                                      draggable
                                      onDragStart={() => handleDragStart(i)}
                                      onDragEnd={handleDragEnd}
                                      className="text-black/25 hover:text-black/50 shrink-0 cursor-grab active:cursor-grabbing md:hidden"
                                    >
                                      <GripVertical size={16} />
                                    </div>
                                    <ExerciseThumb exercise={ex} size={32} rounded="rounded-lg" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-black font-semibold text-sm truncate">{ex?.name || "Unknown exercise"}</p>
                                      {ex && <p className="text-black/35 text-[11px] truncate md:hidden">{ex.equipment} · {ex.category}</p>}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEditingExercise(ex)}
                                      disabled={!ex}
                                      className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60 disabled:opacity-30 md:hidden"
                                      aria-label="Edit this exercise"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                  </div>

                                  {/* sets */}
                                  <div className="mt-2.5 md:mt-0">
                                    <p className="text-black/30 text-[10px] mb-1 md:hidden">SETS</p>
                                    <input
                                      type="number"
                                      min={1}
                                      value={row.targetSets}
                                      onChange={(e) => updateRow(i, { targetSets: +e.target.value })}
                                      className="w-full bg-black/5 rounded-lg text-center text-black text-sm py-1.5 outline-none"
                                    />
                                  </div>

                                  {/* target: reps/time toggle + value + notes */}
                                  <div className="mt-2.5 md:mt-0">
                                    <div className="flex items-center justify-between mb-1 gap-1 md:mb-1">
                                      <p className="text-black/30 text-[10px] shrink-0 md:hidden">{row.targetType === "time" ? "TIME" : "REPETITIONS"}</p>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateRow(i, row.targetType === "time" ? { targetType: "reps", targetReps: 10 } : { targetType: "time", targetReps: 30 })
                                          }
                                          className="text-[9px] font-bold px-1.5 rounded bg-black/8 text-black/40"
                                        >
                                          {row.targetType === "time" ? "REPS" : "TIME"}
                                        </button>
                                        {row.targetType !== "time" && (
                                          <button
                                            type="button"
                                            onClick={() => updateRow(i, { targetReps: row.targetReps === "AMRAP" ? 10 : "AMRAP" })}
                                            className={`text-[9px] font-bold px-1.5 rounded ${
                                              row.targetReps === "AMRAP" ? "bg-black text-white" : "bg-black/8 text-black/40"
                                            }`}
                                          >
                                            AMRAP
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {row.targetType === "time" ? (
                                        <div className="flex items-center gap-1 flex-1">
                                          <button
                                            type="button"
                                            onClick={() => updateRow(i, { targetReps: Math.max(10, (Number(row.targetReps) || 30) - 10) })}
                                            className="w-6 h-[30px] shrink-0 rounded-lg bg-black/5 text-black/50 text-sm font-bold"
                                          >
                                            −
                                          </button>
                                          <div className="flex-1 bg-black/5 rounded-lg text-center text-black text-sm py-1.5 font-semibold">
                                            {row.targetReps || 30}s
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => updateRow(i, { targetReps: (Number(row.targetReps) || 30) + 10 })}
                                            className="w-6 h-[30px] shrink-0 rounded-lg bg-black/5 text-black/50 text-sm font-bold"
                                          >
                                            +
                                          </button>
                                        </div>
                                      ) : row.targetReps === "AMRAP" ? (
                                        <div className="flex-1 bg-black/5 rounded-lg text-center text-black text-sm py-1.5 font-semibold">AMRAP</div>
                                      ) : (
                                        <input
                                          type="number"
                                          min={1}
                                          value={row.targetReps}
                                          onChange={(e) => updateRow(i, { targetReps: +e.target.value })}
                                          className="w-14 shrink-0 bg-black/5 rounded-lg text-center text-black text-sm py-1.5 outline-none"
                                        />
                                      )}
                                      <input
                                        value={row.notes || ""}
                                        onChange={(e) => updateRow(i, { notes: e.target.value })}
                                        placeholder="Note / cue..."
                                        className="flex-1 min-w-0 bg-black/5 rounded-lg px-2.5 py-1.5 text-black text-xs outline-none placeholder:text-black/25"
                                      />
                                    </div>
                                  </div>

                                  {/* rest period */}
                                  <div className="mt-2.5 md:mt-0">
                                    <p className="text-black/30 text-[10px] mb-1 md:hidden">REST</p>
                                    <select
                                      value={row.restSeconds ?? 90}
                                      onChange={(e) => updateRow(i, { restSeconds: +e.target.value })}
                                      className="w-full bg-black/5 rounded-lg text-center text-black text-sm py-1.5 outline-none appearance-none"
                                    >
                                      {REST_PRESETS.map((s) => (
                                        <option key={s} value={s}>
                                          {formatRest(s)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="mt-2.5 md:hidden">
                                    <p className="text-black/30 text-[10px] mb-1">TARGET RIR (REPS IN RESERVE)</p>
                                    <div className="flex gap-1.5">
                                      {RIR_OPTIONS.map((v) => (
                                        <button
                                          key={v}
                                          onClick={() => updateRow(i, { targetRIR: v })}
                                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                                            (row.targetRIR ?? 2) === v ? "bg-black text-white" : "bg-black/8 text-black/50"
                                          }`}
                                        >
                                          {v}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* drag handle — desktop only column */}
                                  <div
                                    draggable
                                    onDragStart={() => handleDragStart(i)}
                                    onDragEnd={handleDragEnd}
                                    className="hidden md:flex items-center justify-center text-black/25 hover:text-black/50 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical size={16} />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* right: exercise picker */}
        <div
          className={`${
            mobilePanel === "editor" ? "hidden" : "flex-1"
          } md:block md:flex-none md:w-[380px] shrink-0 overflow-y-auto px-4 md:px-5 py-5`}
        >
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5 mb-3">
            <Search size={15} className="text-black/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for an exercise"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>

          <div className="mb-3">
            <p className="text-black/30 text-[10px] font-semibold tracking-wide mb-1.5">ADDING TO</p>
            <div className="flex gap-1.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAddSection(s.key)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${
                    addSection === s.key ? "bg-black text-white" : "bg-black/8 text-black/40"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {!addCustomOpen ? (
            <button onClick={() => setAddCustomOpen(true)} className="text-black/60 text-xs font-semibold flex items-center gap-1.5 mb-4">
              <Plus size={13} /> Add custom exercise
            </button>
          ) : (
            <div className="bg-black/[0.03] border border-black/8 rounded-xl p-3 space-y-2 mb-4">
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
                <button onClick={() => setAddCustomOpen(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-2 rounded-lg">
                  Cancel
                </button>
                <button onClick={addCustomExercise} className="flex-1 bg-black text-white text-xs font-bold py-2 rounded-lg">
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((ex) => (
              <div key={ex.id} className="relative bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl p-3 transition-colors">
                <button type="button" onClick={() => addExercise(ex.id)} className="w-full text-left">
                  <div className="relative w-full aspect-square rounded-lg bg-black/8 overflow-hidden flex items-center justify-center mb-2">
                    {(() => {
                      const parsed = ex.videoUrl ? parseVideoUrl(ex.videoUrl) : null;
                      if (!parsed) return <Dumbbell size={20} className="text-black/35" />;
                      if (parsed.kind === "file") {
                        return <video src={parsed.src} muted playsInline preload="metadata" className="w-full h-full object-cover" />;
                      }
                      if (parsed.thumbnail) {
                        return (
                          <>
                            <img src={parsed.thumbnail} alt="" className="w-full h-full object-cover" />
                            <Play size={18} className="absolute text-white drop-shadow" fill="white" />
                          </>
                        );
                      }
                      return <Video size={20} className="text-black/50" />;
                    })()}
                  </div>
                  <p className="text-black text-xs font-semibold leading-tight line-clamp-2 pr-5">{ex.name}</p>
                  <p className="text-black/35 text-[10px] mt-0.5">{ex.equipment}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingExercise(ex)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-black/50 hover:text-black hover:bg-white"
                  aria-label={`View or edit ${ex.name}`}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-black/30 text-xs col-span-2 text-center py-6">No exercises match.</p>}
          </div>
        </div>
      </div>

      <ExerciseSheet
        exercise={editingExercise}
        open={!!editingExercise}
        onClose={() => setEditingExercise(null)}
        showToast={showToast || (() => {})}
      />
    </div>
  );
}
