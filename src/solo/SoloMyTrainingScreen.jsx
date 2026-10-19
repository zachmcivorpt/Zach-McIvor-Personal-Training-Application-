import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { programPhases } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { totalWeeksForProgram, currentWeekNumber, phaseForWeekNumber } from "./weekProgress";
import { BottomSheet, PrimaryButton, SecondaryButton } from "../components/ui";

// A purchased program's own read-only overview — which week the customer
// is in, and that week's workouts by name. Actually running/logging a
// workout reuses APEX's existing workout-session functionality, which is
// explicitly Phase 3 ("Training experience") scope, not this one; this
// screen is the "you own this, here's where you are" access layer Phase 2
// asks for, deliberately stopping short of the logging UI itself.
function ProgramProgressSheet({ open, onClose, program, purchase, onSetStartDate }) {
  const [draftDate, setDraftDate] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const phases = programPhases(program);
  const totalWeeks = totalWeeksForProgram(phases);
  const weekNumber = currentWeekNumber(purchase?.startDate, totalWeeks);
  const current = weekNumber ? phaseForWeekNumber(phases, weekNumber) : null;

  React.useEffect(() => {
    if (open) {
      setDraftDate(purchase?.startDate || localDateKey());
      setEditingDate(false);
    }
  }, [open, purchase?.startDate]);

  return (
    <BottomSheet open={open} onClose={onClose} title={program?.name} wide>
      {!purchase?.startDate ? (
        <div>
          <p className="text-black/60 text-sm mb-4">Pick the date Week 1, Day 1 starts — everything else is tracked from there.</p>
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm mb-4"
          />
          <PrimaryButton className="w-full" onClick={() => onSetStartDate(draftDate)} disabled={!draftDate}>
            SET START DATE
          </PrimaryButton>
        </div>
      ) : (
        <div>
          <p className="text-black/40 text-xs mb-1">STARTED</p>
          <p className="text-black text-sm font-semibold mb-4">{purchase.startDate}</p>
          <p className="text-black/40 text-xs mb-1">CURRENT WEEK</p>
          <p className="text-black text-lg font-extrabold mb-4">
            Week {weekNumber} of {totalWeeks}
            {current?.phase && <span className="text-black/40 text-sm font-semibold"> · {current.phase.name}</span>}
          </p>
          {current?.phase && (
            <div className="space-y-2 mb-5">
              {(current.phase.days || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-3.5 py-3">
                  <p className="text-black text-sm font-semibold">{d.label}</p>
                  <p className="text-black/40 text-xs">{(d.exercises || []).filter((e) => !e.isRest).length} exercises</p>
                </div>
              ))}
              {(current.phase.days || []).length === 0 && <p className="text-black/40 text-xs">No workouts in this phase yet.</p>}
            </div>
          )}
          {!editingDate ? (
            <SecondaryButton className="w-full" type="button" onClick={() => setEditingDate(true)}>
              Change start date
            </SecondaryButton>
          ) : (
            <div>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm mb-3"
              />
              <PrimaryButton
                className="w-full"
                onClick={() => {
                  onSetStartDate(draftDate);
                  setEditingDate(false);
                }}
                disabled={!draftDate || draftDate === purchase.startDate}
              >
                SAVE NEW START DATE
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

export default function SoloMyTrainingScreen() {
  const navigate = useNavigate();
  const { soloPrograms, soloPurchases, setPurchaseStartDate } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [openPurchaseId, setOpenPurchaseId] = useState(null);

  const programsById = useMemo(() => Object.fromEntries(soloPrograms.map((p) => [p.id, p])), [soloPrograms]);
  const openPurchase = soloPurchases.find((p) => p.id === openPurchaseId) || null;
  const openProgram = openPurchase ? programsById[openPurchase.programId] : null;

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-5 pb-10">
      <h1 className="text-xl font-extrabold mb-4">My Training</h1>

      {soloPurchases.length === 0 ? (
        <div className="rounded-2xl px-5 py-10 text-center" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
          <CalendarDays size={22} color={t.textFaint} className="mx-auto mb-3" />
          <p className="text-sm mb-4" style={{ color: t.textMuted }}>
            You don't own any programs yet.
          </p>
          <button onClick={() => navigate("/solo/home")} className="text-sm font-bold underline">
            Browse the catalogue
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {soloPurchases.map((purchase) => {
            const program = programsById[purchase.programId];
            if (!program) return null;
            const totalWeeks = totalWeeksForProgram(programPhases(program));
            const weekNumber = currentWeekNumber(purchase.startDate, totalWeeks);
            return (
              <button
                key={purchase.id}
                onClick={() => setOpenPurchaseId(purchase.id)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
                style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{program.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                    {purchase.startDate ? `Week ${weekNumber} of ${totalWeeks}` : "Set a start date"}
                  </p>
                </div>
                <ChevronRight size={16} color={t.textFaint} />
              </button>
            );
          })}
        </div>
      )}

      <ProgramProgressSheet
        open={!!openPurchase}
        onClose={() => setOpenPurchaseId(null)}
        program={openProgram}
        purchase={openPurchase}
        onSetStartDate={async (date) => {
          await setPurchaseStartDate(openPurchase.id, date);
        }}
      />
    </div>
  );
}
