import React, { useState } from "react";
import { useApp, programPhases } from "../lib/AppContext";
import { newId } from "../lib/id";
import {
  Field,
  TextInput,
  TextArea,
  Select,
  PrimaryButton,
  SecondaryButton,
  FullScreenOverlay,
  BottomSheet,
} from "../components/ui";
import { ClipboardList, Plus, ChevronDown, X, Trash2, GripVertical, ChevronLeft, ChevronRight, Download, Copy, Edit3 } from "lucide-react";
import { STARTER_PROGRAMS } from "../lib/starterPrograms";
import { ExerciseSheet } from "./CoachExercises";

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

function ExerciseRow({ row, exercises, onChange, onRemove, showToast }) {
  const ex = exercises.find((e) => e.id === row.exerciseId);
  const rir = row.targetRIR ?? 2;
  const isAmrap = row.targetReps === "AMRAP";
  const [editingExercise, setEditingExercise] = useState(false);

  return (
    <div className="bg-black/5 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Select value={row.exerciseId} onChange={(e) => onChange({ ...row, exerciseId: e.target.value })} className="flex-1 !py-2 text-xs">
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setEditingExercise(true)}
          disabled={!ex}
          className="w-8 h-8 shrink-0 rounded-lg bg-black/5 flex items-center justify-center text-black/40 disabled:opacity-30"
          aria-label="Edit this exercise"
        >
          <Edit3 size={13} />
        </button>
        <button onClick={onRemove} className="w-8 h-8 shrink-0 rounded-lg bg-black/5 flex items-center justify-center text-black/40">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <p className="text-black/30 text-[10px] mb-1">SETS</p>
          <TextInput
            type="number"
            min={1}
            value={row.targetSets}
            onChange={(e) => onChange({ ...row, targetSets: +e.target.value })}
            className="!py-1.5 text-center text-xs"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-black/30 text-[10px]">REPETITIONS</p>
            <button
              type="button"
              onClick={() => onChange({ ...row, targetReps: isAmrap ? 10 : "AMRAP" })}
              className={`text-[9px] font-bold px-1.5 rounded ${isAmrap ? "bg-black text-white" : "bg-black/8 text-black/40"}`}
            >
              AMRAP
            </button>
          </div>
          {isAmrap ? (
            <div className="w-full !py-1.5 text-center text-xs rounded-lg bg-white border border-black/10 text-black font-semibold">AMRAP</div>
          ) : (
            <TextInput
              type="number"
              min={1}
              value={row.targetReps}
              onChange={(e) => onChange({ ...row, targetReps: +e.target.value })}
              className="!py-1.5 text-center text-xs"
            />
          )}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-black/30 text-[10px] mb-1">TARGET RIR (REPS IN RESERVE)</p>
        <div className="flex gap-1.5">
          {RIR_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...row, targetRIR: v })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                rir === v ? "bg-black text-white" : "bg-black/8 text-black/50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-black/30 text-[10px] mb-1">NOTES (CUES, TEMPO, ETC.)</p>
        <TextArea
          rows={2}
          value={row.notes || ""}
          onChange={(e) => onChange({ ...row, notes: e.target.value })}
          placeholder="e.g. Controlled eccentric, pause at the bottom"
          className="!py-1.5 text-xs"
        />
      </div>
      {ex && <p className="text-black/25 text-[11px] mt-2">{ex.equipment} · {ex.primaryMuscles.join(", ")}</p>}

      {ex && (
        <ExerciseSheet exercise={ex} open={editingExercise} onClose={() => setEditingExercise(false)} showToast={showToast} />
      )}
    </div>
  );
}

function DayEditor({ day, exercises, onChange, onRemove, showToast }) {
  const [open, setOpen] = useState(true);

  function updateExercise(i, row) {
    const exs = day.exercises.map((r, idx) => (idx === i ? row : r));
    onChange({ ...day, exercises: exs });
  }
  function removeExercise(i) {
    onChange({ ...day, exercises: day.exercises.filter((_, idx) => idx !== i) });
  }
  function addExercise() {
    if (exercises.length === 0) return;
    onChange({
      ...day,
      exercises: [...day.exercises, { exerciseId: exercises[0].id, targetSets: 3, targetReps: 10, targetRIR: 2, notes: "" }],
    });
  }

  return (
    <div className="border border-black/10 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-black/[0.03]">
        <GripVertical size={14} className="text-black/20 shrink-0" />
        <TextInput
          value={day.label}
          onChange={(e) => onChange({ ...day, label: e.target.value })}
          placeholder="Day label, e.g. Push Day"
          className="!py-1.5 !bg-transparent !border-0 !px-1 font-semibold flex-1"
        />
        <button onClick={() => setOpen((o) => !o)} className="w-7 h-7 flex items-center justify-center text-black/40">
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center text-black/40">
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="p-3 space-y-2">
          <TextInput
            value={(day.muscleGroups || []).join(", ")}
            onChange={(e) => onChange({ ...day, muscleGroups: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Muscle groups (comma separated)"
            className="text-xs !py-2"
          />
          {day.exercises.map((row, i) => (
            <ExerciseRow
              key={i}
              row={row}
              exercises={exercises}
              onChange={(r) => updateExercise(i, r)}
              onRemove={() => removeExercise(i)}
              showToast={showToast}
            />
          ))}
          <button
            onClick={addExercise}
            disabled={exercises.length === 0}
            className="w-full flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 rounded-xl bg-black/[0.03] disabled:opacity-30"
          >
            <Plus size={13} /> Add exercise
          </button>
        </div>
      )}
    </div>
  );
}

// Full-screen editor for one phase's days/exercises — opened by tapping a
// phase row. Everything else about a phase (name, duration, duplicate,
// delete) is edited right on its row, same as the client-side phase list.
function PhaseDaysEditor({ phase, exercises, onClose, onSave, showToast }) {
  const [days, setDays] = useState(() => JSON.parse(JSON.stringify(phase.days || [])));

  function updateDay(i, day) {
    setDays((ds) => ds.map((d, idx) => (idx === i ? day : d)));
  }
  function removeDay(i) {
    setDays((ds) => ds.filter((_, idx) => idx !== i));
  }
  function addDay() {
    setDays((ds) => [...ds, { id: newId("d"), label: `Day ${ds.length + 1}`, muscleGroups: [], exercises: [] }]);
  }

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[92] bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-white z-10 border-b border-black/5">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-black/60 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-black font-semibold truncate px-2">{phase.name}</span>
          <button onClick={() => onSave(days)} className="text-sm font-bold text-black shrink-0">
            Save
          </button>
        </div>

        <div className="px-5 py-5 space-y-2.5">
          {days.length === 0 && <p className="text-black/30 text-sm text-center py-6">No days in this phase yet.</p>}
          {days.map((d, i) => (
            <DayEditor
              key={d.id}
              day={d}
              exercises={exercises}
              onChange={(day) => updateDay(i, day)}
              onRemove={() => removeDay(i)}
              showToast={showToast}
            />
          ))}
          <SecondaryButton onClick={addDay} className="w-full">
            <Plus size={16} /> Add day
          </SecondaryButton>
        </div>
      </div>
    </FullScreenOverlay>
  );
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

// One training phase within a program — rename inline, adjust its duration
// with a stepper, duplicate or delete it, or tap through to edit its days.
function PhaseRow({ phase, onOpen, onRename, onDuration, onDuplicate, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sessions = phase.days.length;

  return (
    <div className="border border-black/8 rounded-xl px-3.5 py-3 bg-black/[0.02] flex items-center gap-2 flex-wrap md:flex-nowrap">
      <div className="flex-1 min-w-[140px]">
        <input
          value={phase.name}
          onChange={(e) => onRename(e.target.value)}
          className="bg-transparent outline-none text-black font-semibold text-sm w-full"
        />
        <p className="text-black/35 text-xs mt-0.5">
          {sessions} session{sessions === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center bg-black/5 rounded-lg shrink-0">
        <button
          type="button"
          onClick={() => onDuration(Math.max(1, phase.durationWeeks - 1))}
          className="w-7 h-7 flex items-center justify-center text-black/50"
          aria-label="Decrease duration"
        >
          −
        </button>
        <span className="text-black text-xs font-semibold w-16 text-center">
          {phase.durationWeeks} wk{phase.durationWeeks === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => onDuration(phase.durationWeeks + 1)}
          className="w-7 h-7 flex items-center justify-center text-black/50"
          aria-label="Increase duration"
        >
          +
        </button>
      </div>
      <button onClick={onDuplicate} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/40 hover:text-black/70" aria-label="Duplicate phase">
        <Copy size={13} />
      </button>
      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/40 hover:text-red-500" aria-label="Delete phase">
          <Trash2 size={13} />
        </button>
      ) : (
        <button onClick={onDelete} className="shrink-0 text-red-600 text-[10px] font-bold px-2.5 py-1.5 bg-red-50 rounded-lg">
          CONFIRM
        </button>
      )}
      <button onClick={onOpen} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/40" aria-label="Edit phase days">
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export default function CoachPrograms({ showToast }) {
  const { db, createProgram, updateProgram, deleteProgram } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState(null); // { index, phase } | null
  const [confirmDeleteProgram, setConfirmDeleteProgram] = useState(false);
  const [importing, setImporting] = useState(false);
  const exercises = db.exercises;

  const programs = db.programs;
  const selected = programs.find((p) => p.id === selectedId) || programs[0] || null;
  const phases = programPhases(selected);

  function savePhases(next) {
    if (!selected) return;
    updateProgram(selected.id, { phases: next });
  }

  function addPhase() {
    if (!selected) return;
    savePhases([...phases, { id: newId("ph"), name: `Phase ${phases.length + 1}`, durationWeeks: 4, days: [] }]);
    showToast("Phase added");
  }
  function renamePhase(i, name) {
    savePhases(phases.map((p, idx) => (idx === i ? { ...p, name } : p)));
  }
  function setDuration(i, weeks) {
    savePhases(phases.map((p, idx) => (idx === i ? { ...p, durationWeeks: weeks } : p)));
  }
  function duplicatePhase(i) {
    const copy = { ...JSON.parse(JSON.stringify(phases[i])), id: newId("ph"), name: `${phases[i].name} (copy)` };
    const next = [...phases];
    next.splice(i + 1, 0, copy);
    savePhases(next);
    showToast("Phase duplicated");
  }
  function deletePhase(i) {
    savePhases(phases.filter((_, idx) => idx !== i));
    showToast("Phase deleted");
  }
  function savePhaseDays(days) {
    savePhases(phases.map((p, idx) => (idx === editingPhase.index ? { ...p, days } : p)));
    setEditingPhase(null);
    showToast("Phase saved");
  }

  async function handleCreateProgram(data) {
    setNewProgramOpen(false);
    try {
      const created = await createProgram(data);
      setSelectedId(created.id);
      showToast("Program created");
    } catch (err) {
      showToast(err.message || "Couldn't create that program");
    }
  }

  function handleDeleteProgram() {
    if (!selected) return;
    deleteProgram(selected.id);
    setSelectedId(null);
    setConfirmDeleteProgram(false);
    showToast("Program deleted");
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
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {programs.length === 0 && <p className="text-black/30 text-xs px-2 py-4 text-center">No programs yet.</p>}
            {programs.map((p) => {
              const active = p.id === selected?.id;
              const phaseCount = programPhases(p).length;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
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
          </div>
          {programs.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
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

        {/* right: selected program's phases */}
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

              <div className="flex items-center justify-between mb-3">
                <p className="text-black font-semibold text-sm">Training Phases</p>
                <span className="text-black/30 text-xs">{phases.length}</span>
              </div>

              {phases.length === 0 ? (
                <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
                  <p className="text-black/30 text-sm">No phases in this program yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {phases.map((p, i) => (
                    <PhaseRow
                      key={p.id}
                      phase={p}
                      onOpen={() => setEditingPhase({ index: i, phase: p })}
                      onRename={(name) => renamePhase(i, name)}
                      onDuration={(w) => setDuration(i, w)}
                      onDuplicate={() => duplicatePhase(i)}
                      onDelete={() => deletePhase(i)}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={addPhase}
                className="w-full flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 mt-3 rounded-xl bg-black/[0.03]"
              >
                <Plus size={13} /> Add phase
              </button>
            </>
          )}
        </div>
      </div>

      <NewProgramSheet open={newProgramOpen} onClose={() => setNewProgramOpen(false)} onCreate={handleCreateProgram} />
      {editingPhase && (
        <PhaseDaysEditor
          phase={editingPhase.phase}
          exercises={exercises}
          onClose={() => setEditingPhase(null)}
          onSave={savePhaseDays}
          showToast={showToast}
        />
      )}
    </div>
  );
}
