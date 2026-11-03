import React from "react";

// Train Solo's quieter type and buttons for its full-page moments and
// pop-ups (#143, owner: "smaller fonts, more premium"). One small scale,
// used everywhere these screens set text:
//   eyebrow  10px, medium, wide tracking, muted
//   title    24px, medium, tight tracking
//   figure   30px light (hero 44px light), tabular numbers
//   body     13px, relaxed, muted
//   row      13px medium / 11px muted
// Buttons are slim and sentence case — no all-caps blocks.

export const SOLO_TYPE = {
  eyebrow: "text-[10px] font-medium tracking-[0.18em] uppercase",
  title: "text-[24px] leading-[1.18] font-medium tracking-[-0.02em]",
  sheetTitle: "text-[20px] leading-tight font-medium tracking-[-0.015em]",
  figure: "text-[30px] leading-none font-light tracking-[-0.02em] tabular-nums",
  hero: "text-[44px] leading-none font-light tracking-[-0.03em] tabular-nums",
  body: "text-[13px] leading-relaxed",
  row: "text-[13px] font-medium",
  meta: "text-[11px]",
};

// The primary action: slim, rounded, the theme's own ink.
export function SoloButton({ t, children, className = "", style, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full h-12 rounded-full flex items-center justify-center gap-2 text-[13px] font-semibold tracking-[0.01em] active:scale-[0.99] transition-transform disabled:opacity-30 ${className}`}
      style={{ backgroundColor: t.text, color: t.bg, ...style }}
    >
      {children}
    </button>
  );
}

// The quiet secondary action under it.
export function SoloTextButton({ t, children, className = "", ...props }) {
  return (
    <button type="button" {...props} className={`w-full h-11 text-[12px] font-medium disabled:opacity-40 ${className}`} style={{ color: t.textMuted }}>
      {children}
    </button>
  );
}
