import React from "react";

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
export function SoloPageHeader({ t, title, sub, right = null, className = "" }) {
  return (
    <div className={`px-3 pt-5 pb-3 ${className}`} data-testid="solo-page-header">
      <img src={t.logo} alt="APEX" className="block w-auto" style={{ height: 19 }} />
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold leading-tight">{title}</h1>
          {sub}
        </div>
        {right}
      </div>
    </div>
  );
}
