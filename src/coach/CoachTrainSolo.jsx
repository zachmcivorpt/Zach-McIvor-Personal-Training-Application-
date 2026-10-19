import React, { useMemo, useState } from "react";
import { useApp, programPhases } from "../lib/AppContext";
import { newId } from "../lib/id";
import { uploadSoloProgramArtwork } from "../lib/storage";
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton, BottomSheet, ExerciseThumb } from "../components/ui";
import {
  Mountain,
  Plus,
  Trash2,
  Pencil,
  ChevronLeft,
  GripVertical,
  Archive,
  ArchiveRestore,
  MoreVertical,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { countExercises, estimateWorkoutMinutes } from "../lib/workoutStats";
import WorkoutEditor from "./WorkoutEditor";
import { MEASURE_BLUE, CLIENT_DARK_SURFACE, CLIENT_DARK_SURFACE_2, CLIENT_DARK_BORDER, OVER_RED } from "../theme";

// Same "⋯" overflow pattern as CoachPrograms.jsx — kept local rather than
// shared since the two files' action sets differ and it's a small component.
function OverflowMenu({ items, label = "More actions" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 flex items-center justify-center text-white hover:text-white rounded-lg hover:bg-white/10 transition-colors"
        aria-label={label}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 border rounded-xl shadow-lg py-1 w-48"
            style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
          >
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                disabled={it.disabled}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left disabled:opacity-30 transition-colors ${
                  it.danger ? "hover:bg-red-500/10" : "text-white hover:bg-white/10"
                }`}
                style={it.danger ? { color: OVER_RED } : undefined}
              >
                <it.icon size={13} /> {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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

// =====================================================================
// Categories tab
// =====================================================================

function CategorySheet({ open, onClose, initialName, onSave, title }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setName(initialName || "");
  }, [open, initialName]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="CATEGORY NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fat Loss Programs" autoFocus />
        </Field>
        <PrimaryButton type="submit" className="w-full" disabled={!name.trim() || saving}>
          {saving ? "SAVING…" : "SAVE"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function CategoryRow({ category, publishedCount, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onRename, onArchiveToggle }) {
  const archived = !!category.archived;
  return (
    <div
      className="flex items-center gap-3 border rounded-xl px-3.5 py-3"
      style={{ borderColor: CLIENT_DARK_BORDER, backgroundColor: CLIENT_DARK_SURFACE, opacity: archived ? 0.6 : 1 }}
    >
      <GripVertical size={14} className="text-white/30 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{category.name}</p>
        <p className="text-white text-xs mt-0.5">
          {publishedCount} published program{publishedCount === 1 ? "" : "s"}
          {publishedCount === 0 && !archived && " — hidden from customers until one is published here"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Move ${category.name} up in order`}
          className="w-7 h-7 flex items-center justify-center text-white disabled:opacity-20 hover:text-white rounded hover:bg-white/10"
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Move ${category.name} down in order`}
          className="w-7 h-7 flex items-center justify-center text-white disabled:opacity-20 hover:text-white rounded hover:bg-white/10"
        >
          ↓
        </button>
        <button
          onClick={onRename}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border text-white hover:bg-white/10"
          style={{ borderColor: CLIENT_DARK_BORDER }}
        >
          Rename
        </button>
        <button onClick={onArchiveToggle} className="text-xs font-semibold px-2 py-1.5 rounded-lg text-white hover:text-white hover:bg-white/10">
          {archived ? (
            <span className="flex items-center gap-1">
              <ArchiveRestore size={12} /> Restore
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Archive size={12} /> Archive
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function CoachSoloCategories({ showToast }) {
  const { db, createSoloCategory, updateSoloCategory, setSoloCategoryArchived, reorderSoloCategories } = useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState(null); // category | null

  const categories = db.soloProgramCategories || [];
  const active = useMemo(() => categories.filter((c) => !c.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [categories]);
  const archived = useMemo(() => categories.filter((c) => c.archived), [categories]);
  const publishedCountFor = (categoryId) =>
    (db.soloPrograms || []).filter((p) => p.status === "published" && (p.categoryIds || []).includes(categoryId)).length;

  async function handleCreate(name) {
    try {
      await createSoloCategory(name);
      showToast("Category added");
    } catch (err) {
      showToast(err.message || "Couldn't add that category");
    }
  }

  async function handleRename(name) {
    if (!renaming) return;
    try {
      await updateSoloCategory(renaming.id, { name });
      showToast("Category renamed");
    } catch (err) {
      showToast(err.message || "Couldn't rename that category");
    }
  }

  function move(category, direction) {
    const idx = active.findIndex((c) => c.id === category.id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= active.length) return;
    const next = [...active];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    reorderSoloCategories(next.map((c) => c.id));
  }

  function toggleArchive(category) {
    setSoloCategoryArchived(category.id, !category.archived);
    showToast(category.archived ? "Category restored" : "Category archived");
  }

  return (
    <div className="max-w-2xl">
      <p className="text-white text-sm mb-4">
        How your Solo catalogue is organised for customers. Reorder with ↑/↓ — this is the exact order categories appear in the app. A
        category with no published programs is hidden automatically; customers never see an empty section.
      </p>

      <div className="space-y-2">
        {active.length === 0 && <p className="text-white text-sm py-6 text-center">No categories yet.</p>}
        {active.map((c, i) => (
          <CategoryRow
            key={c.id}
            category={c}
            publishedCount={publishedCountFor(c.id)}
            canMoveUp={i > 0}
            canMoveDown={i < active.length - 1}
            onMoveUp={() => move(c, -1)}
            onMoveDown={() => move(c, 1)}
            onRename={() => setRenaming(c)}
            onArchiveToggle={() => toggleArchive(c)}
          />
        ))}
      </div>

      <button
        onClick={() => setNewOpen(true)}
        className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed rounded-xl py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
        style={{ borderColor: "rgba(255,255,255,0.25)" }}
      >
        <Plus size={14} /> New category
      </button>

      <div className="mt-6 rounded-xl p-4 border" style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}>
        <p className="text-white text-xs font-bold mb-1">Archived categories</p>
        {archived.length === 0 ? (
          <p className="text-white text-xs">
            None yet — archiving keeps a category's programs intact, it just stops showing the category itself to customers or as an
            option in the Program Builder.
          </p>
        ) : (
          <div className="space-y-2 mt-2">
            {archived.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                publishedCount={publishedCountFor(c.id)}
                canMoveUp={false}
                canMoveDown={false}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onRename={() => setRenaming(c)}
                onArchiveToggle={() => toggleArchive(c)}
              />
            ))}
          </div>
        )}
      </div>

      <CategorySheet open={newOpen} onClose={() => setNewOpen(false)} title="New category" onSave={handleCreate} />
      <CategorySheet
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename category"
        initialName={renaming?.name}
        onSave={handleRename}
      />
    </div>
  );
}

// =====================================================================
// Programs tab
// =====================================================================

function ArtworkPicker({ program, onUploaded, showToast }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadSoloProgramArtwork(program.id, file);
      await onUploaded(url);
      showToast("Artwork updated");
    } catch (err) {
      showToast(err.message || "Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-16 h-16 rounded-xl border flex items-center justify-center overflow-hidden shrink-0"
        style={{ borderColor: CLIENT_DARK_BORDER, backgroundColor: CLIENT_DARK_SURFACE_2 }}
      >
        {program.artworkUrl ? (
          <img src={program.artworkUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={18} className="text-white" />
        )}
      </div>
      <label className="text-xs font-semibold px-3 py-2 rounded-lg border text-white hover:bg-white/10 cursor-pointer" style={{ borderColor: CLIENT_DARK_BORDER }}>
        {uploading ? "Uploading…" : program.artworkUrl ? "Replace artwork" : "Upload artwork"}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {!program.artworkUrl && <span className="text-white text-xs">Uses the default APEX mark until set</span>}
    </div>
  );
}

function CategoryChips({ allCategories, selectedIds, onToggle }) {
  const selectable = allCategories.filter((c) => !c.archived);
  return (
    <div className="flex flex-wrap gap-2">
      {selectable.length === 0 && <p className="text-white text-xs">No categories yet — add one in the Categories tab.</p>}
      {selectable.map((c) => {
        const on = selectedIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              on ? "bg-white text-black border-white" : "text-white hover:bg-white/10"
            }`}
            style={!on ? { borderColor: CLIENT_DARK_BORDER } : undefined}
          >
            {c.name}
            {on && <X size={11} />}
          </button>
        );
      })}
    </div>
  );
}

function EditProgramSheet({ open, onClose, program, allCategories, onSave }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [description, setDescription] = useState("");
  const [categoryIds, setCategoryIds] = useState([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setName(program?.name || "");
      setLevel(program?.level || "Beginner");
      setDescription(program?.description || "");
      setCategoryIds(program?.categoryIds || []);
    }
  }, [open, program?.id]);

  function toggleCategory(id) {
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), level, description, categoryIds });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={program ? "Edit Program" : "New Program"} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="PROGRAM NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Strength Foundations" autoFocus />
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
        <Field label="CATEGORIES">
          <CategoryChips allCategories={allCategories} selectedIds={categoryIds} onToggle={toggleCategory} />
        </Field>
        <PrimaryButton type="submit" className="w-full" disabled={!name.trim() || saving}>
          {saving ? "SAVING…" : "SAVE"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

// Phase/workout editing mirrors CoachPrograms.jsx's own pattern exactly —
// reusing WorkoutEditor for the actual day/exercise structure.
function EditPhaseSheet({ open, onClose, phase, onSave }) {
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open && phase) {
      setName(phase.name || "");
      setWeeks(phase.durationWeeks || 4);
    }
  }, [open, phase?.id]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), durationWeeks: weeks });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Phase">
      <form onSubmit={submit} className="space-y-4">
        <Field label="PHASE NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Foundation" />
        </Field>
        <Field label="DURATION">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setWeeks((w) => Math.max(1, w - 1))}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/5 text-black/60 text-lg font-semibold"
            >
              −
            </button>
            <span className="text-black text-sm font-semibold w-20 text-center">
              {weeks} week{weeks === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setWeeks((w) => w + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/5 text-black/60 text-lg font-semibold"
            >
              +
            </button>
          </div>
        </Field>
        <PrimaryButton type="submit" className="w-full" disabled={!name.trim() || saving}>
          {saving ? "SAVING…" : "SAVE CHANGES"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function WorkoutRow({ day, exercisesById, onOpen, onDelete }) {
  const exs = day.exercises || [];
  const firstReal = exs.find((e) => !e.isRest);
  const firstEx = firstReal ? exercisesById[firstReal.exerciseId] : null;
  return (
    <div
      className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border rounded-xl px-3.5 py-3 transition-colors"
      style={{ borderColor: CLIENT_DARK_BORDER }}
    >
      <button onClick={onOpen} className="shrink-0" aria-label={`Open ${day.label}`}>
        <ExerciseThumb exercise={firstEx} size={44} rounded="rounded-lg" dark />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="font-semibold text-sm truncate hover:underline" style={{ color: MEASURE_BLUE }}>
          {day.label}
        </p>
        <p className="text-white text-xs truncate mt-0.5">
          est. {estimateWorkoutMinutes(exs)} min · {countExercises(exs)} exercise{countExercises(exs) === 1 ? "" : "s"}
        </p>
      </button>
      <button onClick={onDelete} aria-label={`Delete ${day.label}`} className="w-8 h-8 flex items-center justify-center text-white hover:text-white rounded-lg hover:bg-white/10">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function CoachSoloPrograms({ showToast }) {
  const { db, createSoloProgram, updateSoloProgram, deleteSoloProgram } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [editProgramOpen, setEditProgramOpen] = useState(false);
  const [editPhaseOpen, setEditPhaseOpen] = useState(false);
  const [confirmDeleteProgram, setConfirmDeleteProgram] = useState(false);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [mobileView, setMobileView] = useState("list");

  const exercises = db.exercises;
  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const categories = db.soloProgramCategories || [];
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const programs = db.soloPrograms || [];
  const selected = programs.find((p) => p.id === selectedId) || null;
  const phases = programPhases(selected);
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || phases[0] || null;
  const phaseIndex = selectedPhase ? phases.findIndex((p) => p.id === selectedPhase.id) : -1;

  function selectProgram(id) {
    setSelectedId(id);
    setSelectedPhaseId(null);
  }

  function savePhases(next) {
    if (!selected) return;
    return updateSoloProgram(selected.id, { phases: next });
  }

  async function handleCreate(data) {
    try {
      const created = await createSoloProgram(data);
      selectProgram(created.id);
      setMobileView("detail");
      showToast("Program created");
    } catch (err) {
      showToast(err.message || "Couldn't create that program");
    }
  }

  async function handleSaveEdits(data) {
    if (!selected) return;
    try {
      await updateSoloProgram(selected.id, data);
      showToast("Program saved");
    } catch (err) {
      showToast(err.message || "Couldn't save — check your connection and try again");
    }
  }

  function addPhase() {
    if (!selected) return;
    const newPhase = { id: newId("ph"), name: `Phase ${phases.length + 1}`, durationWeeks: 4, days: [] };
    savePhases([...phases, newPhase]);
    setSelectedPhaseId(newPhase.id);
    showToast("Phase added");
  }

  async function savePhaseEdits(data) {
    if (phaseIndex < 0) return;
    await savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, ...data } : p)));
    showToast("Phase saved");
  }

  function deletePhase() {
    if (phaseIndex < 0) return;
    savePhases(phases.filter((_, idx) => idx !== phaseIndex));
    setSelectedPhaseId(null);
    showToast("Phase deleted");
  }

  function openNewWorkout() {
    if (!selectedPhase) return;
    const days = selectedPhase.days || [];
    const newDay = { id: newId("d"), label: `Workout ${days.length + 1}`, muscleGroups: [], exercises: [] };
    setEditingWorkout({ phaseIndex, dayIndex: days.length, day: newDay });
  }
  function editDay(i) {
    if (!selectedPhase) return;
    setEditingWorkout({ phaseIndex, dayIndex: i, day: selectedPhase.days[i] });
  }
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
      showToast(err.message || "Couldn't save that workout — check your connection and try again");
      return;
    }
    setEditingWorkout(null);
    showToast("Workout saved");
  }
  function deleteDay(i) {
    if (!selectedPhase) return;
    const days = selectedPhase.days.filter((_, idx) => idx !== i);
    savePhases(phases.map((p, idx) => (idx === phaseIndex ? { ...p, days } : p)));
    showToast("Workout deleted");
  }

  function handleDeleteProgram() {
    if (!selected) return;
    deleteSoloProgram(selected.id);
    selectProgram(null);
    setMobileView("list");
    showToast("Program deleted");
  }

  // Publishing is blocked until the program actually has at least one
  // phase with at least one workout in it — matches the catalogue/Week 1
  // preview design, which needs a real Day 1 to show, not an empty shell.
  const hasAnyWorkout = phases.some((p) => (p.days || []).length > 0);
  async function togglePublish() {
    if (!selected) return;
    if (selected.status !== "published" && !hasAnyWorkout) {
      showToast("Add at least one workout before publishing");
      return;
    }
    await updateSoloProgram(selected.id, { status: selected.status === "published" ? "draft" : "published" });
    showToast(selected.status === "published" ? "Moved back to draft" : "Published");
  }

  return (
    <div>
      <div
        className="flex flex-col md:flex-row md:h-[calc(100vh-260px)] md:min-h-[520px] md:border md:rounded-2xl md:overflow-hidden"
        style={{ borderColor: CLIENT_DARK_BORDER }}
      >
        {/* left: program list */}
        <div className="hidden md:flex w-80 shrink-0 border-r flex-col" style={{ backgroundColor: CLIENT_DARK_SURFACE, borderColor: CLIENT_DARK_BORDER }}>
          <div className="p-3 border-b" style={{ borderColor: CLIENT_DARK_BORDER }}>
            <button
              onClick={() => setNewProgramOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-2.5 rounded-xl transition-opacity hover:opacity-90"
            >
              <Plus size={14} /> NEW PROGRAM
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {programs.length === 0 && <p className="text-white text-xs px-2 py-4 text-center">No programs yet.</p>}
            {programs.map((p) => {
              const active = p.id === selected?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectProgram(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? "text-white" : "hover:bg-white/10 text-white"}`}
                  style={active ? { backgroundColor: MEASURE_BLUE } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.status === "published" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.12)" }}
                    >
                      {p.status === "published" ? "LIVE" : "DRAFT"}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 text-white">{(p.categoryIds || []).map((id) => categoriesById[id]?.name).filter(Boolean).join(", ") || "No categories"}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* mobile list */}
        <div className={`md:hidden ${mobileView === "list" ? "block" : "hidden"}`}>
          <button
            onClick={() => setNewProgramOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-2.5 rounded-xl mb-3"
          >
            <Plus size={14} /> NEW PROGRAM
          </button>
          {programs.length === 0 ? (
            <p className="text-white text-sm text-center py-10">No programs yet.</p>
          ) : (
            <div className="space-y-1.5">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    selectProgram(p.id);
                    setMobileView("detail");
                  }}
                  className="w-full text-left px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <p className="text-white text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-white text-xs mt-0.5">{p.status === "published" ? "Live" : "Draft"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* right: detail */}
        <div className={`${mobileView === "detail" ? "block" : "hidden"} md:block flex-1 min-w-0 overflow-y-auto p-4 md:p-6`}>
          <button onClick={() => setMobileView("list")} className="md:hidden flex items-center gap-1 text-white text-sm font-semibold mb-4">
            <ChevronLeft size={16} /> Programs
          </button>
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Mountain size={28} className="text-white mb-3" />
              <p className="text-white text-sm">No program selected yet.</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white text-[11px] font-semibold tracking-wide">PROGRAM</p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: selected.status === "published" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.12)" }}
                    >
                      {selected.status === "published" ? "LIVE" : "DRAFT"}
                    </span>
                  </div>
                  <h2 className="text-white text-xl font-bold truncate">{selected.name}</h2>
                  <p className="text-white text-xs mt-1">
                    {selected.level} · {phases.reduce((a, p) => a + (p.durationWeeks || 0), 0)} weeks total
                  </p>
                  {selected.description && <p className="text-white text-sm mt-2.5 leading-relaxed">{selected.description}</p>}
                  <p className="text-white text-xs mt-2">
                    {(selected.categoryIds || []).map((id) => categoriesById[id]?.name).filter(Boolean).join(", ") || "No categories assigned"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pt-4">
                  <button
                    onClick={() => setEditProgramOpen(true)}
                    aria-label="Edit program"
                    className="w-8 h-8 flex items-center justify-center text-white rounded-lg hover:bg-white/10"
                  >
                    <Pencil size={15} />
                  </button>
                  <OverflowMenu items={[{ icon: Trash2, label: "Delete program", onClick: () => setConfirmDeleteProgram(true), danger: true }]} />
                </div>
              </div>

              <div className="border-t pt-4 mb-4" style={{ borderColor: CLIENT_DARK_BORDER }}>
                <p className="text-white text-[11px] font-semibold tracking-wide mb-2">COVER ARTWORK</p>
                <ArtworkPicker program={selected} showToast={showToast} onUploaded={(url) => updateSoloProgram(selected.id, { artworkUrl: url })} />
              </div>

              <div className="border-t pt-4 mb-5" style={{ borderColor: CLIENT_DARK_BORDER }}>
                <SecondaryButton onClick={togglePublish} className="w-full" dark>
                  {selected.status === "published" ? "Move back to draft" : "Preview & publish"}
                </SecondaryButton>
                {selected.status !== "published" && !hasAnyWorkout && (
                  <p className="text-white text-xs mt-2">Add at least one workout below before this can be published.</p>
                )}
              </div>

              {!selectedPhase ? (
                <div className="border border-dashed rounded-2xl py-10 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
                  <p className="text-white text-sm">No phases in this program yet.</p>
                  <button onClick={addPhase} className="mt-4 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl">
                    + Add phase
                  </button>
                </div>
              ) : (
                <>
                  <div className="border-t pt-4 mb-4" style={{ borderColor: CLIENT_DARK_BORDER }}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-white text-[11px] font-semibold tracking-wide">PHASE</p>
                      <Select value={selectedPhase.id} onChange={(e) => setSelectedPhaseId(e.target.value)} className="!w-auto text-xs">
                        {phases.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-white font-bold text-base truncate">{selectedPhase.name}</h3>
                        <p className="text-white text-xs mt-0.5">
                          {selectedPhase.durationWeeks} wk{selectedPhase.durationWeeks === 1 ? "" : "s"} · {(selectedPhase.days || []).length} workout
                          {(selectedPhase.days || []).length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditPhaseOpen(true)} aria-label="Edit phase" className="w-8 h-8 flex items-center justify-center text-white rounded-lg hover:bg-white/10">
                          <Pencil size={14} />
                        </button>
                        <button onClick={addPhase} aria-label="Add phase" className="w-8 h-8 flex items-center justify-center text-white rounded-lg hover:bg-white/10">
                          <Plus size={14} />
                        </button>
                        <OverflowMenu items={[{ icon: Trash2, label: "Delete phase", onClick: () => setConfirmDeletePhase(true), danger: true }]} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white font-semibold text-sm">
                      Workouts {(selectedPhase.days || []).length > 0 && `(${(selectedPhase.days || []).length})`}
                    </p>
                    <button onClick={openNewWorkout} className="flex items-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-1.5 rounded-lg">
                      <Plus size={13} /> New
                    </button>
                  </div>

                  {(selectedPhase.days || []).length === 0 ? (
                    <div className="border border-dashed rounded-2xl py-10 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
                      <p className="text-white text-sm">No workouts in this phase yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(selectedPhase.days || []).map((d, i) => (
                        <WorkoutRow key={d.id || i} day={d} exercisesById={exercisesById} onOpen={() => editDay(i)} onDelete={() => deleteDay(i)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <EditProgramSheet open={newProgramOpen} onClose={() => setNewProgramOpen(false)} program={null} allCategories={categories} onSave={handleCreate} />
      <EditProgramSheet open={editProgramOpen} onClose={() => setEditProgramOpen(false)} program={selected} allCategories={categories} onSave={handleSaveEdits} />
      <EditPhaseSheet open={editPhaseOpen} onClose={() => setEditPhaseOpen(false)} phase={selectedPhase} onSave={savePhaseEdits} />

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
        <WorkoutEditor open={!!editingWorkout} day={editingWorkout.day} exercises={exercises} onClose={() => setEditingWorkout(null)} onSave={saveWorkout} showToast={showToast} />
      )}
    </div>
  );
}

// =====================================================================
// Shell — Programs | Categories sub-nav, matching the design canvas
// =====================================================================

export default function CoachTrainSolo({ showToast }) {
  const [tab, setTab] = useState("programs");

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center gap-2 mb-1">
        <Mountain size={18} className="text-white" />
        <h1 className="text-white text-lg font-bold">Train Solo</h1>
      </div>
      <p className="text-white text-sm mb-4">Manage the independent, coach-free side of APEX — its own programs and catalogue categories.</p>

      <div className="flex gap-1 border-b mb-5" style={{ borderColor: CLIENT_DARK_BORDER }}>
        {[
          { id: "programs", label: "Programs" },
          { id: "categories", label: "Categories" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-semibold px-3.5 py-2.5 border-b-2 transition-colors"
            style={{
              borderColor: tab === t.id ? "#fff" : "transparent",
              color: tab === t.id ? "#fff" : "rgba(255,255,255,0.55)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "programs" ? <CoachSoloPrograms showToast={showToast} /> : <CoachSoloCategories showToast={showToast} />}
    </div>
  );
}
