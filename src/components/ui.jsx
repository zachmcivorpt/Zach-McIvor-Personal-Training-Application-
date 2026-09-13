import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { X, Check, Camera, Dumbbell, Video, Play, Search } from "lucide-react";
import {
  SURFACE,
  SURFACE_RAISED,
  BORDER,
  ACCENT,
  MEASURE_BLUE,
  CLIENT_DARK_SURFACE,
  CLIENT_DARK_SURFACE_2,
  CLIENT_DARK_BORDER,
} from "../theme";
import { LOGO_BLACK, LOGO_WHITE, MARK_BLACK, MARK_WHITE } from "../lib/brand";
import { fileToCompressedDataUrl } from "../lib/image";
import { useApp } from "../lib/AppContext";
import { parseVideoUrl } from "../lib/video";

// Full-screen video player — opened by tapping an ExerciseThumb that has a
// video attached. Handles YouTube/Vimeo embeds and directly-hosted files
// the same way the rest of the app's video parsing does.
export function VideoPlayerSheet({ exerciseName, videoUrl, onClose }) {
  if (!videoUrl) return null;
  const parsed = parseVideoUrl(videoUrl);
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[130] bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 pt-6 pb-3 shrink-0">
          <span className="text-white font-semibold text-sm truncate pr-3">{exerciseName || "Exercise demo"}</span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-2 pb-6">
          {parsed.kind === "search" ? (
            <a
              href={parsed.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 bg-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl"
            >
              <Search size={16} /> Open YouTube search
            </a>
          ) : parsed.kind === "file" ? (
            <video src={parsed.src} controls autoPlay playsInline className="w-full max-h-full rounded-lg" />
          ) : (
            <iframe
              src={`${parsed.embedSrc}${parsed.embedSrc.includes("?") ? "&" : "?"}autoplay=1`}
              title={exerciseName || "Exercise demo"}
              className="w-full aspect-video rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </div>
    </FullScreenOverlay>
  );
}

// A small square preview for an exercise — shows the actual video (its
// first frame for an uploaded file, YouTube's static thumbnail for a
// YouTube link) so it's visually obvious a video is attached, rather than
// a generic camera icon standing in for it, and tapping it opens a full
// player. Falls back to a plain (non-interactive) dumbbell icon when there's
// no video at all.
export function ExerciseThumb({ exercise, size = 56, rounded = "rounded-2xl", className = "", dark = false }) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const parsed = exercise?.videoUrl ? parseVideoUrl(exercise.videoUrl) : null;
  const mutedIcon = dark ? "text-white/25" : "text-black/25";
  const faintIcon = dark ? "text-white/30" : "text-black/30";
  const boxClass = dark ? "bg-white/8 border border-white/8" : "bg-black/5 border border-black/5";

  const content = (
    <>
      {!parsed ? (
        <Dumbbell size={Math.round(size * 0.4)} className={mutedIcon} />
      ) : parsed.kind === "search" ? (
        <Search size={Math.round(size * 0.35)} className={faintIcon} />
      ) : parsed.kind === "file" ? (
        <video src={parsed.src} muted playsInline preload="metadata" className="w-full h-full object-cover" />
      ) : parsed.thumbnail ? (
        <>
          <img src={parsed.thumbnail} alt="" className="w-full h-full object-cover" />
          <Play size={Math.round(size * 0.3)} className="absolute text-white drop-shadow" fill="white" />
        </>
      ) : (
        <Video size={Math.round(size * 0.35)} className={faintIcon} />
      )}
    </>
  );

  if (!parsed) {
    return (
      <div
        className={`relative ${boxClass} overflow-hidden shrink-0 flex items-center justify-center ${rounded} ${className}`}
        style={{ width: size, height: size }}
      >
        {content}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // A search link has nothing to embed/play — open it as a plain
          // link in a new tab instead of the video player sheet, which
          // would otherwise just show a broken, empty iframe.
          if (parsed?.kind === "search") {
            window.open(parsed.url, "_blank", "noopener,noreferrer");
            return;
          }
          setPlayerOpen(true);
        }}
        className={`relative ${boxClass} overflow-hidden shrink-0 flex items-center justify-center ${rounded} ${className}`}
        style={{ width: size, height: size }}
        aria-label={
          parsed?.kind === "search"
            ? `Search YouTube${exercise?.name ? ` for ${exercise.name}` : ""}`
            : `Play demo video${exercise?.name ? ` for ${exercise.name}` : ""}`
        }
      >
        {content}
      </button>
      {playerOpen && (
        <VideoPlayerSheet exerciseName={exercise?.name} videoUrl={exercise.videoUrl} onClose={() => setPlayerOpen(false)} />
      )}
    </>
  );
}

/* ============================================================================
   BRAND
============================================================================ */

const BRAND_SOURCES = {
  "wordmark-white": LOGO_WHITE,
  "wordmark-black": LOGO_BLACK,
  "mark-white": MARK_WHITE,
  "mark-black": MARK_BLACK,
};

// variant: "wordmark" (mark + "PERSONAL TRAINING") | "mark" (icon only)
// tone: "white" (for dark surfaces) | "black" (for light surfaces)
//
// A coach-uploaded logo (Settings -> Design Settings) overrides the default
// brand mark everywhere this component is used. There are two independent
// uploads — one for dark surfaces (login screen, coach console) and one for
// light surfaces (client app) — because a single mark can't read on both:
// a white "M" that looks right on the black coach header disappears
// entirely on the client app's white background, and there's no reliable
// way to auto-invert an arbitrary (possibly multi-color) logo image. `tone`
// already tells every call site which kind of surface it's on, so it
// doubles as which upload to use; if only one has been uploaded, that one
// is used everywhere rather than falling back to the default mark on the
// surface that's missing its own.
export function Logo({ variant = "wordmark", tone = "white", className = "", style }) {
  const { db } = useApp();
  const design = db?.appDesign || {};
  const customUrl = tone === "white"
    ? design.appLogoUrlOnDark || design.appLogoUrlOnLight
    : design.appLogoUrlOnLight || design.appLogoUrlOnDark;
  return (
    <img
      src={customUrl || BRAND_SOURCES[`${variant}-${tone}`]}
      alt="APEX Coaching Platform"
      className={className}
      style={style}
      draggable={false}
    />
  );
}

// The platform's small tagline — real letter-spaced text rather than a
// baked-in image, so it stays crisp at any size and adapts to either tone
// automatically.
// tone: "white" (for dark surfaces, e.g. the login screen) | "black" (for
// the app's now-light everyday screens).
export function Tagline({ tone = "black", className = "" }) {
  return (
    <p
      className={`text-[10px] font-semibold tracking-[0.3em] text-center ${tone === "white" ? "text-white/80" : "text-black/50"} ${className}`}
    >
      TRAINING &amp; PERFORMANCE
    </p>
  );
}

// Shows the uploaded photo when set, otherwise the initial-letter circle
// used everywhere in the app already — same component for coach and client,
// own-profile and viewed-by-coach contexts.
export function Avatar({ name, url, size = 40, className = "", onClick, dark = false }) {
  const px = `${size}px`;
  const commonClass = `rounded-full shrink-0 flex items-center justify-center overflow-hidden ${
    onClick ? "cursor-pointer" : ""
  } ${className}`;
  if (url) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={commonClass}
        style={{ width: px, height: px, background: "transparent", border: 0, padding: 0 }}
      >
        <img src={url} alt={name} className="w-full h-full object-cover" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${commonClass} ${dark ? "bg-white/10 border border-white/15 text-white" : "bg-black/10 border border-black/15 text-black"} font-bold`}
      style={{ width: px, height: px, fontSize: size * 0.4 }}
    >
      {name?.[0]?.toUpperCase() || "?"}
    </button>
  );
}

// Avatar + hidden file input + upload/compress in one control. Tap the
// photo (or the small camera badge) to replace it.
export function AvatarPicker({ name, url, size = 72, onChange, dark = false }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 400, 0.85);
      onChange(dataUrl);
    } catch {
      // bad file — nothing to persist
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar name={name} url={url} size={size} onClick={() => fileRef.current?.click()} dark={dark} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div
        className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 pointer-events-none ${
          dark ? "bg-white" : "bg-black"
        }`}
        style={{ borderColor: dark ? CLIENT_DARK_SURFACE : SURFACE }}
      >
        <Camera size={12} className={dark ? "text-black" : "text-white"} />
      </div>
      {busy && (
        <div
          className={`absolute inset-0 rounded-full flex items-center justify-center pointer-events-none ${
            dark ? "bg-black/60" : "bg-white/60"
          }`}
        >
          <span
            className={`w-4 h-4 border-2 rounded-full animate-spin ${
              dark ? "border-white/30 border-t-white" : "border-black/30 border-t-black"
            }`}
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   OVERLAYS
============================================================================ */

// Reference-counted body scroll lock. Sheets routinely nest (e.g. a workout
// session sheet opens an exercise detail sheet, which opens a video player),
// and each is its own FullScreenOverlay instance mounting/unmounting on its
// own schedule. A naive save-then-restore of document.body.style.overflow
// per instance breaks the instant two are open at once and they close out
// of mount order — whichever closes last "restores" a value captured while
// the other was still open, permanently locking the whole app's scroll.
// Counting locks instead means only the very last one to close ever clears
// it, regardless of what order they opened or closed in.
let bodyScrollLockCount = 0;
function lockBodyScroll() {
  if (bodyScrollLockCount === 0) document.body.style.overflow = "hidden";
  bodyScrollLockCount++;
}
function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) document.body.style.overflow = "";
}

// Every full-screen sheet in the app (workout session, workout preview,
// messages, exercise detail, video player, notifications...) is built on
// this one wrapper, so a fade-in here softens all of their entrances at
// once instead of every screen popping in instantly.
export function FullScreenOverlay({ children }) {
  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="animate-[fullScreenFadeIn_0.18s_ease-out]">{children}</div>
      <style>{`@keyframes fullScreenFadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </>,
    document.body
  );
}

export function BottomSheet({ open, onClose, title, children, dark = false }) {
  // Opening already slid up smoothly, but closing just vanished the instant
  // `open` went false — no exit animation at all, which is exactly the kind
  // of "blocky" jump a native app never has. Keeping the sheet mounted for
  // one transition's worth of time after close (sliding/fading it back out
  // first) makes every sheet in the app — habits, meals, weigh-ins, forms —
  // close the same smooth way it opened, since they all share this component.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[110] flex items-end justify-center">
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
          onClick={onClose}
        />
        <div
          className={`relative w-full max-w-md rounded-t-3xl max-h-[88vh] overflow-y-auto border-t transition-transform duration-300 ease-out ${
            dark ? "border-white/10" : "border-black/10"
          } ${visible ? "translate-y-0" : "translate-y-full"}`}
          style={{ backgroundColor: dark ? CLIENT_DARK_SURFACE_2 : SURFACE_RAISED }}
        >
          <div
            className="sticky top-0 pt-3 pb-2 px-5 border-b flex items-center justify-between"
            style={{ backgroundColor: dark ? CLIENT_DARK_SURFACE_2 : SURFACE_RAISED, borderColor: dark ? CLIENT_DARK_BORDER : BORDER }}
          >
            <div className="w-8" />
            <div className={`w-10 h-1 rounded-full absolute left-1/2 -translate-x-1/2 top-2 ${dark ? "bg-white/20" : "bg-black/20"}`} />
            <span className={`font-semibold tracking-tight ${dark ? "text-white" : "text-black"}`}>{title}</span>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-black/10"}`}
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

export function Toast({ message, show, dark = false }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div
        className={`text-sm font-medium px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 ${
          dark ? "bg-white text-black" : "bg-black text-white"
        }`}
      >
        <Check size={16} strokeWidth={3} />
        {message}
      </div>
    </div>,
    document.body
  );
}

/* ============================================================================
   PRIMITIVES
============================================================================ */

export function ProgressBar({ value, max, height = 8, dim = false, color, trackClassName = "bg-black/10" }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`w-full rounded-full ${trackClassName}`} style={{ height }}>
      <div
        className="rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, height, backgroundColor: color || (dim ? "rgba(10,10,11,0.5)" : ACCENT) }}
      />
    </div>
  );
}

// A little glass that visibly fills with blue water as a client logs
// intake (+250ml, +500ml, custom) — the fill line eases up smoothly on
// every log so it reads as "pouring in" rather than jumping, and it never
// rises past the rim: any amount beyond `max` still just reads as a full
// glass, it doesn't overflow the drawing.
export function WaterCup({ value, max, size = 56, dark = false }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  // Fill spans the bottle's body only (not the cap/neck), same convention
  // as the old cup version — a real bottle's neck stays clear even full.
  const topY = 16;
  const baseY = 80;
  const fillY = baseY - pct * (baseY - topY);
  const bottlePath =
    "M26 2 H38 Q40 2 40 4 V11 Q40 13 42 15 L45 20 Q48 24 48 29 V78 Q48 82 44 82 H20 Q16 82 16 78 V29 Q16 24 19 20 L22 15 Q24 13 24 11 V4 Q24 2 26 2 Z";
  const capPath = "M26 2 H38 Q40 2 40 4 V11 H24 V4 Q24 2 26 2 Z";
  return (
    <svg width={size} height={Math.round(size * (86 / 64))} viewBox="0 0 64 86" className="shrink-0" aria-hidden="true">
      <defs>
        <clipPath id="waterBottleClip">
          <path d={bottlePath} />
        </clipPath>
      </defs>
      <g clipPath="url(#waterBottleClip)">
        <rect x="0" y="0" width="64" height="86" fill={dark ? "rgba(255,255,255,0.06)" : "rgba(10,10,11,0.04)"} />
        <rect
          x="0"
          y={fillY}
          width="64"
          height={86 - fillY}
          fill={MEASURE_BLUE}
          style={{ transition: "y 0.7s cubic-bezier(0.22,1,0.36,1), height 0.7s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </g>
      <path d={bottlePath} fill="none" stroke={dark ? "rgba(255,255,255,0.25)" : "rgba(10,10,11,0.35)"} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={capPath} fill={dark ? "rgba(255,255,255,0.12)" : "rgba(10,10,11,0.08)"} stroke={dark ? "rgba(255,255,255,0.25)" : "rgba(10,10,11,0.35)"} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({ value, max, size = 64, stroke = 7, children }) {
  const pct = Math.min(1, value / max);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(10,10,11,0.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ACCENT}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - c * pct}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Card({ children, className = "", onClick, style, dark = false }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-3xl p-5 border ${onClick ? "active:scale-[0.98] cursor-pointer" : ""} transition-transform ${className}`}
      style={{ backgroundColor: dark ? CLIENT_DARK_SURFACE : SURFACE, borderColor: dark ? CLIENT_DARK_BORDER : BORDER, ...style }}
    >
      {children}
    </div>
  );
}

export function Pill({ children, tone = "default", dark = false }) {
  const tones = {
    default: "bg-black/8 text-black/70",
    outline: "border border-black/20 text-black/80",
    solid: "bg-black text-white",
    muted: "bg-black/[0.04] text-black/40",
    warning: "bg-red-50 text-red-700",
  };
  const darkTones = {
    default: "bg-white/8 text-white/70",
    outline: "border border-white/20 text-white/80",
    solid: "bg-white text-black",
    muted: "bg-white/[0.06] text-white/40",
    warning: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${(dark ? darkTones : tones)[tone]}`}>{children}</span>
  );
}

// Center is a real number input — free typing (any weight/reps value, not
// locked to `step`), with the +/- buttons kept for quick nudges.
export function NumberStepper({ label, value, setValue, step, min = 0, dark = false }) {
  return (
    <div>
      <p className={`text-xs tracking-wide mb-2 ${dark ? "text-white/40" : "text-black/40"}`}>{label}</p>
      <div className={`flex items-center rounded-xl ${dark ? "bg-white/8" : "bg-black/5"}`}>
        <button
          type="button"
          onClick={() => setValue(Math.max(min, +((+value || 0) - step).toFixed(2)))}
          className={`w-11 h-11 shrink-0 flex items-center justify-center ${dark ? "text-white/60" : "text-black/60"}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : +e.target.value)}
          onBlur={(e) => {
            if (e.target.value === "" || Number.isNaN(+e.target.value)) setValue(min);
          }}
          className={`flex-1 min-w-0 text-center bg-transparent font-bold text-lg tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            dark ? "text-white" : "text-black"
          }`}
        />
        <button
          type="button"
          onClick={() => setValue(+((+value || 0) + step).toFixed(2))}
          className={`w-11 h-11 shrink-0 flex items-center justify-center ${dark ? "text-white/60" : "text-black/60"}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   FORM CONTROLS (shared by coach admin forms)
============================================================================ */

export function Field({ label, children, hint, dark = false }) {
  return (
    <label className="block">
      <span className={`block text-xs tracking-wide mb-1.5 ${dark ? "text-white/40" : "text-black/40"}`}>{label}</span>
      {children}
      {hint && <span className={`block text-xs mt-1 ${dark ? "text-white/30" : "text-black/30"}`}>{hint}</span>}
    </label>
  );
}

export function TextInput({ dark = false, ...props }) {
  return (
    <input
      {...props}
      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors ${
        dark
          ? "bg-white/8 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
          : "bg-black/5 border-black/10 text-black placeholder:text-black/25 focus:border-black/30"
      } ${props.className || ""}`}
    />
  );
}

export function TextArea({ dark = false, ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors resize-none ${
        dark
          ? "bg-white/8 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
          : "bg-black/5 border-black/10 text-black placeholder:text-black/25 focus:border-black/30"
      } ${props.className || ""}`}
    />
  );
}

export function Select({ className, dark = false, ...props }) {
  return (
    <select
      {...props}
      className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors ${
        dark ? "bg-white/8 border-white/10 text-white focus:border-white/30" : "bg-black/5 border-black/10 text-black focus:border-black/30"
      } ${className || ""}`}
    />
  );
}

export function PrimaryButton({ children, className = "", dark = false, ...props }) {
  return (
    <button
      {...props}
      className={`font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 disabled:active:scale-100 ${
        dark ? "bg-white text-black" : "bg-black text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", dark = false, ...props }) {
  return (
    <button
      {...props}
      className={`font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 ${
        dark ? "bg-white/8 text-white" : "bg-black/8 text-black"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, className = "", dark = false, ...props }) {
  return (
    <button
      {...props}
      className={`border font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
        dark ? "bg-white/5 border-white/15 text-white/70" : "bg-black/5 border-black/15 text-black/70"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ============================================================================
   MEASUREMENT DATA VIZ — every chart/sparkline in the app uses this blue
============================================================================ */

// Minimal trend line, no axes — for a metric tile's baseline graph.
export function Sparkline({ data, dataKey = "value", height = 36 }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="flex items-end"><div className="w-full h-px bg-black/10" /></div>;
  }
  const gradId = `spark-${dataKey}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.35} />
              <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricTile({ label, value, date, series, onClick, dark = false }) {
  return (
    <Card onClick={onClick} className="!p-4 flex flex-col justify-between min-h-[128px]" dark={dark}>
      <div>
        <p className={`text-[13px] font-medium ${dark ? "text-white/50" : "text-black/50"}`}>{label}</p>
        {date && <p className={`text-[11px] mt-0.5 ${dark ? "text-white/25" : "text-black/25"}`}>{date}</p>}
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums leading-none mb-2 ${dark ? "text-white" : "text-black"}`}>{value ?? "···"}</p>
        {series ? <Sparkline data={series} /> : <div className="h-9" />}
      </div>
    </Card>
  );
}
