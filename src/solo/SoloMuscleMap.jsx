import React, { useMemo, useState } from "react";
import { Card } from "../components/ui";
import { SOLO_THEMES } from "./SoloThemeContext";
import { MuscleBody, TRAINED_RED, READY_BLUE } from "./MuscleBody";
import { trainedMuscles, intensity, muscleSummary, MUSCLE_LABELS } from "./muscleMap";

// The muscle map on Progress (#148): one glass card with the body (Front /
// Back), two large figures, and what's trained (red) and ready (blue).
// Last 72 hours (about a muscle's recovery time), from their own logs.

// Whole calendar days since their most recent logged session (any age).
export function daysSinceLastSession(logs, now = Date.now()) {
  const last = Math.max(0, ...(logs || []).map((l) => Number(new Date(l?.date)) || 0).filter((v) => v <= now + 3600000));
  if (!last) return null;
  const day = (ts) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.max(0, Math.round((day(now) - day(last)) / 86400000));
}

function Figure({ value, label, color, text, muted, align = "left" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[32px] leading-none font-semibold tabular-nums" style={{ color: color || text }}>
        {value}
      </div>
      <div className="text-[10px] font-semibold tracking-[0.1em] uppercase mt-1.5 leading-snug" style={{ color: muted }}>
        {label}
      </div>
    </div>
  );
}

const sets = (n) => Math.round(n * 10) / 10;

export function SoloMuscleMapCard({ logs, exercisesById, dark }) {
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [view, setView] = useState("front");
  const now = Date.now();
  const trained = useMemo(() => trainedMuscles(logs || [], exercisesById || {}, { now }), [logs, exercisesById]); // eslint-disable-line react-hooks/exhaustive-deps
  const levels = useMemo(() => Object.fromEntries(Object.entries(trained).map(([m, v]) => [m, intensity(v.sets)])), [trained]);
  const { worked, ready } = muscleSummary(trained);
  const since = daysSinceLastSession(logs, now);

  return (
    <Card dark={dark}>
      <div data-testid="muscle-map" style={{ color: t.text }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Muscle Map</p>
          <div className="flex gap-4" role="tablist" aria-label="Body side">
            {["front", "back"].map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className="text-[11px] font-bold uppercase tracking-[0.12em] pb-0.5 border-b-2" style={{ color: view === v ? t.text : t.textFaint, borderColor: view === v ? READY_BLUE : "transparent" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <div className="absolute left-0 top-0 z-10">
            <Figure value={since == null ? "–" : since} label={<>Days since<br />last session</>} text={t.text} muted={t.textMuted} />
          </div>
          <div className="absolute right-0 top-0 z-10">
            <Figure value={ready.length} label={<>Muscle groups<br />ready</>} color={READY_BLUE} text={t.text} muted={t.textMuted} align="right" />
          </div>
          <div className="flex justify-center pt-2">
            <MuscleBody view={view} levels={levels} dark={dark} style={{ height: 320 }} />
          </div>
        </div>

        <div className="mt-4 border-t pt-3 space-y-2 text-[13px] leading-snug" style={{ borderColor: t.panelBorder }}>
          <p data-testid="muscle-map-trained">
            <span className="font-semibold" style={{ color: TRAINED_RED }}>Trained</span>
            <span style={{ color: t.textMuted }}>
              {" "}
              {worked.length ? worked.map((m) => `${MUSCLE_LABELS[m]} ${sets(trained[m].sets)}`).join(" · ") : "nothing in the last 3 days"}
            </span>
          </p>
          {ready.length > 0 && (
            <p data-testid="muscle-map-ready">
              <span className="font-semibold" style={{ color: READY_BLUE }}>Ready</span>
              <span style={{ color: t.textMuted }}> {ready.map((m) => MUSCLE_LABELS[m]).join(" · ")}</span>
            </p>
          )}
          <p className="text-[11px]" style={{ color: t.textFaint }}>
            Sets logged in the last 72 hours; helping muscles count as half a set.
          </p>
        </div>
      </div>
    </Card>
  );
}
