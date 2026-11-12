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
import { MEASURE_BLUE, BG, CLIENT_DARK_BG, BORDER, CLIENT_DARK_BORDER } from "../theme";
import { formatClock } from "../lib/videoFeedback/timeline";
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

export function FeedbackFilmPage({ feedback: f, coachName, dark, onClose, onFirstPlay }) {
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
  const muted = dark ? "text-white/45" : "text-black/45";
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: dark ? CLIENT_DARK_BG : BG, opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(12px)", transition: "opacity 0.28s ease, transform 0.32s cubic-bezier(.2,.8,.2,1)" }}
      data-testid="feedback-film-page"
      role="dialog"
      aria-label="Weekly feedback"
    >
      <div className="shrink-0 flex items-center gap-2 px-2 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 border-b" style={{ borderColor: dark ? CLIENT_DARK_BORDER : BORDER }}>
        <button type="button" onClick={onClose} aria-label="Back" className={`w-10 h-10 rounded-full flex items-center justify-center ${text}`}>
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className={`font-semibold text-[17px] ${text}`}>Weekly feedback</p>
        </div>
        <span className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* The film, on its own black stage. */}
        <div className="bg-black px-3 pt-4 pb-5">
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
          <div className="flex items-center justify-between px-1 mt-3">
            <p className="text-white/55 text-xs">{coachName ? `From ${coachName}` : "From your coach"}</p>
            <p className="text-white/55 text-xs tabular-nums">{formatClock(f.duration)}</p>
          </div>
        </div>
        <div className="px-5 pt-6 pb-16 max-w-2xl mx-auto">
          <p className={`text-[11px] font-bold tracking-[0.14em] uppercase ${muted}`}>{f.checkInDate ? "Your check-in" : "Published"}</p>
          <p className={`text-[22px] font-semibold mt-1 mb-6 ${text}`}>{fmtLong(f.checkInDate || f.publishedAt)}</p>
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

      {open && <FeedbackFilmPage feedback={open} coachName={coachName} dark={dark} onClose={() => setOpenId(null)} onFirstPlay={() => !open.viewedAt && markVideoFeedbackViewed(open.id)} />}
    </div>
  );
}
