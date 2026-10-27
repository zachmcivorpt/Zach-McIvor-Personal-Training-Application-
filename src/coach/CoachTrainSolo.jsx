import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp, programPhases, computeWeekOnePreview } from "../lib/AppContext";
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
  Check,
  Image as ImageIcon,
  Copy,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { countExercises, estimateWorkoutMinutes } from "../lib/workoutStats";
import WorkoutEditor from "./WorkoutEditor";
import { ProgramListItem, StatFigures, Disclosure, PhaseAccordionRow } from "./programDashboardUI";
import { MEASURE_BLUE, CLIENT_DARK_SURFACE, CLIENT_DARK_SURFACE_2, CLIENT_DARK_BORDER, OVER_RED, TEXT, TEXT_MUTED, BORDER_STRONG } from "../theme";
import { GOAL_OPTIONS, STYLE_OPTIONS, ENVIRONMENT_OPTIONS, LEVEL_OPTIONS, AUDIENCE_OPTIONS } from "../solo/programAttributes";
import { formatAudPrice } from "../solo/recommendations";
import { SOLO_ACCENT_PALETTE } from "../solo/SoloThemeContext";

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
      {selectable.length === 0 && <p className="text-xs" style={{ color: TEXT_MUTED }}>No categories yet — add one in the Categories tab.</p>}
      {selectable.map((c) => {
        const on = selectedIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
            style={on ? { backgroundColor: TEXT, borderColor: TEXT, color: "#FFFFFF" } : { borderColor: BORDER_STRONG, color: TEXT }}
          >
            {c.name}
            {on && <X size={11} />}
          </button>
        );
      })}
    </div>
  );
}

// Generic multi-select chip row for the recommendation-matching attributes
// below (goals/environments) — same visual as CategoryChips, just driven
// by a plain {value,label}[] instead of category docs.
function TagChips({ options, selectedValues, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selectedValues.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
            style={on ? { backgroundColor: TEXT, borderColor: TEXT, color: "#FFFFFF" } : { borderColor: BORDER_STRONG, color: TEXT }}
          >
            {opt.label}
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
  const [priceAud, setPriceAud] = useState("");
  const [goals, setGoals] = useState([]);
  const [style, setStyle] = useState("");
  const [environments, setEnvironments] = useState([]);
  const [audience, setAudience] = useState([]);
  const [kind, setKind] = useState("program");
  const [saving, setSaving] = useState(false);
  const isRecovery = kind === "recovery";

  React.useEffect(() => {
    if (open) {
      setName(program?.name || "");
      setLevel(program?.level || "Beginner");
      setDescription(program?.description || "");
      setCategoryIds(program?.categoryIds || []);
      setPriceAud(program?.priceCents != null ? (program.priceCents / 100).toFixed(2) : "");
      setGoals(program?.goals || []);
      setStyle(program?.style || "");
      setEnvironments(program?.environments || []);
      setAudience(program?.audience || []);
      setKind(program?.kind === "recovery" ? "recovery" : "program");
    }
  }, [open, program?.id]);

  function toggleCategory(id) {
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function toggleGoal(value) {
    setGoals((ids) => (ids.includes(value) ? ids.filter((x) => x !== value) : [...ids, value]));
  }
  function toggleAudience(value) {
    setAudience((ids) => (ids.includes(value) ? ids.filter((x) => x !== value) : [...ids, value]));
  }
  function toggleEnvironment(value) {
    setEnvironments((ids) => (ids.includes(value) ? ids.filter((x) => x !== value) : [...ids, value]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const parsedPrice = parseFloat(priceAud);
      await onSave({
        name: name.trim(),
        level,
        description,
        categoryIds,
        // A recovery add-on is always free; a program keeps its own price.
        kind,
        priceCents: isRecovery ? 0 : Number.isFinite(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice * 100) : null,
        goals,
        style: style || null,
        environments,
        audience,
      });
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
        <Field
          label="TYPE"
          hint={
            isRecovery
              ? "Free. Shown in the Catalogue's Recovery add-ons section; a customer runs one alongside a purchased program, with its week-N sessions placed on that program's week-N rest days."
              : "A paid program, bought through Stripe checkout."
          }
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="program">Program (paid)</option>
            <option value="recovery">Recovery add-on (free)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="LEVEL">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVEL_OPTIONS.map((lv) => (
                <option key={lv}>{lv}</option>
              ))}
            </Select>
          </Field>
          {isRecovery ? (
            <Field label="PRICE">
              <p className="text-sm py-2.5" style={{ color: TEXT }}>Free</p>
            </Field>
          ) : (
          <Field label="PRICE (AUD)" hint="Leave blank while still drafting">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={priceAud}
              onChange={(e) => setPriceAud(e.target.value)}
              placeholder="79.00"
            />
          </Field>
          )}
        </div>
        <Field label="DESCRIPTION">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this program is for, who it suits..." />
        </Field>
        {!isRecovery && (
        <Field group label="CATEGORIES">
          <CategoryChips allCategories={allCategories} selectedIds={categoryIds} onToggle={toggleCategory} />
        </Field>
        )}
        {!isRecovery && (
        <Field
          group
          label="WHO IT'S FOR"
          hint="Suggestions only show this program to customers whose consultation answer matches. Leave both off (or pick both) if it suits everyone."
        >
          <TagChips options={AUDIENCE_OPTIONS} selectedValues={audience} onToggle={toggleAudience} />
        </Field>
        )}
        <Field
          group
          label="GOALS THIS PROGRAM SUITS"
          hint="Used to recommend this program to customers whose consultation answers match"
        >
          <TagChips options={GOAL_OPTIONS} selectedValues={goals} onToggle={toggleGoal} />
        </Field>
        <Field label="TRAINING STYLE">
          <Select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">Not set</option>
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field group label="SUITABLE TRAINING ENVIRONMENTS">
          <TagChips options={ENVIRONMENT_OPTIONS} selectedValues={environments} onToggle={toggleEnvironment} />
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
        <Field group label="DURATION">
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
    <div className="flex items-center gap-3 py-3 transition-colors">
      <button onClick={onOpen} className="shrink-0" aria-label={`Open ${day.label}`}>
        <ExerciseThumb exercise={firstEx} size={40} rounded="rounded-lg" dark />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-white font-semibold text-sm truncate hover:underline">{day.label}</p>
        <p className="text-white/45 text-xs truncate mt-0.5">
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
  // Whether the selected phase's dropdown is open (it opens by default).
  const [phaseOpen, setPhaseOpen] = useState(true);

  const exercises = db.exercises;
  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const categories = db.soloProgramCategories || [];
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const programs = db.soloPrograms || [];
  const selected = programs.find((p) => p.id === selectedId) || null;
  // The full phases/days/exercises live on the separately-gated
  // soloProgramContent/{id} doc, not on `selected` itself — see
  // AppContext.jsx's createSoloProgram/updateSoloProgram comment. The
  // coach reads it here the same way any other coach-only collection is
  // read (db.soloProgramContent, watched coach-wide in AppContext.jsx).
  const selectedContent = (db.soloProgramContent || []).find((c) => c.id === selected?.id);

  // One-off backfill: programs saved before weekOnePreview carried
  // sessionsPerWeek (used to match suggestions to a customer's chosen
  // sessions a week) get it filled in from their content.
  const backfilledRef = useRef(new Set());
  useEffect(() => {
    for (const program of programs) {
      if (typeof program.weekOnePreview?.sessionsPerWeek === "number" || backfilledRef.current.has(program.id)) continue;
      const content = (db.soloProgramContent || []).find((c) => c.id === program.id);
      if (!content) continue;
      backfilledRef.current.add(program.id);
      updateSoloProgram(program.id, { weekOnePreview: computeWeekOnePreview(programPhases(content)) }).catch(() => backfilledRef.current.delete(program.id));
    }
  }, [programs, db.soloProgramContent, updateSoloProgram]);
  const phases = programPhases(selectedContent);
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || phases[0] || null;
  const phaseIndex = selectedPhase ? phases.findIndex((p) => p.id === selectedPhase.id) : -1;

  function selectProgram(id) {
    setSelectedId(id);
    setSelectedPhaseId(null);
    setPhaseOpen(true);
  }

  // A recovery add-on is free, so its sessions are also mirrored onto the
  // public soloPrograms doc (recoveryPhases) — customers read them from
  // there without a purchase, while paid programs stay purchase-gated.
  function savePhases(next) {
    if (!selected) return;
    return updateSoloProgram(selected.id, { phases: next, ...(selected.kind === "recovery" && { recoveryPhases: next }) });
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
      await updateSoloProgram(selected.id, { ...data, recoveryPhases: data.kind === "recovery" ? phases : null });
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

  // Copies a phase (and every workout in it) straight after the original,
  // with fresh ids — day ids key customers' workout logs, so a copy must
  // never share them with the phase it came from.
  function duplicatePhase(idx) {
    const source = phases[idx];
    if (!source) return;
    const copy = {
      ...source,
      id: newId("ph"),
      name: `${source.name} (copy)`,
      days: (source.days || []).map((d) => ({ ...d, id: newId("d") })),
    };
    savePhases([...phases.slice(0, idx + 1), copy, ...phases.slice(idx + 1)]);
    setSelectedPhaseId(copy.id);
    showToast("Phase duplicated");
  }

  function movePhase(idx, dir) {
    const to = idx + dir;
    if (to < 0 || to >= phases.length) return;
    const next = [...phases];
    [next[idx], next[to]] = [next[to], next[idx]];
    savePhases(next);
    showToast(dir < 0 ? "Phase moved up" : "Phase moved down");
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
  // preview design, which needs a real Day 1 to show, not an empty shell —
  // has a real AUD price, since the catalogue and Program Details screen
  // both display one, and belongs to at least one non-archived category.
  // The customer catalogue only ever renders a program nested under one of
  // its categories (see recommendations.js's visiblePrograms/
  // visibleCategories) — a published program with no category assigned
  // was silently invisible everywhere in the catalogue with no error or
  // explanation, which is exactly the bug this check exists to prevent
  // from recurring.
  const hasAnyWorkout = phases.some((p) => (p.days || []).length > 0);
  // Recovery add-ons are free and live in their own Catalogue section, so
  // they need neither a price nor a category to be visible.
  const isRecoverySelected = selected?.kind === "recovery";
  const hasPrice = isRecoverySelected || selected?.priceCents != null;
  const hasCategory = isRecoverySelected || (selected?.categoryIds || []).some((id) => categoriesById[id] && !categoriesById[id].archived);
  async function togglePublish() {
    if (!selected) return;
    if (selected.status !== "published" && !hasAnyWorkout) {
      showToast("Add at least one workout before publishing");
      return;
    }
    if (selected.status !== "published" && !hasPrice) {
      showToast("Set a price before publishing");
      return;
    }
    if (selected.status !== "published" && !hasCategory) {
      showToast("Assign at least one category before publishing — otherwise it won't appear anywhere in the catalogue");
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
            {programs.map((p) => (
              <ProgramListItem
                key={p.id}
                active={p.id === selected?.id}
                onClick={() => selectProgram(p.id)}
                title={p.name}
                meta={p.kind === "recovery" ? "Recovery add-on · Free" : (p.categoryIds || []).map((id) => categoriesById[id]?.name).filter(Boolean).join(", ") || "No categories"}
                badge={
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 text-white"
                    style={{ backgroundColor: p.status === "published" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.12)" }}
                  >
                    {p.status === "published" ? "LIVE" : "DRAFT"}
                  </span>
                }
              />
            ))}
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
                  <p className="text-white text-xs mt-0.5">
                    {p.status === "published" ? "Live" : "Draft"}
                    {p.kind === "recovery" ? " · Recovery add-on" : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* right: detail */}
        <div className={`${mobileView === "detail" ? "block" : "hidden"} md:block flex-1 min-w-0 overflow-y-auto py-4 md:p-6`}>
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-white/45 text-[11px] font-bold tracking-[0.14em]">
                      {isRecoverySelected ? "RECOVERY ADD-ON" : "PROGRAM"}
                      {selected.level ? ` · ${selected.level.toUpperCase()}` : ""}
                    </p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: selected.status === "published" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.12)" }}
                    >
                      {selected.status === "published" ? "LIVE" : "DRAFT"}
                    </span>
                  </div>
                  <h2 className="text-white text-lg md:text-xl font-bold leading-snug break-words">{selected.name}</h2>
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

              <StatFigures
                items={[
                  { label: "Phases", value: phases.length },
                  { label: "Weeks", value: phases.reduce((a, p) => a + (p.durationWeeks || 0), 0) },
                  { label: "Workouts", value: phases.reduce((a, p) => a + (p.days || []).length, 0) },
                  { label: "Price", value: isRecoverySelected ? "Free" : selected.priceCents != null ? formatAudPrice(selected.priceCents) : "—" },
                ]}
              />

              <div className="mb-5">
                <SecondaryButton onClick={togglePublish} className="w-full" dark>
                  {selected.status === "published" ? "Move back to draft" : "Preview & publish"}
                </SecondaryButton>
                {selected.status !== "published" && !hasAnyWorkout && (
                  <p className="text-white text-xs mt-2">Add at least one workout below before this can be published.</p>
                )}
                {selected.status !== "published" && hasAnyWorkout && !hasPrice && (
                  <p className="text-white text-xs mt-2">Set a price (edit program) before this can be published.</p>
                )}
                {selected.status !== "published" && hasAnyWorkout && hasPrice && !hasCategory && (
                  <p className="text-white text-xs mt-2">
                    Assign at least one category (edit program) before this can be published — it won't be visible in the catalogue
                    otherwise.
                  </p>
                )}
                {selected.status === "published" && !hasCategory && (
                  <p className="text-white text-xs mt-2">
                    This program is published but has no category assigned, so customers can't see it in the catalogue — edit the
                    program and assign one.
                  </p>
                )}
              </div>

              <div className="mb-5 border-t" style={{ borderColor: CLIENT_DARK_BORDER }}>
                <Disclosure
                  key={`about-${selected.id}`}
                  title="About"
                  summary={
                    isRecoverySelected
                      ? "Recovery add-on"
                      : (selected.categoryIds || []).map((id) => categoriesById[id]?.name).filter(Boolean).join(", ") || "No categories assigned"
                  }
                >
                  {selected.description && <p className="text-white/80 text-sm leading-relaxed">{selected.description}</p>}
                  <p className="text-white/60 text-xs mt-2">
                    {isRecoverySelected
                      ? "Shown in the Catalogue's Recovery add-ons section."
                      : `Categories: ${(selected.categoryIds || []).map((id) => categoriesById[id]?.name).filter(Boolean).join(", ") || "none assigned"}`}
                  </p>
                </Disclosure>
                <Disclosure key={`art-${selected.id}`} title="Cover artwork" summary={selected.artworkUrl ? "Uploaded" : "None yet"}>
                  <ArtworkPicker program={selected} showToast={showToast} onUploaded={(url) => updateSoloProgram(selected.id, { artworkUrl: url })} />
                </Disclosure>
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
                  {/* Every phase as a dropdown, in order — open one to see and edit its workouts. */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <p className="text-white text-[11px] font-bold tracking-[0.14em]">PHASES</p>
                    <button onClick={addPhase} className="flex items-center gap-1 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-white/10">
                      <Plus size={13} /> Add phase
                    </button>
                  </div>
                  <div className="space-y-2">
                    {phases.map((p, idx) => {
                      const open = p.id === selectedPhase.id && phaseOpen;
                      const count = (p.days || []).length;
                      return (
                        <PhaseAccordionRow
                          key={p.id}
                          index={idx}
                          name={p.name}
                          meta={`${p.durationWeeks} wk${p.durationWeeks === 1 ? "" : "s"} · ${count} workout${count === 1 ? "" : "s"}`}
                          open={open}
                          onToggle={() => {
                            if (p.id === selectedPhase.id) setPhaseOpen((o) => !o);
                            else {
                              setSelectedPhaseId(p.id);
                              setPhaseOpen(true);
                            }
                          }}
                          menu={
                            <OverflowMenu
                              label={`${p.name} actions`}
                              items={[
                                {
                                  icon: Pencil,
                                  label: "Edit name & weeks",
                                  onClick: () => {
                                    setSelectedPhaseId(p.id);
                                    setEditPhaseOpen(true);
                                  },
                                },
                                { icon: Copy, label: "Duplicate", onClick: () => duplicatePhase(idx) },
                                ...(idx > 0 ? [{ icon: ArrowUp, label: "Move up", onClick: () => movePhase(idx, -1) }] : []),
                                ...(idx < phases.length - 1 ? [{ icon: ArrowDown, label: "Move down", onClick: () => movePhase(idx, 1) }] : []),
                                {
                                  icon: Trash2,
                                  label: "Delete phase",
                                  danger: true,
                                  onClick: () => {
                                    setSelectedPhaseId(p.id);
                                    setConfirmDeletePhase(true);
                                  },
                                },
                              ]}
                            />
                          }
                        >
                          {open && (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-white/45 text-[11px] font-bold tracking-[0.14em] uppercase">Workouts{count > 0 && ` · ${count}`}</p>
                                <button onClick={openNewWorkout} className="flex items-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-1.5 rounded-lg">
                                  <Plus size={13} /> New
                                </button>
                              </div>
                              {count === 0 ? (
                                <div className="border border-dashed rounded-2xl py-8 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
                                  <p className="text-white text-sm">No workouts in this phase yet.</p>
                                </div>
                              ) : (
                                <div className="divide-y divide-white/[0.07]">
                                  {(selectedPhase.days || []).map((d, i) => (
                                    <WorkoutRow key={d.id || i} day={d} exercisesById={exercisesById} onOpen={() => editDay(i)} onDelete={() => deleteDay(i)} />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </PhaseAccordionRow>
                      );
                    })}
                  </div>
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

// Train Solo's one coach-configurable branding setting: an accent colour
// for the customer app (used instead of the fixed MEASURE_BLUE in a
// handful of Solo customer screens — see SoloThemeContext.jsx). The logo
// is deliberately NOT configurable here: Train Solo's customer screens
// always show the real APEX mountain mark, never a per-coach choice —
// that's the agreed design, not an oversight.
function CoachSoloBranding({ showToast }) {
  const { db, updateSoloBranding } = useApp();
  const current = db.soloBranding?.accent || "blue";

  function pick(value) {
    updateSoloBranding({ accent: value });
    showToast("Branding updated");
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: "rgba(47,143,255,0.08)", border: "1px solid rgba(47,143,255,0.2)" }}>
        <p className="text-white text-sm leading-relaxed">
          These settings apply to Train Solo only — the independent, coach-free side of APEX. They do not change your Coaching app's
          logo, colours, or login screen in any way.
        </p>
      </div>

      <p className="text-white text-[11px] font-bold tracking-wide uppercase mb-1">Solo logo</p>
      <p className="text-white text-xs mb-4">
        Always the existing APEX mark — the same one shown on Login and the Coach Console. This isn't configurable for Train Solo.
      </p>

      <p className="text-white text-[11px] font-bold tracking-wide uppercase mb-2">Solo accent colour</p>
      <p className="text-white text-xs mb-3">
        Used for highlights and callouts across the Train Solo customer app (buttons, progress, safety notices). Never affects the logo
        itself.
      </p>
      <div className="flex gap-3">
        {Object.entries(SOLO_ACCENT_PALETTE).map(([key, hex]) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            aria-label={key}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: hex, border: current === key ? "2px solid #fff" : "2px solid transparent", boxShadow: current === key ? "0 0 0 2px rgba(255,255,255,0.3)" : "none" }}
          >
            {current === key && <Check size={16} color="#fff" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}

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
          { id: "branding", label: "Branding" },
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

      {tab === "programs" && <CoachSoloPrograms showToast={showToast} />}
      {tab === "categories" && <CoachSoloCategories showToast={showToast} />}
      {tab === "branding" && <CoachSoloBranding showToast={showToast} />}
    </div>
  );
}
