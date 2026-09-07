import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, Pill, BottomSheet, Field, TextInput, TextArea, Select, PrimaryButton, DangerButton, SecondaryButton, ExerciseThumb } from "../components/ui";
import { Plus, Upload, Search, Trash2, Download, Copy, Layers } from "lucide-react";
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
              if (parsed.kind === "search") {
                return (
                  <a
                    href={parsed.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-black/5 border border-black/10 text-black/60 text-sm font-medium py-3 rounded-xl"
                  >
                    <Search size={15} /> Open YouTube search — find one, then paste its link here instead
                  </a>
                );
              }
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

// Paste-in bulk video import — one line per exercise as
// "Exercise Name | https://youtube.com/watch?v=...", matched by name
// against the existing library. This is how real, hand-verified videos
// (found and checked one at a time, e.g. via web search) get applied
// without editing each exercise by hand.
function ImportVideosSheet({ open, onClose, showToast }) {
  const { bulkImportExerciseVideos } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { matchedCount, unmatched } | null

  function close() {
    setText("");
    setResult(null);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    // Same class of bug as the login screen's Sign In button: pasting into
    // a mobile textarea can update what's visibly on screen without ever
    // firing React's onChange, leaving `text` state empty while the box
    // looks full. Falling back to the DOM value directly means a paste
    // that "worked" visually actually gets read.
    const raw = text || e.currentTarget.videos?.value || "";
    const pairs = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("|");
        if (i === -1) return null;
        return { name: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
      })
      .filter(Boolean);
    if (pairs.length === 0) {
      showToast("Add at least one line as: Exercise Name | video URL");
      return;
    }
    setBusy(true);
    try {
      const res = await bulkImportExerciseVideos(pairs);
      setResult(res);
      if (res.matchedCount > 0) showToast(`Updated ${res.matchedCount} exercise${res.matchedCount === 1 ? "" : "s"}`);
    } catch (err) {
      showToast(err.message || "Couldn't import videos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title="Import Video List">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-black/40 text-xs">
          One exercise per line: <span className="font-mono text-black/60">Exercise Name | video URL</span>. Names are
          matched exactly (case-insensitive) against your library.
        </p>
        <TextArea
          rows={10}
          name="videos"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Barbell Back Squat | https://youtube.com/watch?v=...\nDeadlift | https://youtube.com/watch?v=..."}
          className="font-mono text-xs"
        />
        {result && (
          <div className="bg-black/5 border border-black/10 rounded-xl px-3.5 py-3 text-sm space-y-1.5">
            <p className="text-black font-semibold">
              Matched {result.matchedCount} of {result.matchedCount + result.unmatched.length}
            </p>
            {result.unmatched.length > 0 && (
              <p className="text-black/50 text-xs">
                No exact name match for: {result.unmatched.join(", ")}
              </p>
            )}
          </div>
        )}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          {busy ? "IMPORTING…" : "IMPORT VIDEOS"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

// Groups the library by trimmed/lowercased name and lets the coach see
// exactly what's duplicated before removing anything. Deletion itself
// happens in AppContext's dedupeExercises — this just previews the groups
// and reports the result, same pattern as ImportVideosSheet above.
function DedupeSheet({ open, onClose, showToast }) {
  const { db, dedupeExercises } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { removedCount, groupCount } | null

  const groups = React.useMemo(() => {
    const map = new Map();
    (db.exercises || []).forEach((e) => {
      const key = (e.name || "").trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return [...map.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  }, [db.exercises]);
  const extraCount = groups.reduce((n, g) => n + g.length - 1, 0);

  function close() {
    setResult(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await dedupeExercises();
      setResult(res);
      showToast(
        res.removedCount === 0
          ? "No duplicates found"
          : `Removed ${res.removedCount} duplicate${res.removedCount === 1 ? "" : "s"} across ${res.groupCount} exercise${res.groupCount === 1 ? "" : "s"}`
      );
    } catch (err) {
      showToast(err.message || "Couldn't remove duplicates");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title="Remove Duplicate Exercises">
      <div className="space-y-4">
        {result ? (
          <p className="text-black/60 text-sm">
            Removed {result.removedCount} duplicate{result.removedCount === 1 ? "" : "s"}. For each name, the copy with the most
            filled-in details (real video, instructions, form cues) was kept — any workout or program that used a removed copy now
            points at the one that's left.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-black/60 text-sm">No duplicate exercise names found.</p>
        ) : (
          <>
            <p className="text-black/40 text-xs">
              {groups.length} exercise name{groups.length === 1 ? "" : "s"} have duplicates. The copy with the most filled-in details
              (real video, instructions, form cues) is kept for each; the rest are removed. Any workout or program using a removed
              copy is automatically repointed at the one that's kept.
            </p>
            <div className="max-h-64 overflow-y-auto border border-black/10 rounded-xl divide-y divide-black/10">
              {groups.map((g) => (
                <div key={g[0].id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-black text-sm truncate">{g[0].name}</span>
                  <span className="text-black/40 text-xs shrink-0">×{g.length}</span>
                </div>
              ))}
            </div>
            <PrimaryButton type="button" onClick={confirm} className="w-full" disabled={busy}>
              {busy ? "REMOVING…" : `REMOVE ${extraCount} DUPLICATE${extraCount === 1 ? "" : "S"}`}
            </PrimaryButton>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

export default function CoachExercises({ showToast, compact = false }) {
  const { db, importSeedExercises: bulkImportExercises, bulkFillExerciseVideos } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | exercise | null
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [fillingVideos, setFillingVideos] = useState(false);
  const [importVideosOpen, setImportVideosOpen] = useState(false);
  const [dedupeOpen, setDedupeOpen] = useState(false);

  const filtered = db.exercises.filter((e) => (e.name || "").toLowerCase().includes(search.toLowerCase()));
  const missingVideoCount = db.exercises.filter((e) => !e.videoUrl).length;
  const needsRealVideoCount = db.exercises.filter((e) => !e.videoUrl || e.videoUrl.includes("youtube.com/results")).length;
  const duplicateExtraCount = (() => {
    const seen = new Map();
    db.exercises.forEach((e) => {
      const key = (e.name || "").trim().toLowerCase();
      if (!key) return;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    let extra = 0;
    seen.forEach((count) => {
      if (count > 1) extra += count - 1;
    });
    return extra;
  })();

  // No direct access to the live database from outside the app — this is
  // how the coach hands over their ACTUAL exercise names (rather than
  // guessing common ones) to search real videos against and get back an
  // Import Video List that's guaranteed to match by name.
  function copyExerciseNames() {
    const names = db.exercises
      .filter((e) => !e.videoUrl || e.videoUrl.includes("youtube.com/results"))
      .map((e) => e.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) {
      showToast("Every exercise already has a specific video");
      return;
    }
    navigator.clipboard?.writeText(names.join("\n"));
    showToast(`Copied ${names.length} name${names.length === 1 ? "" : "s"} — paste them into the chat`);
  }

  async function fillMissingVideos() {
    setFillingVideos(true);
    try {
      const count = await bulkFillExerciseVideos();
      showToast(
        count === 0
          ? "Every exercise already has a video"
          : `Added a YouTube search link to ${count} exercise${count === 1 ? "" : "s"} — swap any of them for a specific video anytime`
      );
    } catch (err) {
      showToast(err.message || "Couldn't fill videos");
    } finally {
      setFillingVideos(false);
    }
  }

  async function importSeedExercises() {
    setImporting(true);
    // Dedupe by the seed's fixed id, not by name — a name-only check let a
    // past import mint a random id for a same-named exercise, which then
    // silently broke every starter-program reference to that fixed id.
    const existingIds = new Set(db.exercises.map((e) => e.id));
    const toImport = SEED_EXERCISES.filter((e) => !existingIds.has(e.id));
    try {
      if (toImport.length === 0) {
        showToast("Your library already has every exercise in the seed list");
      } else {
        await bulkImportExercises(toImport);
        showToast(`Imported ${toImport.length} exercise${toImport.length === 1 ? "" : "s"}`);
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
          {missingVideoCount > 0 && (
            <button
              onClick={fillMissingVideos}
              disabled={fillingVideos}
              aria-label="Fill missing exercise videos"
              title="Adds a YouTube search link (not a specific hand-picked video) to every exercise that doesn't have one yet"
              className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              <Upload size={16} />{" "}
              <span className="hidden sm:inline">{fillingVideos ? "FILLING…" : `FILL ${missingVideoCount} MISSING VIDEO${missingVideoCount === 1 ? "" : "S"}`}</span>
            </button>
          )}
          {needsRealVideoCount > 0 && (
            <button
              onClick={copyExerciseNames}
              aria-label="Copy names of exercises needing a real video"
              title="Copies the names of every exercise that still only has a generic search link, so they can be searched by exact name"
              className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Copy size={16} /> <span className="hidden sm:inline">COPY {needsRealVideoCount} NAME{needsRealVideoCount === 1 ? "" : "S"}</span>
            </button>
          )}
          <button
            onClick={() => setImportVideosOpen(true)}
            aria-label="Import a list of specific videos"
            title="Paste a list of Exercise Name | video URL lines to set real, specific videos in bulk"
            className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Upload size={16} /> <span className="hidden sm:inline">IMPORT VIDEO LIST</span>
          </button>
          {duplicateExtraCount > 0 && (
            <button
              onClick={() => setDedupeOpen(true)}
              aria-label="Remove duplicate exercises"
              title="Finds exercises with the same name and removes the extra copies, keeping the most complete one"
              className="flex items-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Layers size={16} /> <span className="hidden sm:inline">{duplicateExtraCount} DUPLICATE{duplicateExtraCount === 1 ? "" : "S"}</span>
            </button>
          )}
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

      <ImportVideosSheet open={importVideosOpen} onClose={() => setImportVideosOpen(false)} showToast={showToast} />
      <DedupeSheet open={dedupeOpen} onClose={() => setDedupeOpen(false)} showToast={showToast} />

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
