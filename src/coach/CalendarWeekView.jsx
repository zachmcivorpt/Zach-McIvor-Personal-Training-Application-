// #317 (owner, 2026-11-22, approved reference): the coach's client Calendar
// on PHONES — Month / Week / Day, opening on Week. Week = the seven days
// stacked, each with its workout(s), assigned habits with ticks, and cardio;
// then the week's totals. Day = one day the same way. Everything comes from
// CalendarPanel's own itemsForDate (calendarWeek.js); taps open the SAME
// sheets the month grid opens. Desktop keeps the month grid unchanged.
import React from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Dumbbell, Plus, Check, Circle, CalendarDays, ListChecks, Activity } from "lucide-react";
import { MEASURE_BLUE, GOAL_GREEN, OVER_RED } from "../theme";
import { GLASS, GLASS_BLUE } from "./darkUI";
import { weekKeys, weekRangeLabel, dayLabel, splitDay, weekSummary, addDays, keyToDate } from "./calendarWeek";

const CAL_VIEWS = [
  ["month", "Month"],
  ["week", "Week"],
  ["day", "Day"],
];

// Month / Week / Day pills — shown on phones above every view.
export function CalendarViewSwitch({ view, onChange }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full" style={GLASS} role="tablist" aria-label="Calendar view">
      {CAL_VIEWS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className="flex-1 px-3.5 py-1.5 rounded-full text-[13px] font-semibold text-white"
          style={view === id ? GLASS_BLUE : { border: "1px solid transparent" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ‹ Mon 24 – Sun 30 Nov ⌄ › — the label opens a date picker to jump anywhere.
function RangeNav({ label, onPrev, onNext, valueKey, onPick, unit }) {
  return (
    <div className="flex items-center rounded-full min-w-0 w-full" style={GLASS}>
      <button onClick={onPrev} aria-label={`Previous ${unit}`} className="w-9 h-9 flex items-center justify-center text-white shrink-0">
        <ChevronLeft size={17} />
      </button>
      <label className="relative flex-1 min-w-0 flex items-center justify-center gap-1 text-white text-[13px] font-semibold cursor-pointer">
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0 text-white/70" />
        <input
          type="date"
          aria-label={`Pick a ${unit}`}
          value={valueKey}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      <button onClick={onNext} aria-label={`Next ${unit}`} className="w-9 h-9 flex items-center justify-center text-white shrink-0">
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

const STATUS = {
  done: { text: "Completed", color: GOAL_GREEN },
  planned: { text: "Planned", color: MEASURE_BLUE },
  missed: { text: "Missed", color: OVER_RED },
};

function WorkoutCard({ item, onOpen }) {
  const s = STATUS[item.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="week-workout"
      data-status={item.status}
      className="w-full flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left"
      style={item.status === "done" ? GLASS_BLUE : GLASS}
    >
      <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(47,143,255,0.14)" }}>
        <Dumbbell size={16} className="text-white" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-white text-[14.5px] font-bold truncate leading-tight">{item.label}</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-white/75">
          {item.time && <span>{item.time} ·</span>}
          <span>{s.text}</span>
          {item.status === "done" ? (
            <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: s.color }}>
              <Check size={10} strokeWidth={3.5} className="text-black" />
            </span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
          )}
        </span>
      </span>
      <ChevronRight size={18} className="text-white shrink-0" />
    </button>
  );
}

function HabitRow({ habits, future }) {
  if (habits.length === 0) return <p className="text-white/40 text-[12px] px-1">No habits</p>;
  return (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0" data-testid="week-habits">
      {habits.map((h) => (
        <span key={h.key} className="flex items-center gap-0.5 text-[11.5px] text-white/85 min-w-0">
          <span className="truncate max-w-[92px]">{h.label}</span>
          {h.done ? (
            <Check size={13} strokeWidth={3} style={{ color: GOAL_GREEN }} aria-label="done" />
          ) : (
            <Circle size={10} className={future ? "text-white/25" : "text-white/45"} aria-label="not done" />
          )}
        </span>
      ))}
    </div>
  );
}

function CardioCell({ cardio }) {
  return (
    <div className="flex items-center gap-1 shrink-0 pl-2" style={{ borderLeft: "1px solid rgba(255,255,255,0.14)" }} data-testid="week-cardio">
      <Activity size={16} style={{ color: MEASURE_BLUE }} />
      <span className="leading-tight">
        <span className="block text-white/85 text-[11.5px]">Cardio</span>
        <span className="flex items-center gap-1 text-white text-[11.5px]">
          {cardio.sessions > 0 ? (
            <>
              {cardio.minutes > 0 ? `${cardio.minutes} min` : `${cardio.sessions} logged`}
              <Check size={12} strokeWidth={3} style={{ color: GOAL_GREEN }} />
            </>
          ) : (
            "–"
          )}
        </span>
      </span>
    </div>
  );
}

function DayRow({ dayKey, todayKey, items, onOpenDay, onOpenWorkout, onAddSession, expanded }) {
  const split = splitDay(items, dayKey, todayKey);
  const d = keyToDate(dayKey);
  const isToday = dayKey === todayKey;
  return (
    <div
      data-testid="week-day"
      data-date={dayKey}
      className="rounded-2xl px-2.5 py-2 flex gap-2.5"
      style={isToday ? { ...GLASS, boxShadow: `inset 0 0 0 1px ${MEASURE_BLUE}` } : GLASS}
    >
      {!expanded && (
        <button type="button" onClick={() => onOpenDay(dayKey)} className="w-11 shrink-0 text-left pt-1" aria-label={`Open ${dayLabel(dayKey)}`}>
          <span className="block text-white text-[14px] font-semibold">{d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })}</span>
          <span className="block text-white text-[22px] font-bold leading-none mt-0.5" style={isToday ? { color: MEASURE_BLUE } : undefined}>
            {d.getUTCDate()}
          </span>
        </button>
      )}
      <div className="flex-1 min-w-0 space-y-1.5">
        {split.workouts.length > 0 ? (
          split.workouts.map((w) => <WorkoutCard key={w.key} item={w} onOpen={() => onOpenWorkout(dayKey)} />)
        ) : (
          <button
            type="button"
            onClick={() => onAddSession(dayKey)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-2 text-white/85 text-[13px] font-semibold"
            style={{ border: "1px dashed rgba(255,255,255,0.22)" }}
          >
            <Plus size={16} /> Add Session
          </button>
        )}
        <div className="flex items-center gap-2 rounded-xl px-2.5 py-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex-1 min-w-0">
            <HabitRow habits={split.habits} future={dayKey > todayKey} />
          </div>
          <CardioCell cardio={split.cardio} />
        </div>
        {(split.other.length > 0 || (expanded && split.nutrition)) && (
          <button type="button" onClick={() => onOpenDay(dayKey)} className="block text-left text-white/60 text-[11.5px] px-1">
            {[...split.other.map((o) => `${o.label}${o.done ? " ✓" : ""}`), ...(expanded && split.nutrition ? [split.nutrition.label] : [])].join(" · ")}
          </button>
        )}
      </div>
    </div>
  );
}

function WeekSummary({ summary }) {
  const { workoutsDone, workoutsTotal, habitsDone, habitsDue, cardioSessions, cardioMinutes } = summary;
  const pct = workoutsTotal ? workoutsDone / workoutsTotal : 0;
  const R = 24;
  const C = 2 * Math.PI * R;
  return (
    <div className="rounded-2xl px-3 py-3 flex items-center gap-3" style={GLASS} data-testid="week-summary">
      <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0" aria-hidden="true">
        <circle cx="30" cy="30" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
        <circle cx="30" cy="30" r={R} fill="none" stroke={MEASURE_BLUE} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 30 30)" />
        <text x="30" y="34" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">{workoutsTotal ? `${workoutsDone}/${workoutsTotal}` : "–"}</text>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-white/70 text-[12px]">This Week</p>
        <p className="text-white text-[17px] font-bold leading-tight whitespace-nowrap">
          {workoutsTotal ? `${workoutsDone} / ${workoutsTotal}` : "0"} Workouts
        </p>
      </div>
      <div className="shrink-0 space-y-1 pl-3" style={{ borderLeft: "1px solid rgba(255,255,255,0.14)" }}>
        <p className="flex items-center gap-1.5 text-white text-[12.5px]">
          <ListChecks size={14} style={{ color: MEASURE_BLUE }} />
          {habitsDue ? `${habitsDone} / ${habitsDue}` : "–"} Habits
        </p>
        <p className="flex items-center gap-1.5 text-white text-[12.5px]">
          <Activity size={14} style={{ color: MEASURE_BLUE }} />
          {cardioSessions ? `${cardioSessions} Cardio · ${cardioMinutes} min` : "No cardio"}
        </p>
      </div>
    </div>
  );
}

// view: "week" | "day". `itemsFor(key)` = CalendarPanel's itemsForDate.
export default function CalendarWeekView({ view, onViewChange, anchorKey, onAnchorChange, todayKey, itemsFor, onOpenDay, onOpenWorkout, onAddSession }) {
  const isWeek = view === "week";
  const keys = isWeek ? weekKeys(anchorKey) : [anchorKey];
  const days = keys.map((key) => {
    const items = itemsFor(key);
    return { key, items, split: splitDay(items, key, todayKey) };
  });
  const summary = weekSummary(isWeek ? days : [], todayKey);
  return (
    <div className="space-y-2" data-testid={isWeek ? "calendar-week" : "calendar-day"}>
      <div className="flex flex-col gap-2">
        <CalendarViewSwitch view={view} onChange={onViewChange} />
        <RangeNav
          unit={isWeek ? "week" : "day"}
          label={isWeek ? weekRangeLabel(anchorKey) : dayLabel(anchorKey)}
          valueKey={anchorKey}
          onPick={onAnchorChange}
          onPrev={() => onAnchorChange(addDays(anchorKey, isWeek ? -7 : -1))}
          onNext={() => onAnchorChange(addDays(anchorKey, isWeek ? 7 : 1))}
        />
      </div>
      {!keys.includes(todayKey) && (
        <button type="button" onClick={() => onAnchorChange(todayKey)} className="flex items-center gap-1 text-[12px] font-semibold px-1" style={{ color: MEASURE_BLUE }}>
          Back to today
        </button>
      )}
      {days.map((d) => (
        <DayRow
          key={d.key}
          dayKey={d.key}
          todayKey={todayKey}
          items={d.items}
          expanded={!isWeek}
          onOpenDay={onOpenDay}
          onOpenWorkout={onOpenWorkout}
          onAddSession={onAddSession}
        />
      ))}
      {!isWeek && (
        <button type="button" onClick={() => onOpenDay(anchorKey)} className="w-full rounded-2xl py-3 text-white text-[13px] font-semibold" style={GLASS}>
          Open day details
        </button>
      )}
      {isWeek && <WeekSummary summary={summary} />}
      <button
        type="button"
        onClick={() => onViewChange("month")}
        className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-3 text-white text-[14px] font-semibold"
        style={GLASS}
      >
        <CalendarDays size={17} /> Switch to Month View <ChevronRight size={16} />
      </button>
    </div>
  );
}
