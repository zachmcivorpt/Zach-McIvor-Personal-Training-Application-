import React, { useMemo, useState } from "react";
import { useApp, programPhases } from "../lib/AppContext";
import { newId } from "../lib/id";
import { Field, TextInput, TextArea, Select, PrimaryButton, BottomSheet, ExerciseThumb } from "../components/ui";
import { ClipboardList, Plus, X, Trash2, Download, Copy, Edit3, Library } from "lucide-react";
import { STARTER_PROGRAMS } from "../lib/starterPrograms";
import WorkoutEditor from "./WorkoutEditor";

function estimateWorkoutMinutes(exercises) {
  return Math.max(5, Math.round((exercises || []).reduce((a, e) => a + e.targetSets * (45 + (e.restSeconds ?? 90)), 0) / 60));
}

function NewProgramSheet({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [description, setDescription] = useState("");

  function reset() {
    setName("");
    setLevel("Beginner");
    setDescription("");
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), level, description, phases: [] });
    reset();
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Program"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="PROGRAM NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push / Pull / Legs" />
        </Field>
        <Field label="LEVEL">
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </Select>
        </Field>
        <Field label="DESCRIPTION">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this program is for, who it suits..." />
        </Field>
        <PrimaryButton type="submit" className="w-full" disabled={!name.trim()}>
          <Plus size={16} /> CREATE PROGRAM
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

// Pick a destination program + phase to copy one or more workouts into —
// the toolbar's "Copy to..." action.
function CopyWorkoutSheet({ open, onClose, programs, onCopy }) {
  const [targetProgramId, setTargetProgramId] = useState("");
  const [targetPhaseId, setTargetPhaseId] = useState("");
  const targetProgram = programs.find((p) => p.id === targetProgramId);
  const targetPhases = targetProgram ? programPhases(targetProgram) : [];

  function submit() {
    if (!targetProgramId || !targetPhaseId) return;
    onCopy(targetProgramId, targetPhaseId);
    setTargetProgramId("");
    setTargetPhaseId("");
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setTargetProgramId("");
        setTargetPhaseId("");
        onClose();
      }}
      title="Copy to..."
    >
      <div className="space-y-4">
        <Field label="PROGRAM">
          <Select
            value={targetProgramId}
            onChange={(e) => {
              setTargetProgramId(e.target.value);
              setTargetPhaseId("");
            }}
          >
            <option value="">Choose a program...</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {targetProgram && (
          <Field label="PHASE">
            <Select value={targetPhaseId} onChange={(e) => setTargetPhaseId(e.target.value)}>
              <option value="">Choose a phase...</option>
              {targetPhases.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <PrimaryButton className="w-full" disabled={!targetProgramId || !targetPhaseId} onClick={submit}>
          Copy here
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
}

// One row in the Workouts table — thumbnail, name (click to edit), a quick
// duration/exercise-count/muscle-group summary, and per-row actions.
function WorkoutRow({ day, exercisesById, selectMode, selected, onToggleSelect, onOpen, onDuplicate, onDelete }) {
  const exs = day.exercises || [];
  const firstEx = exs[0] ? exercisesById[exs[0].exerciseId] : null;

  return (
    <div className="flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 transition-colors">
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 shrink-0 accent-black" />
      )}
      <button onClick={onOpen} className="shrink-0" aria-label={`Open ${day.label}`}>
        <ExerciseThumb exercise={firstEx} size={44} rounded="rounded-lg" />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-black font-semibold text-sm truncate">{day.label}</p>
        <p className="text-black/40 text-xs truncate mt-0.5">
          est. {estimateWorkoutMinutes(exs)} min · {exs.length} exercise{exs.length === 1 ? "" : "s"}
        </p>
        {day.muscleGroups?.length > 0 && <p className="text-black/30 text-[11px] truncate mt-0.5">{day.muscleGroups.join(", ")}</p>}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 text-black/60 hover:text-black text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-black/8 transition-colors"
        >
          <Edit3 size={13} /> <span className="hidden sm:inline">Edit</span>
        </button>
        <button
          onClick={onDuplicate}
          className="flex items-center gap-1.5 text-black/50 hover:text-black text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-black/8 transition-colors"
        >
          <Copy size={13} /> <span className="hidden sm:inline">Duplicate</span>
        </button>
        <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-red-500 shrink-0" aria-label={`Delete ${day.label}`}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// The selected phase's session list — toolbar (new/from-library/select →
// copy-to/delete) above a table of WorkoutRows. This is the piece that
// replaces the old flat stack of every day's full exercise cards.
function PhaseWorkouts({ days, exercisesById, onOpenNew, onOpenFromLibrary, onEditDay, onDuplicateDay, onDeleteDays, onCopyDays }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  function toggle(i) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function cancelSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-black font-semibold text-sm">Workouts {days.length > 0 && `(${days.length})`}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {days.length >= 1 && (
            <button onClick={() => (selectMode ? cancelSelect() : setSelectMode(true))} className="text-black/50 hover:text-black text-xs font-semibold">
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          {selectMode ? (
            <>
              <button
                onClick={() => onCopyDays([...selected])}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold disabled:opacity-30"
              >
                <Copy size={13} /> Copy to...
              </button>
              <button
                onClick={() => {
                  onDeleteDays([...selected]);
                  cancelSelect();
                }}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 text-red-500 hover:text-red-600 text-xs font-semibold disabled:opacity-30"
              >
                <Trash2 size={13} /> Delete{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            </>
          ) : (
            <>
              <button onClick={onOpenFromLibrary} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold">
                <Library size={13} /> From library
              </button>
              <button onClick={onOpenNew} className="flex items-center gap-1.5 text-black/60 hover:text-black text-xs font-semibold">
                <Plus size={13} /> New workout
              </button>
            </>
          )}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
          <p className="text-black/30 text-sm">No workouts in this phase yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((d, i) => (
            <WorkoutRow
              key={d.id || i}
              day={d}
              exercisesById={exercisesById}
              selectMode={selectMode}
              selected={selected.has(i)}
              onToggleSelect={() => toggle(i)}
              onOpen={() => onEditDay(i)}
              onDuplicate={() => onDuplicateDay(i)}
              onDelete={() => onDeleteDays([i])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CoachPrograms({ showToast }) {
  const { db, createProgram, updateProgram, deleteProgram } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [confirmDeleteProgram, setConfirmDeleteProgram] = useState(false);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null); // { phaseIndex, dayIndex, day } | null
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [copyIndices, setCopyIndices] = useState(null); // array of day indices being copied, or null

  const exercises = db.exercises;
  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const masterWorkouts = db.masterWorkouts || [];

  const programs = db.programs;
  const selected = programs.find((p) => p.id === selectedId) || programs[0] || null;
  const phases = programPhases(selected);
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || phases[0] || null;
  const phaseIndex = selectedPhase ? phases.findIndex((p) => p.id === selectedPhase.id) : -1;

  function selectProgram(id) {
    setSelectedId(id);
    setSelectedPhaseId(null);
    setConfirmDeletePhase(false);
  }
  function selectPhase(id) {
    setSelectedPhaseId(id);
    setConfirmDeletePhase(false);
  }

  function savePhases(next) {
    if (!selected) return;
    updateProgram(selected.id, { phases: next });
  }

  function addPhase() {
    if (!selected) return;
    const newPhase = { id: newId("ph"), name: `Phase ${phases.length + 1}`, durationWeeks: 4, days: [] };
    savePhases([...phases, newPhase]);
    setSelectedPhaseId(newPhase.id);
    showToast("Phase added");
  }
  function renamePhase(name) {
    if (phaseIndex < 0) return;
    savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, name } : p)));
  }
  function setDuration(weeks) {
    if (phaseIndex < 0) return;
    savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, durationWeeks: weeks } : p)));
  }
  function duplicatePhase() {
    if (phaseIndex < 0) return;
    const copy = { ...JSON.parse(JSON.stringify(phases[phaseIndex])), id: newId("ph"), name: `${phases[phaseIndex].name} (copy)` };
    const next = [...phases];
    next.splice(phaseIndex + 1, 0, copy);
    savePhases(next);
    setSelectedPhaseId(copy.id);
    showToast("Phase duplicated");
  }
  function deletePhase() {
    if (phaseIndex < 0) return;
    savePhases(phases.filter((_, idx) => idx !== phaseIndex));
    setSelectedPhaseId(null);
    setConfirmDeletePhase(false);
    showToast("Phase deleted");
  }

  function openNewWorkout() {
    if (!selectedPhase) return;
    const days = selectedPhase.days || [];
    const newDay = { id: newId("d"), label: `Workout ${days.length + 1}`, muscleGroups: [], exercises: [] };
    setEditingWorkout({ phaseIndex, dayIndex: days.length, day: newDay });
  }
  function openWorkoutFromLibrary(masterWorkout) {
    if (!selectedPhase) return;
    const copiedExercises = JSON.parse(JSON.stringify(masterWorkout.exercises || [])).map((ex) => ({ ...ex, addedAt: Date.now() }));
    const newDay = {
      id: newId("d"),
      label: masterWorkout.label,
      muscleGroups: masterWorkout.muscleGroups || [],
      exercises: copiedExercises,
      instructions: masterWorkout.instructions || "",
    };
    setEditingWorkout({ phaseIndex, dayIndex: (selectedPhase.days || []).length, day: newDay });
    setLibraryPickerOpen(false);
  }
  function editDay(i) {
    if (!selectedPhase) return;
    setEditingWorkout({ phaseIndex, dayIndex: i, day: selectedPhase.days[i] });
  }
  function saveWorkout(day) {
    if (!editingWorkout) return;
    const { phaseIndex: pi, dayIndex: di } = editingWorkout;
    const nextPhases = phases.map((p, idx) => {
      if (idx !== pi) return p;
      const days = [...(p.days || [])];
      if (di < days.length) days[di] = day;
      else days.push(day);
      return { ...p, days };
    });
    savePhases(nextPhases);
    setEditingWorkout(null);
    showToast("Workout saved");
  }
  function duplicateDay(i) {
    if (!selectedPhase) return;
    const clone = { ...JSON.parse(JSON.stringify(selectedPhase.days[i])), id: newId("d"), label: `${selectedPhase.days[i].label} (copy)` };
    const days = [...selectedPhase.days];
    days.splice(i + 1, 0, clone);
    savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, days } : p)));
    showToast("Workout duplicated");
  }
  function deleteDays(indices) {
    if (!selectedPhase) return;
    const toDelete = new Set(indices);
    const days = selectedPhase.days.filter((_, idx) => !toDelete.has(idx));
    savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, days } : p)));
    showToast(indices.length === 1 ? "Workout deleted" : `${indices.length} workouts deleted`);
  }
  function copyDaysTo(indices, targetProgramId, targetPhaseId) {
    if (!selectedPhase) return;
    const daysToCopy = indices
      .map((i) => JSON.parse(JSON.stringify(selectedPhase.days[i])))
      .map((d) => ({ ...d, id: newId("d") }));
    const targetProgram = programs.find((p) => p.id === targetProgramId);
    if (!targetProgram) return;
    const targetPhases = programPhases(targetProgram);
    const nextTargetPhases = targetPhases.map((p) => (p.id === targetPhaseId ? { ...p, days: [...(p.days || []), ...daysToCopy] } : p));
    updateProgram(targetProgramId, { phases: nextTargetPhases });
    showToast(`Copied to ${targetProgram.name}`);
  }

  async function handleCreateProgram(data) {
    setNewProgramOpen(false);
    try {
      const created = await createProgram(data);
      selectProgram(created.id);
      showToast("Program created");
    } catch (err) {
      showToast(err.message || "Couldn't create that program");
    }
  }

  function handleDeleteProgram() {
    if (!selected) return;
    deleteProgram(selected.id);
    selectProgram(null);
    setConfirmDeleteProgram(false);
    showToast("Program deleted");
  }

  function deleteAllPrograms() {
    programs.forEach((p) => deleteProgram(p.id));
    selectProgram(null);
    setConfirmDeleteAll(false);
    showToast(`Deleted ${programs.length} program${programs.length === 1 ? "" : "s"}`);
  }

  async function importStarterTemplates() {
    setImporting(true);
    const existingNames = new Set(programs.map((p) => p.name));
    const toImport = STARTER_PROGRAMS.filter((p) => !existingNames.has(p.name));
    let created = 0;
    try {
      for (const template of toImport) {
        await createProgram(template);
        created++;
      }
      if (created === 0) {
        showToast("All starter templates are already in your library");
      } else {
        showToast(`Imported ${created} starter template${created === 1 ? "" : "s"}`);
      }
    } catch (err) {
      showToast(err.message || "Import stopped — something went wrong");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mb-5">
        <h1 className="text-black text-2xl font-bold">Program Templates</h1>
        <p className="text-black/40 text-sm mt-0.5">{programs.length} total · reusable phase-based programs for a client's training</p>
      </div>

      <div className="flex flex-col md:flex-row md:h-[calc(100vh-230px)] md:min-h-[520px] border border-black/8 rounded-2xl overflow-hidden">
        {/* left: program list (desktop sidebar) */}
        <div className="hidden md:flex w-64 shrink-0 border-r border-black/8 flex-col bg-[#F7F7F8]">
          <div className="p-3 border-b border-black/8 space-y-1.5">
            <button
              onClick={() => setNewProgramOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2.5 rounded-xl"
            >
              <Plus size={14} /> NEW PROGRAM
            </button>
            <button
              onClick={importStarterTemplates}
              disabled={importing}
              className="w-full flex items-center justify-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-2.5 rounded-xl disabled:opacity-50"
            >
              <Download size={13} /> {importing ? "IMPORTING…" : "IMPORT STARTERS"}
            </button>
            {programs.length > 0 &&
              (!confirmDeleteAll ? (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="w-full flex items-center justify-center gap-1.5 bg-black/8 hover:bg-red-50 hover:text-red-600 text-black/50 text-xs font-semibold px-3 py-2.5 rounded-xl"
                >
                  <Trash2 size={13} /> DELETE ALL
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={() => setConfirmDeleteAll(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold px-3 py-2.5 rounded-xl">
                    Cancel
                  </button>
                  <button onClick={deleteAllPrograms} className="flex-1 bg-red-500 text-white text-xs font-semibold px-3 py-2.5 rounded-xl">
                    Confirm
                  </button>
                </div>
              ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {programs.length === 0 && <p className="text-black/30 text-xs px-2 py-4 text-center">No programs yet.</p>}
            {programs.map((p) => {
              const active = p.id === selected?.id;
              const phaseCount = programPhases(p).length;
              return (
                <button
                  key={p.id}
                  onClick={() => selectProgram(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                    active ? "bg-black text-white" : "hover:bg-black/5 text-black"
                  }`}
                >
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className={`text-xs mt-0.5 ${active ? "text-white/50" : "text-black/35"}`}>
                    {phaseCount} phase{phaseCount === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* mobile: chip row */}
        <div className="md:hidden border-b border-black/8 p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <button onClick={() => setNewProgramOpen(true)} className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0">
              <Plus size={13} /> NEW
            </button>
            <button
              onClick={importStarterTemplates}
              disabled={importing}
              className="flex items-center gap-1.5 bg-black/8 text-black text-xs font-semibold px-3 py-2 rounded-lg shrink-0 disabled:opacity-50"
            >
              <Download size={13} /> {importing ? "IMPORTING…" : "IMPORT"}
            </button>
            {programs.length > 0 &&
              (!confirmDeleteAll ? (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="flex items-center gap-1.5 bg-black/8 text-black/50 text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              ) : (
                <>
                  <button onClick={() => setConfirmDeleteAll(false)} className="bg-black/8 text-black text-xs font-semibold px-3 py-2 rounded-lg shrink-0">
                    Cancel
                  </button>
                  <button onClick={deleteAllPrograms} className="bg-red-500 text-white text-xs font-semibold px-3 py-2 rounded-lg shrink-0">
                    Delete all
                  </button>
                </>
              ))}
          </div>
          {programs.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProgram(p.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap ${
                    p.id === selected?.id ? "bg-black text-white" : "bg-black/8 text-black/60"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* right: selected program → phase tabs → workouts table */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <ClipboardList size={28} className="text-black/20 mb-3" />
              <p className="text-black/50 text-sm">No program selected yet.</p>
              <button onClick={() => setNewProgramOpen(true)} className="mt-4 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                + New program
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <input
                  value={selected.name}
                  onChange={(e) => updateProgram(selected.id, { name: e.target.value })}
                  className="bg-transparent outline-none text-black text-xl font-bold flex-1 min-w-[140px]"
                />
                <div className="flex items-center gap-2 shrink-0">
                  {!confirmDeleteProgram ? (
                    <button
                      onClick={() => setConfirmDeleteProgram(true)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/50"
                      aria-label="Delete program"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirmDeleteProgram(false)} className="bg-black/8 text-black text-xs font-semibold px-3 py-2 rounded-lg">
                        Cancel
                      </button>
                      <button onClick={handleDeleteProgram} className="bg-red-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                        Confirm delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Select value={selected.level} onChange={(e) => updateProgram(selected.id, { level: e.target.value })} className="!py-1.5 !text-xs !w-auto">
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </Select>
                <span className="text-black/30 text-xs">{phases.reduce((a, p) => a + (p.durationWeeks || 0), 0)} weeks total</span>
              </div>

              <TextArea
                rows={2}
                value={selected.description || ""}
                onChange={(e) => updateProgram(selected.id, { description: e.target.value })}
                placeholder="What this program is for, who it suits..."
                className="mb-5"
              />

              {/* phase sub-nav */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-4 pb-1">
                {phases.map((p) => {
                  const active = p.id === selectedPhase?.id;
                  const count = (p.days || []).length;
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectPhase(p.id)}
                      className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                        active ? "bg-black text-white" : "bg-black/8 text-black/60 hover:bg-black/12"
                      }`}
                    >
                      {p.name} <span className={active ? "text-white/50" : "text-black/35"}>· {count}</span>
                    </button>
                  );
                })}
                <button
                  onClick={addPhase}
                  className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-black/[0.03] border border-dashed border-black/15 text-black/50 hover:bg-black/8"
                >
                  <Plus size={13} /> Phase
                </button>
              </div>

              {!selectedPhase ? (
                <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
                  <p className="text-black/30 text-sm">No phases in this program yet.</p>
                  <button onClick={addPhase} className="mt-4 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                    + Add phase
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                    <input
                      value={selectedPhase.name}
                      onChange={(e) => renamePhase(e.target.value)}
                      className="bg-transparent outline-none text-black font-bold text-base flex-1 min-w-[120px]"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-black/5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setDuration(Math.max(1, selectedPhase.durationWeeks - 1))}
                          className="w-7 h-7 flex items-center justify-center text-black/50"
                          aria-label="Decrease duration"
                        >
                          −
                        </button>
                        <span className="text-black text-xs font-semibold w-14 text-center">
                          {selectedPhase.durationWeeks} wk{selectedPhase.durationWeeks === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDuration(selectedPhase.durationWeeks + 1)}
                          className="w-7 h-7 flex items-center justify-center text-black/50"
                          aria-label="Increase duration"
                        >
                          +
                        </button>
                      </div>
                      <button onClick={duplicatePhase} className="w-7 h-7 flex items-center justify-center text-black/40 hover:text-black/70" aria-label="Duplicate phase">
                        <Copy size={13} />
                      </button>
                      {!confirmDeletePhase ? (
                        <button
                          onClick={() => setConfirmDeletePhase(true)}
                          className="w-7 h-7 flex items-center justify-center text-black/40 hover:text-red-500"
                          aria-label="Delete phase"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button onClick={() => setConfirmDeletePhase(false)} className="bg-black/8 text-black text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                            Cancel
                          </button>
                          <button onClick={deletePhase} className="bg-red-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-black/35 text-xs mb-5">
                    {(selectedPhase.days || []).length} session{(selectedPhase.days || []).length === 1 ? "" : "s"}
                  </p>

                  <PhaseWorkouts
                    days={selectedPhase.days || []}
                    exercisesById={exercisesById}
                    onOpenNew={openNewWorkout}
                    onOpenFromLibrary={() => setLibraryPickerOpen(true)}
                    onEditDay={editDay}
                    onDuplicateDay={duplicateDay}
                    onDeleteDays={deleteDays}
                    onCopyDays={(indices) => setCopyIndices(indices)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <NewProgramSheet open={newProgramOpen} onClose={() => setNewProgramOpen(false)} onCreate={handleCreateProgram} />

      <BottomSheet open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Add from Workout Library">
        {masterWorkouts.length === 0 ? (
          <p className="text-black/30 text-sm text-center py-6">No workout templates yet — build some in Library → Workouts.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {masterWorkouts.map((w) => (
              <button
                key={w.id}
                onClick={() => openWorkoutFromLibrary(w)}
                className="w-full flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 text-left transition-colors"
              >
                <ExerciseThumb exercise={exercisesById[w.exercises?.[0]?.exerciseId]} size={36} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-black font-semibold text-sm truncate">{w.label}</p>
                  <p className="text-black/35 text-xs truncate">
                    {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}
                    {w.muscleGroups?.length ? ` · ${w.muscleGroups.join(", ")}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      <CopyWorkoutSheet
        open={!!copyIndices}
        onClose={() => setCopyIndices(null)}
        programs={programs}
        onCopy={(targetProgramId, targetPhaseId) => {
          copyDaysTo(copyIndices, targetProgramId, targetPhaseId);
          setCopyIndices(null);
        }}
      />

      {editingWorkout && (
        <WorkoutEditor
          open={!!editingWorkout}
          day={editingWorkout.day}
          exercises={exercises}
          onClose={() => setEditingWorkout(null)}
          onSave={saveWorkout}
          showToast={showToast}
        />
      )}
    </div>
  );
}
