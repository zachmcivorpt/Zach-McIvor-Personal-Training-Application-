import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { newId } from "../lib/id";
import { Field, TextInput, TextArea, SecondaryButton, DangerButton, FullScreenOverlay } from "../components/ui";
import { NotebookPen, Plus, ChevronLeft, ChevronUp, ChevronDown, Trash2, Type, Hash, Star, Camera, ListChecks, X, Download } from "lucide-react";
import { CHECKIN_TEMPLATES } from "../lib/checkinTemplates";
import { DarkPanel } from "./darkUI";
import { MEASURE_BLUE } from "../theme";

const QUESTION_TYPES = [
  { type: "text", label: "Short text", icon: Type },
  { type: "number", label: "Number", icon: Hash },
  { type: "rating", label: "Rating (1-5)", icon: Star },
  { type: "choice", label: "Multiple choice", icon: ListChecks },
  { type: "photo", label: "Photo", icon: Camera },
];

function emptyDraft() {
  return { name: "", description: "", questions: [] };
}

function QuestionRow({ q, index, total, onChange, onRemove, onMove }) {
  const meta = QUESTION_TYPES.find((t) => t.type === q.type) || QUESTION_TYPES[0];
  const Icon = meta.icon;
  const options = q.options || [];

  function updateOption(i, value) {
    onChange({ ...q, options: options.map((o, idx) => (idx === i ? value : o)) });
  }
  function removeOption(i) {
    onChange({ ...q, options: options.filter((_, idx) => idx !== i) });
  }
  function addOption() {
    onChange({ ...q, options: [...options, ""] });
  }

  return (
    <div className="bg-black/[0.03] border border-black/8 rounded-xl p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TextInput
            value={q.label}
            onChange={(e) => onChange({ ...q, label: e.target.value })}
            placeholder="Question text"
            className="!py-1.5 text-sm flex-1"
          />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-black/35 text-[11px] font-medium">{meta.label}</span>
          <label className="flex items-center gap-1.5 text-black/45 text-[11px] font-medium">
            <input type="checkbox" checked={!!q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} className="accent-blue-500" />
            Required
          </label>
        </div>
        {q.type === "choice" && (
          <div className="mt-2.5 space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <TextInput
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="!py-1.5 text-sm flex-1"
                />
                <button onClick={() => removeOption(i)} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60">
                  <X size={13} />
                </button>
              </div>
            ))}
            <button onClick={addOption} className="text-blue-600 text-[11px] font-semibold flex items-center gap-1 mt-0.5">
              <Plus size={12} /> Add option
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-black/60 disabled:opacity-20">
          <ChevronUp size={14} />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-black/60 disabled:opacity-20">
          <ChevronDown size={14} />
        </button>
      </div>
      <button onClick={onRemove} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function FormEditor({ form, onClose, onSave, onDelete }) {
  const isNew = !form;
  const [draft, setDraft] = useState(() => (form ? JSON.parse(JSON.stringify(form)) : emptyDraft()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateQuestion(i, q) {
    setDraft((d) => ({ ...d, questions: d.questions.map((row, idx) => (idx === i ? q : row)) }));
  }
  function removeQuestion(i) {
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }));
  }
  function moveQuestion(i, dir) {
    setDraft((d) => {
      const next = [...d.questions];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, questions: next };
    });
  }
  function addQuestion(type) {
    const base = { id: newId("q"), type, label: "", required: false };
    if (type === "choice") base.options = ["Yes", "No"];
    setDraft((d) => ({ ...d, questions: [...d.questions, base] }));
  }

  const canSave = draft.name.trim().length > 0;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-white z-10 border-b border-black/5">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-black/60 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-black font-semibold">{isNew ? "New Check-in Form" : "Edit Form"}</span>
          <button onClick={() => canSave && onSave(draft)} disabled={!canSave} className="text-sm font-bold text-black disabled:text-black/20">
            Save
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 max-w-2xl w-full mx-auto">
          <Field label="FORM NAME">
            <TextInput value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Weekly Check-in" />
          </Field>
          <Field label="DESCRIPTION" hint="Shown to the client above the questions">
            <TextArea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="e.g. Quick weekly check-in — takes 2 minutes."
            />
          </Field>

          <div>
            <p className="text-black font-semibold text-sm mb-3">Questions {draft.questions.length > 0 && `(${draft.questions.length})`}</p>
            {draft.questions.length === 0 && (
              <div className="border border-dashed border-black/12 rounded-2xl py-8 text-center mb-3">
                <p className="text-black/30 text-sm">No questions yet — add one below.</p>
              </div>
            )}
            <div className="space-y-2.5 mb-3">
              {draft.questions.map((q, i) => (
                <QuestionRow
                  key={q.id}
                  q={q}
                  index={i}
                  total={draft.questions.length}
                  onChange={(next) => updateQuestion(i, next)}
                  onRemove={() => removeQuestion(i)}
                  onMove={(dir) => moveQuestion(i, dir)}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {QUESTION_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.type}
                    onClick={() => addQuestion(t.type)}
                    className="flex flex-col items-center gap-1.5 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl py-3 transition-colors"
                  >
                    <Icon size={16} className="text-blue-500" />
                    <span className="text-black/60 text-[11px] font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!isNew && (
            <div className="pt-4 border-t border-black/5">
              {!confirmDelete ? (
                <DangerButton className="w-full" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete form
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

export default function CoachForms({ showToast }) {
  const { db, createForm, updateForm, deleteForm } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | form | null
  const [importing, setImporting] = useState(false);
  const forms = db.forms || [];

  async function importTemplates() {
    setImporting(true);
    const existingNames = new Set(forms.map((f) => f.name));
    const toImport = CHECKIN_TEMPLATES.filter((t) => !existingNames.has(t.name));
    let created = 0;
    try {
      for (const template of toImport) {
        await createForm(template);
        created++;
      }
      if (created === 0) {
        showToast("All check-in templates are already in your library");
      } else {
        showToast(`Imported ${created} check-in template${created === 1 ? "" : "s"}`);
      }
    } catch (err) {
      showToast(err.message || "Import stopped — something went wrong");
    } finally {
      setImporting(false);
    }
  }

  async function handleSave(draft) {
    const cleaned = {
      ...draft,
      questions: draft.questions.map((q) =>
        q.type === "choice" ? { ...q, options: (q.options || []).map((o) => o.trim()).filter(Boolean) } : q
      ),
    };
    try {
      if (cleaned.id && forms.some((f) => f.id === cleaned.id)) {
        await updateForm(cleaned.id, cleaned);
        showToast("Form updated");
      } else {
        await createForm(cleaned);
        showToast("Form created");
      }
      setEditing(null);
    } catch (err) {
      showToast(err.message || "Couldn't save that form");
    }
  }

  function handleDelete(id) {
    deleteForm(id);
    showToast("Form deleted");
    setEditing(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-white/40 text-sm">{forms.length} total · schedule any form to recur weekly on a client's calendar</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={importTemplates}
            disabled={importing}
            aria-label="Import check-in templates"
            className="flex items-center gap-2 bg-white/8 hover:bg-white/15 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={16} /> <span className="hidden sm:inline">{importing ? "IMPORTING…" : "IMPORT WEEKLY CHECK-IN"}</span>
          </button>
          <button
            onClick={() => setEditing({ isNew: true })}
            aria-label="New form"
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl shrink-0 transition-opacity hover:opacity-90"
          >
            <Plus size={16} /> <span className="hidden sm:inline">NEW FORM</span>
          </button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="border border-dashed rounded-2xl py-14 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          <NotebookPen size={22} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm font-medium">No check-in forms yet</p>
          <p className="text-white/30 text-xs mt-1">Build your first one, e.g. a Weekly Check-in.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {forms.map((f) => (
            <DarkPanel key={f.id} chamfer className="active:scale-[0.98] transition-transform">
              <div onClick={() => setEditing(f)} className="relative cursor-pointer hover:bg-white/[0.03] transition-colors p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
                  >
                    <NotebookPen size={16} style={{ color: MEASURE_BLUE }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-white/40 text-xs truncate mt-0.5">
                      {f.questions.length} question{f.questions.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            </DarkPanel>
          ))}
        </div>
      )}

      {editing && <FormEditor form={editing.isNew ? null : editing} onClose={() => setEditing(null)} onSave={handleSave} onDelete={handleDelete} />}
    </div>
  );
}
