import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { BottomSheet } from "../components/ui";
import { soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";
import { MuscleDisplay, TRAINED_RED } from "./MuscleBody";
import { trainedMuscles, intensity, muscleSummary, MUSCLE_LABELS } from "./muscleMap";
import { SOLO_TYPE } from "./SoloUI";

// The muscle map in My Training (#148): a slim row — a small holographic
// figure and one line of what's been trained — that opens the full map.
// Last 72 hours (about a muscle's recovery time), from their own logs.

function ago(ts, now) {
  const h = Math.max(0, Math.round((now - ts) / 3600000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const list = (keys) => keys.map((k) => MUSCLE_LABELS[k]).join(", ");

export function SoloMuscleMapRow({ logs, exercisesById, dark, t }) {
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const trained = useMemo(() => trainedMuscles(logs || [], exercisesById || {}, { now }), [logs, exercisesById]); // eslint-disable-line react-hooks/exhaustive-deps
  const levels = useMemo(() => Object.fromEntries(Object.entries(trained).map(([m, v]) => [m, intensity(v.sets)])), [trained]);
  const { worked, ready } = muscleSummary(trained);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-3 mt-4 py-2 text-left" data-testid="muscle-map-row" aria-label="Muscle map">
        <MuscleDisplay levels={levels} height={46} compact className="w-[64px] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={`block ${SOLO_TYPE.row}`}>Muscle map</span>
          <span className={`block ${SOLO_TYPE.meta} mt-0.5 truncate`} style={{ color: t.textMuted }}>
            {worked.length ? (
              <>
                <span style={{ color: TRAINED_RED }}>Trained:</span> {list(worked.slice(0, 3))}
                {worked.length > 3 ? ` +${worked.length - 3}` : ""}
              </>
            ) : (
              "Nothing in the last 3 days — everything's ready"
            )}
          </span>
        </span>
        <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Muscle map" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
        <div style={{ color: t.text }}>
          <MuscleDisplay levels={levels} height={300} />
          <div className="flex items-center gap-4 mt-3 px-1">
            <span className={`flex items-center gap-1.5 ${SOLO_TYPE.meta}`} style={{ color: t.textMuted }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TRAINED_RED }} /> Trained, last 3 days
            </span>
            <span className={`flex items-center gap-1.5 ${SOLO_TYPE.meta}`} style={{ color: t.textMuted }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ border: `1px solid ${MEASURE_BLUE}`, backgroundColor: "rgba(47,143,255,0.12)" }} /> Ready
            </span>
          </div>

          {worked.length > 0 && (
            <ul className="mt-5 border-t" style={{ borderColor: t.panelBorder }} data-testid="muscle-map-list">
              {worked.map((m) => (
                <li key={m} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: t.panelBorder }}>
                  <span className={SOLO_TYPE.row}>{MUSCLE_LABELS[m]}</span>
                  <span className={`${SOLO_TYPE.meta} tabular-nums`} style={{ color: t.textMuted }}>
                    {Math.round(trained[m].sets * 10) / 10} sets · {ago(trained[m].last, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ready.length > 0 && (
            <p className={`${SOLO_TYPE.body} mt-4`} style={{ color: t.textMuted }}>
              <span style={{ color: MEASURE_BLUE }} className="font-semibold">
                Ready:
              </span>{" "}
              {list(ready)}
            </p>
          )}
          <p className={`${SOLO_TYPE.meta} mt-3`} style={{ color: t.textFaint }}>
            From the sets you've logged in the last 72 hours. Helping muscles count as half a set.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
