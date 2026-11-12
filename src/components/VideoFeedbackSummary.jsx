// Coach video feedback (#219): the written coaching overview under the
// video. Shared by the client's feedback page and the coach's preview, so
// the coach previews exactly what the client reads. Open sections on the
// page under thin rules (no cards); the week's priorities as large numbered
// figures.
import { MEASURE_BLUE } from "../theme";
import { SUMMARY_SECTIONS, cleanSummary } from "../lib/videoFeedback/timeline";

export default function VideoFeedbackSummary({ summary, dark = false, onDarkStage = false }) {
  const s = cleanSummary(summary);
  const text = onDarkStage || dark ? "text-white" : "text-[#0A0A0B]";
  const muted = onDarkStage || dark ? "text-white/45" : "text-black/40";
  const body = onDarkStage || dark ? "text-white/80" : "text-black/75";
  const rule = onDarkStage || dark ? "border-white/10" : "border-black/[0.08]";
  const sections = SUMMARY_SECTIONS.filter(({ key }) => s[key]);

  return (
    <div data-testid="video-feedback-summary">
      {s.priorities.length > 0 && (
        <section className="pb-6">
          <p className={`text-[11px] font-bold tracking-[0.14em] uppercase ${muted}`}>This week's priorities</p>
          <ol className="mt-3">
            {s.priorities.map((p, i) => (
              <li key={i} className={`flex items-baseline gap-4 py-3 ${i > 0 ? `border-t ${rule}` : ""}`}>
                <span className="text-[30px] leading-none font-semibold tabular-nums shrink-0 w-10" style={{ color: MEASURE_BLUE }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`text-[15px] leading-snug font-medium ${text}`}>{p}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {sections.map(({ key, label }, i) => (
        <section key={key} className={`py-5 border-t ${rule} ${i === sections.length - 1 ? "pb-2" : ""}`}>
          <p className={`text-[11px] font-bold tracking-[0.14em] uppercase ${muted}`}>{label}</p>
          <p className={`mt-2 text-[15px] leading-relaxed whitespace-pre-line ${body}`}>{s[key]}</p>
        </section>
      ))}
    </div>
  );
}
