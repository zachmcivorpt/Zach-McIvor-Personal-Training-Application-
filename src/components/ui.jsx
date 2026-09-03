import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { X, Check, Camera } from "lucide-react";
import { SURFACE, SURFACE_RAISED, BORDER, TEXT_MUTED, ACCENT, ACCENT_INK, MEASURE_BLUE } from "../theme";
import { LOGO_BLACK, LOGO_WHITE, MARK_BLACK, MARK_WHITE, TAGLINE_LOGO, TAGLINE_LOGO_BLACK } from "../lib/brand";
import { fileToCompressedDataUrl } from "../lib/image";

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
export function Logo({ variant = "wordmark", tone = "white", className = "", style }) {
  return (
    <img
      src={BRAND_SOURCES[`${variant}-${tone}`]}
      alt="Zach McIvor Personal Training"
      className={className}
      style={style}
      draggable={false}
    />
  );
}

// The brand slogan — the coach's own hand-lettered "Forge Your Path" mark.
// tone: "white" (for dark surfaces, e.g. the login screen) | "black" (for
// the app's now-light everyday screens).
export function Tagline({ tone = "black", className = "h-5 w-auto opacity-80" }) {
  return <img src={tone === "white" ? TAGLINE_LOGO : TAGLINE_LOGO_BLACK} alt="Forge Your Path" className={className} draggable={false} />;
}

// Shows the uploaded photo when set, otherwise the initial-letter circle
// used everywhere in the app already — same component for coach and client,
// own-profile and viewed-by-coach contexts.
export function Avatar({ name, url, size = 40, className = "", onClick }) {
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
      className={`${commonClass} bg-black/10 border border-black/15 text-black font-bold`}
      style={{ width: px, height: px, fontSize: size * 0.4 }}
    >
      {name?.[0]?.toUpperCase() || "?"}
    </button>
  );
}

// Avatar + hidden file input + upload/compress in one control. Tap the
// photo (or the small camera badge) to replace it.
export function AvatarPicker({ name, url, size = 72, onChange }) {
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
      <Avatar name={name} url={url} size={size} onClick={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div
        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black flex items-center justify-center border-2 pointer-events-none"
        style={{ borderColor: SURFACE }}
      >
        <Camera size={12} className="text-white" />
      </div>
      {busy && (
        <div className="absolute inset-0 rounded-full bg-white/60 flex items-center justify-center pointer-events-none">
          <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   OVERLAYS
============================================================================ */

export function FullScreenOverlay({ children }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[110] flex items-end justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          className="relative w-full max-w-md rounded-t-3xl max-h-[88vh] overflow-y-auto animate-[slideUp_0.25s_ease-out] border-t border-black/10"
          style={{ backgroundColor: SURFACE_RAISED }}
        >
          <div
            className="sticky top-0 pt-3 pb-2 px-5 border-b flex items-center justify-between"
            style={{ backgroundColor: SURFACE_RAISED, borderColor: BORDER }}
          >
            <div className="w-8" />
            <div className="w-10 h-1 rounded-full bg-black/20 absolute left-1/2 -translate-x-1/2 top-2" />
            <span className="font-semibold text-black tracking-tight">{title}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/10">
              <X size={16} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </FullScreenOverlay>
  );
}

export function Toast({ message, show }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="bg-black text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
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

export function ProgressBar({ value, max, height = 8, dim = false }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full rounded-full bg-black/10" style={{ height }}>
      <div
        className="rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, height, backgroundColor: dim ? "rgba(10,10,11,0.5)" : ACCENT }}
      />
    </div>
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

export function Card({ children, className = "", onClick, style }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-3xl p-5 border ${onClick ? "active:scale-[0.98] cursor-pointer" : ""} transition-transform ${className}`}
      style={{ backgroundColor: SURFACE, borderColor: BORDER, ...style }}
    >
      {children}
    </div>
  );
}

export function Pill({ children, tone = "default" }) {
  const tones = {
    default: "bg-black/8 text-black/70",
    outline: "border border-black/20 text-black/80",
    solid: "bg-black text-white",
    muted: "bg-black/[0.04] text-black/40",
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

// Center is a real number input — free typing (any weight/reps value, not
// locked to `step`), with the +/- buttons kept for quick nudges.
export function NumberStepper({ label, value, setValue, step, min = 0 }) {
  return (
    <div>
      <p className="text-black/40 text-xs tracking-wide mb-2">{label}</p>
      <div className="flex items-center bg-black/5 rounded-xl">
        <button
          type="button"
          onClick={() => setValue(Math.max(min, +((+value || 0) - step).toFixed(2)))}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-black/60"
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
          className="flex-1 min-w-0 text-center bg-transparent text-black font-bold text-lg tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => setValue(+((+value || 0) + step).toFixed(2))}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-black/60"
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

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-black/40 text-xs tracking-wide mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-black/30 text-xs mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none placeholder:text-black/25 focus:border-black/30 transition-colors ${props.className || ""}`}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none placeholder:text-black/25 focus:border-black/30 transition-colors resize-none ${props.className || ""}`}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      {...props}
      className={`w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none focus:border-black/30 transition-colors ${className || ""}`}
    />
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-black text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-black/8 text-black font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-black/5 border border-black/15 text-black/70 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${className}`}
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

export function MetricTile({ label, value, date, series, onClick }) {
  return (
    <Card onClick={onClick} className="!p-4 flex flex-col justify-between min-h-[128px]">
      <div>
        <p className="text-black/50 text-[13px] font-medium">{label}</p>
        {date && <p className="text-black/25 text-[11px] mt-0.5">{date}</p>}
      </div>
      <div>
        <p className="text-black text-2xl font-bold tabular-nums leading-none mb-2">{value ?? "···"}</p>
        {series ? <Sparkline data={series} /> : <div className="h-9" />}
      </div>
    </Card>
  );
}
