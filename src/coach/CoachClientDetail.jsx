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
} from "lucide-react";

const HABIT_PRESETS = ["12,000 steps", "Do your Mobility", "Log your Nutrition", "Sleep 7+ Hours"];
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
          <p className="text-white/40 text-xs tracking-wide mb-1.5">PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Week 1-4 Stabilisation" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-white/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-white/8 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-white/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-white/8 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <p className="text-white/40 text-xs tracking-wide mb-1.5">START FROM A TEMPLATE (OPTIONAL)</p>
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
      <p className="text-white/50 text-sm mb-4">
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
          <p className="text-white/40 text-xs tracking-wide mb-1.5">NEW PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-white/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-white/8 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-white/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-white/8 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none"
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
    <div className="flex h-full min-h-0">
      {/* phase history */}
      <div className="w-72 shrink-0 border-r border-white/8 flex flex-col min-h-0">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <p className="text-white font-semibold text-sm">Training Program</p>
          <button
            onClick={() => setNewPhaseOpen(true)}
            className="flex items-center gap-1 bg-white text-black text-xs font-bold px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} /> ADD
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {sorted.length === 0 && <p className="text-white/30 text-xs px-2 py-4">No phases yet — add the first one.</p>}
          {sorted.map((p) => {
            const active = p.id === selectedPhaseId;
            const isCurrent = getCurrentPhase(phases, todayKey())?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectPhase(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-sm font-medium truncate flex-1">{p.name}</p>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                </div>
                <p className="text-white/35 text-[11px] mt-0.5">
                  {new Date(p.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {p.endDate ? ` - ${new Date(p.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* selected phase detail */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
        {!phase ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <ClipboardList size={28} className="text-white/20 mb-3" />
            <p className="text-white/50 text-sm">No phase selected yet.</p>
            <button onClick={() => setNewPhaseOpen(true)} className="mt-4 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl">
              + Add a phase
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-1">
              <input
                value={phase.name}
                onChange={(e) => updateClientPhase(client.id, phase.id, { name: e.target.value })}
                className="bg-transparent outline-none text-white text-xl font-bold flex-1 min-w-0"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDuplicating(phase)}
                  className="flex items-center gap-1.5 bg-white/8 hover:bg-white/15 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  <Copy size={13} /> Duplicate
                </button>
                {!confirmDeletePhase || confirmDeletePhase !== phase.id ? (
                  <button
                    onClick={() => setConfirmDeletePhase(phase.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-white/50"
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

            <div className="flex items-center gap-2 text-white/40 text-xs mb-5">
              <Calendar size={13} />
              <input
                type="date"
                value={phase.startDate}
                onChange={(e) => updateClientPhase(client.id, phase.id, { startDate: e.target.value })}
                className="bg-transparent outline-none text-white/60"
              />
              <span>-</span>
              <input
                type="date"
                value={phase.endDate || ""}
                onChange={(e) => updateClientPhase(client.id, phase.id, { endDate: e.target.value })}
                className="bg-transparent outline-none text-white/60"
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
              <p className="text-white font-semibold text-sm">Workouts</p>
              <button onClick={addWorkout} className="flex items-center gap-1.5 text-white/60 text-xs font-semibold">
                <Plus size={13} /> New workout
              </button>
            </div>

            {days.length === 0 ? (
              <div className="border border-dashed border-white/12 rounded-2xl py-10 text-center">
                <p className="text-white/30 text-sm">No workouts in this phase yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((d, i) => (
                  <div key={d.id || i} className="flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{d.label}</p>
                      <p className="text-white/35 text-xs truncate">
                        {d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}
                        {d.muscleGroups?.length ? ` · ${d.muscleGroups.join(", ")}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditingWorkout({ dayIndex: i, day: d })}
                      className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition-colors"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button onClick={() => deleteWorkout(i)} className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/60">
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

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addHabit(client.id, label);
    setLabel("");
  }

  return (
    <div className="max-w-xl px-6 py-6">
      <p className="text-white font-semibold mb-4">Daily Habits</p>
      {habits.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {habits.map((h) => (
            <div key={h.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3.5 py-2.5">
              <span className="text-white text-sm">{h.label}</span>
              <button onClick={() => removeHabit(client.id, h.id)} className="w-7 h-7 flex items-center justify-center text-white/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2 mb-3">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Stretch for 10 minutes" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-white text-black flex items-center justify-center">
          <Plus size={18} />
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {HABIT_PRESETS.filter((p) => !existingLabels.has(p.toLowerCase())).map((preset) => (
          <button key={preset} onClick={() => addHabit(client.id, preset)} className="text-xs bg-white/8 text-white/60 px-3 py-1.5 rounded-full">
            + {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function NutritionPanel({ client, showToast }) {
  const { db, setNutrition } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const nutrition = db.nutrition[client.id];

  return (
    <div className="max-w-xl px-6 py-6">
      <p className="text-white font-semibold mb-4">Nutrition Log</p>
      {!nutrition ? (
        <p className="text-white/30 text-sm">Nothing logged yet.</p>
      ) : (
        <div className="bg-white/5 border border-white/8 rounded-2xl p-4 grid grid-cols-4 gap-3 mb-4">
          {[
            ["Cals", nutrition.calories],
            ["Protein", `${nutrition.protein}g`],
            ["Carbs", `${nutrition.carbs}g`],
            ["Fat", `${nutrition.fat}g`],
          ].map(([l, v]) => (
            <div key={l} className="text-center">
              <p className="text-white font-bold">{v}</p>
              <p className="text-white/40 text-[11px] mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      )}
      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-2 bg-white/5 border border-white/10 text-white/60 text-sm font-medium px-4 py-2.5 rounded-xl"
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
    <div className="max-w-3xl px-6 py-6">
      <p className="text-white font-semibold mb-4">Progress Photos</p>
      {photos.length === 0 ? (
        <p className="text-white/30 text-sm">No photos uploaded by this client yet.</p>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-white/5">
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
    <div className="fixed inset-0 z-[80] bg-[#0A0A0B] flex">
      {/* client mini-sidebar */}
      <div className="w-64 shrink-0 h-screen flex flex-col border-r border-white/8 bg-[#0C0C0E]">
        <div className="p-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} url={client.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{client.name}</p>
              <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
            </div>
          </div>
          {client.status === "active" ? (
            <button
              onClick={() => setMessaging(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-white/8 hover:bg-white/15 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              <MessageCircle size={15} /> Message
            </button>
          ) : (
            <button
              onClick={() => setSendOpen(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-white text-black text-sm font-bold py-2.5 rounded-xl"
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
                  active ? "bg-white text-black" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/8 space-y-1">
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              className="w-full text-left px-3.5 py-2 text-white/30 hover:text-white/60 text-xs font-medium"
            >
              Remove client
            </button>
          ) : (
            <div className="flex gap-1.5 px-1">
              <button onClick={() => setConfirmRemove(false)} className="flex-1 bg-white/8 text-white text-xs font-semibold py-2 rounded-lg">
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
          <button onClick={onClose} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-white/50 hover:text-white text-sm font-medium">
            <ArrowLeft size={15} /> Return to overview
          </button>
        </div>
      </div>

      {/* main panel */}
      <div className="flex-1 min-w-0">
        {clientTab === "program" && <TrainingProgramPanel client={client} showToast={showToast} />}
        {clientTab === "nutrition" && <NutritionPanel client={client} showToast={showToast} />}
        {clientTab === "progress" && <ProgressPanel client={client} />}
        {clientTab === "habits" && <HabitsPanel client={client} />}
      </div>

      {messaging && <ThreadView client={client} onClose={() => setMessaging(false)} />}
      <SendLoginSheet open={sendOpen} onClose={() => setSendOpen(false)} client={client} showToast={showToast} />
    </div>
  );
}
