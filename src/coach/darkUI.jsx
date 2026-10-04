// Shared "premium instrument panel" dark system for the Coach console.
//
// Originally built for the Overview page against a specific reference
// image, then extended across every other coach-side screen. Lives here
// (not components/ui.jsx) because it is deliberately Coach-only — the
// client app keeps its own separate light/dark toggle (ClientThemeContext),
// and nothing in this file is ever imported from src/client/.
//
// Every coach page should import DarkPage/DarkPanel/StatCard/DarkPageHeader
// from here rather than re-implementing the look, so "exact" actually means
// exact — the same component, not a close re-creation of it.
import { CLIENT_DARK_BG, CLIENT_DARK_SURFACE, CLIENT_DARK_BORDER, MEASURE_BLUE, GOAL_GREEN, OVER_RED } from "../theme";
import { ChevronRight, ArrowUpRight } from "lucide-react";

// Full-page dark background. CoachShell's shared content wrapper pads every
// tab with pt-14/pb-16 on mobile (room for the fixed top/bottom bars) over
// its own white root background — -mt-14 etc. cancels that back out so
// this page's own dark background fills that gap too, instead of leaving a
// pale strip above/below the content on mobile while every other (light)
// tab blends into it unnoticed.
export function DarkPage({ children, className = "" }) {
  return (
    <div className="-mt-14 -mb-16 pt-14 pb-16 md:mt-0 md:mb-0 md:pt-0 md:pb-0" style={{ backgroundColor: CLIENT_DARK_BG, minHeight: "100%" }}>
      <div className={`max-w-7xl mx-auto px-4 py-5 md:px-8 md:py-8 ${className}`}>{children}</div>
    </div>
  );
}

// A few layered CSS triangles reading as a plain mountain silhouette —
// "atmospheric, not a giant photograph" — masked out toward the left so it
// washes into the panel rather than reading as a hard-edged image. Used by
// any dark page header that wants the same texture Overview's hero does.
export function MountainTexture() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        maskImage: "linear-gradient(to left, black, transparent 65%)",
        WebkitMaskImage: "linear-gradient(to left, black, transparent 65%)",
      }}
    >
      <div
        className="absolute -bottom-6 -right-10 w-[320px] h-[150px] opacity-60"
        style={{ background: "linear-gradient(160deg, #222a33, #121519)", clipPath: "polygon(30% 0%, 75% 40%, 100% 100%, 0% 100%)" }}
      />
      <div
        className="absolute -bottom-6 right-[-5%] w-[260px] h-[220px] opacity-55"
        style={{ background: "linear-gradient(160deg, #2a3442, #15191f)", clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }}
      />
      <div
        className="absolute -bottom-6 right-[8%] w-[180px] h-[160px] opacity-50"
        style={{ background: "linear-gradient(160deg, #3a4858, #1a1f26)", clipPath: "polygon(40% 0%, 100% 100%, 0% 100%)" }}
      />
    </div>
  );
}

// The near-black glass card used for every section on a dark coach page —
// a hairline border, a corner glow, and (chamfer=true) a cut bottom-right
// corner with a brighter metallic border and a top-edge + diagonal light
// reflection, for the compact "instrument tile" cards (stat tiles, small
// clickable summaries). Full-width sections (lists, panels) use the plain
// (non-chamfer) form.
export function DarkPanel({ children, className = "", chamfer = false, style }) {
  return (
    <div
      className={`relative overflow-hidden border ${chamfer ? "" : "rounded-2xl"} ${className}`}
      style={{
        background: chamfer ? "linear-gradient(165deg, #1A1A1A, #121212 55%)" : CLIENT_DARK_SURFACE,
        borderColor: chamfer ? "rgba(255,255,255,0.14)" : CLIENT_DARK_BORDER,
        clipPath: chamfer ? "polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)" : undefined,
        ...style,
      }}
    >
      {chamfer ? (
        <>
          <div
            className="pointer-events-none absolute top-0 left-[10%] right-[10%] h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)" }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-[-20%] w-[70%]"
            style={{
              background:
                "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.1) 46%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.1) 54%, transparent 70%)",
            }}
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute -top-10 -right-10 w-28 h-28"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 60%)" }}
        />
      )}
      {children}
    </div>
  );
}

// A chamfered instrument tile for a single stat — icon, big number, label,
// and a trend/status line with the card's own chevron affordance tucked
// into the cut corner. trendKind: "up" (green, arrow), "alert" (red dot),
// "link" (blue, icon-only — no trend text), "neutral" (plain muted text).
export function StatCard({ icon: Icon, label, value, trend, trendKind = "neutral", onClick }) {
  const trendColor = trendKind === "up" ? GOAL_GREEN : trendKind === "alert" ? OVER_RED : trendKind === "link" ? MEASURE_BLUE : "#FFFFFF";
  return (
    <DarkPanel chamfer className="active:scale-[0.98] transition-transform">
      <button onClick={onClick} className="relative w-full text-left p-4 sm:p-[18px] transition-colors hover:bg-white/[0.03]" disabled={!onClick}>
        <Icon size={16} style={{ color: MEASURE_BLUE }} />
        <p className="text-white text-[32px] sm:text-4xl font-bold leading-none tabular-nums mt-3">{value}</p>
        <p className="text-white text-[10px] font-bold tracking-[0.15em] uppercase mt-2.5">{label}</p>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: trendColor }}>
            {trendKind === "up" && <ArrowUpRight size={12} />}
            {trendKind === "alert" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: OVER_RED }} />}
            {trendKind === "link" ? <ChevronRight size={14} /> : <span>{trend}</span>}
          </div>
          {onClick && <ChevronRight size={14} className="text-white" />}
        </div>
      </button>
    </DarkPanel>
  );
}

// The simple dark header bar used at the top of every non-Overview coach
// page: title + subtitle in the same type system as Overview's hero, a
// thin blue top line, and an optional right-side slot for page actions
// (a button, a search field, ...). Deliberately does NOT repeat the
// greeting/date/bell/avatar — those live once, in CoachShell's own chrome,
// not duplicated on every page.
export function DarkPageHeader({ title, subtitle, right, texture = false }) {
  return (
    <div className="relative overflow-hidden rounded-2xl mb-4 border" style={{ backgroundColor: CLIENT_DARK_SURFACE, borderColor: CLIENT_DARK_BORDER }}>
      {texture && <MountainTexture />}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${MEASURE_BLUE}, transparent)` }} />
      <div className="relative flex items-center justify-between gap-3 px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0">
          <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-white text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase mt-1.5">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}
