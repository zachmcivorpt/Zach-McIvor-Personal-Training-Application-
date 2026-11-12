// Coach video feedback (#219): the written coaching overview editor, with a
// live preview of exactly what the client will read. Used in the recording
// workspace and for editing a published overview.
import { useEffect, useRef } from "react";
import { Plus, Minus } from "lucide-react";
import { MEASURE_BLUE } from "../../theme";
import { SUMMARY_SECTIONS, MAX_PRIORITIES, summaryReady } from "../../lib/videoFeedback/timeline";
import VideoFeedbackSummary from "../../components/VideoFeedbackSummary";
import { CARD_GLASS } from "./WeeklyScorecard";

function AutoTextArea({ value, onChange, placeholder, label, minRows = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent text-white text-[15px] leading-relaxed placeholder-white/30 outline-none resize-none"
    />
  );
}

export default function SummaryEditor({ summary, onChange, clientName, showPreview = true, context = null }) {
  const set = (key, v) => onChange({ ...summary, [key]: v });
  const priorities = summary.priorities?.length ? summary.priorities : [""];
  return (
    <div className={showPreview ? "grid gap-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : ""} data-testid="summary-editor">
      <div className={showPreview ? "rounded-[22px] min-w-0" : ""} style={showPreview ? { ...CARD_GLASS, padding: 20 } : undefined}>
        <p className="text-white/45 text-xs mb-5">Write freely — only the overall note is required. Empty sections don't show.</p>
        {SUMMARY_SECTIONS.map(({ key, label, placeholder }, i) => (
          <div key={key} className={`py-4 ${i ? "border-t border-white/[0.08]" : ""}`}>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50 mb-1.5">
              {label}
              {key === "overall" && <span style={{ color: MEASURE_BLUE }}> · required</span>}
            </p>
            <AutoTextArea label={label} value={summary[key] || ""} onChange={(v) => set(key, v)} placeholder={placeholder} minRows={key === "overall" ? 3 : 2} />
          </div>
        ))}
        <div className="py-4 border-t border-white/[0.08]">
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50 mb-2">Priorities for the coming week</p>
          {priorities.map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <span className="text-xl font-semibold tabular-nums w-8 shrink-0" style={{ color: MEASURE_BLUE }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <input
                aria-label={`Priority ${i + 1}`}
                value={p}
                onChange={(e) => {
                  const next = priorities.slice();
                  next[i] = e.target.value;
                  set("priorities", next);
                }}
                placeholder={i === 0 ? "e.g. Hit 160 g protein every day" : "Another priority (optional)"}
                className="flex-1 bg-transparent text-white text-[15px] placeholder-white/30 outline-none border-b border-white/10 focus:border-white/30 py-1.5"
              />
              {priorities.length > 1 && (
                <button type="button" onClick={() => set("priorities", priorities.filter((_, j) => j !== i))} className="w-8 h-8 text-white/40" aria-label={`Remove priority ${i + 1}`}>
                  <Minus size={15} />
                </button>
              )}
            </div>
          ))}
          {priorities.length < MAX_PRIORITIES && (
            <button type="button" onClick={() => set("priorities", [...priorities, ""])} className="mt-2 flex items-center gap-1.5 text-white/70 text-xs font-semibold">
              <Plus size={14} /> Add priority
            </button>
          )}
        </div>
        {context && <div className="mt-2 space-y-2.5">{context}</div>}
      </div>
      {showPreview && (
        <div className="rounded-[22px] min-w-0 md:sticky md:top-0 self-start" style={{ ...CARD_GLASS, padding: 20 }} data-testid="summary-preview">
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50 mb-4">What {clientName?.split(" ")[0] || "your client"} will read</p>
          {summaryReady(summary) ? <VideoFeedbackSummary summary={summary} onDarkStage /> : <p className="text-white/40 text-sm">Start with the overall note — the preview fills in as you write.</p>}
        </div>
      )}
    </div>
  );
}

