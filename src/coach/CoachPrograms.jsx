import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp, programPhases } from "../lib/AppContext";
import { newId } from "../lib/id";
import { Field, TextInput, TextArea, Select, PrimaryButton, BottomSheet, ExerciseThumb } from "../components/ui";
import { ClipboardList, Plus, Trash2, Download, Copy, Library, Search, MoreVertical, ChevronDown } from "lucide-react";
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

// Generic "⋯" popover for an item's secondary/rarer actions (Import,
// Delete, Duplicate) — pulling these out of the main toolbar keeps only
// the one or two things worth looking at on first glance at a glance,
// instead of every possible action competing for attention at once.
function OverflowMenu({ items, label = "More actions" }) {
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
        className="w-8 h-8 flex items-center justify-center text-black/40 hover:text-black rounded-lg hover:bg-black/8"
        aria-label={label}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-black/10 rounded-xl shadow-lg py-1 w-44">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              disabled={it.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left disabled:opacity-30 ${
                it.danger ? "text-red-500 hover:bg-red-50" : "text-black/70 hover:bg-black/5"
              }`}
            >
              <it.icon size={13} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One shared confirm step for every destructive action on this screen
// (delete program / phase / all programs) — replaces three separate
// inline Cancel/Confirm button-swaps that used to sit permanently in the
// layout, pushing everything else around whenever one was open.
function ConfirmSheet({ open, onClose, title, body, confirmLabel = "Delete", onConfirm }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p className="text-black/50 text-sm mb-5">{body}</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="flex-1 bg-red-500 text-white text-sm font-semibold py-2.5 rounded-xl"
        >
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

// Mobile-only program switcher — replaces a horizontally-scrolling chip
// row that cut long program names off mid-word with no way to read the
// rest. Tap the current program to pick a different one from a full list.
function ProgramPickerSheet({ open, onClose, programs, selectedId, onSelect, onNew }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Programs">
      <button
        onClick={() => {
          onClose();
          onNew();
        }}
        className="w-full flex items-center justify-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2.5 rounded-xl mb-3"
      >
        <Plus size={14} /> NEW PROGRAM
      </button>
      {programs.length === 0 ? (
        <p className="text-black/30 text-xs text-center py-4">No programs yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
          {programs.map((p) => {
            const phaseCount = programPhases(p).length;
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
                className={`w-full text-left px-3.5 py-3 rounded-xl transition-colors ${
                  active ? "bg-black text-white" : "bg-black/[0.03] hover:bg-black/[0.06] text-black"
                }`}
              >
                <p className="text-sm font-semibold truncate">{p.name}</p>
                <p className={`text-xs mt-0.5 ${active ? "text-white/50" : "text-black/40"}`}>
                  {phaseCount} phase{phaseCount === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

// Mobile-only phase switcher — same reasoning as ProgramPickerSheet above.
function PhasePickerSheet({ open, onClose, phases, selectedId, onSelect, onAdd }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Phases">
      {phases.length > 0 && (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto mb-3">
          {phases.map((ph) => {
            const active = ph.id === selectedId;
            return (
              <button
                key={ph.id}
                onClick={() => {
                  onSelect(ph.id);
                  onClose();
                }}
                className={`w-full text-left px-3.5 py-3 rounded-xl transition-colors ${
                  active ? "bg-blue-600 text-white" : "bg-black/[0.03] hover:bg-black/[0.06] text-black"
                }`}
              >
                <p className="text-sm font-semibold truncate">{ph.name}</p>
                <p className={`text-xs mt-0.5 ${active ? "text-white/60" : "text-black/40"}`}>
                  {ph.durationWeeks} wk{ph.durationWeeks === 1 ? "" : "s"} · {(ph.days || []).length} session
                  {(ph.days || []).length === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => {
          onClose();
          onAdd();
        }}
        className="w-full flex items-center justify-center gap-1.5 bg-black/5 hover:bg-black/10 text-black text-xs font-semibold px-3 py-2.5 rounded-xl"
      >
        <Plus size={13} /> Add phase
      </button>
    </BottomSheet>
  );
}

// One row in the Workouts table — thumbnail, name (tap to edit), a quick
// duration/exercise-count/muscle-group summary, and a Copy to / Delete /
// Duplicate menu. The checkbox only appears once "Select" mode is on, so a
// normal glance at the list isn't competing with a column of checkboxes.
function WorkoutRow({ day, exercisesById, selectMode, selected, onToggleSelect, onOpen, onCopy, onDuplicate, onDelete }) {
  const exs = day.exercises || [];
  const firstReal = exs.find((e) => !e.isRest);
  const firstEx = firstReal ? exercisesById[firstReal.exerciseId] : null;

  return (
    <div className="flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 transition-colors">
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 shrink-0 accent-black" aria-label={`Select ${day.label}`} />
      )}
      <button onClick={selectMode ? onToggleSelect : onOpen} className="shrink-0" aria-label={`Open ${day.label}`}>
        <ExerciseThumb exercise={firstEx} size={44} rounded="rounded-lg" />
      </button>
      <button onClick={selectMode ? onToggleSelect : onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-blue-700 font-semibold text-sm truncate hover:underline">{day.label}</p>
        <p className="text-black/40 text-xs truncate mt-0.5">
          est. {estimateWorkoutMinutes(exs)} min · {countExercises(exs)} exercise{countExercises(exs) === 1 ? "" : "s"}
        </p>
        {day.muscleGroups?.length > 0 && <p className="text-black/30 text-[11px] truncate mt-0.5">{day.muscleGroups.join(", ")}</p>}
      </button>
      {!selectMode && (
        <OverflowMenu
          label={`${day.label} actions`}
          items={[
            { icon: Copy, label: "Copy to...", onClick: onCopy },
            { icon: Copy, label: "Duplicate", onClick: onDuplicate },
            { icon: Trash2, label: "Delete", onClick: onDelete, danger: true },
          ]}
        />
      )}
    </div>
  );
}

// The selected phase's session list. Only "New" and "Import" sit in the
// toolbar by default — multi-select (for bulk Copy to / Delete) is behind
// a "Select" toggle instead of four buttons and a permanent checkbox
// column sitting there whether or not anything's actually selected.
function PhaseWorkouts({ days, exercisesById, onOpenNew, onOpenFromLibrary, onEditDay, onDuplicateDay, onDeleteDays, onCopyDays }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }
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
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-black font-semibold text-sm">Workouts {days.length > 0 && `(${days.length})`}</p>
        {!selectMode ? (
          <div className="flex items-center gap-2">
            <button onClick={onOpenNew} className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-1.5 rounded-lg">
              <Plus size={13} /> New
            </button>
            <button onClick={onOpenFromLibrary} className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-1.5 rounded-lg">
              <Library size={13} /> Import
            </button>
            {days.length > 0 && (
              <button onClick={() => setSelectMode(true)} className="text-black/45 hover:text-black text-xs font-semibold px-1">
                Select
              </button>
            )}
          </div>
        ) : (
          <button onClick={exitSelectMode} className="text-black/45 hover:text-black text-xs font-semibold px-1">
            Cancel
          </button>
        )}
      </div>

      {selectMode && (
        <div className="flex items-center justify-between gap-2 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-2.5 mb-3">
          <label className="flex items-center gap-2 text-black/60 text-xs font-semibold">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => toggleAll(filteredIndices)}
              className="w-4 h-4 accent-black shrink-0"
              aria-label="Select all workouts"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onCopyDays([...selected])}
              disabled={selected.size === 0}
              className="flex items-center gap-1 text-black/55 hover:text-black text-xs font-semibold disabled:opacity-30"
            >
              <Copy size={12} /> Copy to
            </button>
            <button
              onClick={() => {
                onDeleteDays([...selected]);
                exitSelectMode();
              }}
              disabled={selected.size === 0}
              className="flex items-center gap-1 text-red-500 hover:text-red-600 text-xs font-semibold disabled:opacity-30"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}

      {days.length > 3 && (
        <div className="flex items-center gap-2 bg-black/5 rounded-lg px-2.5 py-1.5 mb-3">
          <Search size={13} className="text-black/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workouts"
            className="bg-transparent outline-none text-black text-xs flex-1 placeholder:text-black/30"
          />
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
              selectMode={selectMode}
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
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [phasePickerOpen, setPhasePickerOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

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
    setDescriptionOpen(false);
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
  // Awaited and wrapped in try/catch — this used to fire the Firestore
  // write, close the editor, and show "Workout saved" all before the write
  // resolved, so a failure (offline, a permissions hiccup) was completely
  // invisible: the coach saw success and the exercises they'd just dragged
  // in were never actually persisted. On failure the editor now stays open
  // with the work intact instead of silently losing it.
  async function saveWorkout(day) {
    if (!editingWorkout) return;
    const { phaseIndex: pi, dayIndex: di } = editingWorkout;
    const nextPhases = phases.map((p, idx) => {
      if (idx !== pi) return p;
      const days = [...(p.days || [])];
      if (di < days.length) days[di] = day;
      else days.push(day);
      return { ...p, days };
    });
    try {
      await savePhases(nextPhases);
    } catch (err) {
      showToast("Couldn't save that workout — check your connection and try again");
      return;
    }
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
          <div className="p-3 border-b border-black/8 flex items-center gap-1.5">
            <button
              onClick={() => setNewProgramOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2.5 rounded-xl"
            >
              <Plus size={14} /> NEW PROGRAM
            </button>
            <OverflowMenu
              label="More program actions"
              items={[
                { icon: Download, label: importing ? "Importing…" : "Import starters", onClick: importStarterTemplates, disabled: importing },
                ...(programs.length > 0
                  ? [{ icon: Trash2, label: "Delete all programs", onClick: () => setConfirmDeleteAll(true), danger: true }]
                  : []),
              ]}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {programs.length === 0 && <p className="text-black/30 text-xs px-2 py-4 text-center">No programs yet.</p>}
            {programs.map((p) => {
              const active = p.id === selected?.id;
              const progPhases = active ? phases : programPhases(p);
              return (
                <div
                  key={p.id}
                  className={active ? "rounded-xl bg-white border border-black/10 shadow-sm overflow-hidden" : ""}
                >
                  <button
                    onClick={() => selectProgram(p.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      active ? "bg-black text-white" : "rounded-xl hover:bg-black/5 text-black"
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className={`text-xs mt-0.5 ${active ? "text-white/50" : "text-black/35"}`}>
                      {progPhases.length} phase{progPhases.length === 1 ? "" : "s"}
                    </p>
                  </button>
                  {active && (
                    <div className="p-2 space-y-0.5 border-t border-black/8">
                      <p className="text-black/30 text-[10px] font-bold tracking-wide px-2 pt-0.5 pb-1">TRAINING PHASES</p>
                      {phases.map((ph) => {
                        const phActive = ph.id === selectedPhase?.id;
                        return (
                          <button
                            key={ph.id}
                            onClick={() => selectPhase(ph.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              phActive ? "bg-black/8 text-black font-semibold" : "text-black/55 hover:bg-black/5"
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

        {/* mobile: just the two actions that have nowhere else to live —
            switching program/phase now happens via the chevron next to
            each name below instead of a separate summary card repeating
            the same name a second time */}
        <div className="md:hidden border-b border-black/8 p-3 flex items-center gap-1.5">
          <button
            onClick={() => setNewProgramOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2.5 rounded-xl"
          >
            <Plus size={14} /> NEW PROGRAM
          </button>
          <OverflowMenu
            label="More program actions"
            items={[
              { icon: Download, label: importing ? "Importing…" : "Import starters", onClick: importStarterTemplates, disabled: importing },
              ...(programs.length > 0
                ? [{ icon: Trash2, label: "Delete all programs", onClick: () => setConfirmDeleteAll(true), danger: true }]
                : []),
            ]}
          />
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
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-1">PROGRAM</p>
                    <input
                      value={programDraft.name}
                      onChange={(e) => setProgramDraft((d) => ({ ...d, name: e.target.value }))}
                      className="bg-transparent outline-none text-black text-xl font-bold w-full truncate border-b border-transparent focus:border-black/15 pb-0.5"
                    />
                  </div>
                  {programs.length > 1 && (
                    <button
                      onClick={() => setProgramPickerOpen(true)}
                      aria-label="Switch program"
                      title="Switch program"
                      className="md:hidden w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-black/5 text-black/40 mt-3.5"
                    >
                      <ChevronDown size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pt-[22px]">
                  {programDirty && (
                    <button
                      onClick={saveProgramFields}
                      disabled={savingProgram}
                      className="bg-black text-white text-xs font-bold px-3 py-2 rounded-lg"
                    >
                      {savingProgram ? "SAVING…" : "SAVE"}
                    </button>
                  )}
                  <OverflowMenu
                    label="More program actions"
                    items={[{ icon: Trash2, label: "Delete program", onClick: () => setConfirmDeleteProgram(true), danger: true }]}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                <Select
                  value={programDraft.level}
                  onChange={(e) => setProgramDraft((d) => ({ ...d, level: e.target.value }))}
                  className="!py-1.5 !text-xs !w-auto"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </Select>
                <span className="text-black/30 text-xs whitespace-nowrap">{phases.reduce((a, p) => a + (p.durationWeeks || 0), 0)} weeks total</span>
              </div>

              <button
                onClick={() => setDescriptionOpen((v) => !v)}
                className={`w-full flex items-center justify-between gap-2 text-black/40 hover:text-black/60 text-xs font-semibold py-1 ${
                  descriptionOpen ? "mb-2" : "mb-5"
                }`}
              >
                <span>{descriptionOpen ? "Hide description" : programDraft.description ? "Show description" : "Add a description"}</span>
                <ChevronDown size={14} className={`transition-transform ${descriptionOpen ? "rotate-180" : ""}`} />
              </button>
              {descriptionOpen && (
                <TextArea
                  rows={3}
                  value={programDraft.description}
                  onChange={(e) => setProgramDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="What this program is for, who it suits..."
                  className="mb-5"
                  autoFocus
                />
              )}

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
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={phaseNameDraft}
                            onChange={(e) => setPhaseNameDraft(e.target.value)}
                            className="bg-transparent outline-none text-black font-bold text-base min-w-0 flex-1 truncate border-b border-transparent focus:border-black/15"
                          />
                          {phases.length > 1 && (
                            <button
                              onClick={() => setPhasePickerOpen(true)}
                              aria-label="Switch phase"
                              title="Switch phase"
                              className="md:hidden w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-black/5 text-black/40"
                            >
                              <ChevronDown size={14} />
                            </button>
                          )}
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
                        <OverflowMenu
                          label="More phase actions"
                          items={[
                            { icon: Copy, label: "Duplicate phase", onClick: duplicatePhase },
                            { icon: Trash2, label: "Delete phase", onClick: () => setConfirmDeletePhase(true), danger: true },
                          ]}
                        />
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

      <ProgramPickerSheet
        open={programPickerOpen}
        onClose={() => setProgramPickerOpen(false)}
        programs={programs}
        selectedId={selected?.id}
        onSelect={selectProgram}
        onNew={() => setNewProgramOpen(true)}
      />
      <PhasePickerSheet
        open={phasePickerOpen}
        onClose={() => setPhasePickerOpen(false)}
        phases={phases}
        selectedId={selectedPhase?.id}
        onSelect={selectPhase}
        onAdd={addPhase}
      />

      <ConfirmSheet
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="Delete all programs?"
        body={`This permanently removes all ${programs.length} program${programs.length === 1 ? "" : "s"} and every phase/workout inside them. This can't be undone.`}
        confirmLabel="Delete all"
        onConfirm={deleteAllPrograms}
      />
      <ConfirmSheet
        open={confirmDeleteProgram}
        onClose={() => setConfirmDeleteProgram(false)}
        title="Delete this program?"
        body={`"${selected?.name}" and every phase/workout inside it will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete program"
        onConfirm={handleDeleteProgram}
      />
      <ConfirmSheet
        open={confirmDeletePhase}
        onClose={() => setConfirmDeletePhase(false)}
        title="Delete this phase?"
        body={`"${selectedPhase?.name}" and every workout inside it will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete phase"
        onConfirm={deletePhase}
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
