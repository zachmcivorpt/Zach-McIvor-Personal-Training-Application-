// #328 (owner, 2026-11-27): ONE rest timer for the coached client and Train
// Solo — Train Solo's lit blue ring (Skip · time · +15s), a small floating
// pill at the bottom on clear frosted glass in both light and dark mode
// (owner: "smaller and more glass morphism"): a very see-through fill, a
// bright specular sheen, a lit rim, a soft wide shadow, `blur(36px)
// saturate(200%)` + `-webkit-`. Purely prop-driven: the same timer and
// callbacks each screen already had (`addRest15`, Skip).
import React from "react";
import { MEASURE_BLUE } from "../theme";

export function restGlass(dark) {
  return dark
    ? {
        backgroundColor: "rgba(30,30,36,0.18)",
        backgroundImage:
          "radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(255,255,255,0.22)",
        boxShadow:
          "0 18px 40px -18px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 18px rgba(255,255,255,0.05)",
        backdropFilter: "blur(36px) saturate(200%)",
        WebkitBackdropFilter: "blur(36px) saturate(200%)",
      }
    : {
        backgroundColor: "rgba(255,255,255,0.16)",
        backgroundImage:
          "radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,0.85), rgba(255,255,255,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 60%)",
        border: "1px solid rgba(255,255,255,0.9)",
        boxShadow:
          "0 0 0 0.5px rgba(10,10,11,0.08), 0 18px 40px -18px rgba(20,20,30,0.38), inset 0 1px 0 rgba(255,255,255,1), inset 0 0 18px rgba(255,255,255,0.35)",
        backdropFilter: "blur(36px) saturate(200%)",
        WebkitBackdropFilter: "blur(36px) saturate(200%)",
      };
}

export function RestRing({ restTime, restTotal, onSkip, onAdd15, dark, testId = "rest-ring" }) {
  const left = Math.max(restTime, 0);
  const done = restTotal > 0 ? Math.min(1, (restTotal - left) / restTotal) : 0;
  const C = 2 * Math.PI * 38;
  const ink = dark ? "#FFFFFF" : "#0A0A0B";
  return (
    <div className="fixed left-0 right-0 bottom-0 z-[95] flex justify-center pb-safe pointer-events-none" data-testid={testId}>
      <div
        className="pointer-events-auto mb-3 rounded-full flex items-center gap-4 px-4 py-1"
        style={{ ...restGlass(dark), color: ink }}
        data-testid="rest-ring-glass"
      >
        <button type="button" onClick={onSkip} aria-label="Skip rest" className="h-11 min-w-[76px] px-3 rounded-full text-[12px] font-extrabold uppercase tracking-[0.14em] opacity-75 active:opacity-100">
          Skip
        </button>
        <div className="relative w-[62px] h-[62px] shrink-0" style={{ filter: "drop-shadow(0 0 8px rgba(47,143,255,0.6))" }}>
          <svg viewBox="0 0 86 86" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="43" cy="43" r="38" fill="none" stroke={MEASURE_BLUE} strokeOpacity="0.2" strokeWidth="4" />
            <circle cx="43" cy="43" r="38" fill="none" stroke={MEASURE_BLUE} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * done} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold tabular-nums leading-none" data-testid="rest-time">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-[0.16em] mt-0.5 opacity-60">Rest</span>
          </div>
        </div>
        <button type="button" onClick={onAdd15} aria-label="Add 15 seconds" className="h-11 min-w-[76px] px-3 rounded-full text-[12px] font-extrabold uppercase tracking-[0.14em] active:opacity-70">
          +15s
        </button>
      </div>
    </div>
  );
}
