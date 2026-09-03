import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home as HomeIcon,
  Dumbbell,
  Utensils,
  TrendingUp,
  User,
  Play,
  Check,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  Droplet,
  Moon,
  Activity,
  Footprints,
  Heart,
  Trophy,
  Search,
  Bell,
  Settings,
  ChevronDown,
  Award,
  Target,
  BarChart3,
  Camera,
  ScanLine,
  LogOut,
  Image as ImageIcon,
  X,
  Send,
  MessageCircle,
  StickyNote,
  Clock,
  MessageSquarePlus,
  Video,
  ClipboardList,
  CalendarCheck,
  Star,
  FileText,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApp, flattenSessions, estimate1RM, getPreviousPerformance, getPreviousSets, getCurrentPhase } from "../lib/AppContext";
import {
  Card,
  Pill,
  ProgressBar,
  Ring,
  BottomSheet,
  Toast,
  FullScreenOverlay,
  NumberStepper,
  Logo,
  Sparkline,
  MetricTile,
  DangerButton,
  Avatar,
  AvatarPicker,
  Tagline,
} from "../components/ui";
import { MEASURE_BLUE } from "../theme";
import { WEIGHT_HISTORY, BENCH_HISTORY, VOLUME_HISTORY, METRIC_TILES } from "../lib/mockMetrics";
import { fileToCompressedDataUrl } from "../lib/image";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { BarcodeScanSheet, PhotoEstimateSheet, CreateMealSheet, SavedMealsSection } from "./NutritionFeatures";

/* ============================================================================
   ILLUSTRATIVE METRICS
   Not part of the coach's editable data model (yet) — wearable/nutrition
   integrations would populate these in a production build.
============================================================================ */
const RECOVERY = { score: 82, status: "Ready to train", sleep: "8h 12m", restingHr: 58 };
const ACTIVITY = { steps: 8421, stepGoal: 10000, activeCalories: 412, distanceKm: 5.8 };
const GOALS = [
  { id: "g1", label: "Bench 100kg", current: 82.5, target: 100, unit: "kg" },
  { id: "g2", label: "Lose 5kg", current: 2.4, target: 5, unit: "kg" },
  { id: "g3", label: "Train 4× this week", current: 2, target: 4, unit: "sessions" },
  { id: "g4", label: "Hit 160g protein daily", current: 112, target: 160, unit: "g" },
];
const NUTRITION_TARGETS = { calories: 2200, protein: 160, carbs: 240, fat: 70, water: 3.0 };
const DEFAULT_NUTRITION = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  water: 0,
  meals: {
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snacks: [],
    "Pre-workout": [],
    "Post-workout": [],
  },
};
const ACHIEVEMENTS = [
  { id: "a1", label: "12-day streak", icon: "🔥" },
  { id: "a2", label: "50 workouts completed", icon: "🏆" },
  { id: "a3", label: "New bench PR", icon: "💪" },
  { id: "a4", label: "30-day nutrition log", icon: "🥗" },
];
const COACH_SUGGESTIONS = [
  "What should I train today?",
  "I only have 30 minutes.",
  "How much protein do I have left?",
  "Should I increase my bench weight?",
];

function coachReply(prompt, ctx) {
  const p = prompt.toLowerCase();
  if (p.includes("30 minutes") || p.includes("short"))
    return "With 30 minutes, let's hit a condensed version of today's session — pick the 3 heaviest compound lifts and cut rest to 60 seconds. Want me to trim it for you?";
  if (p.includes("protein"))
    return `You've had ${ctx.nutrition.protein}g of your ${NUTRITION_TARGETS.protein}g target — that leaves ${Math.max(0, NUTRITION_TARGETS.protein - ctx.nutrition.protein)}g. A chicken breast and a scoop of whey would close most of that gap.`;
  if (p.includes("bench"))
    return "Your bench e1RM has climbed from 92kg to 103kg over the last 3 months. You're recovering well — nudge the working weight up 2.5kg and see how bar speed feels before pushing further.";
  if (p.includes("today") || p.includes("train"))
    return ctx.todaySession
      ? `Today's plan is ${ctx.todaySession.label} — ${ctx.todaySession.exercises.length} exercises. Your recovery score is ${RECOVERY.score}%, so you're clear to push intensity.`
      : "You don't have a program assigned yet — ping your coach and they'll get one set up for you.";
  if (p.includes("progress"))
    return "Your weekly volume has trended up for 4 of the last 6 weeks and body weight is down 2.4kg over 8 weeks — that's steady progress.";
  return "Here's a mocked coach response — once connected to a live model, I'll tailor this to your actual training history, recovery, and goals.";
}

function estimateCalories(volume, durationMin) {
  return Math.round(volume * 0.05 + durationMin * 4);
}

function formatRest(seconds) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/* ============================================================================
   HOME
============================================================================ */

function BrandBar() {
  return (
    <div className="flex items-center justify-center pt-3 pb-1">
      <Logo variant="wordmark" tone="black" className="h-9 w-auto opacity-95" />
    </div>
  );
}

function Header({ user, onAvatarClick }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex items-center justify-between px-5 pt-6 pb-2">
      <div>
        <p className="text-black text-xl font-semibold flex items-center gap-1.5">
          {greeting}, {user.name.split(" ")[0]}
          <Dumbbell size={18} className="text-black" />
        </p>
        <p className="text-black/40 text-sm mt-0.5">{dateStr}</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="w-10 h-10 rounded-full bg-black/8 flex items-center justify-center relative">
          <Bell size={18} className="text-black/80" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-black" />
        </button>
        <Avatar name={user.name} url={user.avatarUrl} size={40} onClick={onAvatarClick} />
      </div>
    </div>
  );
}

function TodayWorkoutCard({ program, todaySession, sessionsLen, activeLog, onStart, onView, isToday = true, completedOnDate = false, isPastDate = false, exercisesById }) {
  if (!program || !todaySession) {
    return (
      <Card className="mx-5 text-center py-10">
        <Dumbbell size={26} className="text-black/25 mx-auto mb-3" />
        <p className="text-black font-semibold">No program assigned yet</p>
        <p className="text-black/40 text-sm mt-1">Your coach will assign your training program soon.</p>
      </Card>
    );
  }
  const completedSets = isToday && activeLog ? Object.values(activeLog).flat().filter((s) => s.completed).length : 0;
  const totalSets = todaySession.exercises.reduce((a, e) => a + e.targetSets, 0);
  const started = isToday && !!activeLog;
  const pillLabel = isToday ? "TODAY'S WORKOUT" : completedOnDate ? "COMPLETED" : isPastDate ? "MISSED" : "SCHEDULED";

  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-3">
        <Pill tone="solid">{pillLabel}</Pill>
        <span className="text-black/30 text-xs">{todaySession.weekLabel}</span>
      </div>
      <h2 className="text-black text-2xl font-bold">{todaySession.label}</h2>
      <p className="text-black/50 text-sm mt-1">
        {todaySession.exercises.length} exercises · {program.name}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(todaySession.muscleGroups || []).map((m) => (
          <Pill key={m}>{m}</Pill>
        ))}
      </div>

      {started && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-black/40 mb-1.5">
            <span>Progress</span>
            <span>
              {completedSets}/{totalSets} sets
            </span>
          </div>
          <ProgressBar value={completedSets} max={totalSets} />
        </div>
      )}

      {isToday ? (
        <>
          <button
            onClick={onStart}
            className="w-full mt-5 bg-black text-white font-bold py-4 rounded-2xl text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Play size={18} fill="white" />
            {started ? "RESUME WORKOUT" : "START WORKOUT"}
          </button>
          <button onClick={onView} className="w-full mt-2.5 text-black/60 text-sm font-medium py-2.5 rounded-xl bg-black/5">
            View workout
          </button>
        </>
      ) : (
        <>
          {completedOnDate && (
            <div className="flex items-center gap-2 mt-4 text-black/60 text-sm">
              <Check size={14} /> Workout completed
            </div>
          )}
          <button onClick={onView} className="w-full mt-4 text-black/60 text-sm font-medium py-2.5 rounded-xl bg-black/5">
            Preview exercises
          </button>
        </>
      )}
    </Card>
  );
}

function NutritionSummaryCard({ nutrition, targets, onLogFood, onLogWater }) {
  const items = [
    { label: "CALORIES", value: nutrition.calories, target: targets.calories, unit: "" },
    { label: "PROTEIN", value: nutrition.protein, target: targets.protein, unit: "g" },
    { label: "CARBS", value: nutrition.carbs, target: targets.carbs, unit: "g" },
    { label: "FAT", value: nutrition.fat, target: targets.fat, unit: "g" },
  ];
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-black font-semibold">Nutrition Today</h3>
        <Utensils size={16} className="text-black/30" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it, i) => (
          <div key={it.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-black/40 tracking-wide">{it.label}</span>
            </div>
            <p className="text-black text-sm font-semibold mb-1.5">
              {it.value}
              {it.unit} <span className="text-black/30 font-normal">/ {it.target}{it.unit}</span>
            </p>
            <ProgressBar value={it.value} max={it.target} height={6} dim={i > 0} />
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-black/5 flex items-center gap-3">
        <Droplet size={16} className="text-black/50" />
        <span className="text-black/70 text-sm flex-1">
          Water: <span className="font-semibold text-black">{nutrition.water}L</span> / {targets.water}L
        </span>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onLogFood} className="flex-1 bg-black/8 text-black text-sm font-semibold py-3 rounded-xl">
          + LOG FOOD
        </button>
        <button onClick={onLogWater} className="flex-1 bg-black/8 text-black text-sm font-semibold py-3 rounded-xl">
          + LOG WATER
        </button>
      </div>
    </Card>
  );
}

function RecoveryCardCompact({ recovery }) {
  return (
    <Card>
      <Ring value={recovery.score} max={100} size={48} stroke={5}>
        <span className="text-black font-bold text-sm">{recovery.score}%</span>
      </Ring>
      <p className="text-black/40 text-[11px] tracking-wide mt-3">RECOVERY</p>
      <p className="text-black text-sm font-semibold">{recovery.status}</p>
    </Card>
  );
}

function ActivityCardCompact({ activity }) {
  return (
    <Card>
      <Footprints size={22} className="text-black/60" />
      <p className="text-black/40 text-[11px] tracking-wide mt-3">STEPS</p>
      <p className="text-black text-lg font-bold">{activity.steps.toLocaleString()}</p>
      <p className="text-black/30 text-[11px]">{activity.activeCalories} kcal</p>
    </Card>
  );
}

function GoalsCard({ goals }) {
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-black font-semibold">Goals</h3>
        <Target size={16} className="text-black/30" />
      </div>
      <div className="space-y-4">
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-black/70">{g.label}</span>
              <span className="text-black/40">
                {g.current}/{g.target}
                {g.unit === "kg" || g.unit === "g" ? g.unit : ""}
              </span>
            </div>
            <ProgressBar value={g.current} max={g.target} height={6} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function SessionStrip({ sessions, currentIndex, onSelect }) {
  if (sessions.length === 0) return null;
  const start = Math.max(0, currentIndex - 3);
  const visible = sessions.slice(start, start + 7);
  return (
    <Card className="mx-5">
      <h3 className="text-black font-semibold mb-4">Your Rotation</h3>
      <div className="flex justify-between">
        {visible.map((s, vi) => {
          const idx = start + vi;
          const status = idx < currentIndex ? "done" : idx === currentIndex ? "today" : "upcoming";
          const icon = { done: "✓", today: "●", upcoming: "○" }[status];
          return (
            <button key={idx} onClick={() => onSelect(s)} className="flex flex-col items-center gap-2">
              <span className="text-black/30 text-[10px] font-medium">{idx + 1}</span>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: status === "today" ? "#0A0A0B" : "rgba(10,10,11,0.06)",
                  color: status === "today" ? "#fff" : status === "done" ? "rgba(10,10,11,0.6)" : "rgba(10,10,11,0.3)",
                }}
              >
                {icon}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function DayHeader({ selectedOffset, onJumpToday }) {
  const label = dateForOffset(selectedOffset).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const isToday = selectedOffset === 0;
  return (
    <div className="flex items-center justify-between px-5 pt-1 pb-1">
      <p className="text-black text-lg font-bold">{label}</p>
      {!isToday && (
        <button onClick={onJumpToday} className="text-black/50 text-sm font-semibold underline underline-offset-2">
          Jump to today
        </button>
      )}
    </div>
  );
}

function DateStrip({ selectedOffset, onSelect }) {
  const offsets = useMemo(() => {
    const out = [];
    for (let i = -7; i <= 13; i++) out.push(i);
    return out;
  }, []);
  const stripRef = useRef(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-offset="0"]');
    el?.scrollIntoView({ inline: "start", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-5">
      <div ref={stripRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {offsets.map((offset) => {
          const d = dateForOffset(offset);
          const isToday = offset === 0;
          const isSelected = offset === selectedOffset;
          return (
            <button
              key={offset}
              data-offset={offset}
              onClick={() => onSelect(offset)}
              className={`shrink-0 w-14 rounded-2xl py-2.5 flex flex-col items-center gap-0.5 border transition-colors ${
                isSelected ? "bg-black border-black" : "bg-black/5 border-black/10"
              }`}
            >
              <span className={`text-lg font-bold leading-none ${isSelected ? "text-white" : "text-black"}`}>{d.getDate()}</span>
              <span className={`text-[10px] font-medium ${isSelected ? "text-white/60" : "text-black/40"}`}>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              {isToday && <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white/60" : "bg-black/50"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DailyHabitsCard({ habits, completedIds, onToggle, interactive = true }) {
  if (habits.length === 0) return null;
  const doneCount = habits.filter((h) => completedIds.includes(h.id)).length;
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-black font-semibold">Daily Habits</h3>
        <span className="text-black/40 text-xs">
          {doneCount}/{habits.length}
        </span>
      </div>
      <div className="mb-3">
        <ProgressBar value={doneCount} max={habits.length} height={6} />
      </div>
      <div className="space-y-1.5">
        {habits.map((h) => {
          const done = completedIds.includes(h.id);
          const Tag = interactive ? "button" : "div";
          return (
            <Tag
              key={h.id}
              onClick={interactive ? () => onToggle(h.id) : undefined}
              className={`w-full flex items-center gap-3 bg-black/5 rounded-xl px-3.5 py-3 text-left ${
                interactive ? "" : "opacity-70"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                  done ? "bg-black border-black" : "border-black/25"
                }`}
              >
                {done && <Check size={12} className="text-white" strokeWidth={3.5} />}
              </span>
              <span className={`text-sm flex-1 ${done ? "text-black/40 line-through" : "text-black/85"}`}>{h.label}</span>
            </Tag>
          );
        })}
      </div>
    </Card>
  );
}

function HomeScreen({
  user,
  program,
  sessions,
  currentIndex,
  todaySession,
  activeLog,
  onStartWorkout,
  onViewWorkout,
  nutrition,
  onLogFood,
  onLogWater,
  showToast,
  habits,
  completedHabitIds,
  onToggleHabit,
  onAvatarClick,
  dayOffset,
  onSelectDay,
  daySession,
  isToday,
  completedOnDate,
  dayHabitCompletedIds,
  exercisesById,
}) {
  return (
    <div className="pb-6 space-y-4">
      <Header user={user} onAvatarClick={onAvatarClick} />
      <DayHeader selectedOffset={dayOffset} onJumpToday={() => onSelectDay(0)} />
      <DateStrip selectedOffset={dayOffset} onSelect={onSelectDay} />
      <TodayWorkoutCard
        program={program}
        todaySession={daySession}
        sessionsLen={sessions.length}
        activeLog={activeLog}
        onStart={onStartWorkout}
        onView={onViewWorkout}
        isToday={isToday}
        completedOnDate={completedOnDate}
        isPastDate={dayOffset < 0}
        exercisesById={exercisesById}
      />
      <DailyHabitsCard
        habits={habits}
        completedIds={isToday ? completedHabitIds : dayHabitCompletedIds}
        onToggle={onToggleHabit}
        interactive={isToday}
      />
      {isToday && (
        <NutritionSummaryCard nutrition={nutrition} targets={NUTRITION_TARGETS} onLogFood={onLogFood} onLogWater={onLogWater} />
      )}
      <div className="grid grid-cols-2 gap-4 px-5">
        <RecoveryCardCompact recovery={RECOVERY} />
        <ActivityCardCompact activity={ACTIVITY} />
      </div>
      <GoalsCard goals={GOALS} />
      {sessions.length > 0 && (
        <SessionStrip sessions={sessions} currentIndex={currentIndex} onSelect={(s) => showToast(s.label)} />
      )}
    </div>
  );
}

/* ============================================================================
   WORKOUT PREVIEW + SESSION FLOW
============================================================================ */

function ExerciseThumb({ exercise, size = 56 }) {
  return (
    <div
      className="rounded-2xl bg-black/5 border border-black/5 overflow-hidden shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {exercise?.videoUrl ? (
        <video src={exercise.videoUrl} muted className="w-full h-full object-cover" />
      ) : (
        <Dumbbell size={Math.round(size * 0.4)} className="text-black/25" />
      )}
    </div>
  );
}

function WorkoutPreviewSheet({ session, exercisesById, canStart, onStart, onClose }) {
  const equipment = useMemo(() => {
    const set = new Set();
    session.exercises.forEach((e) => {
      const ex = exercisesById[e.exerciseId];
      if (ex?.equipment) set.add(ex.equipment);
    });
    return Array.from(set);
  }, [session, exercisesById]);

  const estMinutes = Math.max(
    5,
    Math.round(session.exercises.reduce((a, e) => a + e.targetSets * (45 + (e.restSeconds ?? 90)), 0) / 60)
  );

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60">
            <X size={22} />
          </button>
          <span className="text-black/70 text-sm font-semibold">{session.weekLabel || "Workout Preview"}</span>
          <ClipboardList size={19} className="text-black/25" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-28">
          <div className="flex items-center gap-2.5 mt-4">
            <span className="w-9 h-9 rounded-full border-2 border-black/15 shrink-0" />
            <h1 className="text-black text-2xl font-bold truncate">{session.label}</h1>
          </div>

          <div className="flex items-center gap-5 mt-4 text-black/50 text-[13px] font-medium flex-wrap">
            <span className="flex items-center gap-1.5">
              <Target size={15} /> Regular
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={15} /> ~{estMinutes} min
            </span>
            <span className="flex items-center gap-1.5">
              <Dumbbell size={15} /> {session.exercises.length} Exercises
            </span>
          </div>

          {equipment.length > 0 && (
            <div className="mt-5">
              <p className="text-black/35 text-xs font-semibold tracking-wide mb-2">EQUIPMENT</p>
              <div className="flex gap-2.5 flex-wrap">
                {equipment.map((eq) => (
                  <div key={eq} className="flex flex-col items-center gap-1.5 w-16">
                    <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center">
                      <Dumbbell size={20} className="text-black/40" />
                    </div>
                    <span className="text-black/45 text-[10px] text-center leading-tight">{eq}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-black/5">
            {session.exercises.map((e, i) => {
              const ex = exercisesById[e.exerciseId];
              if (!ex) return null;
              return (
                <div key={i} className="relative flex items-center gap-3 py-3.5 border-b border-black/5">
                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: MEASURE_BLUE }} />
                  <div className="pl-3 flex items-center gap-3 flex-1 min-w-0">
                    <ExerciseThumb exercise={ex} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="text-black font-semibold text-[15px] truncate">{ex.name}</p>
                      <p className="text-black/45 text-[13px] mt-0.5">
                        {e.targetSets} sets × {e.targetReps} reps, {formatRest(e.restSeconds ?? 90)} rest between sets
                      </p>
                    </div>
                    {e.notes && <ClipboardList size={16} style={{ color: MEASURE_BLUE }} className="shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {canStart && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center px-6">
            <button
              onClick={onStart}
              className="bg-black text-white font-bold py-4 px-10 rounded-full shadow-2xl flex items-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Play size={16} fill="white" />
              Start Now
            </button>
          </div>
        )}
      </div>
    </FullScreenOverlay>
  );
}

function RestBar({ restTime, restTotal, label, onSkip, onAdd15 }) {
  const pct = restTotal > 0 ? ((restTotal - restTime) / restTotal) * 100 : 0;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[95] flex justify-center">
      <div className="w-full max-w-md bg-black text-white px-5 py-3.5 flex items-center gap-3 shadow-2xl">
        <div className="flex-1 min-w-0">
          <p className="text-white/50 text-[11px] tracking-wide truncate">RESTING · {label}</p>
          <p className="text-white text-xl font-bold tabular-nums">
            {Math.floor(Math.max(restTime, 0) / 60)}:{String(Math.max(restTime, 0) % 60).padStart(2, "0")}
          </p>
          <div className="h-1 bg-white/15 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button onClick={onAdd15} className="bg-white/12 text-white text-xs font-semibold px-3 py-2.5 rounded-xl shrink-0">
          +15s
        </button>
        <button onClick={onSkip} className="bg-white text-black text-xs font-bold px-3 py-2.5 rounded-xl shrink-0">
          SKIP
        </button>
      </div>
    </div>
  );
}

function ExerciseBlock({ exMeta, exercise, rows, previousSets, onChangeField, onBlurKg, onAddSet, note, noteOpen, onToggleNote, onNoteChange }) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const coachNote = exMeta.notes || "";
  const isLongNote = coachNote.length > 90;

  return (
    <div className="bg-[#F7F7F8] rounded-3xl p-4 border border-black/5">
      <div className="flex items-center gap-3">
        <ExerciseThumb exercise={exercise} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-black font-bold text-[15px] truncate">{exercise.name}</p>
            {exMeta.groupType && (
              <span className="bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                {exMeta.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
              </span>
            )}
          </div>
          <p className="text-black/45 text-[13px] mt-0.5">
            {exMeta.targetSets} sets × {exMeta.targetReps} reps
          </p>
        </div>
        <button
          onClick={onToggleNote}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            noteOpen || note ? "bg-black text-white" : "bg-black/8 text-black/50"
          }`}
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>

      {coachNote && (
        <div className="mt-3 bg-white border border-black/10 rounded-2xl px-3.5 py-2.5">
          <p className={`text-black/70 text-[13px] leading-snug ${!notesExpanded && isLongNote ? "line-clamp-2" : ""}`}>{coachNote}</p>
          {isLongNote && (
            <button onClick={() => setNotesExpanded((v) => !v)} className="text-[12px] font-semibold mt-1" style={{ color: MEASURE_BLUE }}>
              {notesExpanded ? "See less" : "See more"}
            </button>
          )}
        </div>
      )}

      {noteOpen && (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add your own note on this exercise…"
            rows={2}
            autoFocus
            className="w-full bg-white border border-black/10 rounded-2xl px-3.5 py-2.5 text-black text-[13px] outline-none placeholder:text-black/25 resize-none"
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 bg-black/[0.04] rounded-full pl-3 pr-1.5 py-1.5">
        <Clock size={13} className="text-black/40 shrink-0" />
        <span className="text-black/50 text-[12px] font-medium flex-1">Rest between each set</span>
        <span className="bg-white text-black/70 text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0">
          {formatRest(exMeta.restSeconds ?? 90)}
        </span>
      </div>

      <div className="mt-3">
        <div className="grid grid-cols-[28px_1fr_60px_60px] gap-2 px-1 mb-1.5">
          <span className="text-black/35 text-[11px] font-semibold">SET</span>
          <span className="text-black/35 text-[11px] font-semibold">PREVIOUS</span>
          <span className="text-black/35 text-[11px] font-semibold text-center">REPS</span>
          <span className="text-black/35 text-[11px] font-semibold text-center">KG</span>
        </div>
        {rows.map((row, i) => {
          const prev = previousSets[i];
          return (
            <div key={i} className="grid grid-cols-[28px_1fr_60px_60px] gap-2 items-center px-1 py-1.5">
              <span className="text-black/50 text-[13px] font-semibold">{i + 1}</span>
              <span className="text-black/40 text-[13px] truncate">{prev ? `${prev.reps} x ${prev.weight} kg` : "-"}</span>
              <input
                type="number"
                inputMode="numeric"
                value={row.reps}
                onChange={(e) => onChangeField(i, "reps", e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl text-center text-black text-[14px] font-medium py-2 outline-none focus:border-black/30"
              />
              <input
                type="number"
                inputMode="decimal"
                value={row.weight}
                onChange={(e) => onChangeField(i, "weight", e.target.value)}
                onBlur={() => onBlurKg(i)}
                className="w-full bg-white border border-black/10 rounded-xl text-center text-black text-[14px] font-medium py-2 outline-none focus:border-black/30"
              />
            </div>
          );
        })}
        <button onClick={onAddSet} className="flex items-center gap-1.5 mt-2 px-1" style={{ color: MEASURE_BLUE }}>
          <Plus size={14} className="border rounded-full p-0.5 box-content" style={{ borderColor: MEASURE_BLUE }} />
          <span className="text-[13px] font-semibold">Add new set</span>
        </button>
      </div>
    </div>
  );
}

function WorkoutSession({ session: daySession, activeLog, setActiveLog, logsForClient, exercisesById, exerciseNotes, setExerciseNotes, onFinish, onExit }) {
  const [autoFill, setAutoFill] = useState(false);
  const [noteOpenFor, setNoteOpenFor] = useState(null);
  const [prToast, setPrToast] = useState(null);
  const [resting, setResting] = useState(false);
  const [restTime, setRestTime] = useState(90);
  const [restTotal, setRestTotal] = useState(90);
  const [restLabel, setRestLabel] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (resting && restTime > 0) {
      timerRef.current = setTimeout(() => setRestTime((t) => t - 1), 1000);
    } else if (resting && restTime === 0) {
      setResting(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [resting, restTime]);

  function rowsFor(exMeta) {
    const existing = activeLog[exMeta.exerciseId] || [];
    const count = Math.max(exMeta.targetSets, existing.length);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(existing[i] || { setNumber: i + 1, weight: "", reps: "", completed: false });
    }
    return out;
  }

  function setField(exerciseId, idx, field, value) {
    setActiveLog((prev) => {
      const arr = [...(prev[exerciseId] || [])];
      while (arr.length <= idx) arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [exerciseId]: arr };
    });
  }

  function addSet(exMeta) {
    setActiveLog((prev) => {
      const arr = [...(prev[exMeta.exerciseId] || [])];
      while (arr.length < exMeta.targetSets) arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
      return { ...prev, [exMeta.exerciseId]: arr };
    });
  }

  function handleBlurKg(exMeta, idx) {
    const arr = activeLog[exMeta.exerciseId] || [];
    const row = arr[idx];
    if (!row) return;
    const weight = parseFloat(row.weight);
    const reps = parseInt(row.reps, 10);
    if (!weight || !reps || isNaN(weight) || isNaN(reps)) return;

    const prevSets = getPreviousSets(logsForClient, exMeta.exerciseId);
    const previous = prevSets[idx] || getPreviousPerformance(logsForClient, exMeta.exerciseId);
    const e1rm = estimate1RM(weight, reps);
    const isPR = previous ? weight > previous.weight || e1rm > estimate1RM(previous.weight, previous.reps) : false;

    setActiveLog((prev) => {
      const next = [...(prev[exMeta.exerciseId] || [])];
      next[idx] = { ...next[idx], completed: true, isPR };
      return { ...prev, [exMeta.exerciseId]: next };
    });

    if (isPR) {
      setPrToast({ exerciseName: exercisesById[exMeta.exerciseId]?.name, weight, reps, prevWeight: previous.weight, prevReps: previous.reps });
      setTimeout(() => setPrToast(null), 3200);
    }

    const totalRows = Math.max(exMeta.targetSets, arr.length);
    if (idx < totalRows - 1) {
      const rest = exMeta.restSeconds ?? 90;
      setRestTime(rest);
      setRestTotal(rest);
      setRestLabel(exercisesById[exMeta.exerciseId]?.name || "");
      setResting(true);
    }
  }

  function toggleAutoFill() {
    setAutoFill((prevOn) => {
      const next = !prevOn;
      if (next) {
        setActiveLog((log) => {
          const updated = { ...log };
          daySession.exercises.forEach((exMeta) => {
            const prevSets = getPreviousSets(logsForClient, exMeta.exerciseId);
            const arr = [...(updated[exMeta.exerciseId] || [])];
            for (let i = 0; i < exMeta.targetSets; i++) {
              if (!arr[i]) arr[i] = { setNumber: i + 1, weight: "", reps: "", completed: false };
              const p = prevSets[i];
              if (p && !arr[i].weight && !arr[i].reps) {
                arr[i] = { ...arr[i], weight: p.weight, reps: p.reps };
              }
            }
            updated[exMeta.exerciseId] = arr;
          });
          return updated;
        });
      }
      return next;
    });
  }

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onExit} className="text-black/60 text-sm font-medium">
            Cancel
          </button>
          <h1 className="text-black font-bold text-[15px] truncate px-2">{daySession.label}</h1>
          <button onClick={onFinish} className="text-black font-bold text-sm shrink-0">
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-28">
          <div className="flex items-center justify-between bg-black/[0.03] rounded-2xl px-4 py-3">
            <span className="text-black/70 text-sm font-medium">Auto fill stats</span>
            <button onClick={toggleAutoFill} className={`w-11 h-6 rounded-full relative transition-colors ${autoFill ? "bg-black" : "bg-black/15"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoFill ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {daySession.exercises.map((exMeta, i) => {
            const exercise = exercisesById[exMeta.exerciseId];
            if (!exercise) return null;
            return (
              <ExerciseBlock
                key={exMeta.exerciseId + i}
                exMeta={exMeta}
                exercise={exercise}
                rows={rowsFor(exMeta)}
                previousSets={getPreviousSets(logsForClient, exMeta.exerciseId)}
                onChangeField={(idx, field, value) => setField(exMeta.exerciseId, idx, field, value)}
                onBlurKg={(idx) => handleBlurKg(exMeta, idx)}
                onAddSet={() => addSet(exMeta)}
                note={exerciseNotes[exMeta.exerciseId] || ""}
                noteOpen={noteOpenFor === exMeta.exerciseId}
                onToggleNote={() => setNoteOpenFor((cur) => (cur === exMeta.exerciseId ? null : exMeta.exerciseId))}
                onNoteChange={(value) => setExerciseNotes((prev) => ({ ...prev, [exMeta.exerciseId]: value }))}
              />
            );
          })}
        </div>

        {resting && (
          <RestBar
            restTime={restTime}
            restTotal={restTotal}
            label={restLabel}
            onAdd15={() => {
              setRestTime((t) => t + 15);
              setRestTotal((t) => t + 15);
            }}
            onSkip={() => setResting(false)}
          />
        )}

        {prToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-[88%] max-w-sm animate-[fadeIn_0.3s_ease-out]">
            <div className="bg-black rounded-2xl p-4 shadow-2xl text-center">
              <p className="text-white font-bold text-sm tracking-wide">🔥 NEW PERSONAL RECORD</p>
              <p className="text-white text-lg font-bold mt-1">{prToast.exerciseName}</p>
              <p className="text-white/70 text-sm mt-0.5">
                {prToast.weight}kg × {prToast.reps} · Best previous: {prToast.prevWeight}kg × {prToast.prevReps}
              </p>
            </div>
          </div>
        )}
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      </div>
    </FullScreenOverlay>
  );
}

function WorkoutSummary({ daySession, activeLog, onDone }) {
  const allSets = Object.values(activeLog).flat();
  const totalVolume = allSets.reduce((a, s) => a + s.weight * s.reps, 0);
  const totalSets = allSets.length;
  const prCount = allSets.filter((s) => s.isPR).length;
  const durationMin = 52;
  const calories = estimateCalories(totalVolume, durationMin);

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10">
        <Logo variant="wordmark" tone="black" className="h-8 w-auto opacity-70 mb-1.5" />
        <Tagline className="h-6 w-auto opacity-90 mb-6" />
        <div className="w-20 h-20 rounded-full bg-black/10 border border-black/15 flex items-center justify-center mb-5">
          <Check size={36} className="text-black" strokeWidth={3} />
        </div>
        <p className="text-black/40 text-xs tracking-widest font-semibold">WORKOUT COMPLETE</p>
        <h2 className="text-black text-3xl font-bold mt-1">{daySession.label}</h2>
        <p className="text-black text-4xl font-bold tabular-nums mt-6">{durationMin}:18</p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-6">
          <div className="bg-[#F7F7F8] rounded-2xl p-4 border border-black/5">
            <p className="text-black text-xl font-bold">{totalSets}</p>
            <p className="text-black/40 text-xs mt-0.5">Sets completed</p>
          </div>
          <div className="bg-[#F7F7F8] rounded-2xl p-4 border border-black/5">
            <p className="text-black text-xl font-bold">{totalVolume.toLocaleString()} kg</p>
            <p className="text-black/40 text-xs mt-0.5">Total volume</p>
          </div>
          <div className="bg-[#F7F7F8] rounded-2xl p-4 border border-black/5">
            <p className="text-black text-xl font-bold">{calories}</p>
            <p className="text-black/40 text-xs mt-0.5">Calories burned</p>
          </div>
          <div className="bg-[#F7F7F8] rounded-2xl p-4 border border-black/5">
            <p className="text-xl font-bold text-black">{prCount} new</p>
            <p className="text-black/40 text-xs mt-0.5">Personal records</p>
          </div>
        </div>

        <button onClick={onDone} className="w-full max-w-sm mt-8 bg-black text-white font-bold py-4 rounded-2xl">
          DONE
        </button>
      </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   WORKOUTS TAB
============================================================================ */

function WorkoutsScreen({ program, todaySession, sessions, currentIndex, activeLog, onStart, onViewWorkout, logsForClient, exercisesById }) {
  const [tab, setTab] = useState("today");
  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-black text-2xl font-bold">Workouts</h1>
      </div>
      <div className="flex gap-2 px-5 mb-4 overflow-x-auto no-scrollbar">
        {["today", "history", "program"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap ${
              tab === t ? "bg-black text-white" : "bg-black/8 text-black/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className="px-5 space-y-4">
          <TodayWorkoutCard program={program} todaySession={todaySession} activeLog={activeLog} onStart={onStart} onView={onViewWorkout} isToday />
          {todaySession && (
            <Card>
              <h3 className="text-black font-semibold mb-3">Exercises</h3>
              <div className="space-y-2">
                {todaySession.exercises.map((e, i) => {
                  const ex = exercisesById[e.exerciseId];
                  if (!ex) return null;
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-black/5 last:border-0">
                      <span className="w-7 h-7 rounded-full bg-black/8 text-black/50 text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-black text-sm font-medium">{ex.name}</p>
                          {e.groupType && (
                            <span className="bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded">
                              {e.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
                            </span>
                          )}
                        </div>
                        <p className="text-black/40 text-xs">
                          {e.targetSets} sets × {e.targetReps} reps · RIR {e.targetRIR ?? 2}
                        </p>
                        {e.notes && <p className="text-black/25 text-[11px] mt-0.5 italic">{e.notes}</p>}
                      </div>
                      <span className="text-black/30 text-xs">{ex.equipment}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="px-5 space-y-3">
          {logsForClient.length === 0 && (
            <Card>
              <p className="text-black/40 text-sm text-center py-6">No completed workouts yet — finish today's session to see it here.</p>
            </Card>
          )}
          {logsForClient.map((h) => {
            const volume = h.entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);
            return (
              <Card key={h.id}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-black font-semibold">{h.dayLabel}</p>
                    <p className="text-black/40 text-xs mt-0.5">{new Date(h.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                  </div>
                  <Pill tone="outline">{volume.toLocaleString()} kg</Pill>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "program" && (
        <div className="px-5 space-y-3">
          {!program && (
            <Card>
              <p className="text-black/40 text-sm text-center py-6">No program assigned yet.</p>
            </Card>
          )}
          {program && (
            <Card>
              <p className="text-black font-semibold">{program.name}</p>
              <p className="text-black/40 text-xs mt-1">{program.description}</p>
              <div className="mt-4 space-y-2">
                {sessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{
                          backgroundColor: i === currentIndex ? "#0A0A0B" : "rgba(10,10,11,0.06)",
                          color: i === currentIndex ? "#fff" : "rgba(10,10,11,0.4)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-black/80 text-sm">{s.label}</span>
                    </div>
                    <span className="text-black/30 text-xs">{s.exercises.length} ex</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   NUTRITION TAB
============================================================================ */

function NutritionScreen({ nutrition, onAddFood, onAddWater, savedMeals, onCreateSavedMeal, onDeleteSavedMeal, showToast }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState("Breakfast");
  const [waterSheetOpen, setWaterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [createMealOpen, setCreateMealOpen] = useState(false);
  const [mealPrefill, setMealPrefill] = useState(null);

  const mealCategories = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-workout", "Post-workout"];
  const filteredFoods = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  function addAndClose(food) {
    onAddFood(activeMeal, food);
    setBarcodeOpen(false);
    setPhotoOpen(false);
    setSheetOpen(false);
  }

  function saveMealFromEstimate(estimate) {
    onCreateSavedMeal({
      name: estimate.name,
      ingredients: estimate.ingredients,
      cals: estimate.cals,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat,
      photoUrl: estimate.photoUrl,
    });
    showToast(`Saved "${estimate.name}" to My Meals`);
    setPhotoOpen(false);
    setSheetOpen(false);
  }

  function logSavedMeal(meal, category) {
    onAddFood(category, { id: meal.id, name: meal.name, cals: meal.cals, protein: meal.protein, carbs: meal.carbs, fat: meal.fat });
  }

  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-black text-2xl font-bold">Nutrition</h1>
        <Search size={20} className="text-black/40" />
      </div>

      <div className="px-5 mt-3">
        <Card>
          <p className="text-black/40 text-xs tracking-wide mb-1">CALORIE TARGET</p>
          <div className="flex items-baseline gap-2">
            <span className="text-black text-3xl font-bold">{Math.max(0, NUTRITION_TARGETS.calories - nutrition.calories)}</span>
            <span className="text-black/40 text-sm">remaining of {NUTRITION_TARGETS.calories}</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={nutrition.calories} max={NUTRITION_TARGETS.calories} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { l: "Protein", v: nutrition.protein, t: NUTRITION_TARGETS.protein },
              { l: "Carbs", v: nutrition.carbs, t: NUTRITION_TARGETS.carbs },
              { l: "Fat", v: nutrition.fat, t: NUTRITION_TARGETS.fat },
            ].map((m) => (
              <div key={m.l} className="text-center">
                <Ring value={m.v} max={m.t} size={56} stroke={5}>
                  <span className="text-black text-xs font-bold">
                    {m.v}/{m.t}
                  </span>
                </Ring>
                <p className="text-black/40 text-xs mt-1.5">{m.l}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="text-black font-semibold flex items-center gap-2">
              <Droplet size={16} className="text-black/60" /> Water
            </p>
            <span className="text-black/50 text-sm">
              {nutrition.water}L / {NUTRITION_TARGETS.water}L
            </span>
          </div>
          <ProgressBar value={nutrition.water} max={NUTRITION_TARGETS.water} height={6} />
          <div className="flex gap-2 mt-3">
            <button onClick={() => onAddWater(0.25)} className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl">
              +250ml
            </button>
            <button onClick={() => onAddWater(0.5)} className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl">
              +500ml
            </button>
            <button onClick={() => setWaterSheetOpen(true)} className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl">
              Custom
            </button>
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <SavedMealsSection
          meals={savedMeals}
          onCreateNew={() => {
            setMealPrefill(null);
            setCreateMealOpen(true);
          }}
          onLog={logSavedMeal}
          onDelete={onDeleteSavedMeal}
        />
      </div>

      <div className="px-5 mt-5 space-y-3">
        {mealCategories.map((meal) => {
          const items = nutrition.meals[meal] || [];
          const totalCals = items.reduce((a, f) => a + f.cals, 0);
          return (
            <Card key={meal}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-black font-semibold">{meal}</p>
                <span className="text-black/40 text-xs">{totalCals} kcal</span>
              </div>
              {items.length === 0 ? (
                <p className="text-black/30 text-sm py-1">No items logged</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {items.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-black/70 min-w-0">
                        {f.photoUrl && (
                          <img src={f.photoUrl} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </span>
                      <span className="text-black/40 shrink-0 ml-2">{f.cals} kcal</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setActiveMeal(meal);
                  setSheetOpen(true);
                }}
                className="w-full mt-1 bg-black/5 text-black/70 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Add food
              </button>
            </Card>
          );
        })}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Add to ${activeMeal}`}>
        <div className="flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-3">
          <Search size={16} className="text-black/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
          />
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setSheetOpen(false);
              setBarcodeOpen(true);
            }}
            className="flex-1 flex flex-col items-center gap-1 bg-black/5 rounded-xl py-3 text-black/50 text-xs"
          >
            <ScanLine size={18} />
            Scan barcode
          </button>
          <button
            onClick={() => {
              setSheetOpen(false);
              setPhotoOpen(true);
            }}
            className="flex-1 flex flex-col items-center gap-1 bg-black/5 rounded-xl py-3 text-black/50 text-xs"
          >
            <Camera size={18} />
            Photo
          </button>
        </div>
        <p className="text-black/30 text-xs mb-2 tracking-wide">SEARCH RESULTS</p>
        <div className="space-y-1">
          {filteredFoods.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                onAddFood(activeMeal, f);
                setSheetOpen(false);
              }}
              className="w-full flex items-center justify-between py-3 border-b border-black/5 last:border-0"
            >
              <div className="text-left">
                <p className="text-black text-sm font-medium">{f.name}</p>
                <p className="text-black/40 text-xs">
                  P{f.protein} · C{f.carbs} · F{f.fat}
                </p>
              </div>
              <span className="text-black/50 text-sm">{f.cals} kcal</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={waterSheetOpen} onClose={() => setWaterSheetOpen(false)} title="Log Water">
        <div className="grid grid-cols-3 gap-2">
          {[0.1, 0.2, 0.33, 0.5, 0.75, 1.0].map((v) => (
            <button
              key={v}
              onClick={() => {
                onAddWater(v);
                setWaterSheetOpen(false);
              }}
              className="bg-black/8 rounded-xl py-4 text-black font-semibold"
            >
              {v * 1000}ml
            </button>
          ))}
        </div>
      </BottomSheet>

      <BarcodeScanSheet open={barcodeOpen} onClose={() => setBarcodeOpen(false)} onAdd={addAndClose} />
      <PhotoEstimateSheet
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onAdd={(estimate) =>
          addAndClose({
            id: `photo_${Date.now()}`,
            name: estimate.name,
            cals: estimate.cals,
            protein: estimate.protein,
            carbs: estimate.carbs,
            fat: estimate.fat,
            photoUrl: estimate.photoUrl,
          })
        }
        onSaveAsMeal={saveMealFromEstimate}
      />
      <CreateMealSheet
        open={createMealOpen}
        onClose={() => setCreateMealOpen(false)}
        prefill={mealPrefill}
        onSave={(meal) => {
          onCreateSavedMeal(meal);
          showToast(`Saved "${meal.name}" to My Meals`);
          setCreateMealOpen(false);
        }}
      />
    </div>
  );
}

/* ============================================================================
   PROGRESS TAB
============================================================================ */

function ChartCard({ title, subtitle, children }) {
  return (
    <Card>
      <p className="text-black font-semibold">{title}</p>
      {subtitle && <p className="text-black/40 text-xs mt-0.5">{subtitle}</p>}
      <div className="h-40 mt-3 -ml-4">{children}</div>
    </Card>
  );
}

const axisStyle = { fontSize: 11, fill: "rgba(10,10,11,0.35)" };

function PhotosSection({ photos, onAdd, onDelete, busy }) {
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-black font-semibold">Progress Photos</p>
        <ImageIcon size={16} className="text-black/30" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAdd(file);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="aspect-square rounded-xl border border-dashed border-black/15 bg-black/[0.03] flex flex-col items-center justify-center gap-1 text-black/40 disabled:opacity-40"
        >
          <Plus size={18} />
          <span className="text-[10px] font-medium">{busy ? "Uploading…" : "Add photo"}</span>
        </button>
        {photos.map((p) => (
          <button key={p.id} onClick={() => setViewing(p)} className="aspect-square rounded-xl overflow-hidden bg-black/5">
            <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {photos.length === 0 && <p className="text-black/25 text-xs mt-3">No photos yet — add one to start a visual timeline.</p>}

      <BottomSheet open={!!viewing} onClose={() => setViewing(null)} title={viewing ? new Date(viewing.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}>
        {viewing && (
          <div>
            <img src={viewing.url} alt="Progress" className="w-full rounded-2xl mb-4" />
            <DangerButton
              className="w-full"
              onClick={() => {
                onDelete(viewing.id);
                setViewing(null);
              }}
            >
              <X size={14} /> Delete photo
            </DangerButton>
          </div>
        )}
      </BottomSheet>
    </Card>
  );
}

function ProgressScreen({ userId, photos, onAddPhoto, onDeletePhoto }) {
  const [range, setRange] = useState("30D");
  const [uploading, setUploading] = useState(false);
  const tiles = useMemo(() => METRIC_TILES(), []);

  async function handleAddPhoto(file) {
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      onAddPhoto(userId, dataUrl);
    } catch {
      // silently ignore a bad file — nothing to persist
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-black text-2xl font-bold">Progress</h1>
        <BarChart3 size={20} className="text-black/40" />
      </div>
      <div className="flex gap-2 px-5 mb-4">
        {["7D", "30D", "90D", "1Y"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              range === r ? "bg-black text-white" : "bg-black/8 text-black/50"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="px-5 space-y-4">
        <div>
          <p className="text-black font-semibold mb-3">My Progress</p>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <MetricTile
                key={t.key}
                label={t.label}
                date={t.date}
                value={typeof t.latest === "number" ? `${t.latest.toFixed(t.decimals)}${t.unit}` : `${t.latest}`}
                series={t.series}
              />
            ))}
          </div>
        </div>

        <PhotosSection photos={photos} onAdd={handleAddPhoto} onDelete={(id) => onDeletePhoto(userId, id)} busy={uploading} />

        <ChartCard title="Body Weight" subtitle="81.8 kg · down 2.4kg over 8 weeks">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={WEIGHT_HISTORY}>
              <defs>
                <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
              <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#wGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Bench Press e1RM" subtitle="103 kg estimated · +11kg in 3 months">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={BENCH_HISTORY}>
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
              <Line type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2.5} dot={{ r: 3, fill: MEASURE_BLUE }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly Training Volume" subtitle="22,600 kg this week · trending up">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={VOLUME_HISTORY}>
              <XAxis dataKey="week" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
              <Bar dataKey="volume" fill={MEASURE_BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <p className="text-black font-semibold mb-3">Strength Personal Bests</p>
          <div className="space-y-2.5">
            {[
              { name: "Bench Press", value: "82.5 kg × 8" },
              { name: "Back Squat", value: "120 kg × 5" },
              { name: "Deadlift", value: "150 kg × 3" },
              { name: "Pull-ups", value: "18 reps" },
            ].map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <span className="text-black/70 text-sm flex items-center gap-2">
                  <Trophy size={14} className="text-black" /> {s.name}
                </span>
                <span className="text-black text-sm font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-black font-semibold mb-3">Achievements</p>
          <div className="grid grid-cols-2 gap-3">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.id} className="bg-black/5 rounded-xl p-3 flex items-center gap-2.5">
                <span className="text-xl grayscale">{a.icon}</span>
                <span className="text-black/70 text-xs font-medium">{a.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================================
   PROFILE TAB
============================================================================ */

function ProfileScreen({ user, onLogout, coachOpen, setCoachOpen, messagesOpen, setMessagesOpen, unreadCount, onAvatarChange }) {
  const rows = [
    { label: "Goals", icon: Target },
    { label: "Equipment", icon: Dumbbell },
    { label: "Training preferences", icon: Settings },
    { label: "Nutrition preferences", icon: Utensils },
    { label: "Notifications", icon: Bell },
    { label: "Connected devices", icon: Heart },
  ];
  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-black text-2xl font-bold">Profile</h1>
      </div>
      <div className="px-5">
        <Card>
          <div className="flex items-center gap-4">
            <AvatarPicker name={user.name} url={user.avatarUrl} size={64} onChange={onAvatarChange} />
            <div>
              <p className="text-black text-lg font-bold">{user.name}</p>
              <p className="text-black/40 text-sm">
                {user.fitnessLevel || "Beginner"} · {user.username}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 bg-black/5 rounded-xl py-2.5 text-center">
              <p className="text-black font-bold">{user.streak || 0}🔥</p>
              <p className="text-black/40 text-[11px]">day streak</p>
            </div>
            <div className="flex-1 bg-black/5 rounded-xl py-2.5 text-center">
              <p className="text-black font-bold">{user.currentSessionIndex || 0}</p>
              <p className="text-black/40 text-[11px]">total workouts</p>
            </div>
            <div className="flex-1 bg-black/5 rounded-xl py-2.5 text-center">
              <p className="text-black font-bold">3</p>
              <p className="text-black/40 text-[11px]">PRs this month</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4 space-y-3">
        <Card onClick={() => setMessagesOpen(true)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center relative">
              <MessageCircle size={18} className="text-black" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-black font-semibold">Messages</p>
              <p className="text-black/40 text-xs">Chat directly with your coach</p>
            </div>
            <ChevronRight size={18} className="text-black/30" />
          </div>
        </Card>

        <Card onClick={() => setCoachOpen(true)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center">
              <Activity size={18} className="text-black" />
            </div>
            <div className="flex-1">
              <p className="text-black font-semibold">AI Coach</p>
              <p className="text-black/40 text-xs">Ask about training, nutrition, and recovery</p>
            </div>
            <ChevronRight size={18} className="text-black/30" />
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <Card>
          {rows.map((r, i) => (
            <div key={r.label} className={`flex items-center gap-3 py-3 ${i !== rows.length - 1 ? "border-b border-black/5" : ""}`}>
              <r.icon size={17} className="text-black/40" />
              <span className="text-black/80 text-sm flex-1">{r.label}</span>
              <ChevronRight size={16} className="text-black/20" />
            </div>
          ))}
        </Card>
      </div>

      <div className="px-5 mt-4">
        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-black/5 border border-black/10 text-black/70 font-semibold py-3.5 rounded-2xl">
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="flex justify-center mt-8">
        <Tagline />
      </div>
    </div>
  );
}

function CoachSheet({ open, onClose, ctx }) {
  const [messages, setMessages] = useState([
    { role: "coach", text: `Hey ${ctx.user.name.split(" ")[0]} — I'm your AI coach. Ask me anything about training, nutrition, or recovery.` },
  ]);
  const [input, setInput] = useState("");

  function send(text) {
    if (!text.trim()) return;
    const userMsg = { role: "user", text };
    const reply = { role: "coach", text: coachReply(text, ctx) };
    setMessages((m) => [...m, userMsg, reply]);
    setInput("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="AI Coach">
      <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-black text-white" : "bg-black/8 text-black/85"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {COACH_SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="text-xs bg-black/8 text-black/60 px-3 py-1.5 rounded-full">
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask your coach..."
          className="flex-1 bg-black/8 rounded-full px-4 py-3 text-sm text-black outline-none placeholder:text-black/30"
        />
        <button onClick={() => send(input)} className="w-11 h-11 rounded-full bg-black flex items-center justify-center">
          <ChevronRight size={18} className="text-white" />
        </button>
      </div>
    </BottomSheet>
  );
}

function MessagesSheet({ open, onClose, user, thread, onSend }) {
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [open, thread.length]);

  function send() {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Messages">
      <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto">
        {thread.length === 0 && (
          <p className="text-black/30 text-sm text-center py-8">No messages yet — say hello to your coach.</p>
        )}
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.from === "client" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "client" ? "bg-black text-white" : "bg-black/8 text-black/85"}`}>
              {m.text && <p className="whitespace-pre-line">{m.text}</p>}
              {m.attachment && (
                <a
                  href={m.attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 ${m.from === "client" ? "bg-white/15 text-white" : "bg-black/8 text-black"}`}
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="text-xs font-medium truncate">{m.attachment.name}</span>
                </a>
              )}
              <p className={`text-[10px] mt-1 ${m.from === "client" ? "text-white/40" : "text-black/30"}`}>
                {new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message your coach..."
          className="flex-1 bg-black/8 rounded-full px-4 py-3 text-sm text-black outline-none placeholder:text-black/30"
        />
        <button onClick={send} className="w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0">
          <Send size={16} className="text-white" />
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================================
   CHECK-INS
============================================================================ */

function nextOccurrence(dayOfWeek, fromDate = new Date()) {
  const d = new Date(fromDate);
  const diff = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastOccurrence(dayOfWeek, fromDate = new Date()) {
  const d = new Date(fromDate);
  const diff = (d.getDay() - dayOfWeek + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isCheckInDue(schedule, responses) {
  const occurrence = lastOccurrence(schedule.dayOfWeek);
  const lastResponse = responses.find((r) => r.scheduleId === schedule.id);
  return !lastResponse || lastResponse.date < occurrence.getTime();
}

function FillCheckInSheet({ schedule, form, open, onClose, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (open) setAnswers({});
  }, [open, form?.id]);

  if (!form) return null;

  function set(qId, value) {
    setAnswers((a) => ({ ...a, [qId]: value }));
  }

  async function handlePhoto(qId, file) {
    if (!file) return;
    setUploading(qId);
    const dataUrl = await fileToCompressedDataUrl(file);
    set(qId, dataUrl);
    setUploading(null);
  }

  const canSubmit = form.questions.every((q) => !q.required || (answers[q.id] !== undefined && answers[q.id] !== ""));

  return (
    <BottomSheet open={open} onClose={onClose} title={form.name}>
      {form.description && <p className="text-black/50 text-sm mb-4">{form.description}</p>}
      <div className="space-y-4">
        {form.questions.map((q) => (
          <div key={q.id}>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">
              {q.label || "Untitled question"} {q.required && <span className="text-black/25">*</span>}
            </p>
            {q.type === "text" && (
              <textarea
                value={answers[q.id] || ""}
                onChange={(e) => set(q.id, e.target.value)}
                rows={2}
                className="w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none placeholder:text-black/25 resize-none"
              />
            )}
            {q.type === "number" && (
              <input
                type="number"
                value={answers[q.id] || ""}
                onChange={(e) => set(q.id, e.target.value)}
                className="w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none"
              />
            )}
            {q.type === "rating" && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set(q.id, n)}
                    className={`flex-1 flex items-center justify-center py-2.5 rounded-xl ${n <= (answers[q.id] || 0) ? "bg-black" : "bg-black/5"}`}
                  >
                    <Star size={16} className={n <= (answers[q.id] || 0) ? "text-white" : "text-black/30"} fill={n <= (answers[q.id] || 0) ? "white" : "none"} />
                  </button>
                ))}
              </div>
            )}
            {q.type === "photo" && (
              <div>
                {answers[q.id] ? (
                  <div className="relative">
                    <img src={answers[q.id]} alt="" className="w-full rounded-xl max-h-56 object-cover" />
                    <button
                      onClick={() => set(q.id, "")}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full flex flex-col items-center justify-center gap-1.5 bg-black/5 border border-dashed border-black/15 rounded-xl py-6 cursor-pointer">
                    <Camera size={18} className="text-black/40" />
                    <span className="text-black/40 text-xs">{uploading === q.id ? "Uploading…" : "Add a photo"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(q.id, e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => onSubmit(answers)}
        disabled={!canSubmit}
        className="w-full mt-6 bg-black text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-30"
      >
        <Check size={18} strokeWidth={3} /> SUBMIT CHECK-IN
      </button>
    </BottomSheet>
  );
}

function CheckInCard({ schedule, form, due, onFill }) {
  if (!form) return null;
  return (
    <div className="flex items-center gap-3 bg-white border border-black/8 rounded-2xl px-4 py-3.5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${due ? "bg-black" : "bg-black/6"}`}>
        <CalendarCheck size={17} className={due ? "text-white" : "text-black/40"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-black font-semibold text-sm truncate">{form.name}</p>
        <p className="text-black/40 text-xs mt-0.5">Every {DAY_LABELS[schedule.dayOfWeek]}</p>
      </div>
      {due ? (
        <button onClick={onFill} className="bg-black text-white text-xs font-bold px-3.5 py-2 rounded-lg shrink-0">
          Fill out
        </button>
      ) : (
        <span className="text-black/30 text-xs shrink-0">Done</span>
      )}
    </div>
  );
}

function CheckInsScreen({ userId, showToast }) {
  const { db, submitFormResponse } = useApp();
  const [filling, setFilling] = useState(null); // schedule object

  const schedules = ((db.formSchedules || {})[userId] || []).filter((s) => s.active);
  const responses = (db.formResponses || {})[userId] || [];
  const formsById = Object.fromEntries((db.forms || []).map((f) => [f.id, f]));

  const due = schedules.filter((s) => isCheckInDue(s, responses));
  const upcoming = schedules.filter((s) => !isCheckInDue(s, responses));

  function submit(answers) {
    submitFormResponse(userId, { formId: filling.formId, scheduleId: filling.id, answers });
    showToast("Check-in submitted");
    setFilling(null);
  }

  return (
    <div className="pb-6 space-y-4">
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-black text-2xl font-bold">Check-ins</h1>
        <p className="text-black/40 text-sm mt-0.5">Scheduled by your coach</p>
      </div>

      {schedules.length === 0 ? (
        <Card className="mx-5 text-center py-10">
          <CalendarCheck size={26} className="text-black/25 mx-auto mb-3" />
          <p className="text-black font-semibold">No check-ins scheduled</p>
          <p className="text-black/40 text-sm mt-1">Your coach hasn't scheduled any check-ins yet.</p>
        </Card>
      ) : (
        <>
          {due.length > 0 && (
            <div className="px-5 space-y-2.5">
              <p className="text-black/40 text-xs tracking-wide font-semibold">DUE NOW</p>
              {due.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due onFill={() => setFilling(s)} />
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="px-5 space-y-2.5">
              <p className="text-black/40 text-xs tracking-wide font-semibold mt-2">UPCOMING</p>
              {upcoming.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due={false} />
              ))}
            </div>
          )}
        </>
      )}

      {responses.length > 0 && (
        <div className="px-5 space-y-2.5">
          <p className="text-black/40 text-xs tracking-wide font-semibold mt-2">HISTORY</p>
          {responses.slice(0, 10).map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-black/[0.03] rounded-xl px-4 py-2.5">
              <span className="text-black/70 text-sm">{formsById[r.formId]?.name || "Check-in"}</span>
              <span className="text-black/35 text-xs">{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
          ))}
        </div>
      )}

      <FillCheckInSheet schedule={filling} form={filling ? formsById[filling.formId] : null} open={!!filling} onClose={() => setFilling(null)} onSubmit={submit} />
    </div>
  );
}

/* ============================================================================
   APP SHELL
============================================================================ */

const TABS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "workouts", label: "Workouts", icon: Dumbbell },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "checkins", label: "Check-ins", icon: CalendarCheck },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "profile", label: "Profile", icon: User },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ClientApp() {
  const {
    currentUser,
    db,
    logWorkout,
    setNutrition,
    logout,
    sendMessage,
    addProgressPhoto,
    deleteProgressPhoto,
    createSavedMeal,
    deleteSavedMeal,
    toggleHabitToday,
    updateUser,
  } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("home");
  const [activeLog, setActiveLog] = useState(null); // {exerciseId: [sets]} while a session is open
  const [exerciseNotes, setExerciseNotes] = useState({}); // {exerciseId: note} — the client's own notes, separate from the coach's
  const [sessionOpen, setSessionOpen] = useState(false);
  const [previewSession, setPreviewSession] = useState(null);
  const [previewCanStart, setPreviewCanStart] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [coachOpen, setCoachOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [seenMessageCount, setSeenMessageCount] = useState(0);
  const [dayOffset, setDayOffset] = useState(0); // days from today, selected on the Home calendar strip

  const clientPhases = (db.clientPhases || {})[currentUser.id] || [];
  const currentPhase = getCurrentPhase(clientPhases, new Date().toISOString().slice(0, 10));
  const program = currentPhase || db.programs.find((p) => p.id === currentUser.assignedProgramId) || null;
  const thread = db.messages[currentUser.id] || [];
  const photos = db.progressPhotos[currentUser.id] || [];
  const unreadCount = Math.max(0, thread.filter((m) => m.from === "coach").length - seenMessageCount);
  const checkInResponses = (db.formResponses || {})[currentUser.id] || [];
  const dueCheckInsCount = ((db.formSchedules || {})[currentUser.id] || []).filter(
    (s) => s.active && isCheckInDue(s, checkInResponses)
  ).length;
  const sessions = useMemo(() => flattenSessions(program), [program]);
  const currentIndex = sessions.length ? (currentUser.currentSessionIndex || 0) % sessions.length : 0;
  const todaySession = sessions.length ? sessions[currentIndex] : null;
  const exercisesById = useMemo(() => Object.fromEntries(db.exercises.map((e) => [e.id, e])), [db.exercises]);
  const logsForClient = db.workoutLogs[currentUser.id] || [];
  const nutrition = db.nutrition[currentUser.id] || DEFAULT_NUTRITION;
  const savedMeals = (db.savedMeals || {})[currentUser.id] || [];
  const habits = (db.habits || {})[currentUser.id] || [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const completedHabitIds = ((db.habitLog || {})[currentUser.id] || {})[todayKey] || [];

  const isToday = dayOffset === 0;
  const selectedIndex = sessions.length
    ? (((currentIndex + dayOffset) % sessions.length) + sessions.length) % sessions.length
    : 0;
  const daySession = sessions.length ? sessions[selectedIndex] : null;
  const selectedDateKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  }, [dayOffset]);
  const dayHabitCompletedIds = isToday ? completedHabitIds : ((db.habitLog || {})[currentUser.id] || {})[selectedDateKey] || [];
  const completedOnDate = logsForClient.some((l) => new Date(l.date).toISOString().slice(0, 10) === selectedDateKey);

  useEffect(() => {
    if (!db.nutrition[currentUser.id]) {
      setNutrition(currentUser.id, () => DEFAULT_NUTRITION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function startWorkout() {
    if (!todaySession) return;
    setActiveLog((prev) => prev || {});
    setSessionOpen(true);
  }

  function finishWorkout() {
    const raw = activeLog || {};
    const cleanedLog = {};
    Object.entries(raw).forEach(([exerciseId, sets]) => {
      const cleaned = (sets || [])
        .filter((s) => s.weight !== "" && s.weight != null && s.reps !== "" && s.reps != null && !isNaN(Number(s.weight)) && !isNaN(Number(s.reps)))
        .map((s, i) => ({ setNumber: i + 1, weight: Number(s.weight), reps: Number(s.reps), completed: true, isPR: !!s.isPR }));
      if (cleaned.length) cleanedLog[exerciseId] = cleaned;
    });
    logWorkout(currentUser.id, {
      programId: program.id,
      programName: program.name,
      weekLabel: todaySession.weekLabel,
      dayLabel: todaySession.label,
      entries: Object.entries(cleanedLog).map(([exerciseId, sets]) => ({ exerciseId, sets, note: exerciseNotes[exerciseId] || "" })),
    });
    setSummaryData({ daySession: todaySession, activeLog: cleanedLog });
    setActiveLog(null);
    setExerciseNotes({});
    setSessionOpen(false);
    setSummaryOpen(true);
  }

  function openPreview(session, canStart) {
    if (!session) return;
    setPreviewSession(session);
    setPreviewCanStart(canStart);
  }

  function addFood(meal, food) {
    setNutrition(currentUser.id, (n) => {
      const base = n || DEFAULT_NUTRITION;
      return {
        ...base,
        calories: base.calories + food.cals,
        protein: base.protein + food.protein,
        carbs: base.carbs + food.carbs,
        fat: base.fat + food.fat,
        meals: { ...base.meals, [meal]: [...base.meals[meal], { ...food, id: food.id + "-" + Date.now() }] },
      };
    });
    showToast(`${food.name} added to ${meal}`);
  }

  function addWater(liters) {
    setNutrition(currentUser.id, (n) => {
      const base = n || DEFAULT_NUTRITION;
      return { ...base, water: Math.round((base.water + liters) * 100) / 100 };
    });
    showToast(`+${Math.round(liters * 1000)}ml logged`);
  }

  function doLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function openMessages() {
    setSeenMessageCount(thread.filter((m) => m.from === "coach").length);
    setMessagesOpen(true);
  }

  return (
    <div className="w-full h-full min-h-screen bg-white font-sans flex justify-center">
      <div className="w-full max-w-md relative">
        <BrandBar />
        {tab === "home" && (
          <HomeScreen
            user={currentUser}
            program={program}
            sessions={sessions}
            currentIndex={currentIndex}
            todaySession={todaySession}
            activeLog={activeLog}
            onStartWorkout={startWorkout}
            onViewWorkout={() => openPreview(daySession, isToday)}
            nutrition={nutrition}
            onLogFood={() => setTab("nutrition")}
            onLogWater={() => addWater(0.25)}
            showToast={showToast}
            habits={habits}
            completedHabitIds={completedHabitIds}
            onToggleHabit={(habitId) => toggleHabitToday(currentUser.id, habitId)}
            onAvatarClick={() => setTab("profile")}
            dayOffset={dayOffset}
            onSelectDay={setDayOffset}
            daySession={daySession}
            isToday={isToday}
            completedOnDate={completedOnDate}
            dayHabitCompletedIds={dayHabitCompletedIds}
            exercisesById={exercisesById}
          />
        )}
        {tab === "workouts" && (
          <WorkoutsScreen
            program={program}
            todaySession={todaySession}
            sessions={sessions}
            currentIndex={currentIndex}
            activeLog={activeLog}
            onStart={startWorkout}
            onViewWorkout={() => openPreview(todaySession, true)}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
          />
        )}
        {tab === "nutrition" && (
          <NutritionScreen
            nutrition={nutrition}
            onAddFood={addFood}
            onAddWater={addWater}
            savedMeals={savedMeals}
            onCreateSavedMeal={(meal) => createSavedMeal(currentUser.id, meal)}
            onDeleteSavedMeal={(mealId) => deleteSavedMeal(currentUser.id, mealId)}
            showToast={showToast}
          />
        )}
        {tab === "checkins" && <CheckInsScreen userId={currentUser.id} showToast={showToast} />}
        {tab === "progress" && (
          <ProgressScreen userId={currentUser.id} photos={photos} onAddPhoto={addProgressPhoto} onDeletePhoto={deleteProgressPhoto} />
        )}
        {tab === "profile" && (
          <ProfileScreen
            user={currentUser}
            onLogout={doLogout}
            coachOpen={coachOpen}
            setCoachOpen={setCoachOpen}
            messagesOpen={messagesOpen}
            setMessagesOpen={openMessages}
            unreadCount={unreadCount}
            onAvatarChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
          />
        )}

        <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50">
          <div className="w-full max-w-md bg-[#FAFAFA]/95 backdrop-blur border-t border-black/5 flex px-2 pb-safe">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-3 relative">
                  <Icon size={21} className={active ? "text-black" : "text-black/35"} strokeWidth={active ? 2.4 : 2} />
                  <span className={`text-[10px] font-medium ${active ? "text-black" : "text-black/35"}`}>{t.label}</span>
                  {t.id === "checkins" && dueCheckInsCount > 0 && (
                    <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-black" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {sessionOpen && activeLog && todaySession && (
          <WorkoutSession
            session={todaySession}
            activeLog={activeLog}
            setActiveLog={setActiveLog}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
            exerciseNotes={exerciseNotes}
            setExerciseNotes={setExerciseNotes}
            onFinish={finishWorkout}
            onExit={() => setSessionOpen(false)}
          />
        )}
        {summaryOpen && summaryData && (
          <WorkoutSummary daySession={summaryData.daySession} activeLog={summaryData.activeLog} onDone={() => setSummaryOpen(false)} />
        )}
        {previewSession && (
          <WorkoutPreviewSheet
            session={previewSession}
            exercisesById={exercisesById}
            canStart={previewCanStart}
            onClose={() => setPreviewSession(null)}
            onStart={() => {
              setPreviewSession(null);
              startWorkout();
            }}
          />
        )}

        <CoachSheet open={coachOpen} onClose={() => setCoachOpen(false)} ctx={{ user: currentUser, nutrition, todaySession }} />
        <MessagesSheet
          open={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          user={currentUser}
          thread={thread}
          onSend={(text) => sendMessage(currentUser.id, "client", text)}
        />
        <Toast message={toast.message} show={toast.show} />
      </div>
    </div>
  );
}
