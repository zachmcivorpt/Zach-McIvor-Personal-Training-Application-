// Coach video feedback (#219): the film player the client watches their
// weekly feedback in, and the coach previews it in (so the coach sees
// exactly what the client will).
//
// A black stage sized to the video's own shape (portrait or landscape,
// never cropped), the coach's thumbnail with one glass play button, and
// minimal glass controls that fade out while it plays: play/pause, seek,
// time, speed, volume and full screen. Position is remembered per video on
// this device (`resumeKey`). Plays inline on iPhone; full screen uses the
// native player there.
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Loader2, RotateCcw } from "lucide-react";
import { formatClock } from "../lib/videoFeedback/timeline";

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2, 0.75];

const GLASS_CONTROL = {
  background: "rgba(20,20,22,0.42)",
  border: "1px solid rgba(255,255,255,0.14)",
  backdropFilter: "blur(20px) saturate(140%)",
  WebkitBackdropFilter: "blur(20px) saturate(140%)",
};

function readPosition(key) {
  if (!key) return 0;
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function writePosition(key, seconds) {
  if (!key) return;
  try {
    if (seconds > 0) localStorage.setItem(key, String(Math.floor(seconds)));
    else localStorage.removeItem(key);
  } catch {}
}

export default function CinematicVideoPlayer({ src, poster, width, height, duration: knownDuration, resumeKey, onFirstPlay, maxHeight = "72vh", className = "", rounded = true }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const hideTimer = useRef(null);
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration || 0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [controlsShown, setControlsShown] = useState(true);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");

  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
  const portrait = aspect < 1;

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsShown(false);
    }, 2600);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // A new video (e.g. the coach previews a fresh render) starts over.
  useEffect(() => {
    startedRef.current = false;
    setStarted(false);
    setPlaying(false);
    setEnded(false);
    setError("");
    setTime(0);
  }, [src]);

  function revealControls() {
    setControlsShown(true);
    scheduleHide();
  }

  async function play() {
    const v = videoRef.current;
    if (!v) return;
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
      const saved = readPosition(resumeKey);
      if (saved > 3 && (!v.duration || saved < v.duration - 5)) {
        try {
          v.currentTime = saved;
        } catch {}
      }
      onFirstPlay?.();
    }
    if (ended) {
      v.currentTime = 0;
      setEnded(false);
    }
    try {
      await v.play();
    } catch {
      setError("This video couldn't start. Tap to try again.");
    }
    scheduleHide();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) play();
    else {
      v.pause();
      revealControls();
    }
  }

  function seekTo(t) {
    const v = videoRef.current;
    if (!v || !Number.isFinite(t)) return;
    v.currentTime = Math.max(0, Math.min(t, (v.duration || duration) - 0.05));
    setTime(v.currentTime);
    setEnded(false);
  }

  function cycleSpeed() {
    const next = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    revealControls();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    revealControls();
  }

  function fullscreen() {
    const v = videoRef.current;
    const stage = stageRef.current;
    if (!v) return;
    // iPhone has no element full screen; the native player is the real one.
    if (stage?.requestFullscreen && document.fullscreenEnabled) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else stage.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen();
    }
  }

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const save = () => writePosition(resumeKey, v.ended ? 0 : v.currentTime);
    const id = setInterval(() => !v.paused && save(), 4000);
    return () => {
      clearInterval(id);
      if (startedRef.current) save();
    };
  }, [resumeKey, src]);

  function onKey(e) {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight") seekTo(time + 10);
    else if (e.key === "ArrowLeft") seekTo(time - 10);
    else if (e.key === "f") fullscreen();
  }

  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const showControls = started && (controlsShown || !playing);

  return (
    <div
      ref={stageRef}
      data-testid="cinematic-player"
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={() => started && revealControls()}
      className={`relative mx-auto bg-black overflow-hidden select-none outline-none ${rounded ? "rounded-[18px]" : ""} ${className}`}
      style={{
        aspectRatio: `${aspect}`,
        width: "100%",
        maxHeight,
        maxWidth: portrait ? `calc(${maxHeight} * ${aspect})` : undefined,
        boxShadow: rounded ? "0 30px 80px -30px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)" : undefined,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-contain"
        onClick={() => (started ? (controlsShown ? togglePlay() : revealControls()) : play())}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          setError("");
        }}
        onPause={(e) => {
          setPlaying(false);
          writePosition(resumeKey, e.currentTarget.currentTime);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          setControlsShown(true);
          writePosition(resumeKey, 0);
        }}
        onError={() => setError("This video couldn't load. Check your connection and try again.")}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
      />

      {/* Before the first play: the thumbnail with one glass play button. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500"
        style={{ opacity: started ? 0 : 1, pointerEvents: started ? "none" : "auto", background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)" }}
      >
        <button
          type="button"
          onClick={play}
          aria-label="Play video"
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
          style={{ ...GLASS_CONTROL, boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}
        >
          <Play size={28} fill="currentColor" className="ml-1" />
        </button>
        {duration > 0 && <span className="absolute bottom-4 right-4 text-white/90 text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full" style={GLASS_CONTROL}>{formatClock(duration)}</span>}
      </div>

      {buffering && playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 size={34} className="text-white/80 animate-spin" />
        </div>
      )}

      {ended && (
        <button type="button" onClick={play} className="absolute inset-0 flex items-center justify-center" aria-label="Watch again">
          <span className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-full" style={GLASS_CONTROL}>
            <RotateCcw size={16} /> Watch again
          </span>
        </button>
      )}

      {error && (
        <button type="button" onClick={play} className="absolute inset-x-4 top-4 text-white text-xs font-medium px-3 py-2 rounded-xl text-left" style={GLASS_CONTROL}>
          {error}
        </button>
      )}

      {/* Controls */}
      <div
        className="absolute inset-x-0 bottom-0 p-3 transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.5))" }}
      >
        <div className="flex items-center gap-2 rounded-2xl px-2.5 py-2" style={GLASS_CONTROL}>
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="w-9 h-9 shrink-0 flex items-center justify-center text-white">
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <span className="text-white/85 text-[11px] font-semibold tabular-nums shrink-0">{formatClock(time)}</span>
          <div className="relative flex-1 h-9 flex items-center">
            <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/20" />
            <div className="absolute left-0 h-[3px] rounded-full bg-white" style={{ width: `${pct}%` }} />
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              onChange={(e) => seekTo(Number(e.target.value))}
              onPointerDown={() => clearTimeout(hideTimer.current)}
              onPointerUp={scheduleHide}
              className="apex-film-seek absolute inset-0 w-full opacity-0 cursor-pointer"
            />
            <span className="absolute w-3 h-3 rounded-full bg-white pointer-events-none -translate-x-1/2" style={{ left: `${pct}%`, boxShadow: "0 0 0 4px rgba(255,255,255,0.15)" }} />
          </div>
          <span className="text-white/60 text-[11px] font-semibold tabular-nums shrink-0">{formatClock(duration)}</span>
          <button type="button" onClick={cycleSpeed} aria-label="Playback speed" className="h-9 min-w-[40px] px-1.5 shrink-0 text-white text-[11px] font-bold tabular-nums">
            {speed}×
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="w-9 h-9 shrink-0 flex items-center justify-center text-white">
            {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = Number(e.target.value);
              v.muted = Number(e.target.value) === 0;
            }}
            className="hidden lg:block w-20 accent-white shrink-0"
          />
          <button type="button" onClick={fullscreen} aria-label="Full screen" className="w-9 h-9 shrink-0 flex items-center justify-center text-white">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
