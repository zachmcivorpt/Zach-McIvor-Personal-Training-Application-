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
  Droplet,
  Moon,
  Activity,
  Footprints,
  Heart,
  Trophy,
  Search,
  Bell,
  Settings,
  Target,
  BarChart3,
  Camera,
  ScanLine,
  LogOut,
  Image as ImageIcon,
  X,
  Send,
  MessageCircle,
  Clock,
  ClipboardList,
  CalendarCheck,
  Star,
  FileText,
  Info,
  Repeat,
  Scale,
  Beef,
  GlassWater,
  Droplets,
  Sparkles,
  Trash2,
  BellRing,
  Calendar,
  Hand,
  Banana,
  ThermometerSun,
  Video,
  Percent,
  Lock,
} from "lucide-react";
import { enablePush, disablePush, pushSupported } from "../lib/push";
import { uploadMessageVideo } from "../lib/storage";
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
import { useApp, estimate1RM, getPreviousPerformance, getPreviousSets, getCurrentPhase } from "../lib/AppContext";
import { countExercises, estimateWorkoutMinutes, countWorkoutSets } from "../lib/workoutStats";
import {
  Card,
  Pill,
  ProgressBar,
  BottomSheet,
  Toast,
  FullScreenOverlay,
  NumberStepper,
  Logo,
  MetricTile,
  DangerButton,
  PrimaryButton,
  SecondaryButton,
  Field,
  TextInput,
  TextArea,
  Avatar,
  AvatarPicker,
  Tagline,
  ExerciseThumb,
  VideoPlayerSheet,
} from "../components/ui";
import { MEASURE_BLUE, GOAL_GREEN, BORDER_STRONG } from "../theme";
import {
  computeWeeklyVolume,
  computeWorkoutsSeries,
  computeE1RMHistory,
  findExerciseByKeyword,
  computePersonalBests,
  computePRsInLastNDays,
  computeSessionsThisWeek,
  computeWeeklyStreak,
  computeAchievements,
  computePerformanceTimeline,
  computeWeeklySessionCompletion,
  closestWeighIn,
  suggestNextSet,
} from "../lib/trainingStats";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { challengeStatus } from "../lib/challengeMetrics";
import { fileToCompressedDataUrl } from "../lib/image";
import { parseVideoUrl } from "../lib/video";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { BarcodeScanSheet, PhotoEstimateSheet, CreateMealSheet, SavedMealsSection, FoodQuantitySheet } from "./NutritionFeatures";

// A short two-tone chime for when the rest timer hits zero — synthesized
// with the Web Audio API rather than an audio file, so it works offline in
// the PWA and needs no asset to ship. Silently no-ops if the browser
// blocks audio without a user gesture, or has no AudioContext at all.
let sharedAudioCtx = null;

// Browsers refuse to let an AudioContext produce sound unless it was
// created (or resumed) inside a real user gesture — a click/tap. The rest
// timer actually finishing is a setTimeout callback, not a gesture, so
// creating the AudioContext there gets silently blocked, no error thrown.
// Call this from the tap that STARTS the rest timer instead, so the
// context is already unlocked and running by the time it later expires.
function unlockTimerAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
  } catch {
    // ignore
  }
}

function playTimerDing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    [880, 1175].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  } catch {
    // ignore — audio is a nice-to-have, never worth breaking the timer over
  }
}

// Repeated float addition/subtraction on macro grams drifts into ugly
// values like 14.200000000000003 — round back to 1 decimal after every
// running-total update so it never has to be cleaned up at display time.
function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

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
const COACH_SUGGESTIONS = [
  "What should I train today?",
  "I only have 30 minutes.",
  "How much protein do I have left?",
  "Should I increase my bench weight?",
  "Give me some snack ideas",
  "What should I eat post-workout?",
];

// Real, common, easy-to-grab options with real macros (scaled from the same
// food database the Nutrition tab logs against) — including the kind of
// thing someone actually grabs on the way out (a packet of jerky, a
// fridge protein shake), not just meal-prep ideas. 20 each so there's
// always something new to suggest — see formatFoodSuggestions below for
// why only a few show up per message.
const SNACK_SUGGESTIONS = [
  { name: "Beef jerky (1 packet, ~30g)", cals: 123, protein: 10, carbs: 3, fat: 2 },
  { name: "Protein shake, RTD (375ml — e.g. a 7-Eleven fridge one)", cals: 139, protein: 30, carbs: 4, fat: 2 },
  { name: "YoPro protein yoghurt (170g tub)", cals: 158, protein: 26, carbs: 9, fat: 2 },
  { name: "Banana + a small handful of almonds (30g)", cals: 279, protein: 7, carbs: 34, fat: 15 },
  { name: "Cottage cheese (150g) + 2 rice cakes", cals: 224, protein: 19, carbs: 21, fat: 6 },
  { name: "Greek yoghurt, low fat (170g) + a banana", cals: 205, protein: 18, carbs: 33, fat: 1 },
  { name: "2 boiled eggs + a rice cake", cals: 182, protein: 14, carbs: 9, fat: 10 },
  { name: "Tuna, canned (100g) + 2 rice cakes", cals: 193, protein: 28, carbs: 16, fat: 2 },
  { name: "Cheddar cheese (30g) + an apple", cals: 215, protein: 9, carbs: 25, fat: 10 },
  { name: "Protein bar (1 bar, ~60g)", cals: 210, protein: 18, carbs: 21, fat: 6 },
  { name: "Peanut butter (20g) + an apple", cals: 212, protein: 6, carbs: 29, fat: 10 },
  { name: "Almonds (30g, small handful)", cals: 174, protein: 6, carbs: 7, fat: 15 },
  { name: "Hummus (50g) + 2 rice cakes", cals: 160, protein: 6, carbs: 23, fat: 6 },
  { name: "Oats, dry (50g) — add water or milk", cals: 190, protein: 7, carbs: 34, fat: 4 },
  { name: "Cottage cheese (150g) + a banana", cals: 252, protein: 18, carbs: 32, fat: 6 },
  { name: "Egg whites (130g) + 2 rice cakes", cals: 145, protein: 16, carbs: 17, fat: 1 },
  { name: "Mozzarella cheese (30g) + an apple", cals: 178, protein: 9, carbs: 26, fat: 5 },
  { name: "Vegan protein bar (1 bar, ~60g)", cals: 210, protein: 12, carbs: 24, fat: 6 },
  { name: "Ricotta (100g) + an apple", cals: 268, protein: 12, carbs: 28, fat: 13 },
  { name: "Walnuts (30g, small handful)", cals: 196, protein: 5, carbs: 4, fat: 20 },
];
const POST_WORKOUT_SUGGESTIONS = [
  { name: "Protein shake, RTD (375ml) + a banana", cals: 244, protein: 31, carbs: 31, fat: 2 },
  { name: "Beef jerky (1 packet) + 2 rice cakes", cals: 200, protein: 12, carbs: 19, fat: 2 },
  { name: "Cottage cheese (150g) + 2 rice cakes", cals: 224, protein: 19, carbs: 21, fat: 6 },
  { name: "YoPro protein yoghurt (170g) + a banana", cals: 263, protein: 27, carbs: 36, fat: 2 },
  { name: "Chicken breast (100g) + 2 rice cakes", cals: 242, protein: 33, carbs: 16, fat: 4 },
  { name: "Tuna, canned (100g) + a banana", cals: 221, protein: 27, carbs: 27, fat: 1 },
  { name: "Egg whites (130g) + a banana", cals: 173, protein: 15, carbs: 28, fat: 0 },
  { name: "Greek yoghurt, low fat (170g) + oats (25g)", cals: 195, protein: 20, carbs: 23, fat: 3 },
  { name: "Protein bar (1 bar) + a banana", cals: 315, protein: 19, carbs: 48, fat: 6 },
  { name: "2 whole eggs + 2 rice cakes", cals: 220, protein: 15, carbs: 17, fat: 11 },
  { name: "Cottage cheese (150g) + a banana", cals: 252, protein: 18, carbs: 32, fat: 6 },
  { name: "Turkey breast (100g) + 2 rice cakes", cals: 212, protein: 32, carbs: 16, fat: 2 },
  { name: "Protein shake, RTD (375ml) + oats (25g)", cals: 234, protein: 33, carbs: 21, fat: 4 },
  { name: "Chicken tenderloin (150g) + a banana", cals: 270, protein: 36, carbs: 27, fat: 2 },
  { name: "YoPro protein yoghurt (170g) + oats (25g)", cals: 253, protein: 29, carbs: 26, fat: 4 },
  { name: "Egg white protein powder (1 scoop) + a banana", cals: 216, protein: 26, carbs: 28, fat: 0 },
  { name: "Beef jerky (1 packet) + a banana", cals: 228, protein: 11, carbs: 30, fat: 2 },
  { name: "Vegan protein bar + a banana", cals: 315, protein: 13, carbs: 51, fat: 6 },
  { name: "Tuna steak (150g) + 2 rice cakes", cals: 353, protein: 47, carbs: 16, fat: 10 },
  { name: "Ham, deli slices (50g) + 2 rice cakes", cals: 131, protein: 11, carbs: 17, fat: 3 },
];

const SNACK_INTRO = "A few easy snack options with the macros:";
const POST_WORKOUT_INTRO = "Good post-training options — protein-forward and easy to grab:";

// Counts how many bullet options have already been sent for this topic
// across the whole conversation, so "more" continues from where it left
// off instead of repeating (or re-explaining) the same batch.
function countShownSuggestions(messages, intro) {
  let count = 0;
  (messages || []).forEach((m) => {
    if (m.role === "coach" && m.text.startsWith(intro)) count += (m.text.match(/^• /gm) || []).length;
  });
  return count;
}

// Only sends a few at a time — a wall of 20 options in one bubble is
// harder to actually read than useful. Points at "more" for the rest.
function formatFoodSuggestions(intro, list, offset, batchSize = 3) {
  const batch = list.slice(offset, offset + batchSize);
  if (batch.length === 0) return `That's every option I've got for now (${list.length} sent) — message your coach if you'd like more ideas.`;
  const lines = batch.map((f) => `• ${f.name} — ${f.cals} kcal, ${f.protein}g protein, ${f.carbs}g carbs, ${f.fat}g fat`);
  const remaining = list.length - (offset + batch.length);
  const tail =
    remaining > 0
      ? `Just ask for "more" and I'll send another ${Math.min(batchSize, remaining)}.`
      : "Log whichever one you actually have under Nutrition — search its name and it'll pull the same numbers.";
  return [intro, ...lines, tail].join("\n");
}

// Quick Tips — canned, rule-based answers to common questions, built only
// from real data already loaded in this session (nutrition, today's
// session). This is NOT a live AI model — there's no backend to run one
// against, so it never invents specific numbers (lift history, recovery
// scores) it doesn't actually have. Anything it can't answer honestly
// points the client to messaging their coach instead.
function coachReply(prompt, ctx, messages = []) {
  const p = prompt.toLowerCase();
  const askingFoodTopic = p.includes("snack") || (p.includes("post") && (p.includes("workout") || p.includes("training")));
  const wantsMore = (p.includes("more") || p.trim() === "more please") && !askingFoodTopic;
  if (wantsMore) {
    const lastCoach = [...messages].reverse().find((m) => m.role === "coach");
    if (lastCoach?.text.startsWith(POST_WORKOUT_INTRO)) {
      return formatFoodSuggestions(POST_WORKOUT_INTRO, POST_WORKOUT_SUGGESTIONS, countShownSuggestions(messages, POST_WORKOUT_INTRO));
    }
    if (lastCoach?.text.startsWith(SNACK_INTRO)) {
      return formatFoodSuggestions(SNACK_INTRO, SNACK_SUGGESTIONS, countShownSuggestions(messages, SNACK_INTRO));
    }
  }
  if (p.includes("30 minutes") || p.includes("short"))
    return "With 30 minutes, try a condensed version of today's session — pick the 3 heaviest compound lifts and cut rest to 60 seconds. Message your coach if you'd like them to trim it for you.";
  if (p.includes("post") && (p.includes("workout") || p.includes("training")))
    return formatFoodSuggestions(POST_WORKOUT_INTRO, POST_WORKOUT_SUGGESTIONS, 0);
  if (p.includes("snack"))
    return formatFoodSuggestions(SNACK_INTRO, SNACK_SUGGESTIONS, 0);
  if (p.includes("protein"))
    return `You've had ${ctx.nutrition.protein}g of your ${ctx.targets.protein}g target — that leaves ${Math.max(0, ctx.targets.protein - ctx.nutrition.protein)}g. A chicken breast and a scoop of whey would close most of that gap.`;
  if (p.includes("bench") || p.includes("weight") || p.includes("increase"))
    return "Check the Progress tab for your real lift history and e1RM trend — I don't have that pulled up here. If you're unsure whether to increase the weight, message your coach and they'll make the call.";
  if (p.includes("today") || p.includes("train"))
    return ctx.todaySession
      ? `Today's plan is ${ctx.todaySession.label} — ${countExercises(ctx.todaySession.exercises)} exercises. Head to the Training tab when you're ready to start.`
      : "You don't have a workout scheduled today — check the Training tab, or message your coach if that doesn't look right.";
  if (p.includes("progress"))
    return "Your real trends (volume, bodyweight, PRs) are on the Progress tab — I don't have them loaded in this chat.";
  return "I can only answer a few common questions right now (today's workout, macros left, general training advice) — for anything specific to you, message your coach directly.";
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

// A prescribed exercise is either a rep count, AMRAP, or a held/worked
// duration in seconds (e.g. a plank) — this renders whichever it is.
function formatTargetReps(exMeta) {
  if (exMeta.targetType === "time") return `${exMeta.targetReps || 30}s`;
  if (exMeta.targetReps === "AMRAP") return "AMRAP";
  return `${exMeta.targetReps} Repetitions`;
}

const SECTION_ORDER = [
  { key: "warmup", label: "Warm-up" },
  { key: "main", label: "Main Session" },
  { key: "cooldown", label: "Cool-down" },
];

// Groups a session's exercises into Warm-up / Main / Cool-down for display.
// Older sessions have no `section` tag on any exercise (everything defaults
// to "main") — in that case we skip the headers entirely so a plain
// program still renders as a plain list, not a lone "MAIN SESSION" title.
function sectionedExercises(list) {
  const withIndex = list.map((exMeta, i) => ({ exMeta, i }));
  const groups = SECTION_ORDER.map((s) => ({
    ...s,
    items: withIndex.filter(({ exMeta }) => (exMeta.section || "main") === s.key),
  })).filter((g) => g.items.length > 0);
  const showHeader = groups.length > 1;
  return groups.map((g) => ({ ...g, showHeader }));
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

function Header({ user, onAvatarClick, notifCount = 0, onOpenNotifications }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex items-center justify-between px-3 pt-6 pb-2">
      <div>
        <p className="text-black text-xl font-semibold flex items-center gap-1.5">
          {greeting}, {user.name.split(" ")[0]}
          <Dumbbell size={18} className="text-black" />
        </p>
        <p className="text-black/40 text-sm mt-0.5">{dateStr}</p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onOpenNotifications} className="w-10 h-10 rounded-full bg-black/8 flex items-center justify-center relative">
          <Bell size={18} className="text-black/80" />
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
              {notifCount}
            </span>
          )}
        </button>
        <Avatar name={user.name} url={user.avatarUrl} size={40} onClick={onAvatarClick} />
      </div>
    </div>
  );
}

function TodayWorkoutCard({ todaySession, activeLog, onStart, onView, isToday = true, completedOnDate = false, isPastDate = false, exercisesById, dbReady = true }) {
  if (!todaySession) {
    return (
      <Card className="mx-3 text-center py-10">
        <Dumbbell size={26} className="text-black/25 mx-auto mb-3" />
        <p className="text-black font-semibold">{dbReady ? "No workout scheduled" : "Loading your schedule…"}</p>
        {dbReady && (
          <p className="text-black/40 text-sm mt-1">
            {isToday ? "Nothing's scheduled for today." : "Nothing's scheduled for this day."}
          </p>
        )}
      </Card>
    );
  }
  const completedSets = isToday && activeLog ? Object.values(activeLog).flat().filter((s) => s.completed).length : 0;
  const totalSets = countWorkoutSets(todaySession.exercises);
  const started = isToday && !!activeLog;
  const pillLabel = completedOnDate ? "COMPLETED" : isToday ? "TODAY'S WORKOUT" : isPastDate ? "MISSED" : "SCHEDULED";

  return (
    <Card className="mx-3 !p-4 !rounded-none !border-0">
      <div className="flex items-center justify-between mb-2">
        <Pill tone="solid">{pillLabel}</Pill>
      </div>
      <h2 className="text-black text-lg font-bold border-l-[3px] border-black pl-2.5">{todaySession.label}</h2>
      <p className="text-black/50 text-xs mt-0.5 pl-2.5">
        {countExercises(todaySession.exercises)} exercise{countExercises(todaySession.exercises) === 1 ? "" : "s"}
      </p>
      {(todaySession.muscleGroups || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {todaySession.muscleGroups.map((m) => (
            <Pill key={m}>{m}</Pill>
          ))}
        </div>
      )}

      {started && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-black/40 mb-1">
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
          {completedOnDate && !started && (
            <div className="flex items-center gap-2 mt-3 text-black/60 text-sm">
              <Check size={14} /> Workout completed
            </div>
          )}
          <div className="flex gap-2 mt-3.5">
            {(!completedOnDate || started) && (
              <button
                onClick={onStart}
                className="flex-1 bg-black text-white font-bold py-3 rounded-none text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Play size={16} fill="white" />
                {started ? "RESUME" : "START WORKOUT"}
              </button>
            )}
            <button
              onClick={onView}
              className={`text-black/70 text-sm font-semibold px-4 rounded-none border-2 border-black/15 bg-black/5 ${
                completedOnDate && !started ? "flex-1 py-3" : ""
              }`}
            >
              View
            </button>
          </div>
        </>
      ) : (
        <>
          {completedOnDate && (
            <div className="flex items-center gap-2 mt-3 text-black/60 text-sm">
              <Check size={14} /> Workout completed
            </div>
          )}
          <button onClick={onView} className="w-full mt-3 text-black/60 text-sm font-medium py-2 rounded-none border-2 border-black/15 bg-black/5">
            Preview exercises
          </button>
        </>
      )}
    </Card>
  );
}

function NutritionSummaryCard({ nutrition, targets, onLogFood, onLogWater, isToday = true }) {
  const logged = nutrition || DEFAULT_NUTRITION;
  const items = [
    { label: "CALORIES", value: Math.round(logged.calories), target: targets.calories, unit: "" },
    { label: "PROTEIN", value: round1(logged.protein), target: targets.protein, unit: "g" },
    { label: "CARBS", value: round1(logged.carbs), target: targets.carbs, unit: "g" },
    { label: "FAT", value: round1(logged.fat), target: targets.fat, unit: "g" },
  ];
  return (
    <Card className="mx-3 !rounded-none !border-2" style={{ borderColor: BORDER_STRONG }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-black font-bold border-l-[3px] border-black pl-2.5">{isToday ? "Nutrition Today" : "Nutrition"}</h3>
        <Utensils size={16} className="text-black/30" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-black/40 tracking-wide">{it.label}</span>
            </div>
            <p className="text-black text-sm font-semibold mb-1.5">
              {it.value}
              {it.unit} <span className="text-black/30 font-normal">/ {it.target}{it.unit}</span>
            </p>
            <ProgressBar
              value={it.value}
              max={it.target}
              height={6}
              color={it.value >= it.target ? GOAL_GREEN : MEASURE_BLUE}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t-2 border-black/10">
        <div className="flex items-center gap-3 mb-1.5">
          {logged.water >= targets.water ? (
            <Droplets size={16} className="text-black shrink-0" />
          ) : (
            <GlassWater size={16} className="text-black/50 shrink-0" />
          )}
          <span className="text-black/70 text-sm flex-1">
            Water: <span className="font-semibold text-black">{logged.water}L</span> / {targets.water}L
          </span>
        </div>
        <ProgressBar
          value={logged.water}
          max={targets.water}
          height={6}
          color={logged.water >= targets.water ? GOAL_GREEN : MEASURE_BLUE}
        />
      </div>
      {isToday && (
        <div className="flex gap-2 mt-4">
          <button onClick={onLogFood} className="flex-1 bg-black/8 text-black text-sm font-semibold py-3 rounded-xl active:scale-[0.97] transition-transform">
            + LOG FOOD
          </button>
          <button
            onClick={onLogWater}
            className="flex-1 flex items-center justify-center gap-1.5 bg-black/8 text-black text-sm font-semibold py-3 rounded-xl active:scale-90 transition-transform duration-150"
          >
            <GlassWater size={15} /> + LOG WATER
          </button>
        </div>
      )}
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
    <div className="flex items-center justify-between px-3 pt-1 pb-1">
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
    <div className="px-3">
      <div ref={stripRef} className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {offsets.map((offset) => {
          const d = dateForOffset(offset);
          const isToday = offset === 0;
          const isSelected = offset === selectedOffset;
          return (
            <button
              key={offset}
              data-offset={offset}
              onClick={() => onSelect(offset)}
              className={`shrink-0 w-10 rounded-xl py-1.5 flex flex-col items-center gap-0.5 border transition-colors ${
                isSelected ? "bg-black border-black" : "bg-black/5 border-black/10"
              }`}
            >
              <span className={`text-sm font-bold leading-none ${isSelected ? "text-white" : "text-black"}`}>{d.getDate()}</span>
              <span className={`text-[9px] font-medium ${isSelected ? "text-white/60" : "text-black/40"}`}>
                {d.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              {isToday && <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white/60" : "bg-black/50"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Maps a coach-written habit label to a fitting icon by keyword — purely
// cosmetic (no data model change), so any habit still works, it just
// looks generic if nothing matches.
function habitIcon(label) {
  const l = label.toLowerCase();
  if (/\bstep|walk|run|jog|cardio\b/.test(l)) return Footprints;
  if (/\bprotein|steak|meat|chicken|meal\b/.test(l)) return Beef;
  if (/\bwater|hydrat|drink\b/.test(l)) return GlassWater;
  if (/\bsleep|bed|rest\b/.test(l)) return Moon;
  if (/\bstretch|mobility|yoga|recover\b/.test(l)) return Activity;
  return Sparkles;
}

function DailyHabitsCard({ habits, completedIds, onToggle, interactive = true }) {
  if (habits.length === 0) return null;
  const doneCount = habits.filter((h) => completedIds.includes(h.id)).length;
  return (
    <Card className="mx-3">
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
          const Icon = habitIcon(h.label);
          const Tag = interactive ? "button" : "div";
          return (
            <Tag
              key={h.id}
              onClick={interactive ? () => onToggle(h.id) : undefined}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${
                done ? "bg-black/[0.04]" : "bg-black/5"
              } ${interactive ? "active:scale-[0.97]" : "opacity-70"} transition-transform duration-150`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                  done ? "bg-black scale-100" : "bg-black/8 scale-95"
                }`}
              >
                <Icon size={16} className={done ? "text-white" : "text-black/45"} strokeWidth={2.2} />
              </span>
              <span className={`text-sm flex-1 transition-colors ${done ? "text-black/40 line-through" : "text-black/85"}`}>{h.label}</span>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 ${
                  done ? "bg-black border-black scale-100" : "border-black/20 scale-90"
                }`}
              >
                {done && <Check size={12} className="text-white" strokeWidth={3.5} />}
              </span>
            </Tag>
          );
        })}
      </div>
    </Card>
  );
}

function ActiveChallengesCard({ challenges, userId }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const active = challenges.filter((c) => challengeStatus(c, todayKey) === "active");
  if (active.length === 0) return null;

  return (
    <div className="px-3 space-y-2.5">
      {active.map((c) => {
        const snapshot = c.leaderboardSnapshot || [];
        const mine = snapshot.find((r) => r.clientId === userId);
        return (
          <Card key={c.id} className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                <Trophy size={17} className="text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black font-semibold text-sm truncate">{c.name}</p>
                {mine ? (
                  <p className="text-black/50 text-xs mt-0.5">
                    You're rank #{mine.rank} of {snapshot.length} · {mine.value}
                  </p>
                ) : (
                  <p className="text-black/30 text-xs mt-0.5">Leaderboard updates when your coach checks in</p>
                )}
              </div>
              {mine && mine.rank <= 3 && (
                <span className="text-lg shrink-0">{mine.rank === 1 ? "🥇" : mine.rank === 2 ? "🥈" : "🥉"}</span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Surfaces the push-notifications opt-in proactively on Home instead of
// leaving it buried in Profile settings — dismissed once enabled, or once
// the client explicitly closes it (both remembered per-device). Enabling
// still has to go through a real tap (browser permission APIs require a
// user gesture), so "automatic" here means "put in front of them," not a
// silent background enable, which no browser allows anyway.
// Floating button to message the coach — draggable (so it never permanently
// blocks something underneath) and dismissible (a small X, remembered per
// device). Uses raw pointer events rather than a plain onClick: a plain
// click near scrollable content can get silently cancelled by the browser
// in favor of a scroll gesture on mobile if the finger drifts even a
// couple of pixels, which is exactly what made this feel "unclickable" —
// tracking the gesture ourselves (and marking it touch-none) avoids that.
const CHAT_BUBBLE_SIZE = 56;
function CoachChatBubble({ coachUser, unreadCount, onOpen }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem("chatBubbleHidden") === "1");

  if (hidden) return null;

  function dismiss(e) {
    e.stopPropagation();
    localStorage.setItem("chatBubbleHidden", "1");
    setHidden(true);
  }

  return (
    <div
      className="fixed z-[55] right-4"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))", width: CHAT_BUBBLE_SIZE, height: CHAT_BUBBLE_SIZE }}
    >
      <button onClick={onOpen} className="w-14 h-14 rounded-full shadow-lg" aria-label={`Message ${coachUser.name}`}>
        <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-white bg-black pointer-events-none">
          {coachUser.avatarUrl ? (
            <img src={coachUser.avatarUrl} alt={coachUser.name} className="w-full h-full object-cover" />
          ) : (
            <img src="/brand/mark-white.png" alt={coachUser.name} className="w-full h-full object-contain p-3" />
          )}
        </div>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white pointer-events-none">
            {unreadCount}
          </span>
        )}
      </button>
      <button
        onClick={dismiss}
        aria-label="Hide chat button"
        className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center ring-2 ring-white"
      >
        <X size={9} strokeWidth={3} />
      </button>
    </div>
  );
}

function NotificationsPromptCard({ userId, showToast }) {
  const [supported, setSupported] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("pushPromptDismissed") === "1");
  const [enabled, setEnabled] = useState(() => !!localStorage.getItem("pushToken"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushSupported().then(setSupported);
  }, []);

  if (!supported || dismissed || enabled) return null;

  function dismiss() {
    localStorage.setItem("pushPromptDismissed", "1");
    setDismissed(true);
  }

  async function enable() {
    setBusy(true);
    try {
      const token = await enablePush(userId);
      localStorage.setItem("pushToken", token);
      setEnabled(true);
      showToast?.("Notifications turned on");
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-3 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
      <BellRing size={18} className="text-blue-600 shrink-0" />
      <p className="flex-1 text-blue-800 text-sm font-medium">Turn on notifications so you never miss a message from your coach</p>
      <button onClick={enable} disabled={busy} className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0 disabled:opacity-50">
        {busy ? "…" : "ENABLE"}
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="text-blue-400 hover:text-blue-600 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

// Cardio logged for the day being viewed on Home — a client's cardio
// sessions (entries: [], cardio: {...}) previously only ever surfaced
// buried in the Workouts tab's history list.
function CardioLogCard({ logs }) {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mx-3 space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Footprints size={17} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-blue-900 text-sm font-semibold truncate">{log.cardio.activityLabel}</p>
            <p className="text-blue-700/70 text-xs mt-0.5">
              {[
                log.cardio.durationMin ? `${log.cardio.durationMin} min` : null,
                log.cardio.distanceKm ? `${log.cardio.distanceKm} km` : null,
                log.cardio.caloriesBurned ? `${log.cardio.caloriesBurned} kcal` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HomeScreen({
  user,
  todaySession,
  activeLog,
  onStartWorkout,
  onViewWorkout,
  dayNutrition,
  targets,
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
  bodyStatsDueToday,
  onLogWeight,
  notifCount,
  onOpenNotifications,
  challenges,
  userId,
  cardioLogs,
  dbReady,
}) {
  return (
    <div className="pb-6 space-y-4">
      <Header user={user} onAvatarClick={onAvatarClick} notifCount={notifCount} onOpenNotifications={onOpenNotifications} />
      <DayHeader selectedOffset={dayOffset} onJumpToday={() => onSelectDay(0)} />
      <DateStrip selectedOffset={dayOffset} onSelect={onSelectDay} />
      {isToday && <NotificationsPromptCard userId={userId} showToast={showToast} />}
      {isToday && bodyStatsDueToday && (
        <div className="mx-3 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <Scale size={18} className="text-amber-600 shrink-0" />
          <p className="flex-1 text-amber-800 text-sm font-medium">Body stats check-in due today</p>
          <button onClick={onLogWeight} className="bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0">
            LOG WEIGHT
          </button>
        </div>
      )}
      <ActiveChallengesCard challenges={challenges} userId={userId} />
      <TodayWorkoutCard
        todaySession={daySession}
        activeLog={activeLog}
        onStart={onStartWorkout}
        onView={onViewWorkout}
        isToday={isToday}
        completedOnDate={completedOnDate}
        isPastDate={dayOffset < 0}
        exercisesById={exercisesById}
        dbReady={dbReady}
      />
      <CardioLogCard logs={cardioLogs} />
      <DailyHabitsCard
        habits={habits}
        completedIds={isToday ? completedHabitIds : dayHabitCompletedIds}
        onToggle={onToggleHabit}
        interactive={isToday}
      />
      <NutritionSummaryCard nutrition={dayNutrition} targets={targets} onLogFood={onLogFood} onLogWater={onLogWater} isToday={isToday} />
    </div>
  );
}

/* ============================================================================
   WORKOUT PREVIEW + SESSION FLOW
============================================================================ */

function WorkoutPreviewSheet({ session, exercisesById, canStart, onStart, onClose }) {
  const equipment = useMemo(() => {
    const set = new Set();
    session.exercises.forEach((e) => {
      const ex = exercisesById[e.exerciseId];
      if (ex?.equipment) set.add(ex.equipment);
    });
    return Array.from(set);
  }, [session, exercisesById]);

  const estMinutes = estimateWorkoutMinutes(session.exercises);

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
              <Dumbbell size={15} /> {countExercises(session.exercises)} Exercises
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

          {sectionedExercises(session.exercises.map((exMeta) => exMeta)).map((group) => (
            <div key={group.key} className="mt-5">
              {group.showHeader && <p className="text-black/40 text-xs font-bold tracking-wide mb-1">{group.label.toUpperCase()}</p>}
              <div className="border-t border-black/5">
                {group.items.map(({ exMeta: e, i }) => {
                  const ex = exercisesById[e.exerciseId];
                  if (!ex) return null;
                  return (
                    <div key={i} className="flex items-center gap-3 py-3.5 border-b border-black/5">
                      <ExerciseThumb exercise={ex} size={56} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-black font-semibold text-[15px] truncate">{ex.name}</p>
                          {e.dropSet && (
                            <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                              DROPSET
                            </span>
                          )}
                        </div>
                        <p className="text-black/45 text-[13px] mt-0.5">
                          {e.targetSets} sets × {formatTargetReps(e)}, {formatRest(e.restSeconds ?? 90)} rest
                          between sets
                        </p>
                      </div>
                      {e.notes && <ClipboardList size={16} className="text-black/40 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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

const PRE_WORKOUT_REMINDERS = [
  { icon: GlassWater, title: "Got your water bottle?", body: "Sip through the session, not just at the end." },
  {
    icon: Banana,
    title: "Had your pre-workout carbs?",
    body: "A banana, a couple of rice cakes, or a spoon of honey 30–60 min out keeps energy steady.",
  },
  {
    icon: ThermometerSun,
    title: "Training somewhere hot, or a long session?",
    body: "Grab electrolytes too — plain water alone won't cut it.",
  },
];

function PreWorkoutReadySheet({ open, onClose, onReady }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Ready to train?">
      <div className="space-y-3">
        {PRE_WORKOUT_REMINDERS.map((r, i) => (
          <div key={i} className="flex items-start gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3">
            <r.icon size={18} className="text-black/50 shrink-0 mt-0.5" />
            <div>
              <p className="text-black text-sm font-semibold">{r.title}</p>
              <p className="text-black/45 text-[13px] mt-0.5 leading-snug">{r.body}</p>
            </div>
          </div>
        ))}
        <button
          onClick={onReady}
          className="w-full bg-black text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-1"
        >
          <Play size={16} fill="white" /> LET'S GO
        </button>
      </div>
    </BottomSheet>
  );
}

function RestBar({ restTime, restTotal, onSkip, onAdd15 }) {
  const pct = restTotal > 0 ? ((restTotal - restTime) / restTotal) * 100 : 0;
  return (
    <div className="fixed top-0 left-0 right-0 z-[95] flex justify-center pt-safe animate-[slideDown_0.3s_ease-out]">
      <div className="w-full max-w-md bg-black text-white px-5 py-3.5 flex items-center gap-3 shadow-2xl">
        <div className="flex-1 min-w-0">
          <p className="text-white/50 text-[11px] tracking-wide truncate">RELAX AND HAVE A DRINK</p>
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
      <style>{`@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

// Tapping an exercise's name during a session opens this — its own demo
// video, instructions/cues, the client's personal best on it, and every
// past logged session that included it.
function ExerciseDetailSheet({ exercise, logsForClient, onClose }) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  const e1rmHistory = useMemo(
    () => (exercise ? computeE1RMHistory(logsForClient, exercise.id) : []),
    [logsForClient, exercise]
  );

  const history = useMemo(() => {
    if (!exercise) return [];
    const rows = [];
    (logsForClient || []).forEach((log) => {
      const entry = log.entries?.find((e) => e.exerciseId === exercise.id);
      if (entry && entry.sets?.length) rows.push({ date: log.date, dayLabel: log.dayLabel, sets: entry.sets });
    });
    return rows.sort((a, b) => b.date - a.date);
  }, [logsForClient, exercise]);

  const best = useMemo(() => {
    let top = null;
    history.forEach((h) =>
      h.sets.forEach((s) => {
        if (!s.weight || !s.reps) return;
        const score = estimate1RM(s.weight, s.reps);
        if (!top || score > top.score) top = { weight: s.weight, reps: s.reps, score };
      })
    );
    return top;
  }, [history]);

  if (!exercise) return null;
  const parsed = exercise.videoUrl ? parseVideoUrl(exercise.videoUrl) : null;
  const instructions = exercise.instructions || [];
  const isLongInstructions = instructions.length > 3;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[115] bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
          <button onClick={onClose} className="text-black/60 -ml-1.5">
            <ChevronLeft size={24} />
          </button>
          <ClipboardList size={19} className="text-black/25" />
        </div>

        {parsed && (
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="relative w-full aspect-video bg-black shrink-0 overflow-hidden"
          >
            {parsed.kind === "file" ? (
              <video src={parsed.src} muted playsInline preload="metadata" className="w-full h-full object-cover" />
            ) : parsed.thumbnail ? (
              <img src={parsed.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : null}
            <span className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              <Play size={12} fill="white" /> FULL VIDEO
            </span>
          </button>
        )}

        <div className="px-5 py-5">
          <h1 className="text-black text-2xl font-bold mb-3">{exercise.name}</h1>

          {instructions.length > 0 && (
            <>
              <ol className={`space-y-2.5 text-black/80 text-[15px] leading-relaxed ${!notesExpanded && isLongInstructions ? "line-clamp-[9]" : ""}`}>
                {instructions.map((step, i) => (
                  <li key={i}>
                    {i + 1}. {step}
                  </li>
                ))}
              </ol>
              {isLongInstructions && (
                <button onClick={() => setNotesExpanded((v) => !v)} className="text-sm font-bold mt-1" style={{ color: MEASURE_BLUE }}>
                  {notesExpanded ? "Show Less" : "Show More"}
                </button>
              )}
            </>
          )}

          {exercise.formCues?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {exercise.formCues.map((c, i) => (
                <Pill key={i} tone="outline">
                  {c}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {best && (
          <div className="px-5 py-4 bg-black/[0.03] border-y border-black/8 flex items-center justify-between">
            <div>
              <p className="text-black/40 text-xs tracking-wide">PERSONAL BEST TO BEAT</p>
              <p className="text-black font-bold mt-0.5">{best.reps} rep max</p>
            </div>
            <p className="text-black text-2xl font-bold">
              {best.weight}
              <span className="text-sm font-semibold">kg</span>
            </p>
          </div>
        )}

        {e1rmHistory.length >= 2 && (
          <div className="px-5 pt-5">
            <p className="text-black/40 text-xs font-semibold tracking-wide mb-3">PROGRESSION</p>
            <div style={{ height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={e1rmHistory}>
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }}
                    formatter={(v) => [`${v} kg`, "Est. 1RM"]}
                  />
                  <Line type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2.5} dot={{ r: 3, fill: MEASURE_BLUE }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="px-5 py-5">
          <p className="text-black/40 text-xs font-semibold tracking-wide mb-3">HISTORY</p>
          {history.length === 0 ? (
            <p className="text-black/30 text-sm">No previous sessions logged for this exercise yet.</p>
          ) : (
            <div className="space-y-5">
              {history.map((h, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-black font-semibold text-sm">{h.dayLabel}</p>
                    <p className="text-black/40 text-xs">
                      {new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {h.sets.map((s, si) => (
                    <div key={si} className="flex items-center justify-between text-sm py-1.5 border-b border-black/5 last:border-0">
                      <span className="text-black/50">Set {s.setNumber}</span>
                      <span className="text-black font-medium">
                        {s.reps} x {s.weight} kg
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {videoOpen && <VideoPlayerSheet exerciseName={exercise.name} videoUrl={exercise.videoUrl} onClose={() => setVideoOpen(false)} />}
    </FullScreenOverlay>
  );
}

function ExerciseBlock({ exMeta, exercise, rows, previousSets, onChangeField, onBlurKg, onAddSet, note, noteOpen, onToggleNote, onNoteChange, onNoteSave, swapInfo, onSwap, onStartRest, onOpenDetail }) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [noteStatus, setNoteStatus] = useState("idle"); // idle | saving | saved
  const noteSaveTimeout = useRef(null);
  const noteStatusResetRef = useRef(null);
  const coachNote = exMeta.notes || "";
  const isLongNote = coachNote.length > 90;

  return (
    <div className="pt-1 pb-5 px-1 border-b border-black/10 last:border-b-0">
      <div className="flex items-center gap-3">
        <ExerciseThumb exercise={exercise} size={56} />
        <button type="button" onClick={() => onOpenDetail?.(exercise, exMeta)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-black font-bold text-[15px] truncate">{exercise.name}</p>
            {exMeta.groupType && (
              <span className="bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                {exMeta.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
              </span>
            )}
            {exMeta.dropSet && (
              <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                DROPSET
              </span>
            )}
          </div>
          <p className="text-black/45 text-[13px] mt-0.5">
            {exMeta.targetSets} sets × {formatTargetReps(exMeta)}
          </p>
        </button>
        <button
          onClick={onSwap}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            swapInfo ? "bg-black text-white" : "text-black/40"
          }`}
        >
          <Repeat size={17} />
        </button>
        <button
          onClick={onToggleNote}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            noteOpen || note ? "bg-black text-white" : "text-black/40"
          }`}
        >
          <ClipboardList size={17} />
        </button>
      </div>

      {swapInfo && (
        <div className="mt-3 bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-2.5">
          <p className="text-black/70 text-[13px] leading-snug">
            <span className="font-semibold">Swapped from {swapInfo.fromName}.</span> {swapInfo.reason}
          </p>
        </div>
      )}

      {coachNote && (
        <div className="mt-3 bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-2.5">
          <p className="text-black/35 text-[10px] font-semibold tracking-wide mb-1">COACH'S NOTES</p>
          <div className="flex items-start gap-2">
            <p className={`text-black/80 text-[13px] leading-snug flex-1 ${!notesExpanded && isLongNote ? "line-clamp-2" : ""}`}>{coachNote}</p>
            {isLongNote && (
              <button
                onClick={() => setNotesExpanded((v) => !v)}
                className="text-[12px] font-semibold shrink-0"
                style={{ color: MEASURE_BLUE }}
              >
                {notesExpanded ? "See less" : "See more"}
              </button>
            )}
          </div>
        </div>
      )}

      {noteOpen && (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => {
              const value = e.target.value;
              onNoteChange(value);
              setNoteStatus("saving");
              if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current);
              if (noteStatusResetRef.current) clearTimeout(noteStatusResetRef.current);
              noteSaveTimeout.current = setTimeout(() => {
                onNoteSave?.(value);
                setNoteStatus("saved");
                noteStatusResetRef.current = setTimeout(() => setNoteStatus("idle"), 1500);
              }, 500);
            }}
            onBlur={() => {
              if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current);
              onNoteSave?.(note);
              setNoteStatus("saved");
              if (noteStatusResetRef.current) clearTimeout(noteStatusResetRef.current);
              noteStatusResetRef.current = setTimeout(() => setNoteStatus("idle"), 1500);
            }}
            placeholder="Add your own note on this exercise…"
            rows={2}
            autoFocus
            className="w-full bg-white border border-black/15 rounded-xl px-3.5 py-2.5 text-black text-[13px] outline-none focus:border-black/30 placeholder:text-black/25 resize-none"
          />
          <p className="text-[11px] mt-1 px-0.5" style={{ color: noteStatus === "saved" ? "#16A34A" : "rgba(10,10,11,0.3)" }}>
            {noteStatus === "saving" ? "Saving…" : noteStatus === "saved" ? "Saved ✓" : "Autosaves as you type"}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => onStartRest(exMeta)}
        className="mt-3 w-full flex items-center gap-2 bg-black/[0.04] hover:bg-black/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors"
      >
        <Hand size={14} style={{ color: MEASURE_BLUE }} className="shrink-0" />
        <span className="text-[12px] font-medium flex-1 text-left" style={{ color: MEASURE_BLUE }}>
          Tap to start rest timer
        </span>
        <span
          className="bg-white border border-black/10 text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1"
          style={{ color: MEASURE_BLUE }}
        >
          <Clock size={11} />
          {formatRest(exMeta.restSeconds ?? 90)}
        </span>
      </button>

      <div className="mt-3">
        <div className="grid grid-cols-[28px_1fr_80px_60px] gap-2 px-1 mb-1.5">
          <span className="text-black/60 text-[12px] font-bold">Set</span>
          <span className="text-black/60 text-[12px] font-bold">Previous</span>
          <span className="text-black/60 text-[10px] font-bold text-center leading-tight">
            {exMeta.targetType === "time" ? "Seconds" : "Repetitions"}
          </span>
          <span className="text-black/60 text-[12px] font-bold text-center">Kg</span>
        </div>
        {rows.map((row, i) => {
          const prev = previousSets[i];
          const suggestion = suggestNextSet(prev, exMeta.targetReps);
          return (
            <div key={i} className="grid grid-cols-[28px_1fr_80px_60px] gap-2 items-center px-1 py-1.5">
              <span className="text-black text-[14px] font-medium">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-black/40 text-[13px] truncate">{prev ? `${prev.reps} x ${prev.weight} kg` : "-"}</p>
                {suggestion && !row.weight && !row.reps && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeField(i, "weight", String(suggestion.weight));
                      onChangeField(i, "reps", String(suggestion.reps));
                    }}
                    className="flex items-center gap-1 text-amber-600 text-[11px] font-semibold mt-0.5"
                  >
                    <TrendingUp size={11} className="shrink-0" />
                    <span className="truncate">Try {suggestion.reps} × {suggestion.weight}kg</span>
                  </button>
                )}
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={row.reps}
                onChange={(e) => onChangeField(i, "reps", e.target.value)}
                onBlur={() => onBlurKg(i)}
                className="w-full bg-white border border-black/15 rounded-xl text-center text-black text-[14px] font-medium py-2 outline-none focus:border-black/40"
              />
              <input
                type="number"
                inputMode="decimal"
                value={row.weight}
                onChange={(e) => onChangeField(i, "weight", e.target.value)}
                onBlur={() => onBlurKg(i)}
                className="w-full bg-white border border-black/15 rounded-xl text-center text-black text-[14px] font-medium py-2 outline-none focus:border-black/40"
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

function SwapExerciseSheet({ exMeta, exercise, allExercises, onClose, onConfirm }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (exMeta) {
      setSearch("");
      setSelected(null);
      setReason("");
    }
  }, [exMeta]);

  if (!exMeta) return null;
  const filtered = allExercises
    .filter((e) => e.id !== exMeta.exerciseId && e.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 40);

  return (
    <BottomSheet open={!!exMeta} onClose={onClose} title={selected ? "Why the swap?" : `Swap ${exercise?.name || "exercise"}`}>
      {!selected ? (
        <div>
          <div className="flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-3">
            <Search size={16} className="text-black/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises"
              autoFocus
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="w-full flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"
              >
                <span className="text-black text-sm">{e.name}</span>
                <span className="text-black/30 text-xs">{e.equipment}</span>
              </button>
            ))}
            {search && filtered.length === 0 && <p className="text-black/30 text-sm text-center py-6">No matching exercises.</p>}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-black/50 text-sm mb-3">
            Swapping <span className="font-semibold text-black">{exercise?.name}</span> for{" "}
            <span className="font-semibold text-black">{selected.name}</span>. Let your coach know why — this note is required and
            visible to them.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Shoulder felt tight, swapped for a machine variation"
            className="w-full bg-black/5 border border-black/10 rounded-2xl px-3.5 py-2.5 text-black text-sm outline-none placeholder:text-black/30 resize-none"
          />
          <div className="flex gap-2 mt-4">
            <SecondaryButton className="flex-1" onClick={() => setSelected(null)}>
              Back
            </SecondaryButton>
            <PrimaryButton className="flex-1" disabled={!reason.trim()} onClick={() => onConfirm(selected, reason.trim())}>
              Confirm Swap
            </PrimaryButton>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function WorkoutSession({
  session: daySession,
  activeLog,
  setActiveLog,
  logsForClient,
  exercisesById,
  exerciseNotes,
  setExerciseNotes,
  allExercises,
  exerciseSwaps,
  setExerciseSwaps,
  onFinish,
  onExit,
  onSaveNote,
}) {
  const [noteOpenFor, setNoteOpenFor] = useState(null);
  const [swapFor, setSwapFor] = useState(null); // the original exMeta currently being swapped
  const [detailExercise, setDetailExercise] = useState(null); // exercise object shown in the full-screen detail sheet
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
      playTimerDing();
    }
    return () => clearTimeout(timerRef.current);
  }, [resting, restTime]);

  // The exercises actually being performed this session — the original
  // plan, with any swapped exercises substituted in.
  const exercisesForSession = useMemo(
    () =>
      daySession.exercises.map((exMeta) => {
        const swap = exerciseSwaps[exMeta.exerciseId];
        if (!swap) return exMeta;
        return { ...exMeta, exerciseId: swap.toExerciseId, originalExerciseId: exMeta.exerciseId };
      }),
    [daySession, exerciseSwaps]
  );

  function confirmSwap(newExercise, reason) {
    const original = swapFor;
    setExerciseSwaps((prev) => ({
      ...prev,
      [original.exerciseId]: {
        toExerciseId: newExercise.id,
        toName: newExercise.name,
        fromName: exercisesById[original.exerciseId]?.name || "the planned exercise",
        reason,
      },
    }));
    setSwapFor(null);
  }

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
  }

  function handleStartRest(exMeta) {
    unlockTimerAudio();
    const rest = exMeta.restSeconds ?? 90;
    setRestTime(rest);
    setRestTotal(rest);
    setRestLabel(exercisesById[exMeta.exerciseId]?.name || "");
    setResting(true);
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

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 pb-28">
          {sectionedExercises(exercisesForSession).map((group) => (
            <div key={group.key}>
              {group.showHeader && (
                <p className="text-black/40 text-[11px] font-bold tracking-wide mb-2 mt-1">{group.label.toUpperCase()}</p>
              )}
              <div className="space-y-4">
                {group.items.map(({ exMeta, i }) => {
                  const exercise = exercisesById[exMeta.exerciseId];
                  if (!exercise) return null;
                  const swap = exMeta.originalExerciseId ? exerciseSwaps[exMeta.originalExerciseId] : null;
                  return (
                    <ExerciseBlock
                      key={(exMeta.originalExerciseId || exMeta.exerciseId) + i}
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
                      onNoteSave={(value) => onSaveNote?.(exMeta.exerciseId, value)}
                      swapInfo={swap}
                      onSwap={() => setSwapFor({ exerciseId: exMeta.originalExerciseId || exMeta.exerciseId })}
                      onStartRest={handleStartRest}
                      onOpenDetail={(ex) => setDetailExercise(ex)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <SwapExerciseSheet
          exMeta={swapFor}
          exercise={swapFor ? exercisesById[swapFor.exerciseId] : null}
          allExercises={allExercises}
          onClose={() => setSwapFor(null)}
          onConfirm={confirmSwap}
        />

        {detailExercise && (
          <ExerciseDetailSheet exercise={detailExercise} logsForClient={logsForClient} onClose={() => setDetailExercise(null)} />
        )}

        {resting && (
          <RestBar
            restTime={restTime}
            restTotal={restTotal}
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

function WorkoutSummary({ daySession, activeLog, durationMin = 0, durationSec = 0, onDone }) {
  const allSets = Object.values(activeLog).flat();
  const totalVolume = allSets.reduce((a, s) => a + s.weight * s.reps, 0);
  const totalSets = allSets.length;
  const prCount = allSets.filter((s) => s.isPR).length;
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
        <p className="text-black text-4xl font-bold tabular-nums mt-6">
          {durationMin}:{String(durationSec).padStart(2, "0")}
        </p>

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

const CARDIO_ACTIVITIES = [
  { id: "running", label: "Running", icon: Footprints },
  { id: "cycling", label: "Cycling", icon: Activity },
  { id: "swimming", label: "Swimming", icon: Droplet },
  { id: "walking", label: "Walking", icon: Footprints },
  { id: "rowing", label: "Rowing", icon: Activity },
  { id: "hiking", label: "Hiking", icon: Footprints },
  { id: "other", label: "Other", icon: Sparkles },
];

function LogCardioSheet({ open, onClose, onSave }) {
  const [activityId, setActivityId] = useState("running");
  const [duration, setDuration] = useState(30);
  const [distance, setDistance] = useState(0);
  const [caloriesBurned, setCaloriesBurned] = useState(0);

  useEffect(() => {
    if (open) {
      setActivityId("running");
      setDuration(30);
      setDistance(0);
      setCaloriesBurned(0);
    }
  }, [open]);

  function save() {
    const activity = CARDIO_ACTIVITIES.find((a) => a.id === activityId);
    onSave({
      activityId,
      activityLabel: activity.label,
      durationMin: duration,
      distanceKm: distance,
      caloriesBurned: caloriesBurned > 0 ? caloriesBurned : null,
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Log Activity">
      <p className="text-black/40 text-xs tracking-wide mb-2">ACTIVITY</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {CARDIO_ACTIVITIES.map((a) => {
          const Icon = a.icon;
          const active = activityId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setActivityId(a.id)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors ${
                active ? "bg-black text-white" : "bg-black/5 text-black/60"
              }`}
            >
              <Icon size={17} />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <NumberStepper label="DURATION (MIN)" value={duration} setValue={setDuration} step={5} min={0} />
        <NumberStepper label="DISTANCE (KM)" value={distance} setValue={setDistance} step={0.5} min={0} />
      </div>
      <div className="mb-5">
        <NumberStepper label="CALORIES BURNED (OPTIONAL)" value={caloriesBurned} setValue={setCaloriesBurned} step={25} min={0} />
      </div>

      <PrimaryButton className="w-full" disabled={duration <= 0} onClick={save}>
        <Check size={16} /> LOG ACTIVITY
      </PrimaryButton>
    </BottomSheet>
  );
}


function ClientPhaseHistorySheet({ open, onClose, phases, currentId, selectedId, onSelect }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Training Phases">
      {phases.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-6">No phases yet.</p>
      ) : (
        <div className="space-y-1.5">
          {phases.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${p.id === selectedId ? "bg-black/8" : "hover:bg-black/[0.03]"}`}
            >
              <div className="flex items-center gap-2">
                <p className="text-black text-sm font-medium flex-1 truncate">{p.name}</p>
                {p.id === currentId && (
                  <span className="text-[10px] font-bold text-white bg-black px-2 py-0.5 rounded-full shrink-0">CURRENT</span>
                )}
              </div>
              <p className="text-black/35 text-xs mt-0.5">
                {new Date(p.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                {p.endDate
                  ? ` – ${new Date(p.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                  : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// Read-only mirror of the coach's own Training Program view — same phase
// (name/dates/description) + workout-list structure, just without any
// edit/add/schedule controls, which stay coach-only.
function ClientProgramTab({ onPreviewDay }) {
  const { db, currentUser } = useApp();
  const phases = (db.clientPhases || {})[currentUser.id] || [];
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const todayStr = new Date().toISOString().slice(0, 10);
  const current = getCurrentPhase(phases, todayStr);
  const [selectedId, setSelectedId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (phases.length === 0) {
    return (
      <div className="px-3">
        <Card>
          <p className="text-black/40 text-sm text-center py-8">No training program set up yet — your coach will assign one soon.</p>
        </Card>
      </div>
    );
  }

  const phase = phases.find((p) => p.id === selectedId) || current || sorted[sorted.length - 1];
  const days = phase?.weeks?.[0]?.days || [];

  return (
    <div className="px-3 space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-black text-lg font-bold min-w-0 truncate">{phase.name}</h2>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold shrink-0"
          >
            <Calendar size={14} /> PHASES
          </button>
        </div>
        <p className="text-black/40 text-xs mb-3">
          {new Date(phase.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {phase.endDate
            ? ` – ${new Date(phase.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
            : ""}
          {phase.id === current?.id && <span className="ml-2 text-black font-semibold">· Current</span>}
        </p>
        {phase.description && <p className="text-black/60 text-sm leading-relaxed whitespace-pre-line">{phase.description}</p>}
      </Card>

      <div>
        <p className="text-black/40 text-xs tracking-wide mb-2 px-1">WORKOUTS IN THIS PHASE</p>
        {days.length === 0 ? (
          <Card>
            <p className="text-black/30 text-sm text-center py-6">No workouts added to this phase yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {days.map((d, i) => (
              <button key={d.id || i} onClick={() => onPreviewDay(d)} className="w-full text-left">
                <Card className="!py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-black font-semibold text-sm truncate">{d.label}</p>
                      <p className="text-black/40 text-xs mt-0.5 truncate">
                        est. {estimateWorkoutMinutes(d.exercises)} min · {countExercises(d.exercises)} exercise{countExercises(d.exercises) === 1 ? "" : "s"}
                        {d.muscleGroups?.length ? ` · ${d.muscleGroups.join(", ")}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-black/25 shrink-0" />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <ClientPhaseHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        phases={sorted}
        currentId={current?.id}
        selectedId={phase.id}
        onSelect={(id) => {
          setSelectedId(id);
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}

function WorkoutsScreen({ todaySession, scheduledWorkouts, activeLog, completedOnDate, onStart, onViewWorkout, onPreviewWorkout, logsForClient, exercisesById, onLogCardio, dbReady }) {
  const [tab, setTab] = useState("today");
  const [cardioOpen, setCardioOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = scheduledWorkouts.filter((w) => w.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="pb-6">
      <div className="px-3 pt-6 pb-4">
        <h1 className="text-black text-2xl font-bold">Training</h1>
      </div>
      <div className="flex gap-2 px-3 mb-4 overflow-x-auto no-scrollbar">
        {["today", "program", "history", "upcoming"].map((t) => (
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
        <div className="px-3 space-y-4">
          <TodayWorkoutCard
            todaySession={todaySession}
            activeLog={activeLog}
            onStart={onStart}
            onView={onViewWorkout}
            isToday
            completedOnDate={completedOnDate}
            dbReady={dbReady}
          />
          <button
            onClick={() => setCardioOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-black/5 hover:bg-black/8 text-black/70 text-sm font-semibold py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
          >
            <Footprints size={16} /> + Log a cardio session
          </button>
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
                          {e.dropSet && (
                            <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded">
                              DROPSET
                            </span>
                          )}
                        </div>
                        <p className="text-black/40 text-xs">
                          {e.targetSets} sets × {formatTargetReps(e)} · RIR {e.targetRIR ?? 2}
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

      {tab === "program" && <ClientProgramTab onPreviewDay={onPreviewWorkout} />}

      {tab === "history" && (
        <div className="px-3 space-y-3">
          {logsForClient.length === 0 && (
            <Card>
              <p className="text-black/40 text-sm text-center py-6">No completed workouts yet — finish today's session to see it here.</p>
            </Card>
          )}
          {logsForClient.map((h) => {
            const volume = h.entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);
            const prCount = h.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
            return (
              <Card key={h.id}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-black font-semibold">{h.dayLabel}</p>
                    <p className="text-black/40 text-xs mt-0.5">{new Date(h.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                  </div>
                  {h.cardio ? (
                    <Pill tone="outline">
                      {h.cardio.durationMin}min{h.cardio.distanceKm > 0 ? ` · ${h.cardio.distanceKm}km` : ""}
                      {h.cardio.caloriesBurned > 0 ? ` · ${h.cardio.caloriesBurned} kcal` : ""}
                    </Pill>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone="outline">{volume.toLocaleString()} kg</Pill>
                      {prCount > 0 && (
                        <span className="text-amber-600 text-[11px] font-semibold">
                          {prCount} PR{prCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LogCardioSheet
        open={cardioOpen}
        onClose={() => setCardioOpen(false)}
        onSave={(cardio) => {
          onLogCardio(cardio);
          setCardioOpen(false);
        }}
      />

      {tab === "upcoming" && (
        <div className="px-3 space-y-2">
          {upcoming.length === 0 && (
            <Card>
              <p className="text-black/40 text-sm text-center py-6">
                {dbReady ? "Nothing scheduled yet — your coach will set up your upcoming workouts." : "Loading your schedule…"}
              </p>
            </Card>
          )}
          {upcoming.map((w) => (
            <Card key={w.id} className="!py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-black font-semibold text-sm">{w.label}</p>
                  <p className="text-black/40 text-xs mt-0.5">
                    {new Date(w.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                  </p>
                </div>
                <span className="text-black/30 text-xs">{countExercises(w.exercises)} ex</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   NUTRITION TAB
============================================================================ */

// Swipe (or drag) a row left past the threshold to delete it — reveals a red
// trash affordance underneath as it moves. Works with touch and mouse alike
// since it's built on pointer events.
function SwipeableRow({ onDelete, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const widthRef = useRef(0);
  const rowRef = useRef(null);

  function onPointerDown(e) {
    startXRef.current = e.clientX;
    widthRef.current = rowRef.current?.offsetWidth || 300;
    setDragging(true);
    // Without capture, a translating row can slide out from under a touch
    // that hasn't moved on screen, firing a premature pointerleave that
    // cancels the drag — capture keeps this element getting the events
    // regardless of where the row itself has moved to.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    setDragX(Math.min(0, Math.max(dx, -widthRef.current)));
  }
  function onPointerUp(e) {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (dragX < -(widthRef.current * 0.35)) {
      setDragX(-widthRef.current);
      setTimeout(onDelete, 150);
    } else {
      setDragX(0);
    }
  }

  return (
    <div ref={rowRef} className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 bg-red-500 rounded-lg flex items-center justify-end pr-3">
        <Trash2 size={14} className="text-white" />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease" }}
        className="relative bg-white touch-pan-y select-none"
      >
        {children}
      </div>
    </div>
  );
}

function NutritionScreen({ nutrition, targets, onAddFood, onRemoveFood, onAddWater, savedMeals, onCreateSavedMeal, onDeleteSavedMeal, showToast }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState("Breakfast");
  const [detailMeal, setDetailMeal] = useState(null);
  const [waterSheetOpen, setWaterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [createMealOpen, setCreateMealOpen] = useState(false);
  const [mealPrefill, setMealPrefill] = useState(null);
  const [pendingFood, setPendingFood] = useState(null);

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
      <div className="px-3 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-black text-2xl font-bold">Nutrition</h1>
        <Search size={20} className="text-black/40" />
      </div>

      <div className="px-3 mt-3">
        <Card>
          <p className="text-black/40 text-xs tracking-wide mb-1">CALORIE TARGET</p>
          <div className="flex items-baseline gap-2">
            <span className="text-black text-3xl font-bold">{Math.max(0, targets.calories - nutrition.calories)}</span>
            <span className="text-black/40 text-sm">remaining of {targets.calories}</span>
          </div>
          <div className="mt-3">
            <ProgressBar
              value={nutrition.calories}
              max={targets.calories}
              color={nutrition.calories >= targets.calories ? GOAL_GREEN : MEASURE_BLUE}
            />
          </div>
          <div className="space-y-3 mt-4 pt-4 border-t border-black/5">
            {[
              { l: "Protein", v: round1(nutrition.protein), t: targets.protein },
              { l: "Carbs", v: round1(nutrition.carbs), t: targets.carbs },
              { l: "Fat", v: round1(nutrition.fat), t: targets.fat },
            ].map((m) => (
              <div key={m.l}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-black/70 text-sm font-medium">{m.l}</span>
                  <span className="text-black/40 text-xs">
                    {m.v}g <span className="text-black/25">/ {m.t}g</span>
                  </span>
                </div>
                <ProgressBar value={m.v} max={m.t} height={6} color={m.v >= m.t ? GOAL_GREEN : MEASURE_BLUE} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="text-black font-semibold flex items-center gap-2">
              {nutrition.water >= targets.water ? (
                <Droplets size={16} className="text-black" />
              ) : (
                <GlassWater size={16} className="text-black/60" />
              )}{" "}
              Water
            </p>
            <span className="text-black/50 text-sm">
              {nutrition.water}L / {targets.water}L
            </span>
          </div>
          <ProgressBar
          value={nutrition.water}
          max={targets.water}
          height={6}
          color={nutrition.water >= targets.water ? GOAL_GREEN : MEASURE_BLUE}
        />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onAddWater(0.25)}
              className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150"
            >
              +250ml
            </button>
            <button
              onClick={() => onAddWater(0.5)}
              className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150"
            >
              +500ml
            </button>
            <button
              onClick={() => setWaterSheetOpen(true)}
              className="flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-[0.97] transition-transform"
            >
              Custom
            </button>
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4">
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

      <div className="px-3 mt-5 space-y-2.5">
        {mealCategories.map((meal) => {
          const items = nutrition.meals[meal] || [];
          const totalCals = items.reduce((a, f) => a + f.cals, 0);
          return (
            <button key={meal} onClick={() => setDetailMeal(meal)} className="w-full text-left active:scale-[0.99] transition-transform">
              <Card>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-black font-semibold">{meal}</p>
                    <p className="text-black/40 text-xs mt-0.5">
                      {items.length === 0 ? "No items logged" : `${items.length} item${items.length === 1 ? "" : "s"} logged`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-black/50 text-sm font-medium">{totalCals} kcal</span>
                    <ChevronRight size={16} className="text-black/25" />
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <BottomSheet open={!!detailMeal} onClose={() => setDetailMeal(null)} title={detailMeal || ""}>
        {detailMeal &&
          (() => {
            const items = nutrition.meals[detailMeal] || [];
            const totals = items.reduce(
              (a, f) => ({ cals: a.cals + f.cals, protein: a.protein + f.protein, carbs: a.carbs + f.carbs, fat: a.fat + f.fat }),
              { cals: 0, protein: 0, carbs: 0, fat: 0 }
            );
            return (
              <div>
                <div className="bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-4">
                  {[
                    ["Cals", Math.round(totals.cals)],
                    ["Protein", `${round1(totals.protein)}g`],
                    ["Carbs", `${round1(totals.carbs)}g`],
                    ["Fat", `${round1(totals.fat)}g`],
                  ].map(([l, v]) => (
                    <div key={l} className="text-center">
                      <p className="text-black font-bold text-sm">{v}</p>
                      <p className="text-black/40 text-[10px] mt-0.5">{l}</p>
                    </div>
                  ))}
                </div>

                {items.length === 0 ? (
                  <p className="text-black/30 text-sm text-center py-4">No items logged yet</p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {items.map((f) => (
                      <SwipeableRow key={f.id} onDelete={() => onRemoveFood(detailMeal, f.id)}>
                        <div className="flex items-center justify-between text-sm bg-white py-2">
                          <span className="flex items-center gap-2 text-black/70 min-w-0">
                            {f.photoUrl && (
                              <img src={f.photoUrl} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                            )}
                            <span className="truncate">{f.name}</span>
                          </span>
                          <span className="text-black/40 shrink-0 ml-2">{f.cals} kcal</span>
                        </div>
                      </SwipeableRow>
                    ))}
                    <p className="text-black/25 text-[10px] text-center pt-0.5">Swipe an item left to remove it</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setActiveMeal(detailMeal);
                    setDetailMeal(null);
                    setSheetOpen(true);
                  }}
                  className="w-full mt-3 bg-black/5 text-black/70 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add food
                </button>
              </div>
            );
          })()}
      </BottomSheet>

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
        <p className="text-black/30 text-xs mb-2 tracking-wide">SEARCH RESULTS · PER 100G</p>
        <div className="space-y-1">
          {filteredFoods.map((f) => (
            <button
              key={f.id}
              onClick={() => setPendingFood(f)}
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

      <FoodQuantitySheet
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          onAddFood(activeMeal, scaled);
          setPendingFood(null);
          setSheetOpen(false);
        }}
      />

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

      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onAdd={(food) => {
          setBarcodeOpen(false);
          setPendingFood(food);
        }}
      />
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

function MetricDetailSheet({ metric, onClose }) {
  const [range, setRange] = useState("7D");
  if (!metric) return null;
  const n = range === "7D" ? 7 : 30;
  const data = (metric.series || []).slice(-n);
  const valueLabel = typeof metric.latest === "number" ? `${metric.latest.toFixed(metric.decimals)}${metric.unit}` : `${metric.latest}`;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[95] bg-white flex flex-col">
        <div className="flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60">
            <X size={20} />
          </button>
          <span className="text-black font-semibold">{metric.label}</span>
          <div className="w-5" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="text-black text-3xl font-bold tabular-nums">{valueLabel}</p>
          <p className="text-black/40 text-xs mt-1">Latest · {metric.date}</p>

          <div className="flex gap-2 mt-5">
            {["7D", "30D"].map((r) => (
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

          <div className="mt-5">
            {!metric.series ? (
              <p className="text-black/30 text-sm text-center py-16">No detailed history available for this metric.</p>
            ) : data.length < 2 ? (
              <p className="text-black/30 text-sm text-center py-16">Not enough history yet for this range.</p>
            ) : (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="mdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }}
                      />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#mdGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-black/30 text-[11px] text-center mt-4">Showing the last {data.length} recorded entries.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

function LogWeightSheet({ open, onClose, onSave, lastWeight }) {
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (open) setWeight(lastWeight ? String(lastWeight) : "");
  }, [open, lastWeight]);

  const parsed = Number(weight);
  const valid = weight !== "" && !isNaN(parsed) && parsed > 0;

  return (
    <BottomSheet open={open} onClose={onClose} title="Log Weight">
      <Field label="WEIGHT (KG)">
        <TextInput
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 82.4"
          autoFocus
        />
      </Field>
      <PrimaryButton
        className="w-full mt-4"
        disabled={!valid}
        onClick={() => {
          onSave(parsed);
          setWeight("");
        }}
      >
        <Check size={16} /> SAVE
      </PrimaryButton>
    </BottomSheet>
  );
}

function WeightHistoryScreen({ weighIns, onClose, onLog, onDelete }) {
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const chartData = weighIns.map((w) => ({
    date: new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: w.weight,
  }));
  const latest = weighIns[weighIns.length - 1];
  const first = weighIns[0];
  const change = latest && first ? Math.round((latest.weight - first.weight) * 10) / 10 : null;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[95] bg-white flex flex-col">
        <div className="flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60">
            <X size={20} />
          </button>
          <span className="text-black font-semibold">Body Weight</span>
          <button onClick={() => setLogOpen(true)} className="text-black font-bold text-sm">
            + Log
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {weighIns.length === 0 ? (
            <div className="py-16 text-center">
              <Scale size={28} className="mx-auto text-black/15 mb-3" />
              <p className="text-black/40 text-sm mb-4">No weigh-ins logged yet.</p>
              <PrimaryButton onClick={() => setLogOpen(true)} className="mx-auto">
                <Plus size={16} /> LOG YOUR FIRST WEIGHT
              </PrimaryButton>
            </div>
          ) : (
            <>
              <p className="text-black text-3xl font-bold tabular-nums">{latest.weight} kg</p>
              <p className="text-black/40 text-xs mt-1">
                {weighIns.length > 1 && change != null
                  ? `${change > 0 ? "up" : change < 0 ? "down" : "steady"} ${Math.abs(change)}kg since your first log`
                  : "Your first logged weigh-in"}
              </p>

              {weighIns.length >= 2 && (
                <div className="h-64 mt-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="whGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }}
                      />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#whGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className="text-black/30 text-xs tracking-wide mt-6 mb-2">ALL ENTRIES · {weighIns.length}</p>
              <div className="space-y-1">
                {[...weighIns].reverse().map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
                    <span className="text-black/50 text-sm">
                      {new Date(w.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-black font-semibold text-sm">{w.weight} kg</span>
                      {confirmDeleteId === w.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setConfirmDeleteId(null)} className="text-black/40 text-xs font-semibold px-2 py-1">
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              onDelete?.(w.id);
                              setConfirmDeleteId(null);
                            }}
                            className="text-red-600 text-xs font-bold px-2 py-1 bg-red-50 rounded-lg"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(w.id)} className="text-black/25 hover:text-red-500 p-1" aria-label="Delete this entry">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <LogWeightSheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        lastWeight={latest?.weight}
        onSave={(w) => {
          onLog(w);
          setLogOpen(false);
        }}
      />
    </FullScreenOverlay>
  );
}

function PhotosSection({ photos, onAdd, onDelete, busy, weighIns }) {
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-black font-semibold">Progress Photos</p>
        <ImageIcon size={16} className="text-black/30" />
      </div>
      <div className="flex items-start gap-2 mb-3 bg-black/[0.03] rounded-xl p-3">
        <Info size={14} className="text-black/30 shrink-0 mt-0.5" />
        <p className="text-black/40 text-[11px] leading-relaxed">
          For photos you can actually compare over time: take them first thing in the morning, in clear/consistent lighting, wearing the
          same clothes (or similar) as your very first set, from the same angles each time.
        </p>
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
          <button key={p.id} onClick={() => setViewing(p)} className="relative aspect-square rounded-xl overflow-hidden bg-black/5">
            <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[10px] font-medium px-1.5 py-1 text-center">
              {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </button>
        ))}
      </div>
      {photos.length === 0 && <p className="text-black/25 text-xs mt-3">No photos yet — add one to start a visual timeline.</p>}

      <BottomSheet open={!!viewing} onClose={() => setViewing(null)} title={viewing ? new Date(viewing.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}>
        {viewing && (
          <div>
            <img src={viewing.url} alt="Progress" className="w-full rounded-2xl mb-3" />
            {(() => {
              const w = closestWeighIn(weighIns, viewing.date);
              return w ? (
                <p className="text-black/50 text-sm text-center mb-4">
                  {w.weight} kg around this time
                </p>
              ) : (
                <p className="text-black/30 text-xs text-center mb-4">No weigh-in logged near this date.</p>
              );
            })()}
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

// Clean 30-day snapshot — strength trend, bodyweight change, consistency,
// PRs — the "how's the last month actually gone" view, distinct from the
// tiles above it which are lifetime/this-week counters.
function PerformanceTimelineCard({ timeline, weekly }) {
  const items = [
    {
      label: "Strength",
      sub: "avg. gain on main lifts",
      value: timeline.strengthChangePct != null ? `${timeline.strengthChangePct > 0 ? "+" : ""}${timeline.strengthChangePct}%` : "—",
    },
    {
      label: "Bodyweight",
      sub: "change over 30 days",
      value: timeline.bodyweightChange != null ? `${timeline.bodyweightChange > 0 ? "+" : ""}${timeline.bodyweightChange} kg` : "—",
    },
    {
      label: "Consistency",
      sub: weekly.pct != null ? `${weekly.completed} of ${weekly.expected} sessions` : "nothing scheduled this week",
      value: weekly.pct != null ? `${weekly.pct}%` : "—",
    },
    { label: "PRs set", sub: "new heaviest lifts", value: `${timeline.prCount}` },
  ];
  return (
    <div className="bg-black rounded-2xl p-5">
      <p className="text-white/40 text-[11px] font-semibold tracking-wide uppercase">Last {timeline.days} Days</p>
      <p className="text-white font-bold text-lg mt-0.5">Performance Timeline</p>
      <p className="text-white/35 text-xs mt-1 mb-4">A quick read on how you've been trending: getting stronger, showing up, hitting new bests.</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-white text-xl font-bold tabular-nums">{it.value}</p>
            <p className="text-white/40 text-[11px] mt-0.5">
              {it.label} <span className="text-white/25">· {it.sub}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Daily body metrics logged manually (no wearable sync yet) — one Firestore
// doc per client per calendar day (bodyMetrics/{clientId}_{date}), each
// field filled in independently. Same card/chart/history treatment as Body
// Weight above, just generalized instead of duplicated five times.
const BODY_METRICS_CONFIG = [
  { key: "steps", label: "Steps", unit: "", icon: Footprints, placeholder: "e.g. 8500" },
  { key: "sleepHours", label: "Sleep", unit: "hrs", icon: Moon, placeholder: "e.g. 7.5" },
  { key: "bodyFatPct", label: "Body Fat", unit: "%", icon: Percent, placeholder: "e.g. 18.5" },
  { key: "leanMassKg", label: "Lean Body Mass", unit: "kg", icon: Activity, placeholder: "e.g. 65.2" },
  { key: "restingHeartRate", label: "Resting Heart Rate", unit: "bpm", icon: Heart, placeholder: "e.g. 58" },
];

function LogBodyMetricSheet({ open, onClose, config, lastValue, onSave }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue(lastValue != null ? String(lastValue) : "");
  }, [open, lastValue]);

  if (!config) return null;
  const parsed = Number(value);
  const valid = value !== "" && !isNaN(parsed) && parsed >= 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={`Log ${config.label}`}>
      <Field label={`${config.label.toUpperCase()}${config.unit ? ` (${config.unit.toUpperCase()})` : ""}`}>
        <TextInput type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={config.placeholder} autoFocus />
      </Field>
      <PrimaryButton
        className="w-full mt-4"
        disabled={!valid}
        onClick={() => {
          onSave(parsed);
          setValue("");
        }}
      >
        <Check size={16} /> SAVE
      </PrimaryButton>
    </BottomSheet>
  );
}

function BodyMetricHistoryScreen({ config, entries, onClose, onLog, onDelete }) {
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const chartData = entries.map((e) => ({ date: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: e.value }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const change = latest && first ? Math.round((latest.value - first.value) * 10) / 10 : null;
  const Icon = config.icon;
  const gradId = `bmGrad-${config.key}`;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[95] bg-white flex flex-col">
        <div className="flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60">
            <X size={20} />
          </button>
          <span className="text-black font-semibold">{config.label}</span>
          <button onClick={() => setLogOpen(true)} className="text-black font-bold text-sm">
            + Log
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {entries.length === 0 ? (
            <div className="py-16 text-center">
              <Icon size={28} className="mx-auto text-black/15 mb-3" />
              <p className="text-black/40 text-sm mb-4">No {config.label.toLowerCase()} logged yet.</p>
              <PrimaryButton onClick={() => setLogOpen(true)} className="mx-auto">
                <Plus size={16} /> LOG YOUR FIRST ENTRY
              </PrimaryButton>
            </div>
          ) : (
            <>
              <p className="text-black text-3xl font-bold tabular-nums">
                {latest.value}
                {config.unit ? <span className="text-lg font-semibold"> {config.unit}</span> : ""}
              </p>
              <p className="text-black/40 text-xs mt-1">
                {entries.length > 1 && change != null
                  ? `${change > 0 ? "up" : change < 0 ? "down" : "steady"} ${Math.abs(change)}${config.unit} since your first log`
                  : "Your first logged entry"}
              </p>

              {entries.length >= 2 && (
                <div className="h-64 mt-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }}
                      />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className="text-black/30 text-xs tracking-wide mt-6 mb-2">ALL ENTRIES · {entries.length}</p>
              <div className="space-y-1">
                {[...entries].reverse().map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-0">
                    <span className="text-black/50 text-sm">
                      {new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-black font-semibold text-sm">
                        {e.value}
                        {config.unit ? ` ${config.unit}` : ""}
                      </span>
                      {confirmDeleteId === e.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setConfirmDeleteId(null)} className="text-black/40 text-xs font-semibold px-2 py-1">
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              onDelete?.(e.date);
                              setConfirmDeleteId(null);
                            }}
                            className="text-red-600 text-xs font-bold px-2 py-1 bg-red-50 rounded-lg"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(e.id)} className="text-black/25 hover:text-red-500 p-1" aria-label="Delete this entry">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <LogBodyMetricSheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        config={config}
        lastValue={latest?.value}
        onSave={(v) => {
          onLog(v);
          setLogOpen(false);
        }}
      />
    </FullScreenOverlay>
  );
}

function BodyMetricCard({ config, entries, onLog, onOpenHistory }) {
  const chartData = entries.map((e) => ({ date: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: e.value }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const change = latest && first ? Math.round((latest.value - first.value) * 10) / 10 : null;
  const Icon = config.icon;
  const gradId = `bmcGrad-${config.key}`;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-black font-semibold flex items-center gap-1.5">
            <Icon size={14} className="text-black/40" /> {config.label}
          </p>
          <p className="text-black/40 text-xs mt-0.5">
            {entries.length === 0
              ? `No ${config.label.toLowerCase()} logged yet`
              : entries.length === 1
              ? `${latest.value}${config.unit ? ` ${config.unit}` : ""} · first log`
              : `${latest.value}${config.unit ? ` ${config.unit}` : ""} · ${change > 0 ? "up" : change < 0 ? "down" : "steady"} ${Math.abs(
                  change
                )}${config.unit} since your first log`}
          </p>
        </div>
        <button
          onClick={() => onLog(config)}
          className="w-8 h-8 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"
        >
          <Plus size={15} />
        </button>
      </div>
      {entries.length >= 2 ? (
        <button onClick={() => onOpenHistory(config)} className="w-full h-40 mt-3 -ml-4 block">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
              <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </button>
      ) : (
        <button
          onClick={() => onOpenHistory(config)}
          className="w-full mt-3 text-center text-black/30 text-xs py-6 border border-dashed border-black/10 rounded-xl"
        >
          {entries.length === 0 ? `Log your ${config.label.toLowerCase()} to start your history` : "Log another entry to see a trend"}
        </button>
      )}
    </Card>
  );
}

function ProgressScreen({ userId, photos, onAddPhoto, onDeletePhoto, weighIns, onLogWeight, onDeleteWeighIn, logsForClient, exercisesById, bodyMetrics, onLogBodyMetric, onDeleteBodyMetric, scheduledWorkouts }) {
  const [uploading, setUploading] = useState(false);
  const [openMetric, setOpenMetric] = useState(null);
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [logMetricConfig, setLogMetricConfig] = useState(null);
  const [historyMetricConfig, setHistoryMetricConfig] = useState(null);

  const bodyMetricEntries = useMemo(() => {
    const out = {};
    BODY_METRICS_CONFIG.forEach((cfg) => {
      out[cfg.key] = (bodyMetrics || [])
        .filter((m) => m[cfg.key] != null)
        .map((m) => ({ id: m.id, date: m.date, value: m[cfg.key] }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });
    return out;
  }, [bodyMetrics]);

  const tiles = useMemo(() => {
    const workoutsSeries = computeWorkoutsSeries(logsForClient);
    return [
      { key: "total", label: "Total Workouts", unit: "", decimals: 0, series: workoutsSeries, latest: logsForClient.length, date: "all-time" },
      { key: "week", label: "This Week", unit: "", decimals: 0, series: null, latest: computeSessionsThisWeek(logsForClient), date: "sessions" },
      { key: "prs", label: "PRs This Month", unit: "", decimals: 0, series: null, latest: computePRsInLastNDays(logsForClient, 30), date: "last 30 days" },
      { key: "streak", label: "Weekly Streak", unit: "", decimals: 0, series: null, latest: computeWeeklyStreak(logsForClient), date: "weeks in a row" },
    ];
  }, [logsForClient]);

  const weeklyVolume = useMemo(() => computeWeeklyVolume(logsForClient), [logsForClient]);
  const benchExercise = useMemo(() => findExerciseByKeyword(Object.values(exercisesById), "Bench Press"), [exercisesById]);
  const benchHistory = useMemo(
    () => (benchExercise ? computeE1RMHistory(logsForClient, benchExercise.id) : []),
    [logsForClient, benchExercise]
  );
  const personalBests = useMemo(() => computePersonalBests(logsForClient, exercisesById), [logsForClient, exercisesById]);
  const achievements = useMemo(() => computeAchievements(logsForClient), [logsForClient]);
  const timeline = useMemo(
    () => computePerformanceTimeline(logsForClient, weighIns, exercisesById, 30),
    [logsForClient, weighIns, exercisesById]
  );
  const weekly = useMemo(
    () => computeWeeklySessionCompletion(logsForClient, scheduledWorkouts),
    [logsForClient, scheduledWorkouts]
  );

  const latestWeighIn = weighIns[weighIns.length - 1];
  const firstWeighIn = weighIns[0];
  const weightChange = latestWeighIn && firstWeighIn ? Math.round((latestWeighIn.weight - firstWeighIn.weight) * 10) / 10 : null;
  const weightChartData = weighIns.map((w) => ({
    date: new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: w.weight,
  }));

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
      <div className="px-3 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-black text-2xl font-bold">Progress</h1>
        <BarChart3 size={20} className="text-black/40" />
      </div>

      <div className="px-3 space-y-4">
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
                onClick={() => setOpenMetric(t)}
              />
            ))}
          </div>
        </div>

        <PerformanceTimelineCard timeline={timeline} weekly={weekly} />

        <PhotosSection photos={photos} onAdd={handleAddPhoto} onDelete={(id) => onDeletePhoto(userId, id)} busy={uploading} weighIns={weighIns} />

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-black font-semibold">Body Weight</p>
              <p className="text-black/40 text-xs mt-0.5">
                {weighIns.length === 0
                  ? "No weigh-ins logged yet"
                  : weighIns.length === 1
                  ? `${latestWeighIn.weight} kg · first log`
                  : `${latestWeighIn.weight} kg · ${weightChange > 0 ? "up" : weightChange < 0 ? "down" : "steady"} ${Math.abs(
                      weightChange
                    )}kg since your first log`}
              </p>
            </div>
            <button
              onClick={() => setQuickLogOpen(true)}
              className="w-8 h-8 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"
            >
              <Plus size={15} />
            </button>
          </div>
          {weighIns.length >= 2 ? (
            <button onClick={() => setWeightHistoryOpen(true)} className="w-full h-40 mt-3 -ml-4 block">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightChartData}>
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
            </button>
          ) : (
            <button
              onClick={() => setWeightHistoryOpen(true)}
              className="w-full mt-3 text-center text-black/30 text-xs py-6 border border-dashed border-black/10 rounded-xl"
            >
              {weighIns.length === 0 ? "Log a weight to start your history" : "Log another weigh-in to see a trend"}
            </button>
          )}
        </Card>

        {BODY_METRICS_CONFIG.map((cfg) => (
          <BodyMetricCard
            key={cfg.key}
            config={cfg}
            entries={bodyMetricEntries[cfg.key]}
            onLog={setLogMetricConfig}
            onOpenHistory={setHistoryMetricConfig}
          />
        ))}

        {benchExercise && benchHistory.length >= 2 ? (
          <ChartCard
            title="Bench Press e1RM"
            subtitle={`${benchHistory[benchHistory.length - 1].value} kg estimated · from your logged sets`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={benchHistory}>
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
                <Line type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2.5} dot={{ r: 3, fill: MEASURE_BLUE }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <Card>
            <p className="text-black font-semibold">Bench Press e1RM</p>
            <p className="text-black/30 text-sm mt-2">
              Log a couple of Bench Press sessions and we'll estimate your one-rep max progress here.
            </p>
          </Card>
        )}

        {weeklyVolume.length >= 2 ? (
          <ChartCard
            title="Weekly Training Volume"
            subtitle={`${weeklyVolume[weeklyVolume.length - 1].volume.toLocaleString()} kg this week`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyVolume}>
                <XAxis dataKey="week" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" }} />
                <Bar dataKey="volume" fill={MEASURE_BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <Card>
            <p className="text-black font-semibold">Weekly Training Volume</p>
            <p className="text-black/30 text-sm mt-2">Complete a few more weeks of logged workouts to see your volume trend.</p>
          </Card>
        )}

        <Card>
          <p className="text-black font-semibold mb-3">Strength Personal Bests</p>
          {personalBests.length === 0 ? (
            <p className="text-black/30 text-sm">Log a set of Bench Press, Squat, Deadlift, Pull-ups or Overhead Press to see your bests here.</p>
          ) : (
            <div className="space-y-2.5">
              {personalBests.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-black/70 text-sm flex items-center gap-2">
                    <Trophy size={14} className="text-black" /> {s.name}
                  </span>
                  <span className="text-black text-sm font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <p className="text-black font-semibold mb-3">Achievements</p>
          {achievements.length === 0 ? (
            <p className="text-black/30 text-sm">Complete workouts to start unlocking milestones here.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((a) => (
                <div key={a.id} className="bg-black/5 rounded-xl p-3 flex items-center gap-2.5">
                  <span className="text-xl grayscale">{a.icon}</span>
                  <span className="text-black/70 text-xs font-medium">{a.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <MetricDetailSheet metric={openMetric} onClose={() => setOpenMetric(null)} />
      {weightHistoryOpen && (
        <WeightHistoryScreen weighIns={weighIns} onClose={() => setWeightHistoryOpen(false)} onLog={onLogWeight} onDelete={onDeleteWeighIn} />
      )}
      <LogWeightSheet
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        lastWeight={latestWeighIn?.weight}
        onSave={(w) => {
          onLogWeight(w);
          setQuickLogOpen(false);
        }}
      />

      {historyMetricConfig && (
        <BodyMetricHistoryScreen
          config={historyMetricConfig}
          entries={bodyMetricEntries[historyMetricConfig.key]}
          onClose={() => setHistoryMetricConfig(null)}
          onLog={(v) => onLogBodyMetric(historyMetricConfig.key, v)}
          onDelete={(dateKey) => onDeleteBodyMetric(dateKey, historyMetricConfig.key)}
        />
      )}
      <LogBodyMetricSheet
        open={!!logMetricConfig}
        config={logMetricConfig}
        lastValue={logMetricConfig ? bodyMetricEntries[logMetricConfig.key]?.[bodyMetricEntries[logMetricConfig.key].length - 1]?.value : null}
        onClose={() => setLogMetricConfig(null)}
        onSave={(v) => {
          onLogBodyMetric(logMetricConfig.key, v);
          setLogMetricConfig(null);
        }}
      />
    </div>
  );
}

/* ============================================================================
   NOTIFICATIONS + PREFERENCES
============================================================================ */

const EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbells",
  "Kettlebells",
  "Resistance Bands",
  "Pull-up Bar",
  "Bench",
  "Cardio Machine",
  "Full Gym Access",
  "Bodyweight Only",
];
const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SESSION_LENGTH_OPTIONS = ["30 min", "45 min", "60 min", "75 min", "90+ min"];
const DIET_OPTIONS = ["No restrictions", "Vegetarian", "Vegan", "Halal", "Kosher", "Dairy-free", "Gluten-free", "Low-carb / Keto"];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-xs font-semibold border ${
        active ? "bg-black text-white border-black" : "bg-black/5 text-black/60 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

const PREF_TITLES = {
  goals: "Goals",
  equipment: "Equipment",
  training: "Training preferences",
  nutrition: "Nutrition preferences",
};

function PreferencesSheet({ section, open, onClose, user }) {
  const { updateUser, notifyCoach } = useApp();
  const prefs = user.preferences || {};
  const [goals, setGoals] = useState(prefs.goals || "");
  const [equipment, setEquipment] = useState(prefs.equipment || []);
  const [trainingDays, setTrainingDays] = useState(prefs.trainingDays || []);
  const [sessionLength, setSessionLength] = useState(prefs.sessionLength || "");
  const [trainingNotes, setTrainingNotes] = useState(prefs.trainingNotes || "");
  const [dietType, setDietType] = useState(prefs.dietType || "");
  const [nutritionNotes, setNutritionNotes] = useState(prefs.nutritionNotes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setGoals(prefs.goals || "");
    setEquipment(prefs.equipment || []);
    setTrainingDays(prefs.trainingDays || []);
    setSessionLength(prefs.sessionLength || "");
    setTrainingNotes(prefs.trainingNotes || "");
    setDietType(prefs.dietType || "");
    setNutritionNotes(prefs.nutritionNotes || "");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section]);

  function toggle(list, setList, val) {
    setList(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }

  async function save() {
    setSaving(true);
    setError("");
    const nextPrefs = { ...prefs, goals, equipment, trainingDays, sessionLength, trainingNotes, dietType, nutritionNotes };
    try {
      await updateUser(user.id, { preferences: nextPrefs });
      notifyCoach(user.id, user.name, "preference_update", `${user.name.split(" ")[0]} updated their ${(PREF_TITLES[section] || "").toLowerCase()}.`);
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!section) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title={PREF_TITLES[section] || ""}>
      <div className="space-y-4">
        {section === "goals" && (
          <Field label="YOUR GOALS" hint="Shared with your coach">
            <TextArea rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Build muscle, lose fat, improve strength on my main lifts..." />
          </Field>
        )}
        {section === "equipment" && (
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-2">WHAT DO YOU HAVE ACCESS TO?</p>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((opt) => (
                <Chip key={opt} active={equipment.includes(opt)} onClick={() => toggle(equipment, setEquipment, opt)}>
                  {opt}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {section === "training" && (
          <>
            <div>
              <p className="text-black/40 text-xs tracking-wide mb-2">PREFERRED TRAINING DAYS</p>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((d) => (
                  <Chip key={d} active={trainingDays.includes(d)} onClick={() => toggle(trainingDays, setTrainingDays, d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-black/40 text-xs tracking-wide mb-2">PREFERRED SESSION LENGTH</p>
              <div className="flex flex-wrap gap-2">
                {SESSION_LENGTH_OPTIONS.map((s) => (
                  <Chip key={s} active={sessionLength === s} onClick={() => setSessionLength(sessionLength === s ? "" : s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label="ANYTHING ELSE?" hint="Injuries, limitations, preferred exercises...">
              <TextArea rows={3} value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} placeholder="e.g. Bad left knee, avoid deep squats..." />
            </Field>
          </>
        )}
        {section === "nutrition" && (
          <>
            <div>
              <p className="text-black/40 text-xs tracking-wide mb-2">DIET TYPE</p>
              <div className="flex flex-wrap gap-2">
                {DIET_OPTIONS.map((d) => (
                  <Chip key={d} active={dietType === d} onClick={() => setDietType(dietType === d ? "" : d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label="ALLERGIES / DISLIKES" hint="Anything you can't or won't eat">
              <TextArea rows={2} value={nutritionNotes} onChange={(e) => setNutritionNotes(e.target.value)} placeholder="e.g. Allergic to peanuts, don't like fish..." />
            </Field>
          </>
        )}
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
      <button onClick={save} disabled={saving} className="w-full mt-6 bg-black text-white font-bold py-4 rounded-2xl disabled:opacity-40">
        {saving ? "SAVING…" : "SAVE"}
      </button>
    </BottomSheet>
  );
}

function ConnectedDevicesSheet({ open, onClose }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Connected devices">
      <div className="text-center py-6">
        <Heart size={28} className="text-black/20 mx-auto mb-3" />
        <p className="text-black font-semibold">Not available yet</p>
        <p className="text-black/40 text-sm mt-1.5 max-w-xs mx-auto">
          Syncing with wearables like Apple Health, Garmin or Whoop isn't built yet — it's on the roadmap for a future update.
        </p>
      </div>
    </BottomSheet>
  );
}

function PushNotificationsSheet({ open, onClose, showToast, userId }) {
  const [enabled, setEnabled] = useState(() => !!localStorage.getItem("pushToken"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      if (enabled) {
        await disablePush(userId, localStorage.getItem("pushToken"));
        localStorage.removeItem("pushToken");
        setEnabled(false);
        showToast("Push notifications turned off");
      } else {
        const token = await enablePush(userId);
        localStorage.setItem("pushToken", token);
        setEnabled(true);
        showToast("Push notifications enabled");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Push Notifications">
      <p className="text-black/50 text-sm mb-4">
        Get notified on this device when your coach messages you or reviews a check-in — even when the app is closed.
      </p>
      <div className="flex items-center justify-between bg-black/5 rounded-xl px-4 py-3.5">
        <span className="text-black font-medium text-sm">{enabled ? "Enabled on this device" : "Turn on"}</span>
        <button
          onClick={toggle}
          disabled={busy}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${enabled ? "bg-blue-500" : "bg-black/15"}`}
          aria-label={enabled ? "Turn off push notifications" : "Turn on push notifications"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>}
      <p className="text-black/30 text-[11px] mt-3">This is per-device — turn it on separately on each phone or browser you use.</p>
    </BottomSheet>
  );
}

function NotificationRow({ icon: Icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-3 bg-black/5 rounded-xl px-3.5 py-3">
      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
        <Icon size={16} className="text-black/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-black text-sm font-semibold">{title}</p>
        <p className="text-black/40 text-xs mt-0.5 truncate">{subtitle}</p>
      </div>
      <ChevronRight size={16} className="text-black/25 shrink-0" />
    </button>
  );
}

function NotificationsCenterSheet({ open, onClose, items }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications">
      {items.length === 0 ? (
        <p className="text-black/40 text-sm text-center py-8">You're all caught up.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <NotificationRow key={i} icon={it.icon} title={it.title} subtitle={it.subtitle} onClick={it.onClick} />
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* ============================================================================
   PROFILE TAB
============================================================================ */

function ProfileScreen({
  user,
  onLogout,
  coachOpen,
  setCoachOpen,
  messagesOpen,
  setMessagesOpen,
  unreadCount,
  onAvatarChange,
  logsForClient,
  onOpenNotifications,
  notifCount,
  showToast,
  dueCheckInsCount,
  onOpenCheckIns,
}) {
  const weekStreak = computeWeeklyStreak(logsForClient);
  const prsThisMonth = computePRsInLastNDays(logsForClient, 30);
  const [prefSection, setPrefSection] = useState(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const rows = [
    { label: "Goals", icon: Target, onClick: () => setPrefSection("goals") },
    { label: "Equipment", icon: Dumbbell, onClick: () => setPrefSection("equipment") },
    { label: "Training preferences", icon: Settings, onClick: () => setPrefSection("training") },
    { label: "Nutrition preferences", icon: Utensils, onClick: () => setPrefSection("nutrition") },
    { label: "Notifications", icon: Bell, onClick: onOpenNotifications },
    { label: "Push Notifications", icon: BellRing, onClick: () => setPushOpen(true) },
    { label: "Connected devices", icon: Heart, onClick: () => setDevicesOpen(true) },
  ];
  return (
    <div className="pb-6">
      <div className="px-3 pt-6 pb-4">
        <h1 className="text-black text-2xl font-bold">Profile</h1>
      </div>
      <div className="px-3">
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
              <p className="text-black font-bold">{weekStreak}🔥</p>
              <p className="text-black/40 text-[11px]">week streak</p>
            </div>
            <div className="flex-1 bg-black/5 rounded-xl py-2.5 text-center">
              <p className="text-black font-bold">{logsForClient.length}</p>
              <p className="text-black/40 text-[11px]">total workouts</p>
            </div>
            <div className="flex-1 bg-black/5 rounded-xl py-2.5 text-center">
              <p className="text-black font-bold">{prsThisMonth}</p>
              <p className="text-black/40 text-[11px]">PRs this month</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4 space-y-3">
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

        <Card onClick={onOpenCheckIns}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center relative">
              <CalendarCheck size={18} className="text-black" />
              {dueCheckInsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
                  {dueCheckInsCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-black font-semibold">Check-ins</p>
              <p className="text-black/40 text-xs">{dueCheckInsCount > 0 ? `${dueCheckInsCount} due now` : "Fill out forms from your coach"}</p>
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
              <p className="text-black font-semibold">Quick Tips</p>
              <p className="text-black/40 text-xs">Canned answers to common questions</p>
            </div>
            <ChevronRight size={18} className="text-black/30" />
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4">
        <Card>
          {rows.map((r, i) => (
            <button
              key={r.label}
              onClick={r.onClick}
              className={`w-full flex items-center gap-3 py-3 text-left ${i !== rows.length - 1 ? "border-b border-black/5" : ""}`}
            >
              <r.icon size={17} className="text-black/40" />
              <span className="text-black/80 text-sm flex-1">{r.label}</span>
              {r.label === "Notifications" && notifCount > 0 && (
                <span className="w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
                  {notifCount}
                </span>
              )}
              <ChevronRight size={16} className="text-black/20" />
            </button>
          ))}
        </Card>
      </div>

      <div className="px-3 mt-4">
        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-black/5 border border-black/10 text-black/70 font-semibold py-3.5 rounded-2xl">
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="flex justify-center mt-8">
        <Tagline />
      </div>

      <PreferencesSheet section={prefSection} open={!!prefSection} onClose={() => setPrefSection(null)} user={user} />
      <ConnectedDevicesSheet open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <PushNotificationsSheet open={pushOpen} onClose={() => setPushOpen(false)} showToast={showToast} userId={user.id} />
    </div>
  );
}

function CoachSheet({ open, onClose, ctx }) {
  const [messages, setMessages] = useState([
    {
      role: "coach",
      text: `Hey ${ctx.user.name.split(" ")[0]} — this is a quick-answer helper, not a live AI. It can handle a handful of common questions using your real numbers where it has them; for anything specific, message your coach directly.`,
    },
  ]);
  const [input, setInput] = useState("");

  function send(text) {
    if (!text.trim()) return;
    const userMsg = { role: "user", text };
    const reply = { role: "coach", text: coachReply(text, ctx, messages) };
    setMessages((m) => [...m, userMsg, reply]);
    setInput("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Quick Tips">
      <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                m.role === "user" ? "bg-black text-white" : "bg-black/8 text-black/85"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {(() => {
          const lastCoach = [...messages].reverse().find((m) => m.role === "coach");
          const isFoodList = lastCoach?.text.startsWith(SNACK_INTRO) || lastCoach?.text.startsWith(POST_WORKOUT_INTRO);
          const outOfOptions = lastCoach?.text.startsWith("That's every option");
          return (
            isFoodList &&
            !outOfOptions && (
              <button onClick={() => send("more")} className="text-xs bg-black text-white px-3 py-1.5 rounded-full font-semibold">
                More options
              </button>
            )
          );
        })()}
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

function MessagesSheet({ open, onClose, user, thread, onSend, coachName }) {
  const [input, setInput] = useState("");
  const [uploadPct, setUploadPct] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const videoInputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [open, thread.length]);

  function send() {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  }

  async function handleVideoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessageVideo(user.id, file, setUploadPct);
      onSend("", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Messages">
      <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto">
        {thread.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-black/8 text-black/85">
              <p className="whitespace-pre-line">
                {`Hey, this is your 24/7 coach — ${coachName || "your coach"} will respond within due time. Ask any questions any time!`}
              </p>
            </div>
          </div>
        )}
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.from === "client" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "client" ? "bg-black text-white" : "bg-black/8 text-black/85"}`}>
              {m.text && <p className="whitespace-pre-line">{m.text}</p>}
              {m.attachment && m.attachment.type === "video" ? (
                <video src={m.attachment.url} controls playsInline className="mt-2 w-full max-w-[220px] rounded-lg bg-black" />
              ) : (
                m.attachment && (
                  <a
                    href={m.attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 ${m.from === "client" ? "bg-white/15 text-white" : "bg-black/8 text-black"}`}
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="text-xs font-medium truncate">{m.attachment.name}</span>
                  </a>
                )
              )}
              <p className={`text-[10px] mt-1 ${m.from === "client" ? "text-white/40" : "text-black/30"}`}>
                {new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {uploadError && (
        <div className="mb-2 flex items-center justify-between gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError("")} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoFile} className="hidden" />
        <button
          onClick={() => videoInputRef.current?.click()}
          disabled={uploadPct !== null}
          aria-label="Attach a form-check video"
          className="w-11 h-11 rounded-full bg-black/8 flex items-center justify-center shrink-0 text-black/60 disabled:opacity-50"
        >
          {uploadPct !== null ? <span className="text-[10px] font-bold">{Math.round(uploadPct * 100)}%</span> : <Video size={17} />}
        </button>
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

const CHECK_IN_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

// Due once every 7 days since the client's last submission — a rolling
// window rather than "since the most recent occurrence of the scheduled
// weekday". Anchoring to the exact weekday meant a client who submitted a
// few days early (before that weekday came back around) would see it flip
// back to due the moment the scheduled day arrived, even though they'd
// already filled out that week's check-in days earlier.
function isCheckInDue(schedule, responses) {
  const lastResponse = responses.find((r) => r.scheduleId === schedule.id);
  return !lastResponse || Date.now() - lastResponse.date >= CHECK_IN_PERIOD_MS;
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
            {q.type === "choice" && (
              <div className="flex flex-col gap-1.5">
                {(q.options || []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(q.id, opt)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium border ${
                      answers[q.id] === opt ? "bg-black text-white border-black" : "bg-black/5 text-black/70 border-transparent"
                    }`}
                  >
                    {opt}
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
      <div className="px-3 pt-6 pb-2">
        <h1 className="text-black text-2xl font-bold">Check-ins</h1>
        <p className="text-black/40 text-sm mt-0.5">Scheduled by your coach</p>
      </div>

      {schedules.length === 0 ? (
        <Card className="mx-3 text-center py-10">
          <CalendarCheck size={26} className="text-black/25 mx-auto mb-3" />
          <p className="text-black font-semibold">No check-ins scheduled</p>
          <p className="text-black/40 text-sm mt-1">Your coach hasn't scheduled any check-ins yet.</p>
        </Card>
      ) : (
        <>
          {due.length > 0 && (
            <div className="px-3 space-y-2.5">
              <p className="text-black/40 text-xs tracking-wide font-semibold">DUE NOW</p>
              {due.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due onFill={() => setFilling(s)} />
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="px-3 space-y-2.5">
              <p className="text-black/40 text-xs tracking-wide font-semibold mt-2">UPCOMING</p>
              {upcoming.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due={false} />
              ))}
            </div>
          )}
        </>
      )}

      {responses.length > 0 && (
        <div className="px-3 space-y-2.5">
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

// One event on a given day — a big tappable (if applicable) card: a status
// dot on the left, title + a plain-English one-liner, a chevron if there's
// somewhere to go. Matches the density of a real day-planner app instead of
// a cramped multi-item row.
function CalendarEventCard({ dot, done, title, subtitle, onClick, draggable, onPointerDown, onPointerMove, onPointerUp, dragging }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? onPointerUp : undefined}
      onPointerCancel={draggable ? onPointerUp : undefined}
      className={`w-full flex items-center gap-3 bg-white border border-black/8 rounded-2xl px-4 py-3.5 text-left ${
        onClick ? "hover:bg-black/[0.02] transition-colors" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing select-none" : ""} ${dragging ? "opacity-40" : ""}`}
      style={draggable ? { touchAction: "none" } : undefined}
    >
      <span
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${dot.border} ${done ? dot.bg : "bg-white"}`}
      >
        {done && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-black font-semibold text-[15px] truncate">{title}</p>
        {subtitle && <p className="text-black/40 text-[13px] mt-0.5 truncate">{subtitle}</p>}
      </div>
      {onClick && <ChevronRight size={18} className="text-black/25 shrink-0" />}
    </Wrapper>
  );
}

// Shown instead of the whole app when the coach has paused this client's
// access (e.g. an unresolved payment) — everything about their program,
// history and progress stays intact server-side, they just can't browse it
// until the coach lifts the pause. Messaging stays open so they can sort it
// out directly rather than being locked out with no way to reach the coach.
function AccessPausedScreen({ onMessageCoach, onLogout }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "70vh" }}>
      <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <Lock size={24} className="text-amber-600" />
      </div>
      <p className="text-black font-bold text-lg mb-1.5">Access paused</p>
      <p className="text-black/50 text-sm max-w-xs mb-6">
        Your coach has temporarily paused your access to your program and profile. Message them to sort it out.
      </p>
      <button onClick={onMessageCoach} className="bg-black text-white text-sm font-bold px-5 py-3 rounded-xl w-full max-w-xs mb-2.5">
        Message your coach
      </button>
      <button onClick={onLogout} className="text-black/40 hover:text-black/60 text-sm font-medium py-2">
        Log out
      </button>
    </div>
  );
}

// A continuously scrollable agenda — only days with something on them get a
// card (an empty stretch just doesn't take up space), grouped under a bold
// date header with a divider, closer to a real day-planner than a packed
// month grid. Opens centered on today and grows further back/forward as the
// client scrolls near either edge; a "Today" button jumps straight back.
function ClientCalendarScreen({
  scheduledWorkoutsByDate,
  logsForClient,
  habits,
  habitLogForClient,
  bodyStatsSchedules,
  weighIns,
  formSchedules,
  forms,
  onPreviewWorkout,
  canEdit,
  onMoveItem,
}) {
  const [daysBack, setDaysBack] = useState(30);
  const [daysForward, setDaysForward] = useState(60);
  const scrollRef = useRef(null);
  const todayRef = useRef(null);
  const scrolledToToday = useRef(false);
  // Drag-to-reschedule — only ever active for the coach browsing as this
  // client (see `canEdit`); a real client can't drag their own calendar.
  // Built on Pointer Events (not the HTML5 drag-and-drop API) because that
  // API is mouse-only — it never fires from a touch gesture at all, which
  // is exactly why this didn't work on a phone. Pointer Events cover mouse
  // and touch identically, so the same code drives both: press and hold
  // briefly (so an ordinary tap/scroll isn't mistaken for a drag), then
  // move to the target day and release.
  const [dragItem, setDragItem] = useState(null); // { date, type: "workout" | "bodystats" }
  const [dragOverDate, setDragOverDate] = useState(null);
  const pressRef = useRef(null); // { timer, startX, startY, date, type, fired }

  function cardPointerDown(e, date, type) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = setTimeout(() => {
      if (!pressRef.current) return;
      pressRef.current.fired = true;
      setDragItem({ date, type });
      try {
        el.setPointerCapture(pointerId);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(10);
    }, 350);
    pressRef.current = { timer, startX, startY, date, type, fired: false };
  }

  function cardPointerMove(e) {
    const p = pressRef.current;
    if (!p) return;
    if (!p.fired) {
      // Moved before the long-press fired — this is a scroll, not a drag.
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 10) {
        clearTimeout(p.timer);
        pressRef.current = null;
      }
      return;
    }
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dayEl = target?.closest("[data-date]");
    const overDate = dayEl?.getAttribute("data-date") || null;
    setDragOverDate(overDate && overDate !== p.date ? overDate : null);
  }

  function cardPointerUp() {
    const p = pressRef.current;
    if (p?.fired && dragOverDate && dragOverDate !== p.date) {
      onMoveItem(p.type, p.date, dragOverDate);
    }
    if (p?.timer) clearTimeout(p.timer);
    pressRef.current = null;
    setDragItem(null);
    setDragOverDate(null);
  }

  const logsByDate = useMemo(() => {
    const map = {};
    logsForClient.forEach((l) => {
      const key = new Date(l.date).toISOString().slice(0, 10);
      if (!map[key]) map[key] = l;
    });
    return map;
  }, [logsForClient]);
  const weighInDates = useMemo(() => new Set(weighIns.map((w) => new Date(w.date).toISOString().slice(0, 10))), [weighIns]);
  const activeFormSchedules = useMemo(() => (formSchedules || []).filter((s) => s.active), [formSchedules]);
  const formsById = useMemo(() => Object.fromEntries((forms || []).map((f) => [f.id, f])), [forms]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - daysBack);
    const list = [];
    for (let i = 0; i <= daysBack + daysForward; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const scheduled = scheduledWorkoutsByDate[dateStr];
      const log = logsByDate[dateStr];
      const dayHabits = habits.filter((h) => {
        const createdKey = new Date(h.createdAt).toISOString().slice(0, 10);
        if (dateStr < createdKey) return false;
        if (h.endsAt && dateStr > new Date(h.endsAt).toISOString().slice(0, 10)) return false;
        return true;
      });
      const checkinsToday = activeFormSchedules.filter((s) => s.dayOfWeek === d.getDay());
      const bodyStatsToday = (bodyStatsSchedules || []).some((b) => b.date === dateStr);
      const hasContent = !!scheduled || !!log || dayHabits.length > 0 || checkinsToday.length > 0 || bodyStatsToday;
      if (!hasContent && dateStr !== todayStr) continue;
      list.push({ date: d, dateStr, scheduled, log, dayHabits, checkinsToday, bodyStatsToday, hasContent });
    }
    return list;
  }, [daysBack, daysForward, scheduledWorkoutsByDate, logsByDate, habits, activeFormSchedules, bodyStatsSchedules, todayStr]);

  useEffect(() => {
    if (scrolledToToday.current) return;
    const t = setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "start" });
      scrolledToToday.current = true;
    }, 50);
    return () => clearTimeout(t);
  }, [days]);

  function handleScroll(e) {
    const el = e.target;
    if (el.scrollTop < 400) setDaysBack((d) => Math.min(d + 30, 365));
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) setDaysForward((d) => Math.min(d + 30, 365));
  }

  function jumpToToday() {
    todayRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-6 pb-3 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-black text-2xl font-bold">Calendar</h1>
          <p className="text-black/40 text-sm mt-0.5">Scroll to see anything past or upcoming.</p>
        </div>
        <button onClick={jumpToToday} className="text-black/50 hover:text-black text-sm font-semibold shrink-0">
          Today
        </button>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 pb-6" style={{ maxHeight: "calc(100vh - 180px)" }}>
        {days.map(({ date: d, dateStr, scheduled, log, dayHabits, checkinsToday, bodyStatsToday, hasContent }, i) => {
          const isToday = dateStr === todayStr;
          const doneHabitIds = habitLogForClient[dateStr] || [];
          const habitsDone = dayHabits.filter((h) => doneHabitIds.includes(h.id)).length;
          const bodyStatsDone = weighInDates.has(dateStr);

          const canDragWorkout = canEdit && !!scheduled && !log;
          const canDragBodyStats = canEdit && !!bodyStatsToday && !bodyStatsDone;
          const isDropTarget = canEdit && dragItem && dragItem.date !== dateStr;

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              ref={isToday ? todayRef : null}
              className={`${i > 0 ? "mt-5" : ""} ${
                isDropTarget && dragOverDate === dateStr ? "bg-blue-50 rounded-2xl ring-2 ring-blue-300" : ""
              }`}
            >
              <p className={`font-bold text-base mb-2 ${isToday ? "text-blue-600" : "text-black"}`}>
                {isToday ? "Today, " : ""}
                {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className="border-b border-black/10 mb-3" />
              <div className="space-y-2.5">
                {scheduled && (
                  <CalendarEventCard
                    dot={{ border: "border-blue-500", bg: "bg-blue-500" }}
                    done={!!log}
                    title={scheduled.label}
                    subtitle={
                      canDragWorkout
                        ? "Drag to a different day to reschedule."
                        : log
                        ? "Workout completed."
                        : "Complete your scheduled workout."
                    }
                    onClick={() =>
                      onPreviewWorkout({ label: scheduled.label, muscleGroups: scheduled.muscleGroups || [], exercises: scheduled.exercises })
                    }
                    draggable={canDragWorkout}
                    dragging={dragItem?.date === dateStr && dragItem?.type === "workout"}
                    onPointerDown={(e) => cardPointerDown(e, dateStr, "workout")}
                    onPointerMove={cardPointerMove}
                    onPointerUp={cardPointerUp}
                  />
                )}
                {!scheduled && log && (
                  <CalendarEventCard dot={{ border: "border-emerald-500", bg: "bg-emerald-500" }} done title={log.dayLabel} subtitle="Completed." />
                )}
                {dayHabits.map((h) => (
                  <CalendarEventCard
                    key={h.id}
                    dot={{ border: "border-amber-500", bg: "bg-amber-500" }}
                    done={doneHabitIds.includes(h.id)}
                    title={h.label}
                    subtitle={doneHabitIds.includes(h.id) ? "Done." : "Daily habit."}
                  />
                ))}
                {checkinsToday.map((s) => (
                  <CalendarEventCard
                    key={s.id}
                    dot={{ border: "border-purple-500", bg: "bg-purple-500" }}
                    done={false}
                    title={formsById[s.formId]?.name || "Check-in"}
                    subtitle="Check-in due."
                  />
                ))}
                {bodyStatsToday && (
                  <CalendarEventCard
                    dot={{ border: "border-orange-500", bg: "bg-orange-500" }}
                    done={bodyStatsDone}
                    title="Body Stats Check-in"
                    subtitle={
                      canDragBodyStats
                        ? "Drag to a different day to reschedule."
                        : bodyStatsDone
                        ? "Logged."
                        : "Log your weight & stats today."
                    }
                    draggable={canDragBodyStats}
                    dragging={dragItem?.date === dateStr && dragItem?.type === "bodystats"}
                    onPointerDown={(e) => cardPointerDown(e, dateStr, "bodystats")}
                    onPointerMove={cardPointerMove}
                    onPointerUp={cardPointerUp}
                  />
                )}
                {!hasContent && (
                  <p className="text-black/25 text-sm px-1">Nothing scheduled.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   APP SHELL
============================================================================ */

// Switching bottom-nav tabs used to just swap content instantly — a hard
// cut with none of the softness a native app has. Fading the new tab in on
// every switch (remounts fresh per `tabKey`, so no crossfade bookkeeping
// needed) smooths that one transition every single tab change goes through.
function TabFade({ tabKey, children }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [tabKey]);
  return <div className={`transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"}`}>{children}</div>;
}

const TABS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "workouts", label: "Training", icon: Dumbbell },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "profile", label: "Profile", icon: User },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ClientApp() {
  const {
    currentUser,
    db,
    logWorkout,
    setNutritionForDate,
    logout,
    sendMessage,
    addProgressPhoto,
    deleteProgressPhoto,
    createSavedMeal,
    deleteSavedMeal,
    toggleHabitToday,
    updateUser,
    logWeight,
    deleteWeighIn,
    logBodyMetric,
    deleteBodyMetric,
    saveExerciseNote,
    viewingAsClient,
    stopViewAsClient,
    scheduleWorkout,
    unscheduleWorkout,
    scheduleBodyStatsCheckin,
    unscheduleBodyStatsCheckin,
    dbReady,
  } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("home");
  const [activeLog, setActiveLog] = useState(null); // {exerciseId: [sets]} while a session is open
  // {exerciseId: note} — the client's own notes, separate from the coach's.
  // Seeded from any notes saved (and not yet cleared by a finished workout)
  // from a previous session, so a note isn't lost if the app is closed
  // before the workout is finished.
  const [exerciseNotes, setExerciseNotes] = useState(() => currentUser.draftExerciseNotes || {});
  const [exerciseSwaps, setExerciseSwaps] = useState({}); // {originalExerciseId: {toExerciseId, toName, fromName, reason}}
  const [sessionOpen, setSessionOpen] = useState(false);
  const [preStartOpen, setPreStartOpen] = useState(false);
  const [previewSession, setPreviewSession] = useState(null);
  const [previewCanStart, setPreviewCanStart] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [coachOpen, setCoachOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [seenMessageCount, setSeenMessageCount] = useState(0);
  const [dayOffset, setDayOffset] = useState(0); // days from today, selected on the Home calendar strip
  const [notifOpen, setNotifOpen] = useState(false);
  const sessionStartedAtRef = useRef(null); // wall-clock time the current session started, for a real WORKOUT COMPLETE duration

  // An installed PWA is routinely left open (backgrounded, phone locked)
  // across a real calendar-day rollover without ever fully closing — so
  // "today" as far as this component's memoized values are concerned can
  // silently freeze at whatever date it was when last interacted with,
  // showing yesterday's stats even though the device's clock has moved on.
  // Bumping this on every resume forces those date-keyed values to
  // recompute against the actual current date instead of a stale one.
  const [dateTick, setDateTick] = useState(0);
  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") setDateTick((n) => n + 1);
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const thread = db.messages[currentUser.id] || [];
  const photos = db.progressPhotos[currentUser.id] || [];
  const weighIns = (db.weighIns || {})[currentUser.id] || [];
  const bodyMetricsForClient = (db.bodyMetrics || {})[currentUser.id] || [];
  const unreadCount = Math.max(0, thread.filter((m) => m.from === "coach").length - seenMessageCount);
  // A real client's `users` listener only ever includes their own doc (see
  // AppContext), so the coach's name/avatar for the chat bubble comes from
  // the public settings/coachProfile mirror instead.
  const coachUser = db.coachProfile?.name ? db.coachProfile : null;
  const checkInResponses = (db.formResponses || {})[currentUser.id] || [];
  const dueCheckInsCount = ((db.formSchedules || {})[currentUser.id] || []).filter(
    (s) => s.active && isCheckInDue(s, checkInResponses)
  ).length;
  const scheduledWorkoutsForClient = (db.scheduledWorkouts || {})[currentUser.id] || [];
  const scheduledWorkoutsByDate = useMemo(
    () => Object.fromEntries(scheduledWorkoutsForClient.map((w) => [w.date, w])),
    [scheduledWorkoutsForClient]
  );
  const bodyStatsSchedulesForClient = (db.bodyStatsSchedules || {})[currentUser.id] || [];
  function scheduledToSession(entry) {
    return entry ? { label: entry.label, muscleGroups: entry.muscleGroups || [], exercises: entry.exercises } : null;
  }
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const todaySession = scheduledToSession(scheduledWorkoutsByDate[todayDateKey]);
  const exercisesById = useMemo(() => Object.fromEntries(db.exercises.map((e) => [e.id, e])), [db.exercises]);
  const logsForClient = db.workoutLogs[currentUser.id] || [];
  const completedToday = logsForClient.some((l) => new Date(l.date).toISOString().slice(0, 10) === todayDateKey);
  const nutritionLogsForClient = db.nutritionLogs[currentUser.id] || [];
  const nutritionByDateKey = useMemo(
    () => Object.fromEntries(nutritionLogsForClient.map((n) => [n.date, n])),
    [nutritionLogsForClient]
  );
  const nutrition = nutritionByDateKey[todayDateKey] || DEFAULT_NUTRITION;
  const targets = useMemo(() => resolveNutritionTargets(currentUser.nutritionTargets), [currentUser.nutritionTargets]);
  const savedMeals = (db.savedMeals || {})[currentUser.id] || [];
  const habits = ((db.habits || {})[currentUser.id] || []).filter((h) => !h.endsAt || h.endsAt >= Date.now());
  const todayKey = todayDateKey;
  const completedHabitIds = ((db.habitLog || {})[currentUser.id] || {})[todayKey] || [];
  const bodyStatsDueToday = bodyStatsSchedulesForClient.some((s) => s.date === todayDateKey) && !weighIns.some((w) => new Date(w.date).toISOString().slice(0, 10) === todayDateKey);

  const isToday = dayOffset === 0;
  const selectedDateKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffset, dateTick]);
  const daySession = scheduledToSession(scheduledWorkoutsByDate[selectedDateKey]);
  const dayHabitCompletedIds = isToday ? completedHabitIds : ((db.habitLog || {})[currentUser.id] || {})[selectedDateKey] || [];
  const completedOnDate = logsForClient.some((l) => new Date(l.date).toISOString().slice(0, 10) === selectedDateKey);
  const dayNutrition = isToday ? nutrition : nutritionByDateKey[selectedDateKey] || null;
  const cardioLogsForSelectedDate = useMemo(
    () => logsForClient.filter((l) => l.cardio && new Date(l.date).toISOString().slice(0, 10) === selectedDateKey),
    [logsForClient, selectedDateKey]
  );

  const notificationItems = useMemo(() => {
    const items = [];
    if (unreadCount > 0) {
      items.push({
        icon: MessageCircle,
        title: `${unreadCount} new message${unreadCount === 1 ? "" : "s"}`,
        subtitle: "From your coach",
        onClick: () => {
          setNotifOpen(false);
          setSeenMessageCount(thread.filter((m) => m.from === "coach").length);
          setMessagesOpen(true);
        },
      });
    }
    if (todaySession && !completedOnDate) {
      items.push({
        icon: Dumbbell,
        title: "Workout scheduled today",
        subtitle: todaySession.label,
        onClick: () => {
          setNotifOpen(false);
          setTab("workouts");
        },
      });
    }
    if (dueCheckInsCount > 0) {
      items.push({
        icon: CalendarCheck,
        title: `${dueCheckInsCount} check-in${dueCheckInsCount === 1 ? "" : "s"} due`,
        subtitle: "Fill them out for your coach",
        onClick: () => {
          setNotifOpen(false);
          setTab("checkins");
        },
      });
    }
    if (bodyStatsDueToday) {
      items.push({
        icon: Scale,
        title: "Body stats check-in due today",
        subtitle: "Log your weight to keep your graph current",
        onClick: () => {
          setNotifOpen(false);
          setTab("progress");
        },
      });
    }
    return items;
  }, [unreadCount, thread, todaySession, completedOnDate, dueCheckInsCount, bodyStatsDueToday]);

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function startWorkout() {
    if (!todaySession) return;
    setPreStartOpen(true);
  }

  function beginSession() {
    setActiveLog((prev) => {
      if (!prev) sessionStartedAtRef.current = Date.now();
      return prev || {};
    });
    setSessionOpen(true);
  }

  function finishWorkout() {
    const elapsedMs = Date.now() - (sessionStartedAtRef.current || Date.now());
    const durationMin = Math.floor(elapsedMs / 60000);
    const durationSec = Math.floor((elapsedMs % 60000) / 1000);
    sessionStartedAtRef.current = null;
    const raw = activeLog || {};
    const cleanedLog = {};
    Object.entries(raw).forEach(([exerciseId, sets]) => {
      const cleaned = (sets || [])
        .filter((s) => s.weight !== "" && s.weight != null && s.reps !== "" && s.reps != null && !isNaN(Number(s.weight)) && !isNaN(Number(s.reps)))
        .map((s, i) => ({ setNumber: i + 1, weight: Number(s.weight), reps: Number(s.reps), completed: true, isPR: !!s.isPR }));
      if (cleaned.length) cleanedLog[exerciseId] = cleaned;
    });
    const swapByToId = Object.fromEntries(
      Object.entries(exerciseSwaps).map(([fromId, s]) => [s.toExerciseId, { swappedFrom: fromId, swappedFromName: s.fromName, swapReason: s.reason }])
    );
    // An exercise only ends up in cleanedLog if it has at least one
    // completed set — but a client can leave a note (e.g. "skipped, knee
    // felt off") on an exercise they never logged sets for at all. Build
    // the saved entries from the union of both, so a note-only exercise
    // still gets an entry (with an empty sets array) instead of the note
    // silently vanishing because nothing else referenced that exercise.
    const notedExerciseIds = Object.keys(exerciseNotes).filter((id) => (exerciseNotes[id] || "").trim());
    const allExerciseIds = new Set([...Object.keys(cleanedLog), ...notedExerciseIds]);
    logWorkout(currentUser.id, {
      dayLabel: todaySession.label,
      entries: Array.from(allExerciseIds).map((exerciseId) => ({
        exerciseId,
        sets: cleanedLog[exerciseId] || [],
        note: exerciseNotes[exerciseId] || "",
        ...(swapByToId[exerciseId] || {}),
      })),
    });
    setSummaryData({ daySession: todaySession, activeLog: cleanedLog, durationMin, durationSec });
    setActiveLog(null);
    setExerciseNotes({});
    setExerciseSwaps({});
    setSessionOpen(false);
    setSummaryOpen(true);
  }

  function openPreview(session, canStart) {
    if (!session) return;
    setPreviewSession(session);
    setPreviewCanStart(canStart);
  }

  function addFood(meal, food) {
    setNutritionForDate(currentUser.id, todayDateKey, (n) => {
      const base = n || DEFAULT_NUTRITION;
      return {
        ...base,
        calories: Math.round(base.calories + food.cals),
        protein: round1(base.protein + food.protein),
        carbs: round1(base.carbs + food.carbs),
        fat: round1(base.fat + food.fat),
        meals: { ...base.meals, [meal]: [...base.meals[meal], { ...food, id: food.id + "-" + Date.now() }] },
      };
    });
    showToast(`${food.name} added to ${meal}`);
  }

  function removeFood(meal, entryId) {
    setNutritionForDate(currentUser.id, todayDateKey, (n) => {
      const base = n || DEFAULT_NUTRITION;
      const items = base.meals[meal] || [];
      const entry = items.find((f) => f.id === entryId);
      if (!entry) return base;
      return {
        ...base,
        calories: Math.max(0, Math.round(base.calories - entry.cals)),
        protein: Math.max(0, round1(base.protein - entry.protein)),
        carbs: Math.max(0, round1(base.carbs - entry.carbs)),
        fat: Math.max(0, round1(base.fat - entry.fat)),
        meals: { ...base.meals, [meal]: items.filter((f) => f.id !== entryId) },
      };
    });
    showToast("Entry removed");
  }

  function addWater(liters) {
    setNutritionForDate(currentUser.id, todayDateKey, (n) => {
      const base = n || DEFAULT_NUTRITION;
      return { ...base, water: Math.round((base.water + liters) * 100) / 100 };
    });
    showToast(`+${Math.round(liters * 1000)}ml logged`);
  }

  function doLogout() {
    // If a coach is browsing as this client, "log out" here must only end
    // the impersonation — actually signing out would kill their own real
    // session too.
    if (viewingAsClient) {
      stopViewAsClient();
      return;
    }
    logout();
    navigate("/login", { replace: true });
  }

  function openMessages() {
    setSeenMessageCount(thread.filter((m) => m.from === "coach").length);
    setMessagesOpen(true);
  }

  // Coach-only (see `canEdit` on ClientCalendarScreen): drag a scheduled
  // workout or body stats check-in from one day to another right from
  // inside the client's own calendar, while browsing as them — the same
  // "reschedule on the fly" the coach already has on their own calendar
  // view of a client. Dropping onto an occupied day just replaces
  // whatever's already there.
  function moveScheduledItem(type, fromDate, toDate) {
    if (!viewingAsClient || fromDate === toDate) return;
    if (type === "bodystats") {
      if (!bodyStatsSchedulesForClient.some((s) => s.date === fromDate)) return;
      scheduleBodyStatsCheckin(currentUser.id, { startDate: toDate, weeks: 1 });
      unscheduleBodyStatsCheckin(currentUser.id, fromDate);
      showToast("Check-in rescheduled");
      return;
    }
    const workout = scheduledWorkoutsByDate[fromDate];
    if (!workout) return;
    scheduleWorkout(currentUser.id, { date: toDate, label: workout.label, muscleGroups: workout.muscleGroups, exercises: workout.exercises });
    unscheduleWorkout(currentUser.id, fromDate);
    showToast("Workout rescheduled");
  }

  return (
    <div className="w-full h-full min-h-screen bg-white font-sans flex justify-center">
      <div className="w-full max-w-md relative">
        {viewingAsClient && (
          <div className="sticky top-0 z-[70] bg-blue-600 text-white flex items-center justify-between gap-2 px-4 py-2 pt-safe">
            <span className="text-xs font-semibold truncate">Viewing as {currentUser.name}</span>
            <button onClick={stopViewAsClient} className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-lg shrink-0">
              <ChevronLeft size={12} /> Exit
            </button>
          </div>
        )}
        <BrandBar />
        {currentUser.accessPaused && !viewingAsClient ? (
          <AccessPausedScreen onMessageCoach={openMessages} onLogout={doLogout} />
        ) : (
        <>
        <TabFade tabKey={tab}>
        {tab === "home" && (
          <HomeScreen
            user={currentUser}
            todaySession={todaySession}
            activeLog={activeLog}
            onStartWorkout={startWorkout}
            onViewWorkout={() => openPreview(daySession, isToday && !completedOnDate)}
            dayNutrition={dayNutrition}
            targets={targets}
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
            bodyStatsDueToday={bodyStatsDueToday}
            onLogWeight={() => setTab("progress")}
            notifCount={notificationItems.length}
            onOpenNotifications={() => setNotifOpen(true)}
            challenges={db.challenges || []}
            userId={currentUser.id}
            cardioLogs={cardioLogsForSelectedDate}
            dbReady={dbReady}
          />
        )}
        {tab === "workouts" && (
          <WorkoutsScreen
            todaySession={todaySession}
            scheduledWorkouts={scheduledWorkoutsForClient}
            activeLog={activeLog}
            completedOnDate={completedToday}
            onStart={startWorkout}
            onViewWorkout={() => openPreview(todaySession, !completedToday)}
            onPreviewWorkout={(day) => openPreview(day, false)}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
            onLogCardio={(cardio) => {
              logWorkout(currentUser.id, { dayLabel: `${cardio.activityLabel} (Cardio)`, entries: [], cardio });
              showToast(`${cardio.activityLabel} logged`);
            }}
            dbReady={dbReady}
          />
        )}
        {tab === "nutrition" && (
          <NutritionScreen
            nutrition={nutrition}
            targets={targets}
            onAddFood={addFood}
            onRemoveFood={removeFood}
            onAddWater={addWater}
            savedMeals={savedMeals}
            onCreateSavedMeal={(meal) => createSavedMeal(currentUser.id, meal)}
            onDeleteSavedMeal={(mealId) => deleteSavedMeal(currentUser.id, mealId)}
            showToast={showToast}
          />
        )}
        {tab === "checkins" && <CheckInsScreen userId={currentUser.id} showToast={showToast} />}
        {tab === "calendar" && (
          <ClientCalendarScreen
            scheduledWorkoutsByDate={scheduledWorkoutsByDate}
            logsForClient={logsForClient}
            habits={habits}
            habitLogForClient={(db.habitLog || {})[currentUser.id] || {}}
            bodyStatsSchedules={bodyStatsSchedulesForClient}
            weighIns={weighIns}
            formSchedules={(db.formSchedules || {})[currentUser.id] || []}
            forms={db.forms || []}
            onPreviewWorkout={(day) => openPreview(day, false)}
            canEdit={viewingAsClient}
            onMoveItem={moveScheduledItem}
          />
        )}
        {tab === "progress" && (
          <ProgressScreen
            userId={currentUser.id}
            photos={photos}
            onAddPhoto={addProgressPhoto}
            onDeletePhoto={deleteProgressPhoto}
            weighIns={weighIns}
            onLogWeight={(w) => logWeight(currentUser.id, w)}
            onDeleteWeighIn={(id) => deleteWeighIn(currentUser.id, id)}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
            bodyMetrics={bodyMetricsForClient}
            onLogBodyMetric={(field, value) => logBodyMetric(currentUser.id, todayDateKey, field, value)}
            onDeleteBodyMetric={(dateKey, field) => deleteBodyMetric(currentUser.id, dateKey, field)}
            scheduledWorkouts={scheduledWorkoutsForClient}
          />
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
            logsForClient={logsForClient}
            onOpenNotifications={() => setNotifOpen(true)}
            notifCount={notificationItems.length}
            showToast={showToast}
            dueCheckInsCount={dueCheckInsCount}
            onOpenCheckIns={() => setTab("checkins")}
          />
        )}
        </TabFade>

        {coachUser && <CoachChatBubble coachUser={coachUser} unreadCount={unreadCount} onOpen={openMessages} />}

        <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50">
          <div className="w-full max-w-md bg-[#FAFAFA]/95 backdrop-blur border-t border-black/5 flex px-2 pb-safe">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-3 relative">
                  <Icon size={21} className={active ? "text-black" : "text-black/35"} strokeWidth={active ? 2.4 : 2} />
                  <span className={`text-[10px] font-medium ${active ? "text-black" : "text-black/35"}`}>{t.label}</span>
                  {t.id === "profile" && dueCheckInsCount > 0 && (
                    <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-black" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </>
        )}

        {sessionOpen && activeLog && todaySession && (
          <WorkoutSession
            session={todaySession}
            activeLog={activeLog}
            setActiveLog={setActiveLog}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
            exerciseNotes={exerciseNotes}
            setExerciseNotes={setExerciseNotes}
            allExercises={db.exercises}
            exerciseSwaps={exerciseSwaps}
            setExerciseSwaps={setExerciseSwaps}
            onFinish={finishWorkout}
            onExit={() => setSessionOpen(false)}
            onSaveNote={(exerciseId, value) => saveExerciseNote(currentUser.id, exerciseId, value)}
          />
        )}
        {summaryOpen && summaryData && (
          <WorkoutSummary
            daySession={summaryData.daySession}
            activeLog={summaryData.activeLog}
            durationMin={summaryData.durationMin}
            durationSec={summaryData.durationSec}
            onDone={() => setSummaryOpen(false)}
          />
        )}
        <PreWorkoutReadySheet
          open={preStartOpen}
          onClose={() => setPreStartOpen(false)}
          onReady={() => {
            setPreStartOpen(false);
            beginSession();
          }}
        />
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

        <CoachSheet open={coachOpen} onClose={() => setCoachOpen(false)} ctx={{ user: currentUser, nutrition, targets, todaySession }} />
        <MessagesSheet
          open={messagesOpen}
          onClose={() => setMessagesOpen(false)}
          user={currentUser}
          thread={thread}
          onSend={(text, attachment) => sendMessage(currentUser.id, "client", text, attachment)}
          coachName={coachUser?.name}
        />
        <NotificationsCenterSheet open={notifOpen} onClose={() => setNotifOpen(false)} items={notificationItems} />
        <Toast message={toast.message} show={toast.show} />
      </div>
    </div>
  );
}
