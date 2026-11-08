import React from "react";
import { Check } from "lucide-react";

// Train Solo's type and buttons for its full-page moments and pop-ups
// (#143/#144). The owner wants the app's own font weights (semibold
// titles and figures, bold all-caps buttons), just SMALLER. One scale:
//   eyebrow  10px semibold, wide tracking, muted
//   title    24px semibold (sheet titles 20px)
//   figure   28px semibold (hero 44px), tabular numbers
//   body     13px, relaxed, muted
//   row      13px semibold / 11px muted

export const SOLO_TYPE = {
  eyebrow: "text-[10px] font-semibold tracking-[0.16em] uppercase",
  title: "text-[24px] leading-[1.15] font-semibold tracking-[-0.025em]",
  sheetTitle: "text-[20px] leading-tight font-semibold tracking-[-0.02em]",
  figure: "text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums",
  hero: "text-[44px] leading-none font-semibold tracking-[-0.04em] tabular-nums",
  body: "text-[13px] leading-relaxed",
  row: "text-[13px] font-semibold",
  meta: "text-[11px]",
};

// The primary action: slim, rounded, the theme's own ink.
export function SoloButton({ t, children, className = "", style, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-bold uppercase tracking-[0.02em] active:scale-[0.98] transition-transform disabled:opacity-30 ${className}`}
      style={{ backgroundColor: t.text, color: t.bg, ...style }}
    >
      {children}
    </button>
  );
}

// The quiet secondary action under it.
export function SoloTextButton({ t, children, className = "", ...props }) {
  return (
    <button type="button" {...props} className={`w-full h-11 text-[12px] font-semibold disabled:opacity-40 ${className}`} style={{ color: t.textMuted }}>
      {children}
    </button>
  );
}

// Every Train Solo tab opens with the same header (#174): the APEX mark top
// left, then the page title at one size and position on all five tabs.
// Tight spacing (#176): logo → title 10px, title → first section 8px.
export function SoloPageHeader({ t, title, sub, right = null, className = "" }) {
  return (
    <div className={`px-3 pt-5 pb-2 ${className}`} data-testid="solo-page-header">
      {/* Logo centred and lit, as in the approved mock-up (#196). */}
      <img
        src={t.logo}
        alt="APEX"
        className="block w-auto mx-auto"
        style={{ height: 21, filter: t.bg === "#FFFFFF" ? "none" : "drop-shadow(0 0 10px rgba(255,255,255,0.55))" }}
      />
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold uppercase tracking-[0.02em] leading-tight">{title}</h1>
          {sub}
        </div>
        {right}
      </div>
    </div>
  );
}

// A checkbox you can see is ticked, on Train Solo's dark photo screens
// (Register, Finish setup, the questionnaire's health consent; #184). The
// native box with `accent-white` drew a white tick on the white box iOS
// shows, so a ticked box looked exactly like an empty one. The real
// checkbox stays (visually hidden) for accessibility and taps on the label;
// the box beside it is drawn here: an outline when empty, white with a dark
// tick when ticked.
export function SoloCheckbox({ checked, onChange, className = "" }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="peer absolute inset-0 opacity-0 m-0 w-full h-full cursor-pointer" />
      <span
        aria-hidden="true"
        data-testid="solo-checkbox-box"
        data-checked={checked ? "true" : "false"}
        className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center border peer-focus-visible:ring-2 peer-focus-visible:ring-white/60"
        style={checked ? { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" } : { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.7)" }}
      >
        {checked && <Check size={13} strokeWidth={3.2} color="#0A0A0B" />}
      </span>
    </span>
  );
}
