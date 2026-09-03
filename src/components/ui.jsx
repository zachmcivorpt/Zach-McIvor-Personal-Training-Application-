import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { X, Check } from "lucide-react";
import { SURFACE, SURFACE_RAISED, BORDER, TEXT_MUTED, ACCENT, ACCENT_INK, MEASURE_BLUE } from "../theme";
import { LOGO_BLACK, LOGO_WHITE, MARK_BLACK, MARK_WHITE } from "../lib/brand";

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
      alt="M Personal Training"
      className={className}
      style={style}
      draggable={false}
    />
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
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div
          className="relative w-full max-w-md rounded-t-3xl max-h-[88vh] overflow-y-auto animate-[slideUp_0.25s_ease-out] border-t border-white/10"
          style={{ backgroundColor: SURFACE_RAISED }}
        >
          <div
            className="sticky top-0 pt-3 pb-2 px-5 border-b flex items-center justify-between"
            style={{ backgroundColor: SURFACE_RAISED, borderColor: BORDER }}
          >
            <div className="w-8" />
            <div className="w-10 h-1 rounded-full bg-white/20 absolute left-1/2 -translate-x-1/2 top-2" />
            <span className="font-semibold text-white tracking-tight">{title}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10">
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
      <div className="bg-white text-black text-sm font-medium px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
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
    <div className="w-full rounded-full bg-white/10" style={{ height }}>
      <div
        className="rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, height, backgroundColor: dim ? "rgba(255,255,255,0.5)" : ACCENT }}
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
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
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
    default: "bg-white/8 text-white/70",
    outline: "border border-white/20 text-white/80",
    solid: "bg-white text-black",
    muted: "bg-white/[0.04] text-white/40",
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function NumberStepper({ label, value, setValue, step, min = 0 }) {
  return (
    <div>
      <p className="text-white/40 text-xs tracking-wide mb-2">{label}</p>
      <div className="flex items-center bg-white/5 rounded-xl">
        <button
          type="button"
          onClick={() => setValue(Math.max(min, +(value - step).toFixed(2)))}
          className="w-11 h-11 flex items-center justify-center text-white/60"
        >
          −
        </button>
        <span className="flex-1 text-center text-white font-bold text-lg tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => setValue(+(value + step).toFixed(2))}
          className="w-11 h-11 flex items-center justify-center text-white/60"
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
      <span className="block text-white/40 text-xs tracking-wide mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-white/30 text-xs mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30 transition-colors ${props.className || ""}`}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30 transition-colors resize-none ${props.className || ""}`}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors ${className || ""}`}
    />
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-white text-black font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-white/8 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-white/5 border border-white/15 text-white/70 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${className}`}
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
    return <div style={{ height }} className="flex items-end"><div className="w-full h-px bg-white/10" /></div>;
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
        <p className="text-white/50 text-[13px] font-medium">{label}</p>
        {date && <p className="text-white/25 text-[11px] mt-0.5">{date}</p>}
      </div>
      <div>
        <p className="text-white text-2xl font-bold tabular-nums leading-none mb-2">{value ?? "···"}</p>
        {series ? <Sparkline data={series} /> : <div className="h-9" />}
      </div>
    </Card>
  );
}
