import React, { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useSoloApp } from "../../lib/SoloAppContext";
import { Logo } from "../../components/ui";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../../theme";
import { SoloBackgroundFrame as Frame } from "../SoloBackground";
import {
  SECTIONS,
  getVisibleQuestions,
  isAnswered,
  firstUnansweredIndex,
  isComplete,
  isFlaggedForMedicalReview,
} from "./questionnaireConfig";

// One question centred on screen at a time, over the background above —
// a single translucent "glass" panel per question, built from the exact
// bg-white/10 + backdrop-blur-sm + border-white/10 combination
// LoginScreen's own role-toggle pill already uses. The one accent colour
// is MEASURE_BLUE (src/theme.js), per the no-new-colours rule — used only
// for the progress bar and the selected-answer state.
function GlassPanel({ children }) {
  return (
    <div
      className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl px-6 py-8 shadow-[0_0_60px_-15px_rgba(0,0,0,0.6)]"
      style={{ animation: "solo-q-in 320ms ease-out" }}
    >
      {children}
    </div>
  );
}

// Health-screening questions (the consent step and every APSS/injury/pain
// question in the "safety" section) get a SOLID panel instead — glass
// over a photo background reads fine for a goals/preferences question,
// but this is exactly the content that most needs to stay unambiguous and
// easy to read regardless of what's behind it, per the agreed "solid
// surfaces for workout-related data and health screening" rule.
function SolidPanel({ children }) {
  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#141414] px-6 py-8 shadow-[0_0_60px_-15px_rgba(0,0,0,0.6)]" style={{ animation: "solo-q-in 320ms ease-out" }}>
      {children}
    </div>
  );
}

function OptionButton({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 rounded-2xl border transition-colors"
      style={
        selected
          ? { backgroundColor: MEASURE_BLUE_SOFT, borderColor: MEASURE_BLUE, color: "#fff" }
          : { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }
      }
    >
      {children}
    </button>
  );
}

function QuestionBody({ question, value, onChange }) {
  if (question.type === "select") {
    return (
      <div className="space-y-2">
        {question.options.map((opt) => (
          <OptionButton key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </OptionButton>
        ))}
      </div>
    );
  }
  if (question.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    function toggle(v) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    }
    return (
      <div className="space-y-2">
        {question.options.map((opt) => (
          <OptionButton key={opt.value} selected={selected.includes(opt.value)} onClick={() => toggle(opt.value)}>
            {opt.label}
          </OptionButton>
        ))}
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
        placeholder="e.g. 28"
        className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3.5 text-white text-lg placeholder:text-white/30 focus:outline-none focus:border-white/40"
        autoFocus
      />
    );
  }
  // text
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type as much or as little as you like…"
      rows={3}
      className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 resize-none"
      autoFocus
    />
  );
}

export default function SoloOnboarding() {
  const { soloAuthUser, soloCurrentUser, saveOnboardingAnswer, recordHealthConsent, soloAppDesign } = useSoloApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get("review") === "1";

  const savedAnswers = soloCurrentUser?.onboarding?.answers || {};
  // Local draft layered over the last-saved answers — lets typing in a
  // text field feel instant without a round-trip to Firestore on every
  // keystroke, while every Next/option click still persists immediately
  // (the "save continuously" requirement), and a page reload resumes from
  // whatever was last actually saved either way.
  const [draft, setDraft] = useState({});
  const answers = useMemo(() => ({ ...savedAnswers, ...draft }), [savedAnswers, draft]);

  const wasCompleteOnMount = useRef(!!soloCurrentUser?.onboarding?.completed);
  const [index, setIndex] = useState(() => (isReview ? 0 : firstUnansweredIndex(savedAnswers)));
  const [showMedicalNotice, setShowMedicalNotice] = useState(false);

  const visible = getVisibleQuestions(answers);
  const clampedIndex = Math.min(index, visible.length - 1);
  const question = visible[clampedIndex];
  const sectionLabel = SECTIONS.find((s) => s.id === question.section)?.label || "";
  const canGoBack = clampedIndex > 0;
  const answered = isAnswered(question, answers);

  async function persist(questionId, value) {
    setDraft((d) => ({ ...d, [questionId]: value }));
    if (soloAuthUser) {
      try {
        await saveOnboardingAnswer(soloAuthUser.uid, { ...savedAnswers, ...draft, [questionId]: value }, questionId, value);
      } catch {
        // Best-effort — the local draft above already reflects the answer
        // so the user isn't blocked; the next successful save (including
        // the one triggered by the next question) carries it through.
      }
    }
  }

  async function goNext() {
    const nextAnswers = answers;
    const nextVisible = getVisibleQuestions(nextAnswers);
    const nextIndex = clampedIndex + 1;
    if (nextIndex >= nextVisible.length) {
      if (isComplete(nextAnswers) && isFlaggedForMedicalReview(nextAnswers) && !wasCompleteOnMount.current) {
        setShowMedicalNotice(true);
        return;
      }
      // Every answer-selection fires its own save in the background (see
      // persist() below) without being awaited, so tapping Finish right
      // after picking the last answer — the normal, fast way to actually
      // finish this — could reach here before that save had even been
      // sent, let alone landed. RequireOnboardingComplete (SoloRoutes.jsx)
      // reads `completed` from the live Firestore-backed soloCurrentUser,
      // not from this component's own local state, so navigating away
      // before the completing write is confirmed meant it almost always
      // still saw `completed: false` on arrival and bounced straight back
      // to the questionnaire — reproducing from firstUnansweredIndex()
      // against whatever had (or hadn't) been saved yet. Awaiting the
      // save here, with the same already-computed full answer set, before
      // navigating closes that race.
      if (soloAuthUser) {
        try {
          await saveOnboardingAnswer(soloAuthUser.uid, nextAnswers, question.id, nextAnswers[question.id]);
        } catch {
          // Best-effort, same as persist() below — proceed regardless;
          // this is no worse than the previous unawaited save.
        }
      }
      navigate("/solo/home", { replace: true });
      return;
    }
    setIndex(nextIndex);
  }

  function goBack() {
    if (canGoBack) setIndex(clampedIndex - 1);
  }

  if (showMedicalNotice) {
    return (
      <Frame appDesign={soloAppDesign} className="flex flex-col items-center justify-center px-6 py-8">
        <SolidPanel>
          <AlertTriangle size={28} color={MEASURE_BLUE} className="mb-4" />
          <h1 className="text-white text-lg font-bold mb-3">Before you start training</h1>
          <p className="text-white/70 text-sm leading-relaxed mb-3">
            Based on your answers to the exercise-safety questions, we'd recommend checking in with a doctor or an allied health
            professional before you begin — just to make sure it's safe for you to exercise right now.
          </p>
          <p className="text-white/50 text-xs leading-relaxed mb-6">
            This isn't a diagnosis and this questionnaire doesn't provide medical clearance — it's a standard first-pass safety check
            (Stage 1 of the Australian Adult Pre-Exercise Screening System). We're not holding back anything else because of it; it's
            just worth getting that guidance first.
          </p>
          <button
            type="button"
            onClick={() => navigate("/solo/home", { replace: true })}
            className="w-full bg-white text-black font-bold py-3.5 rounded-full text-center"
          >
            Got it, continue
          </button>
        </SolidPanel>
      </Frame>
    );
  }

  if (question.type === "consent") {
    const consented = answers.healthConsent === true;
    return (
      <Frame appDesign={soloAppDesign}>
        <OnboardingHeader canGoBack={canGoBack} onBack={goBack} index={clampedIndex} total={visible.length} sectionLabel={sectionLabel} />
        <div className="flex-1 flex items-center justify-center">
          <SolidPanel>
            <h1 className="text-white text-lg font-bold mb-3">{question.label}</h1>
            <p className="text-white/70 text-sm leading-relaxed mb-4">
              The next few questions ask about injuries, pain and medical conditions — information Australian privacy law treats as
              sensitive health information. We only use it to flag when outside medical guidance is worth getting before training, and
              it's protected the same way as the rest of your account (only you can read or write it).
            </p>
            <label className="flex items-start gap-2.5 text-white/80 text-sm leading-relaxed mb-6">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => {
                  const v = e.target.checked;
                  persist("healthConsent", v);
                  if (v && soloAuthUser) recordHealthConsent(soloAuthUser.uid);
                }}
                className="mt-0.5 shrink-0 accent-white"
              />
              <span>
                I consent to providing this health information, as described in the{" "}
                <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <button
              type="button"
              onClick={goNext}
              disabled={!consented}
              className="w-full bg-white text-black font-bold py-3.5 rounded-full text-center disabled:opacity-30"
            >
              Continue
            </button>
          </SolidPanel>
        </div>
      </Frame>
    );
  }

  // Health-screening questions (APSS + injury/pain/healthcare-restriction)
  // get the same solid panel as the consent step above; everything else
  // keeps the glass panel.
  const Panel = question.section === "safety" ? SolidPanel : GlassPanel;

  return (
    <Frame appDesign={soloAppDesign}>
      <OnboardingHeader canGoBack={canGoBack} onBack={goBack} index={clampedIndex} total={visible.length} sectionLabel={sectionLabel} />
      <div className="flex-1 flex items-center justify-center">
        <Panel>
          <h1 className="text-white text-lg font-bold mb-1.5 leading-snug">{question.label}</h1>
          {question.helper && <p className="text-white/50 text-xs leading-relaxed mb-5">{question.helper}</p>}
          {!question.helper && <div className="mb-5" />}
          <QuestionBody question={question} value={answers[question.id]} onChange={(v) => persist(question.id, v)} />
          <div className="flex items-center gap-3 mt-6">
            {!question.required && (
              <button type="button" onClick={goNext} className="text-white/40 text-sm font-medium">
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={question.required && !answered}
              className="flex-1 bg-white text-black font-bold py-3.5 rounded-full text-center disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              {clampedIndex === visible.length - 1 ? "Finish" : "Next"} <ChevronRight size={16} />
            </button>
          </div>
        </Panel>
      </div>
      <style>{`@keyframes solo-q-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </Frame>
  );
}

function OnboardingHeader({ canGoBack, onBack, index, total, sectionLabel }) {
  const navigate = useNavigate();
  const pct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100;
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-4">
        {canGoBack ? (
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-white/50 text-sm font-medium">
            <ChevronLeft size={16} /> Back
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/solo/home")}
            className="flex items-center gap-1 text-white/50 text-sm font-medium"
          >
            <ChevronLeft size={16} /> Home
          </button>
        )}
        <Logo variant="mark" tone="white" className="h-6 w-auto opacity-60" />
      </div>
      <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">{sectionLabel}</p>
      <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: MEASURE_BLUE }} />
      </div>
    </div>
  );
}
