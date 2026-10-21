import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import SoloGlassBox from "./SoloGlassBox";
import { SoloArtwork } from "./SoloArtwork";
import { recommendPrograms } from "./recommendations";
import { BottomSheet, PrimaryButton, SecondaryButton } from "../components/ui";
import { SECTIONS, getVisibleQuestions, isAnswered, isComplete, isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";

// Profile → "Review my consultation answers": every answer on one page,
// grouped by section. Tapping an answer opens it in a pop-up to change it;
// changes are held as a draft until "Save changes", which writes them in
// one go (saveOnboardingAnswer re-derives onboarding.completed) and then
// confirms with the refreshed recommendations. Recommendations are always
// derived live from the saved answers (recommendations.js), so the
// Catalogue's "Recommended for you" follows automatically.
//
// Branching still comes from questionnaireConfig: changing an answer that
// reveals a required follow-up (e.g. goal → "Something else") shows that
// follow-up here as needing an answer, and saving waits for it.
export default function SoloConsultationScreen() {
  const navigate = useNavigate();
  const { soloAuthUser, soloCurrentUser, saveOnboardingAnswer, recordHealthConsent, soloPrograms, soloProgramCategories, soloPurchases } = useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];

  const savedAnswers = useMemo(() => soloCurrentUser?.onboarding?.answers || {}, [soloCurrentUser?.onboarding?.answers]);
  const [draft, setDraft] = useState({});
  const answers = useMemo(() => ({ ...savedAnswers, ...draft }), [savedAnswers, draft]);
  const dirty = Object.keys(draft).some((k) => JSON.stringify(draft[k]) !== JSON.stringify(savedAnswers[k]));
  const complete = isComplete(answers);

  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(null); // { answers } once saved
  const [confirmLeave, setConfirmLeave] = useState(false);

  const visible = getVisibleQuestions(answers);
  const editing = visible.find((q) => q.id === editingId) || null;

  function leave() {
    navigate("/solo/home", { state: { soloTab: "profile" } });
  }

  async function save() {
    if (!soloAuthUser || !dirty || !complete || saving) return;
    setSaving(true);
    setSaveError("");
    const lastId = Object.keys(draft)[0];
    try {
      await saveOnboardingAnswer(soloAuthUser.uid, answers, lastId, answers[lastId]);
      if (draft.healthConsent === true && savedAnswers.healthConsent !== true) recordHealthConsent(soloAuthUser.uid).catch(() => {});
      setSaved({ answers });
      setDraft({});
      window.scrollTo(0, 0);
    } catch {
      setSaveError("Couldn't save your answers — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const header = (title, subtitle, onBack) => (
    <div className="w-full max-w-md mx-auto px-3 pt-5 pb-3 flex items-center gap-2">
      <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={soloGlass(t)}>
        <ChevronLeft size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs" style={{ color: t.textMuted }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  if (saved) {
    return (
      <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
        {header("Consultation", null, leave)}
        <SavedConfirmation
          answers={saved.answers}
          t={t}
          dark={dark}
          accent={accent}
          programs={soloPrograms}
          categories={soloProgramCategories}
          ownedIds={(soloPurchases || []).map((p) => p.programId)}
          onOpenProgram={(id) => navigate(`/solo/program/${id}`)}
          onCatalogue={() => navigate("/solo/home", { state: { soloTab: "catalogue" } })}
          onProfile={leave}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      {header("Consultation", "Tap an answer to change it.", () => (dirty ? setConfirmLeave(true) : leave()))}

      <div className="w-full max-w-md mx-auto px-3 pb-36">
        {SECTIONS.map((section) => {
          const questions = visible.filter((q) => q.section === section.id);
          if (questions.length === 0) return null;
          return (
            <section key={section.id} className="mt-5">
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2" style={{ color: t.textFaint }}>
                {section.label}
              </p>
              <SoloGlassBox t={t} className="rounded-2xl">
                {questions.map((q, i) => {
                  const missing = q.required && !isAnswered(q, answers);
                  const changed = q.id in draft && JSON.stringify(draft[q.id]) !== JSON.stringify(savedAnswers[q.id]);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setEditingId(q.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug" style={{ color: t.textMuted }}>
                          {q.type === "consent" ? "Health information consent" : q.label}
                        </p>
                        <p className="text-sm font-semibold mt-0.5 break-words" style={{ color: missing ? accent : t.text }}>
                          {missing ? "Needs an answer" : formatAnswer(q, answers[q.id])}
                        </p>
                      </div>
                      {changed && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MEASURE_BLUE }} aria-label="Changed" />}
                      <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                    </button>
                  );
                })}
              </SoloGlassBox>
            </section>
          );
        })}
      </div>

      {dirty && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 backdrop-blur-xl"
          style={{ backgroundColor: t.navBg, borderTop: `1px solid ${t.navBorder}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom,0px))" }}
        >
          <div className="w-full max-w-md mx-auto px-3 pt-3">
            {(!complete || saveError) && (
              <p className="text-xs mb-2 text-center" style={{ color: saveError ? "#EF4444" : t.textMuted }}>
                {saveError || "Answer the questions marked “Needs an answer” to save."}
              </p>
            )}
            <div className="flex gap-2">
              <SecondaryButton dark={dark} className="flex-1" type="button" onClick={() => setDraft({})} disabled={saving}>
                Discard
              </SecondaryButton>
              <PrimaryButton dark={dark} className="flex-[2]" type="button" onClick={save} disabled={!complete || saving}>
                {saving ? "Saving…" : "Save changes"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <EditAnswerSheet
        question={editing}
        value={editing ? answers[editing.id] : undefined}
        onClose={() => setEditingId(null)}
        onDone={(value) => {
          setDraft((d) => ({ ...d, [editing.id]: value }));
          setEditingId(null);
        }}
        t={t}
        dark={dark}
      />

      <BottomSheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Discard changes?" dark={dark}>
        <div style={{ color: t.text }}>
          <p className="text-sm mb-5" style={{ color: t.textMuted }}>
            You've changed some answers but haven't saved them.
          </p>
          <PrimaryButton dark={dark} className="w-full mb-2" type="button" onClick={() => setConfirmLeave(false)}>
            Keep editing
          </PrimaryButton>
          <SecondaryButton dark={dark} className="w-full" type="button" onClick={leave}>
            Discard and leave
          </SecondaryButton>
        </div>
      </BottomSheet>
    </div>
  );
}

function formatAnswer(question, value) {
  if (question.type === "consent") return value === true ? "Given" : "Not given";
  if (question.type === "select") return question.options.find((o) => o.value === value)?.label || "—";
  if (question.type === "multiselect") {
    const labels = (Array.isArray(value) ? value : []).map((v) => question.options.find((o) => o.value === v)?.label).filter(Boolean);
    return labels.length ? labels.join(", ") : "—";
  }
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

// One question in a glass pop-up. Holds its own value until Done, so
// backing out of the pop-up leaves the answer as it was.
function EditAnswerSheet({ question, value, onClose, onDone, t, dark }) {
  const [local, setLocal] = useState(value);
  const [forId, setForId] = useState(null);
  if (question && question.id !== forId) {
    setForId(question.id);
    setLocal(value);
  }
  const ok = !question || !question.required || isAnswered(question, { [question.id]: local });
  const textLike = question && (question.type === "text" || question.type === "number");

  return (
    <BottomSheet open={!!question} onClose={onClose} title="Edit answer" dark={dark} keyboardSafeScroll={textLike}>
      {question && (
        <div style={{ color: t.text }}>
          <p className="text-base font-bold leading-snug mb-1.5">{question.type === "consent" ? "Health information consent" : question.label}</p>
          {question.helper && (
            <p className="text-xs leading-relaxed mb-4" style={{ color: t.textMuted }}>
              {question.helper}
            </p>
          )}
          {!question.helper && <div className="mb-4" />}
          <AnswerInput question={question} value={local} onChange={setLocal} t={t} dark={dark} />
          <PrimaryButton dark={dark} className="w-full mt-5" type="button" disabled={!ok} onClick={() => onDone(local)}>
            Done
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function AnswerInput({ question, value, onChange, t, dark }) {
  const option = (selected) =>
    selected
      ? { backgroundColor: MEASURE_BLUE_SOFT, border: `1px solid ${MEASURE_BLUE}`, color: t.text }
      : { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, color: t.text };
  const inputStyle = { backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: dark ? "dark" : "light" };

  if (question.type === "select" || question.type === "multiselect") {
    const multi = question.type === "multiselect";
    const selected = multi ? (Array.isArray(value) ? value : []) : [value];
    return (
      <div className="space-y-2">
        {question.options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(multi ? (on ? selected.filter((x) => x !== opt.value) : [...selected, opt.value]) : opt.value)}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm"
              style={option(on)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (question.type === "consent") {
    return (
      <div>
        <p className="text-sm leading-relaxed mb-4" style={{ color: t.textMuted }}>
          The safety questions ask about injuries, pain and medical conditions — sensitive health information. It's only used to flag when
          outside medical guidance is worth getting before training, and only you can read or write it.
        </p>
        <label className="flex items-start gap-2.5 text-sm leading-relaxed">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 shrink-0" />
          <span>
            I consent to providing this health information, as described in the{" "}
            <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>
    );
  }
  if (question.type === "number") {
    return (
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl px-4 py-3 text-base"
        style={inputStyle}
        autoFocus
      />
    );
  }
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type as much or as little as you like…"
      rows={3}
      className="w-full rounded-2xl px-4 py-3 text-base resize-none"
      style={inputStyle}
      autoFocus
    />
  );
}

function SavedConfirmation({ answers, t, dark, accent, programs, categories, ownedIds, onOpenProgram, onCatalogue, onProfile }) {
  const recommended = recommendPrograms(programs, categories, answers, { limit: 2, excludeIds: ownedIds });
  const flagged = isFlaggedForMedicalReview(answers);
  return (
    <div className="w-full max-w-md mx-auto px-3 pb-10">
      <div className="pt-6 pb-7 text-center">
        <CheckCircle2 size={40} color={MEASURE_BLUE} className="mx-auto mb-3" />
        <h2 className="text-2xl font-extrabold">Answers updated</h2>
        <p className="text-sm mt-1.5" style={{ color: t.textMuted }}>
          Your consultation is saved and your recommendations have been refreshed.
        </p>
      </div>

      {flagged && (
        <div className="rounded-2xl px-4 py-3 mb-5 flex gap-2.5" style={soloGlass(t)}>
          <AlertTriangle size={16} color={accent} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: t.textMuted }}>
            Based on your safety answers, it's worth checking in with a doctor or allied health professional before starting a new program.
            This isn't a diagnosis or medical clearance — just a standard first-pass safety flag.
          </p>
        </div>
      )}

      {recommended.length > 0 && (
        <section className="mb-7">
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
            From your consultation
          </p>
          <h3 className="text-lg font-bold mt-1 mb-3">Recommended for you</h3>
          <div className="space-y-2.5">
            {recommended.map((p) => {
              const weeks = p.weekOnePreview?.totalWeeks || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onOpenProgram(p.id)}
                  className="w-full flex items-center gap-3.5 rounded-2xl p-2.5 pr-4 text-left"
                  style={soloGlass(t)}
                >
                  <SoloArtwork program={p} t={t} className="w-16 h-16 rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                      {p.level}
                      {weeks > 0 ? ` · ${weeks} weeks` : ""}
                    </p>
                  </div>
                  <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <PrimaryButton dark={dark} className="w-full mb-2" type="button" onClick={onCatalogue}>
        Go to Catalogue
      </PrimaryButton>
      <SecondaryButton dark={dark} className="w-full" type="button" onClick={onProfile}>
        Back to Profile
      </SecondaryButton>
    </div>
  );
}
