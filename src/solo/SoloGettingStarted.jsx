import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Dumbbell, CalendarDays, Timer, Search, LineChart, ArrowRight } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { GETTING_STARTED_STEPS, startStep } from "./gettingStarted";

const ICONS = { session: Dumbbell, calendar: CalendarDays, log: Timer, library: Search, progress: LineChart };

// Getting Started (#180): a solid full page (a client-experience moment,
// #141), five steps with large figures, swipe or Next/Back, Skip any time,
// "Try it" takes them to the real screen. Every step change is saved to the
// account (saveSoloGettingStarted), so Profile > Getting Started reopens
// where they left off.
export default function SoloGettingStarted({ open, onClose }) {
  const { soloCurrentUser, saveSoloGettingStarted } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const touchX = useRef(null);

  useEffect(() => {
    if (open) setStep(startStep(soloCurrentUser));
    // Only when it opens: later profile updates mustn't move the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const total = GETTING_STARTED_STEPS.length;
  const s = GETTING_STARTED_STEPS[step];
  const Icon = ICONS[s.id];
  const last = step === total - 1;

  function save(patch) {
    saveSoloGettingStarted(patch).catch(() => {});
  }
  function go(n) {
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === step) return;
    setStep(next);
    save({ step: next });
  }
  function finish(outcome) {
    save({ step, finishedAt: Date.now(), outcome });
    onClose();
  }
  function tryIt() {
    save({ step });
    onClose();
    navigate(s.target.path, s.target.state ? { state: s.target.state } : undefined);
  }

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting Started"
      data-testid="solo-getting-started"
      className="fixed inset-0 z-[140] flex flex-col"
      style={{ backgroundColor: t.bg, color: t.text, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        go(end < start ? step + 1 : step - 1);
      }}
    >
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col px-6">
        <div className="flex items-center justify-between pt-5">
          <img src={t.logo} alt="APEX" className="block w-auto" style={{ height: 19 }} />
          <button type="button" onClick={() => finish("skipped")} className="text-[12px] font-semibold py-2" style={{ color: t.textMuted }}>
            Skip
          </button>
        </div>

        <div className="flex gap-1.5 mt-6" aria-hidden="true">
          {GETTING_STARTED_STEPS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              tabIndex={-1}
              onClick={() => go(i)}
              className="h-[3px] flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i <= step ? MEASURE_BLUE : t.panelBorder }}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col justify-center py-6">
          <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
            Getting started · Step {step + 1} of {total}
          </p>
          <div className="flex items-end justify-between mt-3">
            <p className="text-[64px] leading-none font-semibold tracking-[-0.05em] tabular-nums">{String(step + 1).padStart(2, "0")}</p>
            <span className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={soloGlass(t)}>
              <Icon size={20} color={MEASURE_BLUE} />
            </span>
          </div>
          <h2 className={`${SOLO_TYPE.title} mt-5`}>{s.title}</h2>
          <p className={`${SOLO_TYPE.body} mt-2`} style={{ color: t.textMuted }}>
            {s.body}
          </p>
          <ul className="mt-6 border-t" style={{ borderColor: t.panelBorder }}>
            {s.points.map((p) => (
              <li key={p} className="flex items-center gap-3 py-3 border-b text-[13px]" style={{ borderColor: t.panelBorder }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MEASURE_BLUE }} />
                {p}
              </li>
            ))}
          </ul>
          <button type="button" onClick={tryIt} className="mt-4 self-start flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: MEASURE_BLUE }}>
            {s.tryLabel}
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="pb-6">
          <SoloButton t={t} onClick={() => (last ? finish("completed") : go(step + 1))}>
            {last ? "Start training" : "Next"}
          </SoloButton>
          <SoloTextButton t={t} className="mt-1" disabled={step === 0} onClick={() => go(step - 1)}>
            Back
          </SoloTextButton>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
