// Coach video feedback (#219), client side: the coach's weekly video and
// written overview inside the client's own Check-ins. Loaded only when the
// Check-ins tab opens (React.lazy in ClientApp), never on the launch path.
//
// The newest feedback leads as a large film thumbnail; earlier ones follow
// as open rows. Opening one shows a full page: the film on a black stage
// (the one dark surround), the written overview underneath on the client's
// own page colour.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Play, Check } from "lucide-react";
import { useApp } from "../lib/AppContext";
import { MEASURE_BLUE, CLIENT_DARK_BG } from "../theme";
import { formatClock } from "../lib/videoFeedback/timeline";
import { checkinChanges, headlineChanges } from "../lib/videoFeedback/checkinChanges";
import CinematicVideoPlayer from "../components/CinematicVideoPlayer";
import VideoFeedbackSummary from "../components/VideoFeedbackSummary";

const EMPTY_LIST = [];
const fmtLong = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function FilmThumb({ f, large = false, dark }) {
  const aspect = f.width > 0 && f.height > 0 ? f.width / f.height : 16 / 9;
  return (
    <span
      className={`relative block overflow-hidden bg-black ${large ? "rounded-[20px]" : "rounded-lg"}`}
      style={large ? { aspectRatio: `${Math.max(aspect, 4 / 5)}`, boxShadow: dark ? "0 0 0 1px rgba(255,255,255,0.08)" : "0 24px 60px -28px rgba(0,0,0,0.55)" } : { width: 72, height: 46 }}
    >
      {f.posterUrl && <img src={f.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
      <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)" }} />
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={`${large ? "w-16 h-16" : "w-6 h-6"} rounded-full flex items-center justify-center text-white`}
          style={{ background: "rgba(20,20,22,0.42)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        >
          <Play size={large ? 24 : 10} fill="currentColor" className="ml-[2px]" />
        </span>
      </span>
      {large && (
        <span className="absolute bottom-3 right-3 text-white text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full" style={{ background: "rgba(20,20,22,0.42)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          {formatClock(f.duration)}
        </span>
      )}
    </span>
  );
}

const GLASS_DARK = {
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.11)",
  backdropFilter: "blur(26px) saturate(140%)",
  WebkitBackdropFilter: "blur(26px) saturate(140%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px -30px rgba(0,0,0,0.8)",
};
const GLASS_LIGHT = {
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(255,255,255,0.85)",
  backdropFilter: "blur(26px) saturate(160%)",
  WebkitBackdropFilter: "blur(26px) saturate(160%)",
  boxShadow: "0 20px 50px -30px rgba(0,0,0,0.35)",
};
const VERDICT = { worse: "WORSE", better: "BETTER" };

// #220: glass on the APEX gym photo (softly blurred) in the client's own
// light/dark choice; the film full width, then the check-in it answers and
// the written overview.
export function FeedbackFilmPage({ feedback: f, coachName, dark, onClose, onFirstPlay, checkinHeadline = [] }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, []);
  const text = dark ? "text-white" : "text-black";
  const muted = dark ? "text-white/50" : "text-black/45";
  const glass = dark ? GLASS_DARK : GLASS_LIGHT;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{ backgroundColor: dark ? CLIENT_DARK_BG : "#EEF0F4", opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(12px)", transition: "opacity 0.28s ease, transform 0.32s cubic-bezier(.2,.8,.2,1)" }}
      data-testid="feedback-film-page"
      role="dialog"
      aria-label="Weekly feedback"
    >
      <img
        src="/brand/gym-dark.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover"
        style={{ filter: dark ? "blur(30px) brightness(0.55)" : "blur(40px) brightness(1.6) grayscale(1)", transform: "scale(1.15)", opacity: dark ? 0.9 : 0.55 }}
      />
      <div className="relative shrink-0 flex items-center gap-2 px-2 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} aria-label="Back" className={`w-10 h-10 rounded-full flex items-center justify-center ${text}`} style={glass}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className={`font-semibold text-[17px] ${text}`}>Weekly feedback</p>
        </div>
        <span className="w-10" />
      </div>
      <div className="relative flex-1 overflow-y-auto overscroll-contain px-2 pb-16 space-y-2" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="pt-1">
          <CinematicVideoPlayer
            src={f.videoUrl}
            poster={f.posterUrl}
            width={f.width}
            height={f.height}
            duration={f.duration}
            resumeKey={`apexFeedbackPos_${f.id}_${f.version || ""}`}
            onFirstPlay={onFirstPlay}
            maxHeight="68vh"
          />
          <div className="flex items-center justify-between px-2 mt-2.5">
            <p className={`text-xs ${muted}`}>{coachName ? `From ${coachName}` : "From your coach"}</p>
            <p className={`text-xs tabular-nums ${muted}`}>{formatClock(f.duration)}</p>
          </div>
        </div>
        {checkinHeadline.length > 0 && (
          <div className="rounded-[22px] p-4" style={glass} data-testid="client-checkin-changes">
            <div className="flex items-center justify-between">
              <p className={`text-[10px] font-bold tracking-[0.16em] uppercase ${muted}`}>Answers your check-in</p>
              {f.checkInDate && <span className={`text-[11px] ${muted}`}>{fmtShort(f.checkInDate)}</span>}
            </div>
            <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${checkinHeadline.length}, minmax(0,1fr))` }}>
              {checkinHeadline.map((c) => (
                <div key={c.id} className="rounded-2xl p-3 text-center min-w-0" style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.5)", border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.06)" }}>
                  <p className={`text-[20px] font-semibold tabular-nums ${text}`}>
                    {c.prev}
                    <span className={`mx-1 text-[14px] ${muted}`}>→</span>
                    {c.now}
                  </p>
                  <p className={`text-[11px] truncate ${muted}`}>{c.label}</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: c.verdict === "better" ? MEASURE_BLUE : dark ? "#fff" : "#0A0A0B" }}>
                    {VERDICT[c.verdict]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-[22px] px-5 pt-5 pb-3" style={glass}>
          <p className={`text-[11px] font-bold tracking-[0.14em] uppercase ${muted}`}>{f.checkInDate ? "Your check-in" : "Published"}</p>
          <p className={`text-[22px] font-semibold mt-1 mb-5 ${text}`}>{fmtLong(f.checkInDate || f.publishedAt)}</p>
          <VideoFeedbackSummary summary={f.summary} dark={dark} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ClientVideoFeedback({ userId, dark = false, autoOpenId = null, onAutoOpened }) {
  const { db, markVideoFeedbackViewed } = useApp();
  const feedback = db.videoFeedback?.[userId] || EMPTY_LIST;
  const coachName = db.coachProfile?.name || "";
  const [openId, setOpenId] = useState(null);

  // Opened from Home / the notification list.
  useEffect(() => {
    if (!autoOpenId) return;
    if (feedback.some((f) => f.id === autoOpenId)) {
      setOpenId(autoOpenId);
      onAutoOpened?.();
    }
  }, [autoOpenId, feedback, onAutoOpened]);

  const open = feedback.find((f) => f.id === openId) || null;
  // The check-in this video answers, against the one before it (#220).
  function headlineFor(f) {
    if (!f?.checkInId) return [];
    const responses = db.formResponses?.[userId] || EMPTY_LIST;
    const response = responses.find((r) => r.id === f.checkInId);
    const form = response ? (db.forms || []).find((x) => x.id === response.formId) : null;
    return headlineChanges(checkinChanges(form, response, responses));
  }

  function openFilm(f) {
    setOpenId(f.id);
    if (!f.viewedAt) markVideoFeedbackViewed(f.id);
  }

  if (feedback.length === 0) return null;
  const [latest, ...earlier] = feedback;
  const muted = dark ? "text-white/40" : "text-black/40";
  const text = dark ? "text-white" : "text-black";
  const firstPriority = latest.summary?.priorities?.[0];

  return (
    <div className="px-2.5" data-testid="client-video-feedback">
      <p className={`text-xs tracking-wide font-semibold mb-2.5 ${muted}`}>COACH FEEDBACK</p>
      <button type="button" onClick={() => openFilm(latest)} className="block w-full text-left active:scale-[0.995] transition-transform" data-testid="latest-feedback">
        <FilmThumb f={latest} large dark={dark} />
        <span className="flex items-start justify-between gap-3 mt-3 px-0.5">
          <span className="min-w-0">
            <span className={`block text-[17px] font-semibold ${text}`}>
              {latest.checkInDate ? `Your check-in · ${fmtShort(latest.checkInDate)}` : `Weekly feedback · ${fmtShort(latest.publishedAt)}`}
            </span>
            {firstPriority && <span className={`block text-sm mt-0.5 truncate ${dark ? "text-white/60" : "text-black/55"}`}>01 · {firstPriority}</span>}
          </span>
          {!latest.viewedAt && (
            <span className="shrink-0 mt-0.5 text-[10px] font-bold tracking-[0.1em] text-white px-2 py-1 rounded-full" style={{ backgroundColor: MEASURE_BLUE }}>
              NEW
            </span>
          )}
        </span>
      </button>

      {earlier.length > 0 && (
        <div className="mt-6">
          <p className={`text-xs tracking-wide font-semibold mb-1 ${muted}`}>EARLIER FEEDBACK</p>
          <div className={`divide-y ${dark ? "divide-white/[0.07]" : "divide-black/[0.07]"}`}>
            {earlier.map((f) => (
              <button key={f.id} type="button" onClick={() => openFilm(f)} className="w-full flex items-center gap-3 py-3 text-left">
                <FilmThumb f={f} dark={dark} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${text}`}>{fmtShort(f.checkInDate || f.publishedAt)}</span>
                  <span className={`block text-xs truncate ${muted}`}>{f.summary?.priorities?.[0] || f.summary?.overall || ""}</span>
                </span>
                <span className={`text-xs tabular-nums shrink-0 ${muted}`}>{formatClock(f.duration)}</span>
                {f.viewedAt ? <Check size={14} className={muted} /> : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MEASURE_BLUE }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <FeedbackFilmPage
          feedback={open}
          coachName={coachName}
          dark={dark}
          checkinHeadline={headlineFor(open)}
          onClose={() => setOpenId(null)}
          onFirstPlay={() => !open.viewedAt && markVideoFeedbackViewed(open.id)}
        />
      )}
    </div>
  );
}
