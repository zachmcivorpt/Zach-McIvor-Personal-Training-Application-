import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp, programPhases } from "../lib/AppContext";
import { newId } from "../lib/id";
import { Field, TextInput, TextArea, Select, PrimaryButton, BottomSheet, ExerciseThumb } from "../components/ui";
import { ClipboardList, Plus, Trash2, Download, Copy, Library, Search, MoreVertical, Check } from "lucide-react";
import { STARTER_PROGRAMS } from "../lib/starterPrograms";
import { countExercises, estimateWorkoutMinutes } from "../lib/workoutStats";
import WorkoutEditor from "./WorkoutEditor";

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
// the toolbar's / row's "Copy to..." action.
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

// Small "..." popover for a row's less-common actions.
function RowMenu({ onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center text-black/40 hover:text-black rounded-lg hover:bg-black/8"
        aria-label="More actions"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-black/10 rounded-xl shadow-lg py-1 w-36">
          <button
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-black/70 hover:bg-black/5 text-left"
          >
            <Copy size={13} /> Duplicate
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 text-left"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// One row in the Workouts table — checkbox, thumbnail, name (click to
// edit), a quick duration/exercise-count/muscle-group summary, and
// Edit / Copy to / ⋯ actions, mirroring Trainerize's workout row.
function WorkoutRow({ day, exercisesById, selected, onToggleSelect, onOpen, onCopy, onDuplicate, onDelete }) {
  const exs = day.exercises || [];
  const firstReal = exs.find((e) => !e.isRest);
  const firstEx = firstReal ? exercisesById[firstReal.exerciseId] : null;

  return (
    <div className="flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 transition-colors">
      <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 shrink-0 accent-black" aria-label={`Select ${day.label}`} />
      <button onClick={onOpen} className="shrink-0" aria-label={`Open ${day.label}`}>
        <ExerciseThumb exercise={firstEx} size={44} rounded="rounded-lg" />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-blue-700 font-semibold text-sm truncate hover:underline">{day.label}</p>
        <p className="text-black/40 text-xs truncate mt-0.5">
          est. {estimateWorkoutMinutes(exs)} min · {countExercises(exs)} exercise{countExercises(exs) === 1 ? "" : "s"}
        </p>
        {day.muscleGroups?.length > 0 && <p className="text-black/30 text-[11px] truncate mt-0.5">{day.muscleGroups.join(", ")}</p>}
      </button>
      <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs font-semibold">
        <button onClick={onOpen} className="text-black/55 hover:text-black">
          Edit
        </button>
        <button onClick={onCopy} className="text-black/55 hover:text-black">
          Copy to
        </button>
      </div>
      <RowMenu onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>
  );
}

// The selected phase's session list — toolbar (New / Import / Copy to /
// Delete, a select-all checkbox, and a search box) above a table of
// WorkoutRows, matching Trainerize's own Workouts table.
function PhaseWorkouts({ days, exercisesById, onOpenNew, onOpenFromLibrary, onEditDay, onDuplicateDay, onDeleteDays, onCopyDays }) {
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");

  function toggle(i) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function toggleAll(indices) {
    setSelected((s) => (indices.length > 0 && indices.every((i) => s.has(i)) ? new Set() : new Set(indices)));
  }

  const filtered = days.map((d, i) => ({ d, i })).filter(({ d }) => d.label.toLowerCase().includes(search.toLowerCase()));
  const filteredIndices = filtered.map(({ i }) => i);
  const allChecked = filteredIndices.length > 0 && filteredIndices.every((i) => selected.has(i));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-black font-semibold text-sm">Workouts {days.length > 0 && `(${days.length})`}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onOpenNew} className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-1.5 rounded-lg">
            <Plus size={13} /> New
          </button>
          <button onClick={onOpenFromLibrary} className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-1.5 rounded-lg">
            <Library size={13} /> Import
          </button>
          <button
            onClick={() => onCopyDays([...selected])}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-30"
          >
            <Copy size={13} /> Copy to
          </button>
          <button
            onClick={() => {
              onDeleteDays([...selected]);
              setSelected(new Set());
            }}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 bg-black/8 hover:bg-red-50 hover:text-red-600 text-black/60 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-30"
          >
            <Trash2 size={13} /> Delete{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      {days.length > 0 && (
        <div className="flex items-center gap-2.5 mb-3">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => toggleAll(filteredIndices)}
            className="w-4 h-4 accent-black shrink-0"
            aria-label="Select all workouts"
          />
          <div className="flex items-center gap-2 bg-black/5 rounded-lg px-2.5 py-1.5 flex-1 max-w-xs">
            <Search size={13} className="text-black/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workouts"
              className="bg-transparent outline-none text-black text-xs flex-1 placeholder:text-black/30"
            />
          </div>
        </div>
      )}

      {days.length === 0 ? (
        <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
          <p className="text-black/30 text-sm">No workouts in this phase yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-6">No workouts match "{search}".</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ d, i }) => (
            <WorkoutRow
              key={d.id || i}
              day={d}
              exercisesById={exercisesById}
              selected={selected.has(i)}
              onToggleSelect={() => toggle(i)}
              onOpen={() => onEditDay(i)}
              onCopy={() => onCopyDays([i])}
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
  const [programDraft, setProgramDraft] = useState({ name: "", level: "Beginner", description: "" });
  const [savingProgram, setSavingProgram] = useState(false);
  const [phaseNameDraft, setPhaseNameDraft] = useState("");
  const [savingPhaseName, setSavingPhaseName] = useState(false);

  const exercises = db.exercises;
  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const masterWorkouts = db.masterWorkouts || [];

  const programs = db.programs;
  const selected = programs.find((p) => p.id === selectedId) || programs[0] || null;
  const phases = programPhases(selected);
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || phases[0] || null;
  const phaseIndex = selectedPhase ? phases.findIndex((p) => p.id === selectedPhase.id) : -1;

  // Draft state resets to whatever's actually saved whenever the coach
  // switches to a different program/phase, so edits never leak across items.
  useEffect(() => {
    if (selected) setProgramDraft({ name: selected.name, level: selected.level, description: selected.description || "" });
  }, [selected?.id]);
  useEffect(() => {
    if (selectedPhase) setPhaseNameDraft(selectedPhase.name);
  }, [selectedPhase?.id]);

  const programDirty =
    !!selected &&
    (programDraft.name !== selected.name || programDraft.level !== selected.level || programDraft.description !== (selected.description || ""));
  const phaseNameDirty = !!selectedPhase && phaseNameDraft !== selectedPhase.name;

  async function saveProgramFields() {
    if (!selected || !programDirty) return;
    setSavingProgram(true);
    try {
      await updateProgram(selected.id, {
        name: programDraft.name.trim() || selected.name,
        level: programDraft.level,
        description: programDraft.description,
      });
      showToast("Program saved");
    } catch (err) {
      showToast(err.message || "Couldn't save — check your connection and try again");
    } finally {
      setSavingProgram(false);
    }
  }

  async function savePhaseName() {
    if (!selectedPhase || !phaseNameDirty || phaseIndex < 0) return;
    setSavingPhaseName(true);
    try {
      await savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, name: phaseNameDraft.trim() || p.name } : p)));
      showToast("Phase saved");
    } catch (err) {
      showToast(err.message || "Couldn't save — check your connection and try again");
    } finally {
      setSavingPhaseName(false);
    }
  }

  // Flushes any unsaved edit to the program/phase being left, so switching
  // away before hitting Save never silently discards it.
  function selectProgram(id) {
    if (programDirty) saveProgramFields();
    setSelectedId(id);
    setSelectedPhaseId(null);
    setConfirmDeletePhase(false);
  }
  function selectPhase(id) {
    if (phaseNameDirty) savePhaseName();
    setSelectedPhaseId(id);
    setConfirmDeletePhase(false);
  }

  function savePhases(next) {
    if (!selected) return;
    return updateProgram(selected.id, { phases: next });
  }

  function addPhase() {
    if (!selected) return;
    const newPhase = { id: newId("ph"), name: `Phase ${phases.length + 1}`, durationWeeks: 4, days: [] };
    savePhases([...phases, newPhase]);
    setSelectedPhaseId(newPhase.id);
    showToast("Phase added");
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
    if (!selectedPhase || indices.length === 0) return;
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
    <div className="max-w-7xl mx-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mb-5">
        <h1 className="text-black text-2xl font-bold">Program Templates</h1>
        <p className="text-black/40 text-sm mt-0.5">{programs.length} total · reusable phase-based programs for a client's training</p>
      </div>

      <div className="flex flex-col md:flex-row md:h-[calc(100vh-200px)] md:min-h-[600px] border border-black/8 rounded-2xl overflow-hidden">
        {/* left: program list, with the active program's phases nested right below it */}
        <div className="hidden md:flex w-80 shrink-0 border-r border-black/8 flex-col bg-[#F7F7F8]">
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
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {programs.length === 0 && <p className="text-black/30 text-xs px-2 py-4 text-center">No programs yet.</p>}
            {programs.map((p) => {
              const active = p.id === selected?.id;
              const progPhases = active ? phases : programPhases(p);
              return (
                <div key={p.id}>
                  <button
                    onClick={() => selectProgram(p.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                      active ? "bg-black text-white" : "hover:bg-black/5 text-black"
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className={`text-xs mt-0.5 ${active ? "text-white/50" : "text-black/35"}`}>
                      {progPhases.length} phase{progPhases.length === 1 ? "" : "s"}
                    </p>
                  </button>
                  {active && (
                    <div className="ml-3 mt-1 mb-2 pl-2.5 border-l border-black/10 space-y-0.5">
                      <p className="text-black/30 text-[10px] font-bold tracking-wide px-2 pt-1 pb-0.5">TRAINING PHASES</p>
                      {phases.map((ph) => {
                        const phActive = ph.id === selectedPhase?.id;
                        return (
                          <button
                            key={ph.id}
                            onClick={() => selectPhase(ph.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              phActive ? "bg-black/10 text-black font-semibold" : "text-black/55 hover:bg-black/5"
                            }`}
                          >
                            {ph.name} <span className="text-black/30">· {(ph.days || []).length}</span>
                          </button>
                        );
                      })}
                      <button onClick={addPhase} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 font-semibold">
                        + Add phase
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* mobile: program chips, then the active program's phase chips */}
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
          {selected && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2">
              {phases.map((ph) => (
                <button
                  key={ph.id}
                  onClick={() => selectPhase(ph.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                    ph.id === selectedPhase?.id ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {ph.name}
                </button>
              ))}
              <button onClick={addPhase} className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-black/50 bg-black/5">
                + Phase
              </button>
            </div>
          )}
        </div>

        {/* right: selected phase's summary + workouts table */}
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
              <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-1.5">PROGRAM</p>
              <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <input
                  value={programDraft.name}
                  onChange={(e) => setProgramDraft((d) => ({ ...d, name: e.target.value }))}
                  className="bg-transparent outline-none text-black text-xl font-bold flex-1 min-w-[140px]"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={saveProgramFields}
                    disabled={!programDirty || savingProgram}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors ${
                      programDirty ? "bg-black text-white" : "bg-black/8 text-black/30"
                    } disabled:cursor-default`}
                  >
                    {savingProgram ? "SAVING…" : programDirty ? "SAVE" : (
                      <>
                        <Check size={13} /> SAVED
                      </>
                    )}
                  </button>
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
                <Select
                  value={programDraft.level}
                  onChange={(e) => setProgramDraft((d) => ({ ...d, level: e.target.value }))}
                  className="!py-1.5 !text-xs !w-auto"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </Select>
                <span className="text-black/30 text-xs">{phases.reduce((a, p) => a + (p.durationWeeks || 0), 0)} weeks total</span>
              </div>

              <TextArea
                rows={2}
                value={programDraft.description}
                onChange={(e) => setProgramDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="What this program is for, who it suits..."
                className="mb-5"
              />

              {!selectedPhase ? (
                <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
                  <p className="text-black/30 text-sm">No phases in this program yet.</p>
                  <button onClick={addPhase} className="mt-4 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                    + Add phase
                  </button>
                </div>
              ) : (
                <>
                  <div className="border-t border-black/8 pt-4 mb-5">
                    <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-1.5">PHASE</p>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={phaseNameDraft}
                            onChange={(e) => setPhaseNameDraft(e.target.value)}
                            className="bg-transparent outline-none text-black font-bold text-base min-w-[120px]"
                          />
                          {phaseNameDirty && (
                            <button
                              onClick={savePhaseName}
                              disabled={savingPhaseName}
                              className="bg-black text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                            >
                              {savingPhaseName ? "SAVING…" : "SAVE"}
                            </button>
                          )}
                        </div>
                        <p className="text-black/35 text-xs mt-0.5">
                          {(selectedPhase.days || []).length} session{(selectedPhase.days || []).length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
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
                  </div>

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
                <ExerciseThumb exercise={exercisesById[w.exercises?.find((e) => !e.isRest)?.exerciseId]} size={36} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-black font-semibold text-sm truncate">{w.label}</p>
                  <p className="text-black/35 text-xs truncate">
                    {countExercises(w.exercises)} exercise{countExercises(w.exercises) === 1 ? "" : "s"}
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
