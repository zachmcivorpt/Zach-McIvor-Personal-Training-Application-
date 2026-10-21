import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ChevronLeft, Play, CheckCircle2, Lock, Clock3 } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { SoloMountainArt, SoloArtwork } from "./SoloMountainArt";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { programPhases } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { totalWeeksForProgram, currentWeekNumber, phaseForWeekNumber } from "./weekProgress";
import { BottomSheet, PrimaryButton, SecondaryButton } from "../components/ui";

// A purchased program's own overview — which week the customer is in, that
// week's workouts, and a Start button for each that opens
// SoloWorkoutSessionScreen (ClientApp.jsx's own WorkoutSession, adapted —
// see that file). A day already logged this week (soloWorkoutLogs has a
// matching purchaseId+dayId+weekNumber doc) shows as completed instead of
// Start, same "a log's mere existence means the day is done" idea
// Coaching's own workoutLogs already uses.
//
// `content` is this program's full phases/days/exercises, fetched only
// because this customer owns a purchase for it — see SoloAppContext.jsx's
// soloProgramContentByProgramId and firestore.rules' soloProgramContent
// block. `program` itself (the public catalogue doc) never has this data.
function ProgramProgressSheet({ open, onClose, program, content, purchase, onSetStartDate, soloWorkoutLogs, onStartDay }) {
  const [draftDate, setDraftDate] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const phases = programPhases(content);
  const totalWeeks = totalWeeksForProgram(phases);
  const currentWeek = currentWeekNumber(purchase?.startDate, totalWeeks);
  const weekNumber = selectedWeek || currentWeek;
  const current = weekNumber ? phaseForWeekNumber(phases, weekNumber) : null;
  const isFutureWeek = currentWeek != null && weekNumber > currentWeek;

  function isDayDone(dayId) {
    return soloWorkoutLogs.some((l) => l.purchaseId === purchase?.id && l.dayId === dayId && l.weekNumber === weekNumber);
  }

  React.useEffect(() => {
    if (open) {
      setDraftDate(purchase?.startDate || localDateKey());
      setEditingDate(false);
      setSelectedWeek(null);
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

          <div className="flex items-center justify-between mb-1">
            <p className="text-black/40 text-xs">{isFutureWeek ? "UPCOMING WEEK" : "CURRENT WEEK"}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => setSelectedWeek(Math.max(1, weekNumber - 1))}
                disabled={weekNumber <= 1}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-black/5 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => setSelectedWeek(Math.min(totalWeeks, weekNumber + 1))}
                disabled={weekNumber >= totalWeeks}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-black/5 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <p className="text-black text-lg font-extrabold mb-4">
            Week {weekNumber} of {totalWeeks}
            {current?.phase && <span className="text-black/40 text-sm font-semibold"> · {current.phase.name}</span>}
          </p>
          {isFutureWeek && (
            <div className="flex items-center gap-2 bg-black/[0.03] rounded-xl px-3.5 py-2.5 mb-4">
              <Lock size={13} className="text-black/40 shrink-0" />
              <p className="text-black/50 text-xs">
                This week unlocks once Week {currentWeek} is underway — you're browsing ahead, not starting it yet.
              </p>
            </div>
          )}
          {current?.phase && (
            <div className="space-y-2 mb-5">
              {(current.phase.days || []).map((d) => {
                const done = isDayDone(d.id);
                return (
                  <div key={d.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-black text-sm font-semibold">{d.label}</p>
                      <p className="text-black/40 text-xs">{(d.exercises || []).filter((e) => !e.isRest).length} exercises</p>
                    </div>
                    {isFutureWeek ? (
                      <Lock size={14} className="text-black/30 shrink-0" />
                    ) : done ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 shrink-0">
                        <CheckCircle2 size={14} /> Done
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartDay(d, weekNumber)}
                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-black text-white shrink-0"
                      >
                        <Play size={11} fill="white" /> Start
                      </button>
                    )}
                  </div>
                );
              })}
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
  const location = useLocation();
  const { soloPrograms, soloPurchases, soloWorkoutLogs, soloProgramContentByProgramId, setPurchaseStartDate } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [openPurchaseId, setOpenPurchaseId] = useState(null);

  // Switching tabs keeps the window's scroll position; start at the header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Arriving here right after a purchase (see SoloProgramDetailsScreen's
  // post-purchase navigate) opens that program's progress sheet
  // immediately, so the customer lands straight on "pick a start date"
  // instead of just the tab with nothing else happening.
  useEffect(() => {
    const requestedId = location.state?.openPurchaseId;
    if (requestedId && soloPurchases.some((p) => p.id === requestedId)) {
      setOpenPurchaseId(requestedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, soloPurchases]);

  const programsById = useMemo(() => Object.fromEntries(soloPrograms.map((p) => [p.id, p])), [soloPrograms]);
  const openPurchase = soloPurchases.find((p) => p.id === openPurchaseId) || null;
  const openProgram = openPurchase ? programsById[openPurchase.programId] : null;
  const openContent = openPurchase ? soloProgramContentByProgramId[openPurchase.programId] : null;

  function startDay(purchase, program, day, weekNumber) {
    navigate("/solo/workout", {
      state: { purchaseId: purchase.id, programId: program.id, dayId: day.id, weekNumber, day },
    });
  }

  // Everything shown per program is derived from real data: the purchase's
  // start date, the owned soloProgramContent (sessions per week, total
  // sessions, next day), and this customer's own soloWorkoutLogs.
  const ownedRows = useMemo(
    () =>
      soloPurchases
        .map((purchase) => {
          const program = programsById[purchase.programId];
          if (!program) return null;
          return { purchase, program, ...summarizeProgress(purchase, program, soloProgramContentByProgramId[purchase.programId], soloWorkoutLogs) };
        })
        .filter(Boolean),
    [soloPurchases, programsById, soloProgramContentByProgramId, soloWorkoutLogs]
  );
  const active = pickActiveRow(ownedRows, soloWorkoutLogs);
  const glass = {
    backgroundColor: dark ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.62)",
    border: `1px solid ${t.panelBorder}`,
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  };

  return (
    <div className="relative w-full">
      <div className="absolute inset-x-0 top-0 h-80 pointer-events-none">
        <SoloMountainArt fadeTo={t.bg} />
      </div>

      <div className="relative w-full max-w-md mx-auto px-5 pt-6 pb-10">
        <h1 className="sr-only">My Training</h1>
        <img src={SOLO_THEMES.dark.logo} alt="APEX" className="h-11 w-auto mb-6" />

        {ownedRows.length === 0 ? (
          <div className="rounded-3xl px-5 py-10 text-center" style={glass}>
            <CalendarDays size={22} color={t.textFaint} className="mx-auto mb-3" />
            <p className="text-sm mb-4" style={{ color: t.textMuted }}>
              You don't own any programs yet.
            </p>
            <button onClick={() => navigate("/solo/home")} className="text-sm font-bold underline">
              Browse the catalogue
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpenPurchaseId(active.purchase.id)}
              className="w-full text-left rounded-3xl px-5 pt-5 pb-4"
              style={glass}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-extrabold leading-tight">{active.program.name}</h2>
                <ChevronRight size={20} color={t.textMuted} className="mt-1 shrink-0" />
              </div>
              <p className="text-sm mt-1.5" style={{ color: t.textMuted }}>
                {weekLine(active)}
              </p>
              {active.purchase.startDate && <ProgressBar pct={active.pct} t={t} className="mt-4" large />}

              <div className="mt-4 pt-3.5 grid grid-cols-2" style={{ borderTop: `1px solid ${t.panelBorder}` }}>
                <div className="flex items-start gap-2.5 pr-3">
                  <CalendarDays size={18} color={t.textMuted} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px]" style={{ color: t.textMuted }}>
                      Next session
                    </p>
                    <p className="text-sm font-semibold truncate">{active.nextLabel}</p>
                    {active.nextDetail && (
                      <p className="text-[11px]" style={{ color: t.textFaint }}>
                        {active.nextDetail}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2.5 pl-3" style={{ borderLeft: `1px solid ${t.panelBorder}` }}>
                  <Clock3 size={18} color={t.textMuted} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px]" style={{ color: t.textMuted }}>
                      Completed
                    </p>
                    <p className="text-sm font-semibold">
                      {active.sessionsThisWeek != null ? `${active.doneThisWeek} of ${active.sessionsThisWeek}` : "—"}
                    </p>
                    <p className="text-[11px]" style={{ color: t.textFaint }}>
                      sessions this week
                    </p>
                  </div>
                </div>
              </div>
            </button>

            <h2 className="text-lg font-bold mt-8 mb-3">Your Programs</h2>
            <div className="space-y-2.5">
              {ownedRows.map((row) => (
                <button
                  key={row.purchase.id}
                  onClick={() => setOpenPurchaseId(row.purchase.id)}
                  className="w-full flex items-center gap-3.5 rounded-2xl p-2.5 pr-4 text-left"
                  style={glass}
                >
                  <SoloArtwork program={row.program} logo={SOLO_THEMES.dark.logo} className="w-16 h-16 rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{row.program.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                      {weekLine(row)}
                    </p>
                    {row.purchase.startDate && row.pct > 0 && <ProgressBar pct={row.pct} t={t} className="mt-2" />}
                  </div>
                  <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}

      {soloWorkoutLogs.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
            History
          </p>
          <div className="space-y-2">
            {soloWorkoutLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{log.dayLabel}</p>
                  <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                    {new Date(log.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {log.durationMin} min
                  </p>
                </div>
                <p className="text-xs font-semibold shrink-0" style={{ color: t.textMuted }}>
                  {(log.entries || []).reduce((a, e) => a + (e.sets || []).length, 0)} sets
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProgramProgressSheet
        open={!!openPurchase}
        onClose={() => setOpenPurchaseId(null)}
        program={openProgram}
        content={openContent}
        purchase={openPurchase}
        soloWorkoutLogs={soloWorkoutLogs}
        onStartDay={(day, weekNumber) => startDay(openPurchase, openProgram, day, weekNumber)}
        onSetStartDate={async (date) => {
          await setPurchaseStartDate(openPurchase.id, date);
        }}
      />
      </div>
    </div>
  );
}

function ProgressBar({ pct, t, className = "", large = false }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex-1 rounded-full overflow-hidden ${large ? "h-2.5" : "h-1.5"}`} style={{ backgroundColor: t.chipBg }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: MEASURE_BLUE }} />
      </div>
      <span className={`${large ? "text-sm" : "text-[11px]"} font-semibold tabular-nums`} style={{ color: t.textMuted }}>
        {pct}%
      </span>
    </div>
  );
}

function weekLine(row) {
  if (!row.purchase.startDate) return "Set a start date";
  const parts = [`Week ${row.weekNumber} of ${row.totalWeeks}`];
  if (row.sessionsThisWeek != null) parts.push(`${row.sessionsThisWeek} session${row.sessionsThisWeek === 1 ? "" : "s"}/week`);
  return parts.join(" · ");
}

// The program a customer is most likely "on": the one they last logged a
// workout for, else the most recently started one, else the first owned.
function pickActiveRow(rows, logs) {
  if (rows.length === 0) return null;
  const latestLog = logs.reduce((best, l) => (!best || (l.date || 0) > (best.date || 0) ? l : best), null);
  const fromLog = latestLog && rows.find((r) => r.purchase.id === latestLog.purchaseId);
  if (fromLog) return fromLog;
  const started = rows.filter((r) => r.purchase.startDate).sort((a, b) => (a.purchase.startDate < b.purchase.startDate ? 1 : -1));
  return started[0] || rows[0];
}

export function summarizeProgress(purchase, program, content, logs) {
  const phases = programPhases(content);
  // Week count comes from the public doc's weekOnePreview so it's
  // available before the gated content listener resolves.
  const totalWeeks = program.weekOnePreview?.totalWeeks || totalWeeksForProgram(phases);
  const weekNumber = currentWeekNumber(purchase.startDate, totalWeeks);
  const purchaseLogs = logs.filter((l) => l.purchaseId === purchase.id);
  // A day counts once per week however many times it was logged.
  const doneKeys = new Set(purchaseLogs.map((l) => `${l.weekNumber}:${l.dayId}`));
  const totalSessions = phases.reduce((sum, p) => sum + (p.durationWeeks || 0) * (p.days || []).length, 0);
  const pct = totalSessions > 0 ? Math.min(100, Math.round((doneKeys.size / totalSessions) * 100)) : 0;

  const current = weekNumber ? phaseForWeekNumber(phases, weekNumber) : null;
  const days = current?.phase?.days || null;
  const sessionsThisWeek = days ? days.length : null;
  const doneThisWeek = days ? days.filter((d) => doneKeys.has(`${weekNumber}:${d.id}`)).length : 0;

  let nextLabel = "—";
  let nextDetail = null;
  if (!purchase.startDate) {
    nextLabel = "Set a start date";
  } else if (days) {
    const next = days.find((d) => !doneKeys.has(`${weekNumber}:${d.id}`));
    if (next) {
      nextLabel = next.label || "Workout";
      const past = purchaseLogs.filter((l) => l.dayId === next.id && l.durationMin > 0);
      const exerciseCount = (next.exercises || []).filter((e) => !e.isRest).length;
      nextDetail = past.length
        ? `~${Math.round(past.reduce((a, l) => a + l.durationMin, 0) / past.length)} min`
        : `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`;
    } else {
      nextLabel = "Week complete";
    }
  }

  return { totalWeeks, weekNumber, pct, sessionsThisWeek, doneThisWeek, nextLabel, nextDetail };
}
