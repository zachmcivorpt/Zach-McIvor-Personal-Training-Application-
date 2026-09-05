import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, Pill, BottomSheet, Field, TextInput, TextArea, Select, PrimaryButton, DangerButton, SecondaryButton, ExerciseThumb } from "../components/ui";
import { Plus, Upload, Search, Trash2, Download } from "lucide-react";
import { SEED_EXERCISES } from "../lib/seed";
import { parseVideoUrl } from "../lib/video";

function emptyExercise() {
  return {
    name: "",
    category: "",
    equipment: "Barbell",
    difficulty: "Beginner",
    primaryMuscles: "",
    secondaryMuscles: "",
    instructions: "",
    formCues: "",
    videoUrl: "",
  };
}

function toFormState(ex) {
  return {
    name: ex.name,
    category: ex.category,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    primaryMuscles: (ex.primaryMuscles || []).join(", "),
    secondaryMuscles: (ex.secondaryMuscles || []).join(", "),
    instructions: (ex.instructions || []).join("\n"),
    formCues: (ex.formCues || []).join("\n"),
    videoUrl: ex.videoUrl || "",
  };
}

function fromFormState(f) {
  return {
    name: f.name.trim(),
    category: f.category.trim(),
    equipment: f.equipment,
    difficulty: f.difficulty,
    primaryMuscles: f.primaryMuscles.split(",").map((s) => s.trim()).filter(Boolean),
    secondaryMuscles: f.secondaryMuscles.split(",").map((s) => s.trim()).filter(Boolean),
    instructions: f.instructions.split("\n").map((s) => s.trim()).filter(Boolean),
    formCues: f.formCues.split("\n").map((s) => s.trim()).filter(Boolean),
    videoUrl: f.videoUrl.trim(),
  };
}

export function ExerciseSheet({ exercise, open, onClose, showToast }) {
  const { createExercise, updateExercise, deleteExercise } = useApp();
  const [form, setForm] = useState(() => (exercise ? toFormState(exercise) : emptyExercise()));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadedName, setUploadedName] = useState("");
  const fileRef = useRef(null);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    set("videoUrl", url);
    setUploadedName(file.name);
  }

  function submit(e) {
    e.preventDefault();
    const data = fromFormState(form);
    if (exercise) {
      updateExercise(exercise.id, data);
      showToast("Exercise updated");
    } else {
      createExercise(data);
      showToast("Exercise added");
    }
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={exercise ? "Edit Exercise" : "Add Exercise"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="EXERCISE NAME">
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bulgarian Split Squat" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CATEGORY">
            <TextInput value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Legs" required />
          </Field>
          <Field label="EQUIPMENT">
            <Select value={form.equipment} onChange={(e) => set("equipment", e.target.value)}>
              {["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "Suspension", "Foam Roller", "Kettlebell", "Band", "Battle Ropes", "Medicine Ball", "Plate", "EZ Bar"].map((eq) => (
                <option key={eq}>{eq}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="DIFFICULTY">
          <Select value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PRIMARY MUSCLES" hint="comma separated">
            <TextInput value={form.primaryMuscles} onChange={(e) => set("primaryMuscles", e.target.value)} placeholder="Quads, Glutes" />
          </Field>
          <Field label="SECONDARY MUSCLES" hint="comma separated">
            <TextInput value={form.secondaryMuscles} onChange={(e) => set("secondaryMuscles", e.target.value)} placeholder="Core" />
          </Field>
        </div>
        <Field label="INSTRUCTIONS" hint="one step per line">
          <TextArea rows={3} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder={"Step one\nStep two"} />
        </Field>
        <Field label="FORM CUES" hint="one per line">
          <TextArea rows={2} value={form.formCues} onChange={(e) => set("formCues", e.target.value)} placeholder="Keep chest up" />
        </Field>

        <Field label="DEMO VIDEO">
          <div className="space-y-2">
            <TextInput
              value={form.videoUrl.startsWith("blob:") ? "" : form.videoUrl}
              onChange={(e) => set("videoUrl", e.target.value)}
              placeholder="Paste a hosted video URL (YouTube, Vimeo, MP4...)"
            />
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-black/10" />
              <span className="text-black/30 text-[10px]">OR</span>
              <div className="h-px flex-1 bg-black/10" />
            </div>
            <input ref={fileRef} type="file" accept="video/*" onChange={handleFile} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-black/5 border border-dashed border-black/15 text-black/60 text-sm font-medium py-3 rounded-xl"
            >
              <Upload size={15} /> {uploadedName || "Upload a video file"}
            </button>
            {form.videoUrl && (() => {
              const parsed = parseVideoUrl(form.videoUrl);
              return parsed.kind === "file" ? (
                <video src={parsed.src} controls className="w-full rounded-xl bg-white max-h-48" />
              ) : (
                <iframe
                  src={parsed.embedSrc}
                  title="Exercise demo preview"
                  className="w-full aspect-video rounded-xl bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              );
            })()}
            <p className="text-black/25 text-[11px] leading-relaxed">
              Uploaded files preview instantly but only persist for this browser session — connect real video storage (S3, Mux,
              Cloudinary...) to keep them long-term. A pasted URL persists normally.
            </p>
          </div>
        </Field>

        <PrimaryButton type="submit" className="w-full">
          {exercise ? "SAVE CHANGES" : "ADD EXERCISE"}
        </PrimaryButton>

        {exercise && (
          <div>
            {!confirmDelete ? (
              <DangerButton type="button" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete exercise
              </DangerButton>
            ) : (
              <div className="flex gap-2">
                <SecondaryButton type="button" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </SecondaryButton>
                <DangerButton
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    deleteExercise(exercise.id);
                    showToast("Exercise deleted");
                    onClose();
                  }}
                >
                  Confirm delete
                </DangerButton>
              </div>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}

export default function CoachExercises({ showToast, compact = false }) {
  const { db, createExercise } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | exercise | null
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  const filtered = db.exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  async function importSeedExercises() {
    setImporting(true);
    const existingNames = new Set(db.exercises.map((e) => e.name));
    const toImport = SEED_EXERCISES.filter((e) => !existingNames.has(e.name));
    let created = 0;
    try {
      for (const ex of toImport) {
        const { id: _id, ...data } = ex;
        await createExercise(data);
        created++;
      }
      if (created === 0) {
        showToast("Your library already has every exercise in the seed list");
      } else {
        showToast(`Imported ${created} exercise${created === 1 ? "" : "s"}`);
      }
    } catch (err) {
      showToast(err.message || "Import stopped — something went wrong");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={compact ? "max-w-6xl mx-auto px-4 pb-8 md:px-8" : "max-w-6xl mx-auto px-4 py-5 md:px-8 md:py-8"}>
      <div className={`flex items-center justify-between gap-3 flex-wrap ${compact ? "mb-4" : "mb-6"}`}>
        <div className="min-w-0">
          {!compact && <h1 className="text-black text-2xl font-bold">Exercise Library</h1>}
          <p className="text-black/40 text-sm mt-0.5">{db.exercises.length} total</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={importSeedExercises}
            disabled={importing}
            aria-label="Import seed exercises"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={16} /> <span className="hidden sm:inline">{importing ? "IMPORTING…" : "IMPORT MORE EXERCISES"}</span>
          </button>
          <button onClick={() => setEditing({ isNew: true })} aria-label="New exercise" className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0">
            <Plus size={16} /> <span className="hidden sm:inline">NEW EXERCISE</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5 mb-5 md:max-w-sm">
        <Search size={16} className="text-black/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises"
          className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {filtered.map((ex) => (
          <Card key={ex.id} onClick={() => setEditing(ex)}>
            <div className="flex items-center gap-3">
              <ExerciseThumb exercise={ex} size={40} rounded="rounded-xl" />
              <div className="flex-1 min-w-0">
                <p className="text-black font-semibold text-sm truncate">{ex.name}</p>
                <p className="text-black/40 text-xs truncate mt-0.5">
                  {ex.category} · {ex.equipment}
                </p>
              </div>
              <Pill tone="outline">{ex.difficulty}</Pill>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <ExerciseSheet
          exercise={editing.isNew ? null : editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
