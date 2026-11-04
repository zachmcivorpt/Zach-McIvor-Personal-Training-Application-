import React, { useState } from "react";
import { useSoloApp } from "../lib/SoloAppContext";
import { SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { CompletedSessionSheet } from "./SoloTrainingSheets";

// Session history (#152): the last part of the Progress tab (it used to sit
// at the bottom of My Training). Newest first, 10 at a time; tapping a
// session opens what was logged.
export function SoloSessionHistory({ logs, exercisesById, dark }) {
  const { soloTrainingPrograms, soloProgramsById } = useSoloApp();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const glass = soloGlass(t);
  const [viewLog, setViewLog] = useState(null);
  const [showAll, setShowAll] = useState(false);
  if (!logs?.length) return null;
  const shown = showAll ? logs : logs.slice(0, 10);

  function programName(log) {
    const p = (soloTrainingPrograms || []).find((x) => x.id === log?.purchaseId);
    return (p && soloProgramsById?.[p.programId]?.name) || null;
  }

  return (
    <div data-testid="session-history" style={{ color: t.text }}>
      <p className="font-semibold mb-3">Session History</p>
      <div className="space-y-2">
        {shown.map((log) => (
          <button key={log.id} type="button" onClick={() => setViewLog(log)} className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left" style={glass}>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{log.dayLabel}</p>
              <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                {new Date(log.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {log.durationMin} min
              </p>
            </div>
            <p className="text-xs font-semibold shrink-0" style={{ color: t.textMuted }}>
              {(log.entries || []).reduce((a, e) => a + (e.sets || []).length, 0)} sets
            </p>
          </button>
        ))}
      </div>
      {logs.length > 10 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-center text-xs font-semibold py-3 mt-1" style={{ color: t.textMuted }}>
          {showAll ? "Show fewer" : `Show all ${logs.length} sessions`}
        </button>
      )}
      <CompletedSessionSheet log={viewLog} programName={programName(viewLog)} exercisesById={exercisesById} onClose={() => setViewLog(null)} dark={dark} t={t} />
    </div>
  );
}
