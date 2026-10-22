import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ChevronLeft, Play, CheckCircle2, Lock, Dumbbell, HeartPulse, Scale, Camera, Droplet, Minus, Plus } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { SoloArtwork } from "./SoloArtwork";
import { isRecoveryAddon } from "./recommendations";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { programPhases } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { totalWeeksForProgram, currentWeekNumber, phaseForWeekNumber } from "./weekProgress";
import { sessionDateKeys, sessionDayLabel, buildSoloCalendar, calendarItemTarget, mondayOf, addDays } from "./soloCalendar";
import SoloGlassBox from "./SoloGlassBox";
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
function ProgramProgressSheet({ open, onClose, program, content, purchase, onSetStartDate, soloWorkoutLogs, onStartDay, dark, t }) {
  const rowStyle = { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` };
  const inputStyle = { backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: dark ? "dark" : "light" };
  const [draftDate, setDraftDate] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const phases = programPhases(content);
  const totalWeeks = totalWeeksForProgram(phases);
  const currentWeek = currentWeekNumber(purchase?.startDate, totalWeeks);
  const weekNumber = selectedWeek || currentWeek;
  const current = weekNumber ? phaseForWeekNumber(phases, weekNumber) : null;
  const isFutureWeek = currentWeek != null && weekNumber > currentWeek;
  const today = localDateKey();
  const dateKeys = sessionDateKeys(purchase?.startDate, weekNumber, (current?.phase?.days || []).length);

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
    <BottomSheet open={open} onClose={onClose} title={program?.name} wide dark={dark}>
      <div style={{ color: t.text }}>
      {!purchase?.startDate ? (
        <div>
          <p className="text-sm mb-4" style={{ color: t.textMuted }}>Pick the date Week 1, Day 1 starts — everything else is tracked from there.</p>
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm mb-4"
            style={inputStyle}
          />
          <PrimaryButton dark={dark} className="w-full" onClick={() => onSetStartDate(draftDate)} disabled={!draftDate}>
            SET START DATE
          </PrimaryButton>
        </div>
      ) : (
        <div>
          <p className="text-xs mb-1" style={{ color: t.textFaint }}>STARTED</p>
          <p className="text-sm font-semibold mb-4">
            {new Date(`${purchase.startDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </p>

          <div className="flex items-center justify-between mb-1">
            <p className="text-xs" style={{ color: t.textFaint }}>{isFutureWeek ? "UPCOMING WEEK" : "CURRENT WEEK"}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => setSelectedWeek(Math.max(1, weekNumber - 1))}
                disabled={weekNumber <= 1}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                style={rowStyle}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => setSelectedWeek(Math.min(totalWeeks, weekNumber + 1))}
                disabled={weekNumber >= totalWeeks}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                style={rowStyle}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <p className="text-lg font-extrabold mb-4">
            Week {weekNumber} of {totalWeeks}
            {current?.phase && <span className="text-sm font-semibold" style={{ color: t.textFaint }}> · {current.phase.name}</span>}
          </p>
          {isFutureWeek && (
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-4" style={rowStyle}>
              <Lock size={13} color={t.textFaint} className="shrink-0" />
              <p className="text-xs" style={{ color: t.textMuted }}>
                This week unlocks once Week {currentWeek} is underway — you're browsing ahead, not starting it yet.
              </p>
            </div>
          )}
          {current?.phase && (
            <div className="space-y-2 mb-5">
              {(current.phase.days || []).map((d, i) => {
                const done = isDayDone(d.id);
                const dateKey = dateKeys[i];
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={rowStyle}>
                    <SessionDate dateKey={dateKey} today={today} t={t} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{d.label}</p>
                      <p className="text-xs" style={{ color: t.textFaint }}>
                        {sessionDayLabel(dateKey, today)} · {exerciseCountLabel(d)}
                      </p>
                    </div>
                    {isFutureWeek ? (
                      <Lock size={14} color={t.textFaint} className="shrink-0" />
                    ) : done ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 shrink-0">
                        <CheckCircle2 size={14} /> Done
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartDay(d, weekNumber)}
                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.text, color: t.bg }}
                      >
                        <Play size={11} fill="currentColor" /> Start
                      </button>
                    )}
                  </div>
                );
              })}
              {(current.phase.days || []).length === 0 && <p className="text-xs" style={{ color: t.textFaint }}>No workouts in this phase yet.</p>}
            </div>
          )}
          {!editingDate ? (
            <SecondaryButton dark={dark} className="w-full" type="button" onClick={() => setEditingDate(true)}>
              Change start date
            </SecondaryButton>
          ) : (
            <div>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm mb-3"
                style={inputStyle}
              />
              <PrimaryButton
                dark={dark}
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
      </div>
    </BottomSheet>
  );
}

export default function SoloMyTrainingScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    soloPrograms,
    soloPurchases,
    soloWorkoutLogs,
    soloProgramContentByProgramId,
    setPurchaseStartDate,
    soloCurrentUser,
    soloWeighIns,
    soloBodyMetrics,
    soloProgressPhotos,
    soloWaterLogs,
    addSoloWater,
    setSoloWaterGoal,
  } = useSoloApp();
  const activeAddon = soloPrograms.find((p) => p.id === soloCurrentUser?.recoveryAddon?.programId && p.status === "published" && isRecoveryAddon(p)) || null;
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
  const glass = soloGlass(t);
  const todayKey = localDateKey();

  // The day view: a Mon–Sun strip, and that day's plan taken from the same
  // schedule the Calendar builds (buildSoloCalendar), so the two always
  // agree on what's on which day.
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const weekStart = mondayOf(selectedKey);
  const weekKeys = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const addonProgram = programsById[soloCurrentUser?.recoveryAddon?.programId];
  const recoveryAddon = addonProgram && addonProgram.status === "published" && isRecoveryAddon(addonProgram) ? addonProgram : null;
  const byDate = useMemo(
    () =>
      buildSoloCalendar({
        purchases: soloPurchases,
        programsById,
        contentByProgramId: soloProgramContentByProgramId,
        workoutLogs: soloWorkoutLogs,
        weighIns: soloWeighIns,
        bodyMetrics: soloBodyMetrics,
        progressPhotos: soloProgressPhotos,
        recoveryAddon,
        accountCreatedAt: soloCurrentUser?.createdAt,
        fromKey: weekStart,
        toKey: addDays(weekStart, 6),
      }),
    [soloPurchases, programsById, soloProgramContentByProgramId, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloProgressPhotos, recoveryAddon, soloCurrentUser?.createdAt, weekStart]
  );
  const dayItems = [...(byDate[selectedKey] || [])].sort((a, b) => ITEM_ORDER[a.type] - ITEM_ORDER[b.type]);

  function openItem(item) {
    const target = calendarItemTarget(item, { todayKey, soloUid: soloCurrentUser?.id, contentByProgramId: soloProgramContentByProgramId });
    if (target) navigate(target.path, target.state ? { state: target.state } : undefined);
  }

  return (
    <div className="relative w-full">
      <div className="relative w-full max-w-md mx-auto px-3 pt-6 pb-10">
        <h1 className="sr-only">My Training</h1>
        <img src={t.logo} alt="APEX" className="w-auto mb-5" style={{ height: 19 }} />

        <WeekStrip
          weekKeys={weekKeys}
          selectedKey={selectedKey}
          todayKey={todayKey}
          byDate={byDate}
          onSelect={setSelectedKey}
          onShiftWeek={(n) => setSelectedKey(addDays(weekStart, n * 7))}
          onToday={() => setSelectedKey(todayKey)}
          t={t}
        />

        <DayPlan
          dateKey={selectedKey}
          todayKey={todayKey}
          items={dayItems}
          ownsPrograms={ownedRows.length > 0}
          onOpen={openItem}
          target={(item) => calendarItemTarget(item, { todayKey, soloUid: soloCurrentUser?.id, contentByProgramId: soloProgramContentByProgramId })}
          onBrowse={() => navigate("/solo/home", { state: { soloTab: "catalogue" } })}
          t={t}
        />

        <WaterCard
          dateKey={selectedKey}
          todayKey={todayKey}
          ml={soloWaterLogs.find((w) => w.date === selectedKey)?.ml || 0}
          goalMl={soloCurrentUser?.waterGoalMl || DEFAULT_WATER_GOAL_ML}
          onAdd={(delta, current) => soloCurrentUser && addSoloWater(soloCurrentUser.id, selectedKey, delta, current)}
          onSetGoal={(goal) => soloCurrentUser && setSoloWaterGoal(soloCurrentUser.id, goal)}
          dark={dark}
          t={t}
        />

        {ownedRows.length > 0 && (
          <>
            <h2 className="text-lg font-bold mt-8 mb-3">Your Programs</h2>
            <div className="space-y-2.5">
              {ownedRows.map((row) => (
                <button
                  key={row.purchase.id}
                  onClick={() => setOpenPurchaseId(row.purchase.id)}
                  className="w-full flex items-center gap-3.5 rounded-2xl p-2.5 pr-4 text-left"
                  style={glass}
                >
                  <SoloArtwork program={row.program} t={t} className="w-14 h-14 rounded-xl shrink-0" />
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

        {activeAddon && (
          <>
            <h2 className="text-lg font-bold mt-8 mb-3">Recovery Add-on</h2>
            <button
              onClick={() => navigate("/solo/calendar")}
              className="w-full flex items-center gap-3.5 rounded-2xl p-2.5 pr-4 text-left"
              style={glass}
            >
              <SoloArtwork program={activeAddon} t={t} className="w-14 h-14 rounded-xl shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{activeAddon.name}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                  Free · on your rest days — see your calendar
                </p>
              </div>
              <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
            </button>
          </>
        )}

      {soloWorkoutLogs.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
            History
          </p>
          <div className="space-y-2">
            {soloWorkoutLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-2xl px-4 py-3" style={glass}>
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
        dark={dark}
        t={t}
        onStartDay={(day, weekNumber) => startDay(openPurchase, openProgram, day, weekNumber)}
        onSetStartDate={async (date) => {
          await setPurchaseStartDate(openPurchase.id, date);
        }}
      />
      </div>
    </div>
  );
}

const ITEM_ORDER = { workout: 0, addon: 1, recovery: 2, bodystats: 3, photos: 4 };
const ITEM_ICON = { workout: Dumbbell, addon: HeartPulse, recovery: HeartPulse, bodystats: Scale, photos: Camera };
const DEFAULT_WATER_GOAL_ML = 2500;
const WATER_GOALS_ML = [2000, 2500, 3000, 3500, 4000];

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd …
function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix}`;
}

function litres(ml) {
  return String(Math.round(ml / 10) / 100);
}

// Mon–Sun for the selected week: weekday letter over the date figure, a dot
// under any day with a session still to do, a check once it's all done.
function WeekStrip({ weekKeys, selectedKey, todayKey, byDate, onSelect, onShiftWeek, onToday, t }) {
  const first = new Date(`${weekKeys[0]}T00:00:00`);
  const showToday = !weekKeys.includes(todayKey) || selectedKey !== todayKey;
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <div className="flex items-center gap-1.5">
          {showToday && (
            <button type="button" onClick={onToday} className="text-xs font-semibold px-3 h-7 rounded-full" style={{ ...soloGlass(t), color: MEASURE_BLUE }}>
              Today
            </button>
          )}
          <button type="button" aria-label="Previous week" onClick={() => onShiftWeek(-1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={soloGlass(t)}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" aria-label="Next week" onClick={() => onShiftWeek(1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={soloGlass(t)}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <SoloGlassBox t={t} className="rounded-2xl grid grid-cols-7 p-1.5">
        {weekKeys.map((key) => {
          const d = new Date(`${key}T00:00:00`);
          const sessions = (byDate[key] || []).filter((i) => i.type === "workout" || i.type === "addon");
          const allDone = sessions.length > 0 && sessions.every((i) => i.done);
          const selected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              aria-pressed={selected}
              className="flex flex-col items-center py-2 rounded-xl"
              style={selected ? { backgroundColor: t.text, color: t.bg } : undefined}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: selected ? t.bg : isToday ? MEASURE_BLUE : t.textFaint }}>
                {d.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              <span className="text-lg font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: selected ? t.bg : isToday ? MEASURE_BLUE : t.text }}>
                {d.getDate()}
              </span>
              <span className="h-3 mt-0.5 flex items-center">
                {allDone ? (
                  <CheckCircle2 size={10} color={selected ? t.bg : MEASURE_BLUE} />
                ) : sessions.length > 0 ? (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selected ? t.bg : MEASURE_BLUE }} />
                ) : null}
              </span>
            </button>
          );
        })}
      </SoloGlassBox>
    </div>
  );
}

// Everything on the selected day, in one place. The session leads — a
// slightly larger card with a blue edge, its name, program/week, exercise
// count and Start — with rest-day recovery and Monday check-ins as smaller
// rows underneath.
function DayPlan({ dateKey, todayKey, items, ownsPrograms, onOpen, target, onBrowse, t }) {
  const d = new Date(`${dateKey}T00:00:00`);
  const relative = dateKey === todayKey ? "Today" : sessionDayLabel(dateKey, todayKey);
  const dayName = ["Today", "Tomorrow", "Yesterday"].includes(relative) ? relative : d.toLocaleDateString("en-AU", { weekday: "long" });
  const heading = `${dayName}, ${ordinal(d.getDate())} ${d.toLocaleDateString("en-AU", { month: "long" })}`;
  const sessions = items.filter((i) => i.type === "workout" || i.type === "addon");
  const others = items.filter((i) => i.type !== "workout" && i.type !== "addon");
  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold leading-tight mb-3">{heading}</h2>
      {items.length === 0 ? (
        <div className="rounded-3xl px-5 py-8 text-center" style={soloGlass(t)}>
          {ownsPrograms ? (
            <>
              <p className="text-lg font-extrabold">Rest day</p>
              <p className="text-sm mt-1" style={{ color: t.textMuted }}>
                Nothing scheduled — recover and come back fresh.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: t.textMuted }}>
                You don't own any programs yet.
              </p>
              <button type="button" onClick={onBrowse} className="text-sm font-bold underline">
                Browse the catalogue
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((item) => (
            <SessionHero key={item.id} item={item} actionable={!!target(item)} onStart={() => onOpen(item)} future={dateKey > todayKey} t={t} />
          ))}
          {others.length > 0 && (
            <SoloGlassBox t={t} className="rounded-2xl">
              {others.map((item, i) => {
                const Icon = ITEM_ICON[item.type] || CalendarDays;
                const actionable = !!target(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => actionable && onOpen(item)}
                    disabled={!actionable}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                    style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}
                  >
                    <Icon size={16} color={t.textMuted} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{item.title}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: t.textMuted }}>
                        {item.subtitle}
                      </p>
                    </div>
                    {item.done ? (
                      <CheckCircle2 size={16} color={MEASURE_BLUE} className="shrink-0" />
                    ) : actionable ? (
                      <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                    ) : (
                      <Lock size={14} color={t.textFaint} className="shrink-0" />
                    )}
                  </button>
                );
              })}
            </SoloGlassBox>
          )}
        </div>
      )}
    </div>
  );
}

function SessionHero({ item, actionable, onStart, future, t }) {
  const exercises = (item.day?.exercises || []).filter((e) => !e.isRest).length;
  const Icon = item.type === "addon" ? HeartPulse : Dumbbell;
  return (
    <button
      type="button"
      onClick={() => actionable && onStart()}
      disabled={!actionable}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left disabled:cursor-default"
      style={{ ...soloGlass(t), borderColor: item.done ? t.panelBorder : "rgba(47,143,255,0.45)" }}
    >
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(47,143,255,0.14)" }}>
        <Icon size={18} color={MEASURE_BLUE} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold leading-tight truncate">{item.title}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: t.textMuted }}>
          {item.subtitle}
          {exercises > 0 ? ` · ${exercises} exercise${exercises === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      {item.done ? (
        <span className="flex items-center gap-1 text-xs font-bold shrink-0" style={{ color: MEASURE_BLUE }}>
          <CheckCircle2 size={15} /> Done
        </span>
      ) : actionable ? (
        <span className="flex items-center gap-1 text-xs font-bold px-3.5 py-2 rounded-full shrink-0" style={{ backgroundColor: t.text, color: t.bg }}>
          <Play size={11} fill="currentColor" /> Start
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-semibold shrink-0" style={{ color: t.textFaint }}>
          <Lock size={13} /> {future ? "On the day" : "Locked"}
        </span>
      )}
    </button>
  );
}

// A glass that fills to the day's progress. Each add drops a droplet into
// it (falling to the water line, then a ripple) — `drops` is a counter so
// every tap restarts the animation, even several in a row.
const CUP_W = 64;
const CUP_H = 84;
const CUP_TOP = 8; // inside rim
const CUP_BOTTOM = 78; // inside base
const CUP_PATH = "M6 6 H58 L52 74 Q51.4 80 45.5 80 H18.5 Q12.6 80 12 74 Z";

function WaterGlass({ pct, drops, dark }) {
  const level = CUP_BOTTOM - ((CUP_BOTTOM - CUP_TOP) * pct) / 100; // y of the water line
  const clipId = "solo-water-cup";
  return (
    <div className="relative shrink-0" style={{ width: CUP_W, height: CUP_H }} aria-hidden="true">
      <svg width={CUP_W} height={CUP_H} viewBox={`0 0 ${CUP_W} ${CUP_H}`} className="absolute inset-0 overflow-visible">
        <defs>
          <clipPath id={clipId}>
            <path d={CUP_PATH} />
          </clipPath>
        </defs>
        <path d={CUP_PATH} fill={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"} />
        <g clipPath={`url(#${clipId})`}>
          <g
            style={{
              transform: `translateY(${level}px)`,
              opacity: pct > 0 ? 1 : 0,
              transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms",
            }}
          >
            <path d="M-20 3 Q-4 -2 12 3 T44 3 T76 3 T108 3 V120 H-20 Z" fill={MEASURE_BLUE} opacity="0.9" className="solo-water-wave" />
            <rect x="-20" y="3" width="140" height="120" fill={MEASURE_BLUE} opacity="0.9" />
            <rect x="16" y="10" width="5" height="120" rx="2.5" fill="#fff" opacity="0.18" />
          </g>
        </g>
        <path d={CUP_PATH} fill="none" stroke={dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)"} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {drops > 0 && (
        <span key={drops} className="absolute left-1/2 top-0 pointer-events-none" style={{ "--solo-drop-fall": `${level - 6}px` }}>
          <Droplet size={12} color={MEASURE_BLUE} fill={MEASURE_BLUE} className="solo-water-drop" />
          <span className="solo-water-ripple" style={{ top: `${level}px`, borderColor: dark ? "rgba(255,255,255,0.7)" : MEASURE_BLUE }} />
        </span>
      )}
      <style>{`
        .solo-water-drop { position: absolute; left: -6px; top: -14px; animation: solo-water-drop 520ms cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        @keyframes solo-water-drop { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 92% { opacity: 1; } 100% { transform: translateY(var(--solo-drop-fall)); opacity: 0; } }
        .solo-water-ripple { position: absolute; left: -10px; width: 20px; height: 6px; margin-top: -3px; border: 1.5px solid; border-radius: 50%; opacity: 0; animation: solo-water-ripple 520ms ease-out 470ms forwards; }
        @keyframes solo-water-ripple { 0% { transform: scale(0.3); opacity: 0.9; } 100% { transform: scale(1.8); opacity: 0; } }
        .solo-water-wave { animation: solo-water-wave 3.2s linear infinite; }
        @keyframes solo-water-wave { from { transform: translateX(0); } to { transform: translateX(-32px); } }
        @media (prefers-reduced-motion: reduce) { .solo-water-drop, .solo-water-ripple, .solo-water-wave { animation: none; display: none; } }
      `}</style>
    </div>
  );
}

// Water for the selected day, kept to one slim row so the session stays
// the focus: a small glass that fills (a drop falls in on every add), the
// amount against the goal (tap to change the goal), and quick buttons.
// Future days can't be logged.
function WaterCard({ dateKey, todayKey, ml, goalMl, onAdd, onSetGoal, dark, t }) {
  const [goalOpen, setGoalOpen] = useState(false);
  const [drops, setDrops] = useState(0);
  const future = dateKey > todayKey;
  const pct = Math.min(100, Math.round((ml / goalMl) * 100));
  const chip = { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` };
  const add = (delta) => {
    if (delta > 0) setDrops((n) => n + 1);
    onAdd(delta, ml);
  };
  const scale = 0.5;
  return (
    <SoloGlassBox t={t} className="rounded-2xl px-3.5 py-2.5 mt-3">
      <div className="flex items-center gap-3">
        <div className="shrink-0" style={{ width: CUP_W * scale, height: CUP_H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <WaterGlass pct={pct} drops={drops} dark={dark} />
          </div>
        </div>
        <button type="button" onClick={() => setGoalOpen(true)} className="min-w-0 flex-1 text-left" aria-label={`Water ${litres(ml)} of ${litres(goalMl)} litres — change goal`}>
          <p className="text-[11px] font-semibold" style={{ color: t.textFaint }}>
            Water{pct >= 100 ? " · goal reached" : ` · ${pct}%`}
          </p>
          <p className="leading-tight mt-0.5">
            <span className="text-lg font-extrabold tabular-nums">{litres(ml)}</span>
            <span className="text-xs font-semibold ml-1" style={{ color: t.textMuted }}>
              / {litres(goalMl)} L
            </span>
          </p>
        </button>
        {future ? (
          <p className="text-[11px] shrink-0" style={{ color: t.textFaint }}>
            Log on the day
          </p>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="Remove 250 ml"
              onClick={() => add(-250)}
              disabled={ml <= 0}
              className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
              style={chip}
            >
              <Minus size={14} />
            </button>
            <button type="button" onClick={() => add(250)} className="h-9 px-3 rounded-full text-xs font-bold flex items-center gap-0.5" style={chip}>
              <Plus size={12} /> 250 ml
            </button>
            <button
              type="button"
              onClick={() => add(500)}
              className="h-9 px-3 rounded-full text-xs font-bold flex items-center gap-0.5"
              style={{ backgroundColor: t.text, color: t.bg }}
            >
              <Plus size={12} /> 500 ml
            </button>
          </div>
        )}
      </div>
      <BottomSheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Daily water goal" dark={dark}>
        <div style={{ color: t.text }} className="space-y-2">
          {WATER_GOALS_ML.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                onSetGoal(g);
                setGoalOpen(false);
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold"
              style={
                g === goalMl
                  ? { backgroundColor: "rgba(47,143,255,0.16)", border: `1px solid ${MEASURE_BLUE}` }
                  : { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}` }
              }
            >
              {litres(g)} L a day
              {g === goalMl && <CheckCircle2 size={16} color={MEASURE_BLUE} />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </SoloGlassBox>
  );
}

// A session's scheduled date as a figure: short weekday over the day of the
// month, in the accent colour when it's today.
function SessionDate({ dateKey, today, t }) {
  if (!dateKey) return null;
  const d = new Date(`${dateKey}T00:00:00`);
  const color = dateKey === today ? MEASURE_BLUE : t.text;
  return (
    <div className="w-9 shrink-0 text-center leading-none">
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: dateKey === today ? MEASURE_BLUE : t.textFaint }}>
        {d.toLocaleDateString(undefined, { weekday: "short" })}
      </p>
      <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color }}>
        {d.getDate()}
      </p>
    </div>
  );
}

function exerciseCountLabel(day) {
  const n = (day.exercises || []).filter((e) => !e.isRest).length;
  return `${n} exercise${n === 1 ? "" : "s"}`;
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
  const dateKeys = days ? sessionDateKeys(purchase.startDate, weekNumber, days.length) : [];
  const weekSessions = (days || []).map((day, i) => ({ day, dateKey: dateKeys[i], done: doneKeys.has(`${weekNumber}:${day.id}`) }));

  let nextLabel = "—";
  let nextDetail = null;
  if (!purchase.startDate) {
    nextLabel = "Set a start date";
  } else if (days) {
    const nextIndex = days.findIndex((d) => !doneKeys.has(`${weekNumber}:${d.id}`));
    const next = nextIndex >= 0 ? days[nextIndex] : null;
    if (next) {
      nextLabel = next.label || "Workout";
      const past = purchaseLogs.filter((l) => l.dayId === next.id && l.durationMin > 0);
      const detail = past.length ? `~${Math.round(past.reduce((a, l) => a + l.durationMin, 0) / past.length)} min` : exerciseCountLabel(next);
      nextDetail = `${sessionDayLabel(dateKeys[nextIndex])} · ${detail}`;
    } else {
      nextLabel = "Week complete";
    }
  }

  return { totalWeeks, weekNumber, pct, sessionsThisWeek, doneThisWeek, nextLabel, nextDetail, weekSessions, phaseName: current?.phase?.name || null };
}
