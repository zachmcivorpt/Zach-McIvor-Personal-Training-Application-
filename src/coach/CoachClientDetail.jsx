import React, { useState } from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { Pill, TextInput, TextArea, Select, PrimaryButton, SecondaryButton, DangerButton, Avatar, ProgressBar, BottomSheet } from "../components/ui";
import { ThreadView } from "./CoachMessages";
import { SendLoginSheet } from "./CoachClients";
import WorkoutEditor from "./WorkoutEditor";
import {
  ArrowLeft,
  MessageCircle,
  Send,
  ClipboardList,
  Utensils,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Copy,
  Trash2,
  Calendar,
  Edit3,
  X,
  Library,
  Dumbbell,
  NotebookPen,
  ChevronRight,
} from "lucide-react";

const todayKey = () => new Date().toISOString().slice(0, 10);

function emptyPhase(programs) {
  const t = todayKey();
  const end = new Date();
  end.setDate(end.getDate() + 27);
  return {
    name: "New Phase",
    level: "Intermediate",
    description: "",
    startDate: t,
    endDate: end.toISOString().slice(0, 10),
    templateId: "",
  };
}

function NewPhaseSheet({ open, onClose, programs, onCreate }) {
  const [form, setForm] = useState(emptyPhase(programs));

  function reset() {
    setForm(emptyPhase(programs));
  }

  function submit(e) {
    e.preventDefault();
    const template = programs.find((p) => p.id === form.templateId);
    onCreate({
      name: form.name.trim() || "New Phase",
      level: form.level,
      description: form.description,
      startDate: form.startDate,
      endDate: form.endDate,
      weeks: template ? JSON.parse(JSON.stringify(template.weeks)) : [{ id: "w1", label: "Week 1", days: [] }],
    });
    reset();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Phase"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Week 1-4 Stabilisation" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">START FROM A TEMPLATE (OPTIONAL)</p>
          <Select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
            <option value="">— Start blank —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <PrimaryButton type="submit" className="w-full">
          <Plus size={16} /> CREATE PHASE
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function DuplicatePhaseSheet({ open, onClose, phase, onDuplicate }) {
  const [form, setForm] = useState(null);

  React.useEffect(() => {
    if (phase) {
      const start = new Date(phase.startDate);
      const end = phase.endDate ? new Date(phase.endDate) : null;
      const spanDays = end ? Math.round((end - start) / 86400000) : 27;
      const newStart = new Date();
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + spanDays);
      setForm({
        name: `${phase.name} (copy)`,
        startDate: newStart.toISOString().slice(0, 10),
        endDate: newEnd.toISOString().slice(0, 10),
      });
    }
  }, [phase]);

  if (!phase || !form) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Duplicate & Schedule Phase">
      <p className="text-black/50 text-sm mb-4">
        Makes a full copy of "{phase.name}" with its own workouts, ready to tweak — set when it should run.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDuplicate(form);
        }}
        className="space-y-4"
      >
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">NEW PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
        </div>
        <PrimaryButton type="submit" className="w-full">
          <Copy size={16} /> DUPLICATE & SCHEDULE
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function TrainingProgramPanel({ client, showToast }) {
  const { db, addClientPhase, updateClientPhase, deleteClientPhase, duplicateClientPhase } = useApp();
  const phases = (db.clientPhases || {})[client.id] || [];
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [selectedPhaseId, setSelectedPhaseId] = useState(() => getCurrentPhase(phases, todayKey())?.id || sorted[0]?.id || null);
  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(null);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null); // { dayIndex, day } | null
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);

  const phase = phases.find((p) => p.id === selectedPhaseId) || sorted[0] || null;
  const days = phase?.weeks?.[0]?.days || [];

  function selectPhase(id) {
    setSelectedPhaseId(id);
  }

  function createPhase(data) {
    const created = addClientPhase(client.id, data);
    setSelectedPhaseId(created.id);
    showToast("Phase created");
  }

  function duplicatePhase(overrides) {
    const created = duplicateClientPhase(client.id, duplicating.id, overrides);
    if (created) {
      setSelectedPhaseId(created.id);
      showToast("Phase duplicated and scheduled");
    }
    setDuplicating(null);
  }

  function addWorkout() {
    if (!phase) return;
    const newDay = { id: `d_${Date.now()}`, label: `Workout ${days.length + 1}`, muscleGroups: [], exercises: [] };
    setEditingWorkout({ dayIndex: days.length, day: newDay });
  }

  function addWorkoutFromLibrary(masterWorkout) {
    if (!phase) return;
    const newDay = {
      id: `d_${Date.now()}`,
      label: masterWorkout.label,
      muscleGroups: masterWorkout.muscleGroups || [],
      exercises: JSON.parse(JSON.stringify(masterWorkout.exercises || [])),
      instructions: masterWorkout.instructions || "",
    };
    setEditingWorkout({ dayIndex: days.length, day: newDay });
    setLibraryPickerOpen(false);
  }

  function saveWorkout(day) {
    if (!phase) return;
    const nextDays = [...days];
    if (editingWorkout.dayIndex < nextDays.length) {
      nextDays[editingWorkout.dayIndex] = day;
    } else {
      nextDays.push(day);
    }
    updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
    setEditingWorkout(null);
    showToast("Workout saved");
  }

  function deleteWorkout(i) {
    if (!phase) return;
    const nextDays = days.filter((_, idx) => idx !== i);
    updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
  }

  return (
    <div className="flex flex-col md:flex-row md:h-full min-h-0">
      {/* phase history (desktop) */}
      <div className="hidden md:flex w-72 shrink-0 border-r border-black/8 flex-col min-h-0">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <p className="text-black font-semibold text-sm">Training Program</p>
          <button
            onClick={() => setNewPhaseOpen(true)}
            className="flex items-center gap-1 bg-black text-white text-xs font-bold px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} /> ADD
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {sorted.length === 0 && <p className="text-black/30 text-xs px-2 py-4">No phases yet — add the first one.</p>}
          {sorted.map((p) => {
            const active = p.id === selectedPhaseId;
            const isCurrent = getCurrentPhase(phases, todayKey())?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectPhase(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-black/10" : "hover:bg-black/5"}`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-black text-sm font-medium truncate flex-1">{p.name}</p>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />}
                </div>
                <p className="text-black/35 text-[11px] mt-0.5">
                  {new Date(p.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {p.endDate ? ` - ${new Date(p.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* phase history (mobile) */}
      <div className="md:hidden shrink-0 border-b border-black/8 px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-black font-semibold text-sm">Training Program</p>
          <button
            onClick={() => setNewPhaseOpen(true)}
            className="flex items-center gap-1 bg-black text-white text-xs font-bold px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} /> ADD
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-black/30 text-xs py-1">No phases yet — add the first one.</p>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {sorted.map((p) => {
              const active = p.id === selectedPhaseId;
              const isCurrent = getCurrentPhase(phases, todayKey())?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPhase(p.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-black text-white" : "bg-black/8 text-black/60"
                  }`}
                >
                  {p.name}
                  {isCurrent && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-black"}`} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* selected phase detail */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
        {!phase ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <ClipboardList size={28} className="text-black/20 mb-3" />
            <p className="text-black/50 text-sm">No phase selected yet.</p>
            <button onClick={() => setNewPhaseOpen(true)} className="mt-4 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
              + Add a phase
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
              <input
                value={phase.name}
                onChange={(e) => updateClientPhase(client.id, phase.id, { name: e.target.value })}
                className="bg-transparent outline-none text-black text-xl font-bold flex-1 min-w-[140px]"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDuplicating(phase)}
                  className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  <Copy size={13} /> Duplicate
                </button>
                {!confirmDeletePhase || confirmDeletePhase !== phase.id ? (
                  <button
                    onClick={() => setConfirmDeletePhase(phase.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/50"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      deleteClientPhase(client.id, phase.id);
                      setSelectedPhaseId(null);
                      setConfirmDeletePhase(null);
                      showToast("Phase deleted");
                    }}
                    className="bg-red-500/20 text-red-300 text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    Confirm delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-black/40 text-xs mb-5">
              <Calendar size={13} />
              <input
                type="date"
                value={phase.startDate}
                onChange={(e) => updateClientPhase(client.id, phase.id, { startDate: e.target.value })}
                className="bg-transparent outline-none text-black/60"
              />
              <span>-</span>
              <input
                type="date"
                value={phase.endDate || ""}
                onChange={(e) => updateClientPhase(client.id, phase.id, { endDate: e.target.value })}
                className="bg-transparent outline-none text-black/60"
              />
            </div>

            <TextArea
              rows={2}
              value={phase.description || ""}
              onChange={(e) => updateClientPhase(client.id, phase.id, { description: e.target.value })}
              placeholder="Say something about this training phase"
              className="mb-6"
            />

            <div className="flex items-center justify-between mb-3">
              <p className="text-black font-semibold text-sm">Workouts</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setLibraryPickerOpen(true)} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold">
                  <Library size={13} /> From library
                </button>
                <button onClick={addWorkout} className="flex items-center gap-1.5 text-black/60 text-xs font-semibold">
                  <Plus size={13} /> New workout
                </button>
              </div>
            </div>

            {days.length === 0 ? (
              <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
                <p className="text-black/30 text-sm">No workouts in this phase yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((d, i) => (
                  <div key={d.id || i} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-black font-medium text-sm truncate">{d.label}</p>
                      <p className="text-black/35 text-xs truncate">
                        {d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}
                        {d.muscleGroups?.length ? ` · ${d.muscleGroups.join(", ")}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditingWorkout({ dayIndex: i, day: d })}
                      className="flex items-center gap-1.5 text-black/60 hover:text-black text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-black/8 transition-colors"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button onClick={() => deleteWorkout(i)} className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-black/60">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <NewPhaseSheet open={newPhaseOpen} onClose={() => setNewPhaseOpen(false)} programs={db.programs} onCreate={createPhase} />
      <DuplicatePhaseSheet open={!!duplicating} onClose={() => setDuplicating(null)} phase={duplicating} onDuplicate={duplicatePhase} />
      <BottomSheet open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Add from Workout Library">
        {(db.masterWorkouts || []).length === 0 ? (
          <p className="text-black/30 text-sm text-center py-6">No workout templates yet — build some in Library → Workouts.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(db.masterWorkouts || []).map((w) => (
              <button
                key={w.id}
                onClick={() => addWorkoutFromLibrary(w)}
                className="w-full flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Dumbbell size={15} className="text-blue-500" />
                </div>
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
      {editingWorkout && (
        <WorkoutEditor
          open={!!editingWorkout}
          day={editingWorkout.day}
          exercises={db.exercises}
          onClose={() => setEditingWorkout(null)}
          onSave={saveWorkout}
        />
      )}
    </div>
  );
}

function HabitsPanel({ client }) {
  const { db, addHabit, removeHabit } = useApp();
  const [label, setLabel] = useState("");
  const habits = (db.habits || {})[client.id] || [];
  const existingLabels = new Set(habits.map((h) => h.label.toLowerCase()));
  const presets = (db.habitPresets || []).map((p) => p.label);

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addHabit(client.id, label);
    setLabel("");
  }

  return (
    <div className="max-w-xl px-4 py-5 md:px-6 md:py-6">
      <p className="text-black font-semibold mb-4">Daily Habits</p>
      {habits.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {habits.map((h) => (
            <div key={h.id} className="flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5">
              <span className="text-black text-sm">{h.label}</span>
              <button onClick={() => removeHabit(client.id, h.id)} className="w-7 h-7 flex items-center justify-center text-black/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2 mb-3">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Stretch for 10 minutes" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-black text-white flex items-center justify-center">
          <Plus size={18} />
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {presets.filter((p) => !existingLabels.has(p.toLowerCase())).map((preset) => (
          <button key={preset} onClick={() => addHabit(client.id, preset)} className="text-xs bg-black/8 text-black/60 px-3 py-1.5 rounded-full">
            + {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleFormSheet({ open, onClose, client, showToast }) {
  const { db, scheduleForm } = useApp();
  const forms = db.forms || [];
  const [formId, setFormId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);

  React.useEffect(() => {
    if (open) {
      setFormId(forms[0]?.id || "");
      setDayOfWeek(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e) {
    e.preventDefault();
    if (!formId) return;
    scheduleForm(client.id, formId, dayOfWeek);
    showToast("Check-in scheduled");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule a Check-in">
      {forms.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-6">No check-in forms yet — build one in Library → Forms first.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">FORM</p>
            <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">REPEATS WEEKLY ON</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDayOfWeek(i)}
                  className={`py-2.5 rounded-lg text-xs font-semibold ${dayOfWeek === i ? "bg-blue-500 text-white" : "bg-black/8 text-black/50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <PrimaryButton type="submit" className="w-full">
            <Calendar size={16} /> SCHEDULE CHECK-IN
          </PrimaryButton>
        </form>
      )}
    </BottomSheet>
  );
}

function CheckInsPanel({ client, showToast }) {
  const { db, unscheduleForm, toggleFormSchedule } = useApp();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [viewingResponse, setViewingResponse] = useState(null);
  const forms = db.forms || [];
  const schedules = (db.formSchedules || {})[client.id] || [];
  const responses = (db.formResponses || {})[client.id] || [];
  const formsById = Object.fromEntries(forms.map((f) => [f.id, f]));

  return (
    <div className="max-w-2xl px-4 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-black font-semibold">Scheduled Check-ins</p>
        <button onClick={() => setScheduleOpen(true)} className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-lg">
          <Plus size={13} /> Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="border border-dashed border-black/12 rounded-2xl py-8 text-center mb-6">
          <p className="text-black/30 text-sm">No check-ins scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {schedules.map((s) => {
            const form = formsById[s.formId];
            return (
              <div key={s.id} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <NotebookPen size={15} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-black font-medium text-sm truncate">{form?.name || "Deleted form"}</p>
                  <p className="text-black/35 text-xs">Every {DAY_LABELS[s.dayOfWeek]}</p>
                </div>
                <button
                  onClick={() => toggleFormSchedule(client.id, s.id)}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${s.active ? "bg-blue-500" : "bg-black/15"}`}
                  aria-label={s.active ? "Pause schedule" : "Resume schedule"}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${s.active ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <button
                  onClick={() => unscheduleForm(client.id, s.id)}
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60"
                  aria-label="Remove schedule"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-black font-semibold mb-3">Responses</p>
      {responses.length === 0 ? (
        <p className="text-black/30 text-sm">No check-ins submitted yet.</p>
      ) : (
        <div className="space-y-2">
          {responses.map((r) => {
            const form = formsById[r.formId];
            return (
              <button
                key={r.id}
                onClick={() => setViewingResponse(r)}
                className="w-full flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3 text-left hover:bg-black/[0.06] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-black font-medium text-sm truncate">{form?.name || "Deleted form"}</p>
                  <p className="text-black/35 text-xs">{new Date(r.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
                <ChevronRight size={16} className="text-black/25 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <ScheduleFormSheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} client={client} showToast={showToast} />

      <BottomSheet open={!!viewingResponse} onClose={() => setViewingResponse(null)} title={formsById[viewingResponse?.formId]?.name || "Check-in"}>
        {viewingResponse && (
          <div className="space-y-3">
            {(formsById[viewingResponse.formId]?.questions || []).map((q) => (
              <div key={q.id} className="bg-black/5 rounded-xl px-3.5 py-2.5">
                <p className="text-black/40 text-[11px] tracking-wide mb-1">{q.label || "Untitled question"}</p>
                {q.type === "photo" && viewingResponse.answers[q.id] ? (
                  <img src={viewingResponse.answers[q.id]} alt="" className="w-full rounded-lg mt-1 max-h-48 object-cover" />
                ) : (
                  <p className="text-black text-sm">
                    {q.type === "rating" && viewingResponse.answers[q.id] ? `${viewingResponse.answers[q.id]} / 5` : viewingResponse.answers[q.id] || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function NutritionPanel({ client, showToast }) {
  const { db, setNutrition } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const nutrition = db.nutrition[client.id];

  return (
    <div className="max-w-xl px-4 py-5 md:px-6 md:py-6">
      <p className="text-black font-semibold mb-4">Nutrition Log</p>
      {!nutrition ? (
        <p className="text-black/30 text-sm">Nothing logged yet.</p>
      ) : (
        <div className="bg-black/5 border border-black/8 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            ["Cals", nutrition.calories],
            ["Protein", `${nutrition.protein}g`],
            ["Carbs", `${nutrition.carbs}g`],
            ["Fat", `${nutrition.fat}g`],
          ].map(([l, v]) => (
            <div key={l} className="text-center">
              <p className="text-black font-bold">{v}</p>
              <p className="text-black/40 text-[11px] mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      )}
      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-2 bg-black/5 border border-black/10 text-black/60 text-sm font-medium px-4 py-2.5 rounded-xl"
        >
          <Trash2 size={13} /> Clear logged nutrition
        </button>
      ) : (
        <div className="flex gap-2 max-w-xs">
          <SecondaryButton className="flex-1" onClick={() => setConfirmReset(false)}>
            Cancel
          </SecondaryButton>
          <DangerButton
            className="flex-1"
            onClick={() => {
              setNutrition(client.id, () => ({
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
                water: 0,
                meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] },
              }));
              setConfirmReset(false);
              showToast("Nutrition log cleared");
            }}
          >
            Confirm clear
          </DangerButton>
        </div>
      )}
    </div>
  );
}

function ProgressPanel({ client }) {
  const { db } = useApp();
  const photos = db.progressPhotos[client.id] || [];
  return (
    <div className="max-w-3xl px-4 py-5 md:px-6 md:py-6">
      <p className="text-black font-semibold mb-4">Progress Photos</p>
      {photos.length === 0 ? (
        <p className="text-black/30 text-sm">No photos uploaded by this client yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-black/5">
              <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CLIENT_NAV = [
  { id: "program", label: "Training Program", icon: ClipboardList },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "progress", label: "Progress", icon: ImageIcon },
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "checkins", label: "Check-ins", icon: NotebookPen },
];

export default function CoachClientDetail({ clientId, onClose, showToast }) {
  const { db, removeClient } = useApp();
  const [clientTab, setClientTab] = useState("program");
  const [messaging, setMessaging] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const client = db.users.find((u) => u.id === clientId);
  if (!client) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-white flex flex-col md:flex-row">
      {/* client mini-sidebar (desktop) */}
      <div className="hidden md:flex w-64 shrink-0 h-screen flex-col border-r border-black/8 bg-[#F7F7F8]">
        <div className="p-5 border-b border-black/8">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} url={client.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="text-black font-bold text-sm truncate">{client.name}</p>
              <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
            </div>
          </div>
          {client.status === "active" ? (
            <button
              onClick={() => setMessaging(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              <MessageCircle size={15} /> Message
            </button>
          ) : (
            <button
              onClick={() => setSendOpen(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-black text-white text-sm font-bold py-2.5 rounded-xl"
            >
              <Send size={15} /> Send Login Details
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {CLIENT_NAV.map((item) => {
            const Icon = item.icon;
            const active = clientTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setClientTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-black text-white" : "text-black/60 hover:bg-black/5 hover:text-black/90"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-black/8 space-y-1">
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              className="w-full text-left px-3.5 py-2 text-black/30 hover:text-black/60 text-xs font-medium"
            >
              Remove client
            </button>
          ) : (
            <div className="flex gap-1.5 px-1">
              <button onClick={() => setConfirmRemove(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-2 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => {
                  removeClient(client.id);
                  showToast("Client removed");
                  onClose();
                }}
                className="flex-1 bg-red-500/20 text-red-300 text-xs font-semibold py-2 rounded-lg"
              >
                Confirm
              </button>
            </div>
          )}
          <button onClick={onClose} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-black/50 hover:text-black text-sm font-medium">
            <ArrowLeft size={15} /> Return to overview
          </button>
        </div>
      </div>

      {/* mobile header */}
      <div className="md:hidden shrink-0 bg-[#F7F7F8] border-b border-black/8">
        <div className="flex items-center gap-2.5 px-3 pt-4 pb-3">
          <button onClick={onClose} aria-label="Return to overview" className="w-8 h-8 -ml-1 flex items-center justify-center text-black/60 shrink-0">
            <ArrowLeft size={18} />
          </button>
          <Avatar name={client.name} url={client.avatarUrl} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-black font-bold text-sm truncate">{client.name}</p>
            <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
          </div>
          {client.status === "active" ? (
            <button
              onClick={() => setMessaging(true)}
              className="w-9 h-9 rounded-full bg-black/8 flex items-center justify-center shrink-0"
            >
              <MessageCircle size={15} className="text-black/70" />
            </button>
          ) : (
            <button
              onClick={() => setSendOpen(true)}
              className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0"
            >
              <Send size={13} /> Send
            </button>
          )}
        </div>
        <div className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar">
          {CLIENT_NAV.map((item) => {
            const Icon = item.icon;
            const active = clientTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setClientTab(item.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-black text-white" : "bg-black/8 text-black/60"
                }`}
              >
                <Icon size={13} strokeWidth={active ? 2.4 : 2} /> {item.label}
              </button>
            );
          })}
        </div>
        {!confirmRemove ? (
          <button onClick={() => setConfirmRemove(true)} className="block px-3 pb-2.5 text-black/30 text-[11px] font-medium">
            Remove client
          </button>
        ) : (
          <div className="flex gap-1.5 px-3 pb-2.5">
            <button onClick={() => setConfirmRemove(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-1.5 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => {
                removeClient(client.id);
                showToast("Client removed");
                onClose();
              }}
              className="flex-1 bg-red-500/20 text-red-500 text-xs font-semibold py-1.5 rounded-lg"
            >
              Confirm remove
            </button>
          </div>
        )}
      </div>

      {/* main panel */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto md:overflow-visible">
        {clientTab === "program" && <TrainingProgramPanel client={client} showToast={showToast} />}
        {clientTab === "nutrition" && <NutritionPanel client={client} showToast={showToast} />}
        {clientTab === "progress" && <ProgressPanel client={client} />}
        {clientTab === "habits" && <HabitsPanel client={client} />}
        {clientTab === "checkins" && <CheckInsPanel client={client} showToast={showToast} />}
      </div>

      {messaging && <ThreadView client={client} onClose={() => setMessaging(false)} />}
      <SendLoginSheet open={sendOpen} onClose={() => setSendOpen(false)} client={client} showToast={showToast} />
    </div>
  );
}
