// The coached client app's look (#279, owner's mock-up 2026-11-18). Parts
// shared by every client tab (top bar, tab bar) and Home's own cards. Light
// is grey page + white glass + black; dark is black page + charcoal glass +
// white. Every number shown is the client's own (clientLook.js).
import React, { createContext, useContext, useRef, useState } from "react";
import { Bell, User, Flame, Dumbbell, Apple, BarChart3, CalendarDays, ChevronRight, ChevronDown, ArrowRight, Play, TrendingUp, Droplet, Utensils, Check, Minus, Home as HomeIcon, CheckCircle2, Footprints } from "lucide-react";
import { SOLO_MARK_WHITE, SOLO_MARK_BLACK } from "../solo/soloMark";
import { clientLook } from "./clientLook";
import { MEASURE_BLUE } from "../theme";

// What the top bar's bell and profile buttons open, from ClientApp, so every
// tab's header works without passing them down each screen.
export const ClientChromeContext = createContext({ notifCount: 0, onOpenNotifications: null, onOpenProfile: null });

const TAP = "active:scale-[0.96] transition-transform";

// The mock-up's flame: solid, with a cut-out inner flame.
function StreakFlame({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="3 1 18 22" aria-hidden="true" fill="currentColor">
      <path fillRule="evenodd" d="M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69zM10.2 17.38c1.44-.35 2.18-1.39 2.38-2.31.33-1.43-.96-2.83-.09-5.09.33 1.87 3.27 3.04 3.27 5.08.08 2.53-2.66 4.7-5.56 2.32z" />
    </svg>
  );
}

// The mock-up's dumbbell lies flat; lucide's is diagonal.
function FlatDumbbell({ style, ...props }) {
  return <Dumbbell {...props} style={{ transform: "rotate(45deg)", ...style }} />;
}

// The APEX mark alone on the left (no wordmark, owner), the bell (red dot when there's
// something new) and profile on the right.
export function ClientTopBar({ dark }) {
  const L = clientLook(dark);
  const { notifCount, onOpenNotifications, onOpenProfile } = useContext(ClientChromeContext);
  return (
    <div className="flex items-center justify-between px-3.5 pt-2" data-testid="client-top-bar">
      <div className="flex items-center gap-3">
        <img src={dark ? SOLO_MARK_WHITE : SOLO_MARK_BLACK} alt="APEX" data-testid="client-tab-logo" className="block w-auto" style={{ height: 27, ...(dark ? {} : { mixBlendMode: "multiply" }) }} />
      </div>
      <div className="flex items-center gap-3">
        {onOpenNotifications && (
          <button type="button" aria-label="Notifications" onClick={onOpenNotifications} className={`relative w-9 h-9 rounded-[12px] flex items-center justify-center ${TAP}`} style={{ ...L.tile, color: L.ink }} data-testid="client-bell">
            <Bell size={17} />
            {notifCount > 0 && <span className="absolute top-1.5 right-2 w-[7px] h-[7px] rounded-full bg-red-500" data-testid="client-bell-dot" />}
          </button>
        )}
        {onOpenProfile && (
          <button type="button" aria-label="Profile" onClick={onOpenProfile} className={`w-9 h-9 rounded-[12px] flex items-center justify-center ${TAP}`} style={{ ...L.tile, color: L.ink }} data-testid="client-profile-button">
            <User size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

// "GOOD EVENING / Zach" with a line under it, and the day streak card.
export function HomeGreeting({ dark, greeting, firstName, streak, onStreak }) {
  const L = clientLook(dark);
  return (
    <div className="px-3.5 -mt-1.5 flex items-stretch gap-3" data-testid="home-greeting-row">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-semibold tracking-[0.22em] uppercase" style={{ color: L.ink }} data-testid="home-greeting">
          {greeting}
        </p>
        <p className="flex items-center gap-3 min-w-0" style={{ color: L.ink }}>
          <span className="text-[22px] leading-tight font-bold tracking-[-0.03em] truncate">{firstName}</span>
          <span aria-hidden="true" className="w-px h-5 shrink-0" style={{ backgroundColor: L.faint }} />
        </p>
        <p className="text-[11px] leading-tight mt-1" style={{ color: L.muted }}>
          Stronger than yesterday.
        </p>
      </div>
      <button type="button" onClick={onStreak} className={`shrink-0 self-center rounded-[18px] w-[156px] h-[54px] pl-3 pr-2 flex items-center gap-1.5 text-left ${TAP}`} style={{ ...L.card, color: L.ink }} data-testid="home-streak">
        <span className="shrink-0"><StreakFlame size={22} /></span>
        <span>
          <span className="block text-[19px] leading-none font-bold tabular-nums">{streak == null ? "–" : streak}</span>
          <span className="block text-[8.5px] mt-0.5 whitespace-nowrap" style={{ color: L.muted }}>
            day streak
          </span>
        </span>
        <span className="w-px h-[30px] mx-1.5 shrink-0" style={{ backgroundColor: L.faint }} />
        <span className="text-[9px] leading-[1.25] font-medium w-[38px] shrink-0">
          {streak ? "Keep it going" : "Start today"} <ArrowRight size={9} className="inline -mt-0.5" />
        </span>
      </button>
    </div>
  );
}

// Mon–Sun on one glass card: the chosen day a solid circle, a done day a
// solid tick, a planned one an empty ring, the chosen day a dash under it.
export function HomeWeekStrip({ dark, dayOffset, onSelect, heading, dotFor, dateForOffset, localDateKey }) {
  const L = clientLook(dark);
  const selected = dateForOffset(dayOffset);
  const mondayOffset = dayOffset - ((selected.getDay() + 6) % 7);
  const offsets = Array.from({ length: 7 }, (_, i) => mondayOffset + i);
  const swipe = useRef(null);
  return (
    <div className="px-3.5" data-testid="client-week-strip">
      {/* The mock-up has no heading or arrows: the day is said for screen
          readers, and a sideways swipe on the strip changes week. */}
      <p className="sr-only" data-testid="home-day-heading">
        {heading}
      </p>
      <button type="button" aria-label="Previous week" onClick={() => onSelect(dayOffset - 7)} className="sr-only">
        Previous week
      </button>
      <button type="button" aria-label="Next week" onClick={() => onSelect(dayOffset + 7)} className="sr-only">
        Next week
      </button>
      <div
        className="rounded-[20px] grid grid-cols-7 px-1 pt-[7px] pb-1"
        style={{ ...L.card, touchAction: "pan-y" }}
        onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (swipe.current ?? e.changedTouches[0].clientX);
          swipe.current = null;
          if (Math.abs(dx) > 50) onSelect(dayOffset + (dx < 0 ? 7 : -7));
        }}
        data-testid="home-week-card"
      >
        {offsets.map((offset) => {
          const d = dateForOffset(offset);
          const key = localDateKey(d);
          const dot = dotFor(key);
          const isSel = offset === dayOffset;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(offset)}
              aria-label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              aria-pressed={isSel}
              className="flex flex-col items-center"
            >
              <span className="text-[8.5px] leading-none mb-[2px] font-semibold uppercase tracking-[0.06em]" style={{ color: isSel ? L.ink : L.muted }}>
                {d.toLocaleDateString("en-AU", { weekday: "short" })}
              </span>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold tabular-nums" style={isSel ? { backgroundColor: L.ink, color: L.onInk, boxShadow: `0 0 0 2px ${dark ? "#0A0A0B" : "#FFFFFF"}, 0 0 0 3.5px ${MEASURE_BLUE}` } : { color: L.ink }}>
                {d.getDate()}
              </span>
              <span className="h-[12px] flex items-center" data-dot={dot || undefined}>
                {dot === "done" ? (
                  <span className="w-[11px] h-[11px] rounded-full flex items-center justify-center" style={{ backgroundColor: L.ink, color: L.onInk }}>
                    <Check size={7} strokeWidth={3.5} />
                  </span>
                ) : dot === "planned" ? (
                  <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The day's workout on the dark gym-photo card: a label pill, the name,
// "5 Exercises · ~35 min", Start/Resume (or View when done / another day),
// and View Plan.
export function HomeWorkoutCard({ session, minutes, exercises, label, started, done, canStart, isPastDate, onStart, onView, onDiscard, dbReady, dark }) {
  const L = clientLook(dark);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!session) {
    return (
      <div className="mx-3.5 rounded-[28px] px-5 py-7" style={{ ...L.card, color: L.ink }} data-testid="client-session-hero">
        <p className="text-[20px] font-bold">{dbReady ? "Rest day" : "Loading your schedule…"}</p>
        {dbReady && (
          <p className="text-[13px] mt-1" style={{ color: L.muted }}>
            Nothing scheduled — recover and come back fresh.
          </p>
        )}
      </div>
    );
  }
  const primary = canStart ? onStart : onView;
  const primaryLabel = canStart ? (started ? "Resume Workout" : "Start Workout") : done ? "View Workout" : isPastDate ? "View Workout" : "View Workout";
  return (
    <div className="mx-3.5">
      {/* The whole card does the main action too (as before #279); its two
          buttons do their own and don't bubble. */}
      <div role="button" tabIndex={0} onClick={primary} onKeyDown={(e) => e.key === "Enter" && primary()} className="relative overflow-hidden rounded-[22px] text-white cursor-pointer" style={{ minHeight: 158, boxShadow: "0 22px 40px -24px rgba(0,0,0,0.6)" }} data-testid="client-session-hero">
        <img src="/brand/home-workout.jpg" alt="" aria-hidden="true" className="absolute inset-y-0 right-0 w-[56%] h-full object-cover object-left" />
        <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(90deg, #111113 0%, #111113 42%, rgba(17,17,19,0.55) 52%, rgba(17,17,19,0) 62%)" }} />
        <div className="relative px-4 pt-3 pb-3 flex flex-col gap-1">
          <span className="self-start inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[9.5px] font-semibold tracking-[0.08em] uppercase" style={{ backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            {done ? <CheckCircle2 size={13} /> : <FlatDumbbell size={13} />} {label}
          </span>
          <p className="text-[27px] leading-[1.1] font-extrabold tracking-[-0.02em] pr-10 mt-1">{session.label}</p>
          <p className="text-[12.5px] text-white/75">
            {exercises > 0 ? `${exercises} Exercise${exercises === 1 ? "" : "s"}` : ""}
            {exercises > 0 && minutes > 0 ? "  •  " : ""}
            {minutes > 0 ? `~${minutes} min` : ""}
          </p>
          <div className="flex items-center justify-between gap-3 mt-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); primary(); }} className={`h-[34px] pl-4 pr-6 rounded-full bg-white text-black text-[12.5px] font-semibold flex items-center gap-2.5 ${TAP}`} data-testid="home-start-workout">
              {canStart && <Play size={13} fill="currentColor" />} {primaryLabel}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onView(); }} className="text-[12px] font-semibold flex items-center gap-1.5 text-white/90" data-testid="home-view-plan">
              View Plan <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
      {started && onDiscard && (
        <button
          type="button"
          onClick={() => {
            if (confirmDiscard) {
              onDiscard();
              setConfirmDiscard(false);
            } else setConfirmDiscard(true);
          }}
          className="w-full text-center text-[11px] font-medium mt-2"
          style={{ color: L.muted }}
        >
          {confirmDiscard ? "Tap again to discard these sets" : "Not started this — discard progress"}
        </button>
      )}
    </div>
  );
}

function Ring({ value, max, size = 128, stroke = 7, dark }) {
  const L = clientLook(dark);
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={L.track} strokeWidth={stroke} />
      {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={L.ink} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}

// Calories as a ring, protein/carbs/fat with black bars, and water with +Log.
export function HomeNutritionCard({ dark, nutrition, targets, dayLabel, isToday, onOpenNutrition, onLogWater, overColor }) {
  const L = clientLook(dark);
  const cal = Math.round(nutrition.calories || 0);
  const over = targets.calories > 0 && cal > targets.calories;
  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  const macros = [
    { label: "Protein", value: r1(nutrition.protein), target: targets.protein },
    { label: "Carbs", value: r1(nutrition.carbs), target: targets.carbs },
    { label: "Fat", value: r1(nutrition.fat), target: targets.fat },
  ];
  return (
    <div className="mx-3.5 rounded-[22px] px-4 pt-2 pb-1.5" style={{ ...L.card, color: L.ink }} data-testid="home-nutrition">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: L.line }}>
        <span className="flex items-center gap-2.5 text-[13px] font-semibold">
          <Utensils size={17} /> Nutrition
        </span>
        <button type="button" onClick={onOpenNutrition} className="flex items-center gap-1 text-[11px] font-semibold" data-testid="home-nutrition-open">
          {dayLabel} <ChevronDown size={13} />
        </button>
      </div>
      <div className="flex items-center gap-3 pt-0.5">
        <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
          <Ring value={cal} max={targets.calories} size={88} stroke={5} dark={dark} />
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold tabular-nums leading-none" style={over ? { color: overColor } : undefined}>
              {cal.toLocaleString()}
            </span>
            <span className="text-[9px] mt-0.5 tabular-nums" style={{ color: L.muted }}>
              / {Number(targets.calories || 0).toLocaleString()} kcal
            </span>
          </span>
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-3 self-stretch border-l" style={{ borderColor: L.line }}>
          {macros.map((m, i) => (
            <div key={m.label} className={`min-w-0 pl-2 pr-1 flex flex-col justify-center ${i > 0 ? "border-l" : ""}`} style={{ borderColor: L.line }}>
              <p className="text-[10px]" style={{ color: L.muted }}>
                {m.label}
              </p>
              <p className="text-[14px] font-bold tabular-nums leading-tight tracking-[-0.02em] whitespace-nowrap">{m.value}g</p>
              <p className="text-[9.5px] tabular-nums" style={{ color: L.muted }}>
                / {m.target}g
              </p>
              <div className="h-[4px] rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: L.track }}>
                <div className="h-full rounded-full" style={{ width: `${m.target > 0 ? Math.min(100, (m.value / m.target) * 100) : 0}%`, backgroundColor: L.ink }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-full pl-3 pr-[3px] py-[2px]" style={{ backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(10,10,11,0.04)" }}>
        <Droplet size={13} />
        <span className="text-[11px] font-semibold">Water</span>
        <span className="text-[11px] tabular-nums flex-1" style={{ color: L.muted }}>
          {r1(nutrition.water)} / {targets.water} L
        </span>
        {isToday && (
          <>
            {nutrition.water > 0 && (
              <button type="button" aria-label="Remove 250 ml" onClick={() => onLogWater(-0.25)} className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${TAP}`} style={L.tile}>
                <Minus size={11} />
              </button>
            )}
            <button type="button" onClick={() => onLogWater(0.25)} className={`h-[22px] px-2.5 rounded-full text-[10.5px] font-semibold ${TAP}`} style={L.tile} data-testid="home-water-250">
              +250ml
            </button>
            <button type="button" onClick={() => onLogWater(0.5)} className={`h-[22px] px-2.5 rounded-full text-[10.5px] font-semibold ${TAP}`} style={L.tile} data-testid="home-water-500">
              +500ml
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Four shortcuts: Log Workout, Log Nutrition, View Progress, Log Cardio.
export function HomeQuickTiles({ dark, onLogWorkout, onLogNutrition, onProgress, onLogCardio }) {
  const L = clientLook(dark);
  const tiles = [
    { icon: FlatDumbbell, a: "Log", b: "Workout", on: onLogWorkout, id: "workout" },
    { icon: Apple, a: "Log", b: "Nutrition", on: onLogNutrition, id: "nutrition" },
    { icon: BarChart3, a: "View", b: "Progress", on: onProgress, id: "progress" },
    { icon: Footprints, a: "Log", b: "Cardio", on: onLogCardio, id: "cardio" },
  ];
  return (
    <div className="px-3.5 grid grid-cols-4 gap-2" data-testid="home-quick-tiles">
      {tiles.map((t) => (
        <button key={t.id} type="button" onClick={t.on} className={`rounded-[16px] pt-2.5 pb-2 px-1 flex flex-col items-center gap-1 ${TAP}`} style={{ ...L.tile, color: L.ink }} data-testid={`home-tile-${t.id}`}>
          <t.icon size={18} strokeWidth={1.8} />
          <span className="relative text-[9px] leading-[1.25] font-medium text-center">
            {t.a}
            <br />
            {t.b}
            <ChevronRight size={10} className="absolute left-full bottom-[1px] ml-1" />
          </span>
        </button>
      ))}
    </div>
  );
}

// "Your Focus This Week" on a dark mountain banner — only when there's a
// true line to show (weekFocus).
export function HomeFocusBanner({ dark, focus, onOpen }) {
  if (!focus) return null;
  return (
    <div className="px-3.5">
      <button type="button" onClick={onOpen} className={`relative w-full overflow-hidden rounded-[18px] text-left text-white ${TAP}`} style={{ backgroundColor: "#0B0B0C", border: dark ? "1px solid rgba(255,255,255,0.08)" : "none", boxShadow: "0 16px 30px -20px rgba(0,0,0,0.6)" }} data-testid="home-focus">
        <img src="/brand/focus-mountain.jpg" alt="" aria-hidden="true" className="absolute right-0 top-0 h-full w-[62%] object-cover object-right" />
        <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(90deg, #0B0B0C 0%, #0B0B0C 38%, rgba(11,11,12,0.6) 60%, rgba(11,11,12,0) 80%)" }} />
        <span className="relative flex items-center gap-4 pl-4 pr-3 py-2">
          <TrendingUp size={22} strokeWidth={2.4} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-semibold">Your Focus This Week</span>
            <span className="block text-[9.5px] text-white/70">{focus.text}</span>
          </span>
          <ChevronRight size={15} strokeWidth={2.2} className="shrink-0" />
        </span>
      </button>
    </div>
  );
}

const TAB_ICONS = { home: HomeIcon, workouts: FlatDumbbell, nutrition: Apple, calendar: CalendarDays, progress: BarChart3, profile: User };

// A floating glass bar: icon over a sentence-case label, the current tab
// solid with a dot under it. Sits close to the bottom (#278).
export function ClientTabBar({ dark, tabs, tab, onSelect, badgeFor }) {
  const L = clientLook(dark);
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50 pointer-events-none" style={{ transform: "translateZ(0)", paddingBottom: "max(4px, calc(env(safe-area-inset-bottom, 0px) - 24px))" }}>
      <div className="pointer-events-auto w-full max-w-md mx-[7px] rounded-[24px] flex px-1" style={{ ...L.card, backgroundColor: dark ? "rgba(24,24,26,0.82)" : "rgba(255,255,255,0.8)" }} data-testid="client-tab-bar">
        {tabs.map((t) => {
          const Icon = TAB_ICONS[t.id] || t.icon;
          const active = tab === t.id;
          const color = active ? L.ink : L.muted;
          return (
            <button key={t.id} type="button" onClick={() => onSelect(t.id)} aria-current={active ? "page" : undefined} className="flex-1 h-[51px] flex flex-col items-center justify-center gap-[3px] relative">
              <Icon size={19} color={color} strokeWidth={active ? 2.3 : 1.8} fill={active && (t.id === "home" || t.id === "profile") ? color : "none"} />
              <span className="text-[9.5px] leading-none" style={{ color, fontWeight: active ? 700 : 500 }}>
                {t.label}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: active ? L.ink : "transparent" }} />
              {badgeFor?.(t.id) && <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
