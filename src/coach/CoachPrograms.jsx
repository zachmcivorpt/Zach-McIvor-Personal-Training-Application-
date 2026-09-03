import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { newId } from "../lib/id";
import {
  Card,
  Pill,
  Field,
  TextInput,
  TextArea,
  Select,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  FullScreenOverlay,
} from "../components/ui";
import { ClipboardList, Plus, ChevronDown, X, Trash2, GripVertical, ChevronLeft } from "lucide-react";

function emptyDraft() {
  return { name: "", level: "Beginner", description: "", weeks: [] };
}

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

function ExerciseRow({ row, exercises, onChange, onRemove }) {
  const ex = exercises.find((e) => e.id === row.exerciseId);
  const rir = row.targetRIR ?? 2;
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Select value={row.exerciseId} onChange={(e) => onChange({ ...row, exerciseId: e.target.value })} className="flex-1 !py-2 text-xs">
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <button onClick={onRemove} className="w-8 h-8 shrink-0 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <p className="text-white/30 text-[10px] mb-1">SETS</p>
          <TextInput
            type="number"
            min={1}
            value={row.targetSets}
            onChange={(e) => onChange({ ...row, targetSets: +e.target.value })}
            className="!py-1.5 text-center text-xs"
          />
        </div>
        <div>
          <p className="text-white/30 text-[10px] mb-1">REPS</p>
          <TextInput
            type="number"
            min={1}
            value={row.targetReps}
            onChange={(e) => onChange({ ...row, targetReps: +e.target.value })}
            className="!py-1.5 text-center text-xs"
          />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-white/30 text-[10px] mb-1">TARGET RIR (REPS IN RESERVE)</p>
        <div className="flex gap-1.5">
          {RIR_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...row, targetRIR: v })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                rir === v ? "bg-white text-black" : "bg-white/8 text-white/50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-white/30 text-[10px] mb-1">NOTES (CUES, TEMPO, ETC.)</p>
        <TextArea
          rows={2}
          value={row.notes || ""}
          onChange={(e) => onChange({ ...row, notes: e.target.value })}
          placeholder="e.g. Controlled eccentric, pause at the bottom"
          className="!py-1.5 text-xs"
        />
      </div>
      {ex && <p className="text-white/25 text-[11px] mt-2">{ex.equipment} · {ex.primaryMuscles.join(", ")}</p>}
    </div>
  );
}

function DayEditor({ day, exercises, onChange, onRemove }) {
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
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.03]">
        <GripVertical size={14} className="text-white/20 shrink-0" />
        <TextInput
          value={day.label}
          onChange={(e) => onChange({ ...day, label: e.target.value })}
          placeholder="Day label, e.g. Push Day"
          className="!py-1.5 !bg-transparent !border-0 !px-1 font-semibold flex-1"
        />
        <button onClick={() => setOpen((o) => !o)} className="w-7 h-7 flex items-center justify-center text-white/40">
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center text-white/40">
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
            <ExerciseRow key={i} row={row} exercises={exercises} onChange={(r) => updateExercise(i, r)} onRemove={() => removeExercise(i)} />
          ))}
          <button
            onClick={addExercise}
            disabled={exercises.length === 0}
            className="w-full flex items-center justify-center gap-1.5 text-white/50 text-xs font-medium py-2.5 rounded-xl bg-white/[0.03] disabled:opacity-30"
          >
            <Plus size={13} /> Add exercise
          </button>
        </div>
      )}
    </div>
  );
}

function WeekEditor({ week, exercises, onChange, onRemove }) {
  function updateDay(i, day) {
    onChange({ ...week, days: week.days.map((d, idx) => (idx === i ? day : d)) });
  }
  function removeDay(i) {
    onChange({ ...week, days: week.days.filter((_, idx) => idx !== i) });
  }
  function addDay() {
    onChange({
      ...week,
      days: [...week.days, { id: newId("d"), label: `Day ${week.days.length + 1}`, muscleGroups: [], exercises: [] }],
    });
  }

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <TextInput
          value={week.label}
          onChange={(e) => onChange({ ...week, label: e.target.value })}
          className="!py-1.5 !bg-transparent !border-0 !px-0 font-bold text-base flex-1"
        />
        <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center text-white/40 shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="space-y-2.5">
        {week.days.map((d, i) => (
          <DayEditor key={d.id} day={d} exercises={exercises} onChange={(day) => updateDay(i, day)} onRemove={() => removeDay(i)} />
        ))}
      </div>
      <button onClick={addDay} className="w-full flex items-center justify-center gap-1.5 text-white/50 text-xs font-medium py-2.5 mt-2.5 rounded-xl bg-white/5">
        <Plus size={13} /> Add day
      </button>
    </div>
  );
}

function ProgramEditor({ program, exercises, onClose, onSave, onDelete }) {
  const isNew = !program;
  const [draft, setDraft] = useState(() => (program ? JSON.parse(JSON.stringify(program)) : emptyDraft()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateWeek(i, week) {
    setDraft((d) => ({ ...d, weeks: d.weeks.map((w, idx) => (idx === i ? week : w)) }));
  }
  function removeWeek(i) {
    setDraft((d) => ({ ...d, weeks: d.weeks.filter((_, idx) => idx !== i) }));
  }
  function addWeek() {
    setDraft((d) => ({ ...d, weeks: [...d.weeks, { id: newId("w"), label: `Week ${d.weeks.length + 1}`, days: [] }] }));
  }

  const totalSessions = draft.weeks.reduce((a, w) => a + w.days.length, 0);
  const canSave = draft.name.trim().length > 0;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-[#0A0A0B] z-10 border-b border-white/5">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-white/60 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-semibold">{isNew ? "New Program" : "Edit Program"}</span>
          <button
            onClick={() => canSave && onSave(draft)}
            disabled={!canSave}
            className="text-sm font-bold text-white disabled:text-white/20"
          >
            Save
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <Field label="PROGRAM NAME">
            <TextInput value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Push / Pull / Legs" />
          </Field>
          <Field label="LEVEL">
            <Select value={draft.level} onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value }))}>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </Select>
          </Field>
          <Field label="DESCRIPTION">
            <TextArea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="What this program is for, who it suits..."
            />
          </Field>

          <div className="flex items-center justify-between pt-2">
            <p className="text-white font-semibold">Structure</p>
            <span className="text-white/30 text-xs">{totalSessions} session{totalSessions === 1 ? "" : "s"}</span>
          </div>

          <div className="space-y-3">
            {draft.weeks.map((w, i) => (
              <WeekEditor key={w.id} week={w} exercises={exercises} onChange={(wk) => updateWeek(i, wk)} onRemove={() => removeWeek(i)} />
            ))}
          </div>

          <SecondaryButton onClick={addWeek} className="w-full">
            <Plus size={16} /> Add week
          </SecondaryButton>

          {!isNew && (
            <div className="pt-4 border-t border-white/5">
              {!confirmDelete ? (
                <DangerButton className="w-full" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete program
                </DangerButton>
              ) : (
                <div className="flex gap-2">
                  <SecondaryButton className="flex-1" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </SecondaryButton>
                  <DangerButton className="flex-1" onClick={() => onDelete(draft.id)}>
                    Confirm delete
                  </DangerButton>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </FullScreenOverlay>
  );
}

export default function CoachPrograms({ showToast }) {
  const { db, createProgram, updateProgram, deleteProgram } = useApp();
  const [editing, setEditing] = useState(null); // program object, or {} for new
  const exercises = db.exercises;

  function openNew() {
    if (exercises.length === 0) {
      showToast("Add an exercise first");
      return;
    }
    setEditing({ isNew: true });
  }

  function handleSave(draft) {
    if (draft.id && db.programs.some((p) => p.id === draft.id)) {
      updateProgram(draft.id, draft);
      showToast("Program updated");
    } else {
      createProgram(draft);
      showToast("Program created");
    }
    setEditing(null);
  }

  function handleDelete(id) {
    deleteProgram(id);
    showToast("Program deleted");
    setEditing(null);
  }

  return (
    <div className="px-5 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Programs</h1>
          <p className="text-white/40 text-sm mt-0.5">{db.programs.length} total</p>
        </div>
        <button onClick={openNew} className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
          <Plus size={20} />
        </button>
      </div>

      <div className="space-y-2.5">
        {db.programs.length === 0 && (
          <Card>
            <p className="text-white/40 text-sm text-center py-6">No programs yet — build your first one.</p>
          </Card>
        )}
        {db.programs.map((p) => {
          const sessions = p.weeks.reduce((a, w) => a + w.days.length, 0);
          const assignedCount = db.users.filter((u) => u.assignedProgramId === p.id).length;
          return (
            <Card key={p.id} onClick={() => setEditing(p)}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-white font-semibold">{p.name}</p>
                <Pill tone="outline">{p.level}</Pill>
              </div>
              {p.description && <p className="text-white/40 text-xs mb-2 line-clamp-2">{p.description}</p>}
              <div className="flex items-center gap-3 text-white/35 text-xs">
                <span className="flex items-center gap-1">
                  <ClipboardList size={12} /> {sessions} session{sessions === 1 ? "" : "s"}
                </span>
                <span>{assignedCount} client{assignedCount === 1 ? "" : "s"} assigned</span>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <ProgramEditor
          program={editing.isNew ? null : editing}
          exercises={exercises}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
