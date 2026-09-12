import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home as HomeIcon,
  Dumbbell,
  Utensils,
  UtensilsCrossed,
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
  ShoppingCart,
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
  Paperclip,
  CheckCircle2,
  GripVertical,
  Zap,
  Upload,
  Download,
} from "lucide-react";
import { enablePush, disablePush, pushSupported } from "../lib/push";
import { uploadMessageVideo, uploadMessagePdf, uploadMessageImage } from "../lib/storage";
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
import { localDateKey } from "../lib/dateKey";
import { countExercises, estimateWorkoutMinutes, countWorkoutSets } from "../lib/workoutStats";
import {
  Card,
  Pill,
  ProgressBar,
  WaterCup,
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
  computePersonalBests,
  computePRsInLastNDays,
  computeWorkoutStreak,
  computeMonthlyConsistency,
  computeMonthlyVolume,
  computeAchievements,
  computePerformanceTimeline,
  closestWeighIn,
  suggestNextSet,
} from "../lib/trainingStats";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { challengeStatus } from "../lib/challengeMetrics";
import { fileToCompressedDataUrl } from "../lib/image";
import { parseVideoUrl } from "../lib/video";
import { FOOD_DATABASE } from "../lib/foodDatabase";
import { bestMatches, matchPct, eligibleForSlot } from "../lib/mealMatch";
import { ShoppingListSheet } from "../components/ShoppingListSheet";
import { BarcodeScanSheet, PhotoEstimateSheet, CreateMealSheet, SavedMealsSection, FoodQuantitySheet, QuickAddFoodSheet } from "./NutritionFeatures";
import {
  BODY_FAT_CONFIG,
  LEAN_MASS_CONFIG,
  BODY_MEASUREMENTS_CONFIG,
  buildBodyMetricEntries,
  LogBodyMetricSheet,
  BodyMetricHistoryScreen,
  BodyMetricCard,
  BodyMeasurementsListCard,
  ConsistencyHeatmap,
} from "../components/ProgressWidgets";

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
  if (exMeta.targetReps == null || exMeta.targetReps === "") return "Repetitions";
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
   THEME — the coach can flip the client app between dark and light from
   Design Settings (settings/appDesign.clientDarkMode). Every themed
   component below reads it via useClientDark() rather than a prop, since
   plumbing one boolean through this many nested components would mean
   touching every function signature; a context avoids that while still
   updating instantly everywhere the moment the coach flips the switch.
============================================================================ */

export const ClientThemeContext = createContext(true);
export function useClientDark() {
  return useContext(ClientThemeContext);
}

/* ============================================================================
   HOME
============================================================================ */

function BrandBar({ dark = false }) {
  return (
    <div className="flex items-center justify-center pt-3 pb-1">
      <Logo variant="mark" tone={dark ? "white" : "black"} className={`h-9 w-auto ${dark ? "opacity-90" : "opacity-95"}`} />
    </div>
  );
}

function Header({ user, onAvatarClick, notifCount = 0, onOpenNotifications }) {
  const dark = useClientDark();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-0">
      <div>
        <p className={`text-xl font-semibold tracking-tight ${dark ? "text-white" : "text-black"}`}>
          {greeting}, {user.name.split(" ")[0]}
        </p>
        <p className={`text-sm mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>{dateStr}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenNotifications}
          className={`w-10 h-10 rounded-full flex items-center justify-center relative active:scale-95 transition-transform ${
            dark ? "bg-white/8" : "bg-black/8"
          }`}
        >
          <Bell size={17} className={dark ? "text-white/80" : "text-black/80"} />
          {notifCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                dark ? "bg-white text-black" : "bg-black text-white"
              }`}
            >
              {notifCount}
            </span>
          )}
        </button>
        <Avatar name={user.name} url={user.avatarUrl} size={40} onClick={onAvatarClick} dark={dark} />
      </div>
    </div>
  );
}

function TodayWorkoutCard({ todaySession, activeLog, onStart, onView, isToday = true, completedOnDate = false, isPastDate = false, exercisesById, dbReady = true, fullWidth = false }) {
  const dark = useClientDark();
  const outerMargin = fullWidth ? "" : "mx-4";
  const outerRadius = fullWidth ? "rounded-none" : "rounded-2xl";
  const cardBg = dark ? "#141414" : "#F7F7F8";
  const border = dark ? "border-white/8" : "border-black/8";
  const muted20 = dark ? "text-white/20" : "text-black/20";
  const muted30 = dark ? "text-white/30" : "text-black/30";
  const muted35 = dark ? "text-white/35" : "text-black/35";
  const muted40 = dark ? "text-white/40" : "text-black/40";
  const muted45 = dark ? "text-white/45" : "text-black/45";
  const muted70 = dark ? "text-white/70" : "text-black/70";
  const primaryText = dark ? "text-white" : "text-black";
  const trackClass = dark ? "bg-white/10" : "bg-black/10";
  const ctaClass = dark ? "bg-white text-black" : "bg-black text-white";
  const ctaFill = dark ? "black" : "white";
  const viewBorder = dark ? "border-white/12 bg-white/5" : "border-black/12 bg-black/5";

  if (!todaySession) {
    return (
      <div className={`${outerMargin} ${outerRadius} p-8 ${border} border text-center`} style={{ backgroundColor: cardBg }}>
        <Dumbbell size={22} className={`${muted20} mx-auto mb-3`} />
        <p className={`${muted70} font-medium text-sm`}>{dbReady ? "No workout scheduled" : "Loading your schedule…"}</p>
        {dbReady && (
          <p className={`${muted30} text-xs mt-1`}>{isToday ? "Nothing's scheduled for today." : "Nothing's scheduled for this day."}</p>
        )}
      </div>
    );
  }
  const completedSets = isToday && activeLog ? Object.values(activeLog).flat().filter((s) => s.completed).length : 0;
  const totalSets = countWorkoutSets(todaySession.exercises);
  const started = isToday && !!activeLog;
  const exCount = countExercises(todaySession.exercises);
  const estMin = estimateWorkoutMinutes(todaySession.exercises);
  const pillLabel = completedOnDate ? "COMPLETED" : isToday ? "TODAY'S FOCUS" : isPastDate ? "MISSED" : "SCHEDULED";

  return (
    <div className={`${outerMargin} ${outerRadius} p-5 ${border} border`} style={{ backgroundColor: cardBg }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`${muted35} text-[11px] font-bold tracking-[0.14em]`}>{pillLabel}</span>
        {completedOnDate && !started && <Check size={15} className={muted40} />}
      </div>
      <h2 className={`${primaryText} text-xl font-bold tracking-tight`}>{todaySession.label}</h2>
      {(todaySession.muscleGroups || []).length > 0 && (
        <p className={`${muted45} text-[13px] mt-1`}>{todaySession.muscleGroups.join(" & ")} Focus</p>
      )}
      <p className={`${muted30} text-[12px] mt-2.5 tracking-wide`}>
        {exCount} EXERCISE{exCount === 1 ? "" : "S"} · ~{estMin} MIN
      </p>

      {started && (
        <div className="mt-4">
          <div className={`flex justify-between text-xs ${muted35} mb-1.5`}>
            <span>Progress</span>
            <span>
              {completedSets}/{totalSets} sets
            </span>
          </div>
          <ProgressBar value={completedSets} max={totalSets} color={dark ? "#FFFFFF" : "#0A0A0B"} trackClassName={trackClass} />
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {(!completedOnDate || started) && (
          <button
            onClick={onStart}
            className={`flex-1 font-bold py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${ctaClass}`}
          >
            <Play size={15} fill={ctaFill} />
            {started ? "RESUME WORKOUT" : "START WORKOUT"}
          </button>
        )}
        <button
          onClick={onView}
          className={`${muted70} text-sm font-semibold px-4 rounded-xl border ${viewBorder} active:scale-[0.98] transition-transform ${
            completedOnDate && !started ? "flex-1 py-3.5" : ""
          }`}
        >
          View
        </button>
      </div>
    </div>
  );
}

function NutritionSummaryCard({ nutrition, targets, onLogFood, onLogWater, isToday = true }) {
  const dark = useClientDark();
  const logged = nutrition || DEFAULT_NUTRITION;
  const items = [
    { label: "CALORIES", value: Math.round(logged.calories), target: targets.calories, unit: "" },
    { label: "PROTEIN", value: round1(logged.protein), target: targets.protein, unit: "g" },
    { label: "CARBS", value: round1(logged.carbs), target: targets.carbs, unit: "g" },
    { label: "FAT", value: round1(logged.fat), target: targets.fat, unit: "g" },
  ];
  const border = dark ? "border-white/8" : "border-black/8";
  const primaryText = dark ? "text-white" : "text-black";
  const muted25 = dark ? "text-white/25" : "text-black/25";
  const muted30 = dark ? "text-white/30" : "text-black/30";
  const muted35 = dark ? "text-white/35" : "text-black/35";
  const muted50 = dark ? "text-white/50" : "text-black/50";
  const muted70 = dark ? "text-white/70" : "text-black/70";
  const trackClass = dark ? "bg-white/8" : "bg-black/8";
  const actionBtn = dark ? "bg-white/8 text-white" : "bg-black/8 text-black";
  return (
    <div className={`mx-4 rounded-2xl p-5 ${border} border`} style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`${primaryText} font-semibold`}>{isToday ? "Nutrition Today" : "Nutrition"}</h3>
        <Utensils size={15} className={muted25} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className={`${muted35} tracking-wide`}>{it.label}</span>
            </div>
            <p className={`${primaryText} text-sm font-semibold mb-1.5`}>
              {it.value}
              {it.unit} <span className={`${muted30} font-normal`}>/ {it.target}{it.unit}</span>
            </p>
            <ProgressBar
              value={it.value}
              max={it.target}
              height={6}
              color={it.value >= it.target ? GOAL_GREEN : MEASURE_BLUE}
              trackClassName={trackClass}
            />
          </div>
        ))}
      </div>
      <div className={`mt-4 pt-4 border-t ${border} flex items-center gap-3`}>
        <WaterCup value={logged.water} max={targets.water} size={36} dark={dark} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {logged.water >= targets.water ? (
              <Droplets size={16} className={`${primaryText} shrink-0`} />
            ) : (
              <GlassWater size={16} className={`${muted50} shrink-0`} />
            )}
            <span className={`${muted70} text-sm`}>
              Water: <span className={`font-semibold ${primaryText}`}>{logged.water}L</span> / {targets.water}L
            </span>
          </div>
        </div>
      </div>
      {isToday && (
        <div className="flex gap-2 mt-4">
          <button onClick={onLogFood} className={`flex-1 text-sm font-semibold py-3 rounded-xl active:scale-[0.97] transition-transform ${actionBtn}`}>
            + LOG FOOD
          </button>
          <button
            onClick={onLogWater}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-3 rounded-xl active:scale-90 transition-transform duration-150 ${actionBtn}`}
          >
            <GlassWater size={15} /> + LOG WATER
          </button>
        </div>
      )}
    </div>
  );
}

function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function DayHeader({ selectedOffset, onJumpToday }) {
  const dark = useClientDark();
  if (selectedOffset === 0) return null;
  return (
    <div className="flex items-center justify-end px-4 pt-1 pb-1">
      <button
        onClick={onJumpToday}
        className={`text-sm font-semibold underline underline-offset-2 ${dark ? "text-white/50" : "text-black/50"}`}
      >
        Jump to today
      </button>
    </div>
  );
}

function DateStrip({ selectedOffset, onSelect }) {
  const dark = useClientDark();
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
    <div className="px-4">
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
              className={`shrink-0 w-[calc((100%-48px)/7)] rounded-xl py-2 flex flex-col items-center gap-0.5 border transition-colors ${
                isSelected
                  ? dark
                    ? "bg-white border-white"
                    : "bg-black border-black"
                  : dark
                  ? "bg-white/[0.04] border-white/8"
                  : "bg-black/[0.04] border-black/8"
              }`}
            >
              <span
                className={`text-sm font-bold leading-none ${
                  isSelected ? (dark ? "text-black" : "text-white") : dark ? "text-white" : "text-black"
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`text-[9px] font-semibold tracking-wide ${
                  isSelected ? (dark ? "text-black/50" : "text-white/50") : dark ? "text-white/35" : "text-black/35"
                }`}
              >
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              {isToday && (
                <span
                  className={`w-1 h-1 rounded-full ${
                    isSelected ? (dark ? "bg-black/40" : "bg-white/40") : dark ? "bg-white/50" : "bg-black/50"
                  }`}
                />
              )}
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

function DailyHabitsCard({ habits, completedIds, onToggle, interactive = true, showToast }) {
  const dark = useClientDark();
  // Optimistic overrides, keyed by habit id, for taps whose Firestore write
  // hasn't confirmed yet — without this the checkbox only ever changes once
  // the realtime listener echoes the write back, so a slow connection (or a
  // write that silently failed) looked exactly like the tap doing nothing
  // at all. Cleared once the real completedIds reflects the write (success)
  // or the write throws (failure — reverts to whatever it was before).
  const [pending, setPending] = useState({});
  if (habits.length === 0) return null;
  const isDone = (h) => (h.id in pending ? pending[h.id] : completedIds.includes(h.id));
  const doneCount = habits.filter((h) => isDone(h)).length;

  async function handleToggle(h) {
    setPending((p) => ({ ...p, [h.id]: !isDone(h) }));
    try {
      await onToggle(h.id);
    } catch {
      // Reverts below either way; the caller is responsible for surfacing
      // a toast if it wants one.
    } finally {
      setPending((p) => {
        const { [h.id]: _dropped, ...rest } = p;
        return rest;
      });
    }
  }

  const doneRowBg = dark ? "bg-white/[0.06]" : "bg-black/[0.06]";
  const notDoneRowBg = dark ? "bg-white/[0.03]" : "bg-black/[0.03]";
  const doneIconBg = dark ? "bg-white" : "bg-black";
  const notDoneIconBg = dark ? "bg-white/8" : "bg-black/8";
  const doneIconColor = dark ? "text-black" : "text-white";
  const notDoneIconColor = dark ? "text-white/45" : "text-black/45";
  const doneLabelColor = dark ? "text-white/35" : "text-black/35";
  const notDoneLabelColor = dark ? "text-white/85" : "text-black/85";
  const doneCheckBg = dark ? "bg-white border-white" : "bg-black border-black";
  const notDoneCheckBorder = dark ? "border-white/20" : "border-black/20";
  const checkIconColor = dark ? "text-black" : "text-white";
  return (
    <div className={`mx-4 rounded-2xl p-5 border ${dark ? "border-white/8" : "border-black/8"}`} style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}>
      <div className="flex items-center justify-between mb-0.5">
        <h3 className={`font-semibold ${dark ? "text-white" : "text-black"}`}>Daily Execution</h3>
        <span className={`text-xs font-medium tracking-wide ${dark ? "text-white/35" : "text-black/35"}`}>
          {doneCount}/{habits.length} COMPLETE
        </span>
      </div>
      <p className={`text-xs mb-3 ${dark ? "text-white/35" : "text-black/35"}`}>The small actions that drive your performance.</p>
      <div className="mb-3">
        <ProgressBar
          value={doneCount}
          max={habits.length}
          height={6}
          color={dark ? "#FFFFFF" : "#0A0A0B"}
          trackClassName={dark ? "bg-white/10" : "bg-black/10"}
        />
      </div>
      <div className="space-y-1.5">
        {habits.map((h) => {
          const done = isDone(h);
          const Icon = habitIcon(h.label);
          return (
            <button
              type="button"
              key={h.id}
              onClick={() => (interactive ? handleToggle(h) : showToast?.("Jump to today to update habits"))}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${
                done ? doneRowBg : notDoneRowBg
              } ${interactive ? "active:scale-[0.97]" : "opacity-60"} transition-transform duration-150`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                  done ? `${doneIconBg} scale-100` : `${notDoneIconBg} scale-95`
                }`}
              >
                <Icon size={16} className={done ? doneIconColor : notDoneIconColor} strokeWidth={2.2} />
              </span>
              <span className={`text-sm flex-1 transition-colors ${done ? `${doneLabelColor} line-through` : notDoneLabelColor}`}>{h.label}</span>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 ${
                  done ? `${doneCheckBg} scale-100` : `${notDoneCheckBorder} scale-90`
                }`}
              >
                {done && <Check size={12} className={checkIconColor} strokeWidth={3.5} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActiveChallengesCard({ challenges, userId }) {
  const dark = useClientDark();
  const todayKey = localDateKey();
  const active = challenges.filter((c) => challengeStatus(c, todayKey) === "active");
  if (active.length === 0) return null;

  return (
    <div className="px-4 space-y-2.5">
      {active.map((c) => {
        const snapshot = c.leaderboardSnapshot || [];
        const mine = snapshot.find((r) => r.clientId === userId);
        return (
          <div
            key={c.id}
            className={`rounded-2xl p-4 border ${dark ? "border-white/8" : "border-black/8"}`}
            style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${dark ? "bg-white/8" : "bg-black/8"}`}>
                <Trophy size={17} className={dark ? "text-white" : "text-black"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm truncate ${dark ? "text-white" : "text-black"}`}>{c.name}</p>
                {mine ? (
                  <p className={`text-xs mt-0.5 ${dark ? "text-white/45" : "text-black/45"}`}>
                    You're rank #{mine.rank} of {snapshot.length} · {mine.value}
                  </p>
                ) : (
                  <p className={`text-xs mt-0.5 ${dark ? "text-white/30" : "text-black/30"}`}>Leaderboard updates when your coach checks in</p>
                )}
              </div>
              {mine && mine.rank <= 3 && (
                <span className="text-lg shrink-0">{mine.rank === 1 ? "🥇" : mine.rank === 2 ? "🥈" : "🥉"}</span>
              )}
            </div>
          </div>
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
  const dark = useClientDark();
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
    <div
      className={`mx-4 flex items-center gap-3 rounded-2xl px-4 py-3 border ${dark ? "border-white/8" : "border-black/8"}`}
      style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}
    >
      <BellRing size={17} className="shrink-0" style={{ color: MEASURE_BLUE }} />
      <p className={`flex-1 text-[13px] font-medium ${dark ? "text-white/65" : "text-black/65"}`}>
        Turn on notifications so you never miss a message from your coach
      </p>
      <button
        onClick={enable}
        disabled={busy}
        className="text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0 disabled:opacity-50"
        style={{ backgroundColor: MEASURE_BLUE }}
      >
        {busy ? "…" : "ENABLE"}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className={`shrink-0 ${dark ? "text-white/25 hover:text-white/50" : "text-black/25 hover:text-black/50"}`}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// Cardio logged for the day being viewed on Home — a client's cardio
// sessions (entries: [], cardio: {...}) previously only ever surfaced
// buried in the Workouts tab's history list.
function CardioLogCard({ logs }) {
  const dark = useClientDark();
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mx-4 space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${dark ? "border-white/8" : "border-black/8"}`}
          style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(47,143,255,0.15)" }}>
            <Footprints size={17} style={{ color: MEASURE_BLUE }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${dark ? "text-white/85" : "text-black/85"}`}>{log.cardio.activityLabel}</p>
            <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>
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
  const dark = useClientDark();
  return (
    <div className="pb-28 space-y-5">
      <Header user={user} onAvatarClick={onAvatarClick} notifCount={notifCount} onOpenNotifications={onOpenNotifications} />
      <div className="space-y-1.5">
        <DayHeader selectedOffset={dayOffset} onJumpToday={() => onSelectDay(0)} />
        <DateStrip selectedOffset={dayOffset} onSelect={onSelectDay} />
      </div>
      {isToday && <NotificationsPromptCard userId={userId} showToast={showToast} />}
      {isToday && bodyStatsDueToday && (
        <div
          className={`mx-4 flex items-center gap-3 rounded-2xl px-4 py-3 border ${dark ? "border-white/8" : "border-black/8"}`}
          style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}
        >
          <Scale size={17} className="shrink-0" style={{ color: MEASURE_BLUE }} />
          <p className={`flex-1 text-[13px] font-medium ${dark ? "text-white/65" : "text-black/65"}`}>Body stats check-in due today</p>
          <button onClick={onLogWeight} className="text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0" style={{ backgroundColor: MEASURE_BLUE }}>
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
        showToast={showToast}
      />
      <NutritionSummaryCard nutrition={dayNutrition} targets={targets} onLogFood={onLogFood} onLogWater={onLogWater} isToday={isToday} />
    </div>
  );
}

/* ============================================================================
   WORKOUT PREVIEW + SESSION FLOW
============================================================================ */

function WorkoutPreviewSheet({ session, exercisesById, canStart, onStart, onClose }) {
  const dark = useClientDark();
  const { db, currentUser, addWorkoutComment } = useApp();
  const [commentDraft, setCommentDraft] = useState("");
  const comments = session.workoutLogId
    ? (db.workoutComments[currentUser.id] || []).filter((c) => c.workoutLogId === session.workoutLogId)
    : [];
  const autoEntries = session.workoutLogId
    ? session.exercises.flatMap((e) => {
        const ex = exercisesById[e.exerciseId];
        return (e.actualSets || [])
          .filter((s) => s.isPR)
          .map((s, si) => ({
            id: `pr_${e.exerciseId}_${si}`,
            system: true,
            text: `New PR — ${ex?.name || "Exercise"}: ${s.reps}${s.weight > 0 ? ` × ${s.weight} kg` : ""}`,
          }));
      })
    : [];
  const commentTimeline = session.workoutLogId
    ? [...autoEntries, ...comments.map((c) => ({ ...c, system: false }))].sort((a, b) => (a.date || 0) - (b.date || 0))
    : [];

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
      <div className={dark ? "fixed inset-0 z-[90] bg-black flex flex-col" : "fixed inset-0 z-[90] bg-white flex flex-col"}>
        <div className={dark ? "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5"}>
          <button onClick={onClose} className={dark ? "text-white/60" : "text-black/60"}>
            <X size={22} />
          </button>
          <span className={dark ? "text-white/70 text-sm font-semibold" : "text-black/70 text-sm font-semibold"}>{session.weekLabel || "Workout Preview"}</span>
          <ClipboardList size={19} className={dark ? "text-white/25" : "text-black/25"} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-28">
          <div className="flex items-center gap-2.5 mt-4">
            <span className={dark ? "w-9 h-9 rounded-full border-2 border-white/15 shrink-0" : "w-9 h-9 rounded-full border-2 border-black/15 shrink-0"} />
            <h1 className={dark ? "text-white text-2xl font-bold truncate" : "text-black text-2xl font-bold truncate"}>{session.label}</h1>
          </div>

          <div className={dark ? "flex items-center gap-5 mt-4 text-white/50 text-[13px] font-medium flex-wrap" : "flex items-center gap-5 mt-4 text-black/50 text-[13px] font-medium flex-wrap"}>
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
              <p className={dark ? "text-white/35 text-xs font-semibold tracking-wide mb-2" : "text-black/35 text-xs font-semibold tracking-wide mb-2"}>EQUIPMENT</p>
              <div className="flex gap-2.5 flex-wrap">
                {equipment.map((eq) => (
                  <div key={eq} className="flex flex-col items-center gap-1.5 w-16">
                    <div className={dark ? "w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center" : "w-14 h-14 rounded-2xl bg-black/5 border border-black/5 flex items-center justify-center"}>
                      <Dumbbell size={20} className={dark ? "text-white/40" : "text-black/40"} />
                    </div>
                    <span className={dark ? "text-white/45 text-[10px] text-center leading-tight" : "text-black/45 text-[10px] text-center leading-tight"}>{eq}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sectionedExercises(session.exercises.map((exMeta) => exMeta)).map((group) => (
            <div key={group.key} className="mt-5">
              {group.showHeader && <p className={dark ? "text-white/40 text-xs font-bold tracking-wide mb-1" : "text-black/40 text-xs font-bold tracking-wide mb-1"}>{group.label.toUpperCase()}</p>}
              <div className={dark ? "border-t border-white/5" : "border-t border-black/5"}>
                {group.items.map(({ exMeta: e, i }) => {
                  const ex = exercisesById[e.exerciseId];
                  if (!ex) return null;
                  return (
                    <div key={i} className={dark ? "flex items-center gap-3 py-3.5 border-b border-white/5" : "flex items-center gap-3 py-3.5 border-b border-black/5"}>
                      <ExerciseThumb dark={dark} exercise={ex} size={56} rounded="rounded-lg" className="shadow-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={dark ? "text-white font-semibold text-[15px] truncate" : "text-black font-semibold text-[15px] truncate"}>{ex.name}</p>
                          {e.dropSet && (
                            <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                              DROPSET
                            </span>
                          )}
                        </div>
                        {e.actualSets ? (
                          e.actualSets.length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              {e.actualSets.map((s, si) => (
                                <p key={si} className={dark ? "text-white/60 text-[13px]" : "text-black/60 text-[13px]"}>
                                  Set {si + 1} — {s.reps}
                                  {s.weight > 0 ? ` × ${s.weight} kg` : ""}
                                  {s.isPR && (
                                    <span className="font-semibold ml-1" style={{ color: GOAL_GREEN }}>
                                      PR
                                    </span>
                                  )}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className={dark ? "text-white/35 text-[13px] mt-0.5 italic" : "text-black/35 text-[13px] mt-0.5 italic"}>No sets logged</p>
                          )
                        ) : (
                          <p className={dark ? "text-white/45 text-[13px] mt-0.5" : "text-black/45 text-[13px] mt-0.5"}>
                            {e.targetSets} sets × {formatTargetReps(e)}, {formatRest(e.restSeconds ?? 90)} rest
                            between sets
                          </p>
                        )}
                        {e.note && <p className={dark ? "text-white/40 text-[12px] mt-1 italic" : "text-black/40 text-[12px] mt-1 italic"}>"{e.note}"</p>}
                      </div>
                      {e.notes && <ClipboardList size={16} className={dark ? "text-white/40 shrink-0" : "text-black/40 shrink-0"} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {session.workoutLogId && (
            <div className="mt-6">
              <p className={dark ? "text-white/35 text-xs font-semibold tracking-wide mb-2 flex items-center gap-1.5" : "text-black/35 text-xs font-semibold tracking-wide mb-2 flex items-center gap-1.5"}>
                <MessageCircle size={13} /> COMMENTS
              </p>
              <div className="space-y-2">
                {commentTimeline.length === 0 && <p className={dark ? "text-white/30 text-[13px]" : "text-black/30 text-[13px]"}>No comments on this workout yet.</p>}
                {commentTimeline.map((item) =>
                  item.system ? (
                    <div key={item.id} className={dark ? "flex items-start gap-2 text-white/50 text-[12px]" : "flex items-start gap-2 text-black/50 text-[12px]"}>
                      <Trophy size={13} className="shrink-0 mt-0.5" style={{ color: GOAL_GREEN }} />
                      <p className="leading-snug">{item.text}</p>
                    </div>
                  ) : (
                    <div key={item.id} className={dark ? "bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2" : "bg-black/[0.03] border border-black/5 rounded-lg px-3 py-2"}>
                      <p className={dark ? "text-white/60 text-[11px] font-semibold" : "text-black/60 text-[11px] font-semibold"}>
                        {item.authorName || (item.from === "coach" ? "Coach" : "You")}
                        <span className={dark ? "text-white/30 font-normal ml-1.5" : "text-black/30 font-normal ml-1.5"}>
                          {new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </p>
                      <p className={dark ? "text-white text-[13px] mt-0.5 whitespace-pre-wrap" : "text-black text-[13px] mt-0.5 whitespace-pre-wrap"}>{item.text}</p>
                    </div>
                  )
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <TextInput dark={dark}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment for your coach…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentDraft.trim()) {
                      addWorkoutComment(currentUser.id, session.workoutLogId, "client", currentUser.name, commentDraft);
                      setCommentDraft("");
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (!commentDraft.trim()) return;
                    addWorkoutComment(currentUser.id, session.workoutLogId, "client", currentUser.name, commentDraft);
                    setCommentDraft("");
                  }}
                  disabled={!commentDraft.trim()}
                  className={dark ? "shrink-0 w-11 h-11 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-30" : "shrink-0 w-11 h-11 rounded-xl bg-black text-white flex items-center justify-center disabled:opacity-30"}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {canStart && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center px-6">
            <button
              onClick={onStart}
              className={dark ? "bg-white text-black font-bold py-4 px-10 rounded-full shadow-2xl flex items-center gap-2 active:scale-[0.98] transition-transform" : "bg-black text-white font-bold py-4 px-10 rounded-full shadow-2xl flex items-center gap-2 active:scale-[0.98] transition-transform"}
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
  const dark = useClientDark();
  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Ready to train?">
      <div className="space-y-3">
        {PRE_WORKOUT_REMINDERS.map((r, i) => (
          <div key={i} className={dark ? "flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-3.5 py-3" : "flex items-start gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3"}>
            <r.icon size={18} className={dark ? "text-white/50 shrink-0 mt-0.5" : "text-black/50 shrink-0 mt-0.5"} />
            <div>
              <p className={dark ? "text-white text-sm font-semibold" : "text-black text-sm font-semibold"}>{r.title}</p>
              <p className={dark ? "text-white/45 text-[13px] mt-0.5 leading-snug" : "text-black/45 text-[13px] mt-0.5 leading-snug"}>{r.body}</p>
            </div>
          </div>
        ))}
        <button
          onClick={onReady}
          className={dark ? "w-full bg-white text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-1" : "w-full bg-black text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-1"}
        >
          <Play size={16} fill="white" /> LET'S GO
        </button>
      </div>
    </BottomSheet>
  );
}

function RestBar({ restTime, restTotal, onSkip, onAdd15 }) {
  const dark = useClientDark();
  const pct = restTotal > 0 ? ((restTotal - restTime) / restTotal) * 100 : 0;
  return (
    <div className="fixed top-0 left-0 right-0 z-[95] flex justify-center pt-safe animate-[slideDown_0.3s_ease-out]">
      <div className={dark ? "w-full max-w-md bg-white text-black px-5 py-3.5 flex items-center gap-3 shadow-2xl" : "w-full max-w-md bg-black text-white px-5 py-3.5 flex items-center gap-3 shadow-2xl"}>
        <div className="flex-1 min-w-0">
          <p className={dark ? "text-black/50 text-[11px] tracking-wide truncate" : "text-white/50 text-[11px] tracking-wide truncate"}>RELAX AND HAVE A DRINK</p>
          <p className={dark ? "text-black text-xl font-bold tabular-nums" : "text-white text-xl font-bold tabular-nums"}>
            {Math.floor(Math.max(restTime, 0) / 60)}:{String(Math.max(restTime, 0) % 60).padStart(2, "0")}
          </p>
          <div className={dark ? "h-1 bg-black/15 rounded-full mt-1.5 overflow-hidden" : "h-1 bg-white/15 rounded-full mt-1.5 overflow-hidden"}>
            <div className={dark ? "h-full bg-black rounded-full transition-all" : "h-full bg-white rounded-full transition-all"} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button onClick={onAdd15} className={dark ? "bg-black/12 text-black text-xs font-semibold px-3 py-2.5 rounded-xl shrink-0" : "bg-white/12 text-white text-xs font-semibold px-3 py-2.5 rounded-xl shrink-0"}>
          +15s
        </button>
        <button onClick={onSkip} className={dark ? "bg-black text-white text-xs font-bold px-3 py-2.5 rounded-xl shrink-0" : "bg-white text-black text-xs font-bold px-3 py-2.5 rounded-xl shrink-0"}>
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
  const dark = useClientDark();
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
      <div className={dark ? "fixed inset-0 z-[115] bg-black flex flex-col overflow-y-auto" : "fixed inset-0 z-[115] bg-white flex flex-col overflow-y-auto"}>
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
          <button onClick={onClose} className={dark ? "text-white/60 -ml-1.5" : "text-black/60 -ml-1.5"}>
            <ChevronLeft size={24} />
          </button>
          <ClipboardList size={19} className={dark ? "text-white/25" : "text-black/25"} />
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
          <h1 className={dark ? "text-white text-2xl font-bold mb-3" : "text-black text-2xl font-bold mb-3"}>{exercise.name}</h1>

          {instructions.length > 0 && (
            <>
              <ol className={`space-y-2.5 ${dark ? "text-white/80" : "text-black/80"} text-[15px] leading-relaxed ${!notesExpanded && isLongInstructions ? "line-clamp-[9]" : ""}`}>
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
                <Pill dark={dark} key={i} tone="outline">
                  {c}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {best && (
          <div className={dark ? "px-5 py-4 bg-white/[0.03] border-y border-white/8 flex items-center justify-between" : "px-5 py-4 bg-black/[0.03] border-y border-black/8 flex items-center justify-between"}>
            <div>
              <p className={dark ? "text-white/40 text-xs tracking-wide" : "text-black/40 text-xs tracking-wide"}>PERSONAL BEST TO BEAT</p>
              <p className={dark ? "text-white font-bold mt-0.5" : "text-black font-bold mt-0.5"}>{best.reps} rep max</p>
            </div>
            <p className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>
              {best.weight}
              <span className="text-sm font-semibold">kg</span>
            </p>
          </div>
        )}

        {e1rmHistory.length >= 2 && (
          <div className="px-5 pt-5">
            <p className={dark ? "text-white/40 text-xs font-semibold tracking-wide mb-3" : "text-black/40 text-xs font-semibold tracking-wide mb-3"}>PROGRESSION</p>
            <div style={{ height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={e1rmHistory}>
                  <XAxis dataKey="date" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                          background: dark ? "#1C1C1C" : "#FFFFFF",
                          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: dark ? "#FFFFFF" : "#0A0A0B",
                        }}
                    formatter={(v) => [`${v} kg`, "Est. 1RM"]}
                  />
                  <Line type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2.5} dot={{ r: 3, fill: MEASURE_BLUE }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="px-5 py-5">
          <p className={dark ? "text-white/40 text-xs font-semibold tracking-wide mb-3" : "text-black/40 text-xs font-semibold tracking-wide mb-3"}>HISTORY</p>
          {history.length === 0 ? (
            <p className={dark ? "text-white/30 text-sm" : "text-black/30 text-sm"}>No previous sessions logged for this exercise yet.</p>
          ) : (
            <div className="space-y-5">
              {history.map((h, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className={dark ? "text-white font-semibold text-sm" : "text-black font-semibold text-sm"}>{h.dayLabel}</p>
                    <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                      {new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {h.sets.map((s, si) => (
                    <div key={si} className={dark ? "flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0" : "flex items-center justify-between text-sm py-1.5 border-b border-black/5 last:border-0"}>
                      <span className={dark ? "text-white/50" : "text-black/50"}>Set {s.setNumber}</span>
                      <span className={dark ? "text-white font-medium" : "text-black font-medium"}>
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
  const dark = useClientDark();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [noteStatus, setNoteStatus] = useState("idle"); // idle | saving | saved
  const noteSaveTimeout = useRef(null);
  const noteStatusResetRef = useRef(null);
  const coachNote = exMeta.notes || "";
  const isLongNote = coachNote.length > 90;

  return (
    <div className={dark ? "pt-1 pb-5 px-1 border-b border-white/10 last:border-b-0" : "pt-1 pb-5 px-1 border-b border-black/10 last:border-b-0"}>
      <div className="flex items-center gap-3">
        <ExerciseThumb dark={dark} exercise={exercise} size={56} rounded="rounded-lg" className="shadow-sm" />
        <button type="button" onClick={() => onOpenDetail?.(exercise, exMeta)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className={dark ? "text-white font-bold text-[17px] truncate" : "text-black font-bold text-[17px] truncate"}>{exercise.name}</p>
            {exMeta.groupType && (
              <span className={dark ? "bg-white/8 text-white/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0" : "bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"}>
                {exMeta.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
              </span>
            )}
            {exMeta.dropSet && (
              <span className={dark ? "bg-orange-500/15 text-orange-400 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0" : "bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"}>
                DROPSET
              </span>
            )}
          </div>
          <p className={dark ? "text-white/45 text-[14px] mt-0.5" : "text-black/45 text-[14px] mt-0.5"}>
            {exMeta.targetSets} sets × {formatTargetReps(exMeta)}
          </p>
        </button>
        <button
          onClick={onSwap}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            swapInfo ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "text-white/40" : "text-black/40"
          }`}
        >
          <Repeat size={17} />
        </button>
        <button
          onClick={onToggleNote}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            noteOpen || note ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "text-white/40" : "text-black/40"
          }`}
        >
          <ClipboardList size={17} />
        </button>
      </div>

      {swapInfo && (
        <div className={dark ? "mt-3 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5" : "mt-3 bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-2.5"}>
          <p className={dark ? "text-white/70 text-[13px] leading-snug" : "text-black/70 text-[13px] leading-snug"}>
            <span className="font-semibold">Swapped from {swapInfo.fromName}.</span> {swapInfo.reason}
          </p>
        </div>
      )}

      {coachNote && (
        <div className={dark ? "mt-3 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5" : "mt-3 bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-2.5"}>
          <p className={dark ? "text-white/35 text-[10px] font-semibold tracking-wide mb-1" : "text-black/35 text-[10px] font-semibold tracking-wide mb-1"}>COACH'S NOTES</p>
          <div className="flex items-start gap-2">
            <p className={`${dark ? "text-white/80" : "text-black/80"} text-[14px] leading-snug flex-1 ${!notesExpanded && isLongNote ? "line-clamp-2" : ""}`}>{coachNote}</p>
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
            className={dark ? "w-full bg-black border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-[14px] outline-none focus:border-white/30 placeholder:text-white/25 resize-none" : "w-full bg-white border border-black/15 rounded-xl px-3.5 py-2.5 text-black text-[14px] outline-none focus:border-black/30 placeholder:text-black/25 resize-none"}
          />
          <p className="text-[11px] mt-1 px-0.5" style={{ color: noteStatus === "saved" ? "#16A34A" : dark ? "rgba(255,255,255,0.3)" : "rgba(10,10,11,0.3)" }}>
            {noteStatus === "saving" ? "Saving…" : noteStatus === "saved" ? "Saved ✓" : "Autosaves as you type"}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => onStartRest(exMeta)}
        className={dark ? "mt-3 w-full flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors" : "mt-3 w-full flex items-center gap-2 bg-black/[0.04] hover:bg-black/[0.07] rounded-full pl-3 pr-1.5 py-1.5 transition-colors"}
      >
        <Hand size={14} style={{ color: MEASURE_BLUE }} className="shrink-0" />
        <span className="text-[13px] font-medium flex-1 text-left" style={{ color: MEASURE_BLUE }}>
          Tap to start rest timer
        </span>
        <span
          className={dark ? "bg-black border border-white/10 text-[13px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1" : "bg-white border border-black/10 text-[13px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1"}
          style={{ color: MEASURE_BLUE }}
        >
          <Clock size={11} />
          {formatRest(exMeta.restSeconds ?? 90)}
        </span>
      </button>

      <div className="mt-3">
        <div className="grid grid-cols-[30px_1fr_84px_64px] gap-2 px-1 mb-1.5">
          <span className={dark ? "text-white/70 text-[13px] font-bold" : "text-black/70 text-[13px] font-bold"}>Set</span>
          <span className={dark ? "text-white/70 text-[13px] font-bold" : "text-black/70 text-[13px] font-bold"}>Previous</span>
          <span className={dark ? "text-white/70 text-[12px] font-bold text-center leading-tight" : "text-black/70 text-[12px] font-bold text-center leading-tight"}>
            {exMeta.targetType === "time" ? "Seconds" : "Repetitions"}
          </span>
          <span className={dark ? "text-white/70 text-[13px] font-bold text-center" : "text-black/70 text-[13px] font-bold text-center"}>Kg</span>
        </div>
        {rows.map((row, i) => {
          const prev = previousSets[i];
          const suggestion = suggestNextSet(prev, exMeta.targetReps);
          return (
            <div key={i} className="grid grid-cols-[30px_1fr_84px_64px] gap-2 items-center px-1 py-1.5">
              <span className={dark ? "text-white text-[18px] font-bold" : "text-black text-[18px] font-bold"}>{i + 1}</span>
              <div className="min-w-0">
                <p className={dark ? "text-white/40 text-[14px] truncate" : "text-black/40 text-[14px] truncate"}>{prev ? `${prev.reps} x ${prev.weight} kg` : "-"}</p>
                {suggestion && !row.weight && !row.reps && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeField(i, "weight", String(suggestion.weight));
                      onChangeField(i, "reps", String(suggestion.reps));
                    }}
                    className="flex items-center gap-1 text-[12px] font-semibold mt-0.5"
                    style={{ color: MEASURE_BLUE }}
                  >
                    <TrendingUp size={12} className="shrink-0" />
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
                className={dark ? "w-full bg-black border border-white/15 rounded-xl text-center text-white text-[19px] font-bold py-2 outline-none focus:border-white/40" : "w-full bg-white border border-black/15 rounded-xl text-center text-black text-[19px] font-bold py-2 outline-none focus:border-black/40"}
              />
              <input
                type="number"
                inputMode="decimal"
                value={row.weight}
                onChange={(e) => onChangeField(i, "weight", e.target.value)}
                onBlur={() => onBlurKg(i)}
                className={dark ? "w-full bg-black border border-white/15 rounded-xl text-center text-white text-[19px] font-bold py-2 outline-none focus:border-white/40" : "w-full bg-white border border-black/15 rounded-xl text-center text-black text-[19px] font-bold py-2 outline-none focus:border-black/40"}
              />
            </div>
          );
        })}
        <button onClick={onAddSet} className="flex items-center gap-1.5 mt-2 px-1" style={{ color: MEASURE_BLUE }}>
          <Plus size={14} className="border rounded-full p-0.5 box-content" style={{ borderColor: MEASURE_BLUE }} />
          <span className="text-[14px] font-semibold">Add new set</span>
        </button>
      </div>
    </div>
  );
}

function SwapExerciseSheet({ exMeta, exercise, allExercises, onClose, onConfirm }) {
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={!!exMeta} onClose={onClose} title={selected ? "Why the swap?" : `Swap ${exercise?.name || "exercise"}`}>
      {!selected ? (
        <div>
          <div className={dark ? "flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5 mb-3" : "flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-3"}>
            <Search size={16} className={dark ? "text-white/40" : "text-black/40"} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises"
              autoFocus
              className={dark ? "bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30" : "bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"}
            />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className={dark ? "w-full flex items-center justify-between py-2.5 border-b border-white/5 last:border-0" : "w-full flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"}
              >
                <span className={dark ? "text-white text-sm" : "text-black text-sm"}>{e.name}</span>
                <span className={dark ? "text-white/30 text-xs" : "text-black/30 text-xs"}>{e.equipment}</span>
              </button>
            ))}
            {search && filtered.length === 0 && <p className={dark ? "text-white/30 text-sm text-center py-6" : "text-black/30 text-sm text-center py-6"}>No matching exercises.</p>}
          </div>
        </div>
      ) : (
        <div>
          <p className={dark ? "text-white/50 text-sm mb-3" : "text-black/50 text-sm mb-3"}>
            Swapping <span className={dark ? "font-semibold text-white" : "font-semibold text-black"}>{exercise?.name}</span> for{" "}
            <span className={dark ? "font-semibold text-white" : "font-semibold text-black"}>{selected.name}</span>. Let your coach know why — this note is required and
            visible to them.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Shoulder felt tight, swapped for a machine variation"
            className={dark ? "w-full bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white text-sm outline-none placeholder:text-white/30 resize-none" : "w-full bg-black/5 border border-black/10 rounded-2xl px-3.5 py-2.5 text-black text-sm outline-none placeholder:text-black/30 resize-none"}
          />
          <div className="flex gap-2 mt-4">
            <SecondaryButton dark={dark} className="flex-1" onClick={() => setSelected(null)}>
              Back
            </SecondaryButton>
            <PrimaryButton dark={dark} className="flex-1" disabled={!reason.trim()} onClick={() => onConfirm(selected, reason.trim())}>
              Confirm Swap
            </PrimaryButton>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

const CONFETTI_COLORS = ["#FFFFFF", "#3B82F6", "#EF4444", "#10B981", "#8B5CF6", "#EC4899"];

// A one-shot burst of falling confetti pieces, computed once per mount (not
// per render) so the pieces don't jump to new random positions if the
// parent re-renders while the burst is still playing out.
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.2,
        duration: 1.4 + Math.random() * 0.7,
        rotate: 180 + Math.random() * 540,
        drift: (Math.random() - 0.5) * 120,
      })),
    []
  );
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 w-2 h-2.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s cubic-bezier(0.25,0.46,0.45,0.94) ${p.delay}s forwards`,
            "--drift": `${p.drift}px`,
            "--rotate": `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
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
  const dark = useClientDark();
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
      <div className={dark ? "fixed inset-0 z-[90] bg-black flex flex-col" : "fixed inset-0 z-[90] bg-white flex flex-col"}>
        <div className={dark ? "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5"}>
          <button onClick={onExit} className={dark ? "text-white/60 text-sm font-medium" : "text-black/60 text-sm font-medium"}>
            Cancel
          </button>
          <h1 className={dark ? "text-white font-bold text-[17px] truncate px-2" : "text-black font-bold text-[17px] truncate px-2"}>{daySession.label}</h1>
          <button onClick={onFinish} className={dark ? "text-white font-bold text-sm shrink-0" : "text-black font-bold text-sm shrink-0"}>
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 pb-28">
          {sectionedExercises(exercisesForSession).map((group) => (
            <div key={group.key}>
              {group.showHeader && (
                <p className={dark ? "text-white/40 text-[11px] font-bold tracking-wide mb-2 mt-1" : "text-black/40 text-[11px] font-bold tracking-wide mb-2 mt-1"}>{group.label.toUpperCase()}</p>
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
          <>
            <ConfettiBurst />
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[101] w-[88%] max-w-sm animate-[prPop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]">
              <div className={dark ? "bg-white rounded-2xl p-5 shadow-2xl text-center" : "bg-black rounded-2xl p-5 shadow-2xl text-center"}>
                <p className="text-3xl leading-none mb-1.5">🏆</p>
                <p className={dark ? "text-black font-bold text-sm tracking-wide" : "text-white font-bold text-sm tracking-wide"}>NEW PERSONAL RECORD</p>
                <p className={dark ? "text-black text-xl font-bold mt-1" : "text-white text-xl font-bold mt-1"}>{prToast.exerciseName}</p>
                <p className={dark ? "text-black/70 text-sm mt-0.5" : "text-white/70 text-sm mt-0.5"}>
                  {prToast.weight}kg × {prToast.reps} · Best previous: {prToast.prevWeight}kg × {prToast.prevReps}
                </p>
              </div>
            </div>
          </>
        )}
        <style>{`
          @keyframes prPop{0%{opacity:0;transform:translate(-50%,-10px) scale(0.85)}60%{opacity:1;transform:translate(-50%,2px) scale(1.03)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}
          @keyframes confettiFall{0%{transform:translate(0,-10px) rotate(0deg);opacity:1}100%{transform:translate(var(--drift),100vh) rotate(var(--rotate));opacity:0}}
        `}</style>
      </div>
    </FullScreenOverlay>
  );
}

function WorkoutSummary({
  daySession,
  activeLog,
  durationMin = 0,
  durationSec = 0,
  proteinTarget = 0,
  proteinSoFar = 0,
  habits = [],
  completedHabitIds = [],
  onToggleHabit,
  onDone,
}) {
  const dark = useClientDark();
  const allSets = Object.values(activeLog).flat();
  const totalVolume = allSets.reduce((a, s) => a + s.weight * s.reps, 0);
  const totalSets = allSets.length;
  const prCount = allSets.filter((s) => s.isPR).length;
  const calories = estimateCalories(totalVolume, durationMin);
  const proteinRemaining = Math.max(0, Math.round(proteinTarget - proteinSoFar));

  return (
    <FullScreenOverlay>
      <div className={dark ? "fixed inset-0 z-[90] bg-black flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10" : "fixed inset-0 z-[90] bg-white flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10"}>
        <Logo variant="mark" tone="black" className="h-8 w-auto opacity-70 mb-1.5" />
        <Tagline tone="white" className="mb-6" />
        <div className={dark ? "w-20 h-20 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-5" : "w-20 h-20 rounded-full bg-black/10 border border-black/15 flex items-center justify-center mb-5"}>
          <Check size={36} className={dark ? "text-white" : "text-black"} strokeWidth={3} />
        </div>
        <p className={dark ? "text-white/40 text-xs tracking-widest font-semibold" : "text-black/40 text-xs tracking-widest font-semibold"}>WORKOUT COMPLETE</p>
        <h2 className={dark ? "text-white text-3xl font-bold mt-1" : "text-black text-3xl font-bold mt-1"}>{daySession.label}</h2>
        <p className={dark ? "text-white text-4xl font-bold tabular-nums mt-6" : "text-black text-4xl font-bold tabular-nums mt-6"}>
          {durationMin}:{String(durationSec).padStart(2, "0")}
        </p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-6">
          <div className={dark ? "bg-[#1C1C1C] rounded-2xl p-4 border border-white/8" : "bg-[#F7F7F8] rounded-2xl p-4 border border-black/5"}>
            <p className={dark ? "text-white text-xl font-bold" : "text-black text-xl font-bold"}>{totalSets}</p>
            <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>Sets completed</p>
          </div>
          <div className={dark ? "bg-[#1C1C1C] rounded-2xl p-4 border border-white/8" : "bg-[#F7F7F8] rounded-2xl p-4 border border-black/5"}>
            <p className={dark ? "text-white text-xl font-bold" : "text-black text-xl font-bold"}>{totalVolume.toLocaleString()} kg</p>
            <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>Total volume</p>
          </div>
          <div className={dark ? "bg-[#1C1C1C] rounded-2xl p-4 border border-white/8" : "bg-[#F7F7F8] rounded-2xl p-4 border border-black/5"}>
            <p className={dark ? "text-white text-xl font-bold" : "text-black text-xl font-bold"}>{calories}</p>
            <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>Calories burned</p>
          </div>
          <div className={dark ? "bg-[#1C1C1C] rounded-2xl p-4 border border-white/8" : "bg-[#F7F7F8] rounded-2xl p-4 border border-black/5"}>
            <p className={dark ? "text-xl font-bold text-white" : "text-xl font-bold text-black"}>{prCount} new</p>
            <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>Personal records</p>
          </div>
        </div>

        <div className={dark ? "w-full max-w-sm mt-6 flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-3.5 py-3 text-left" : "w-full max-w-sm mt-6 flex items-start gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3 text-left"}>
          <Utensils size={18} className={dark ? "text-white/50 shrink-0 mt-0.5" : "text-black/50 shrink-0 mt-0.5"} />
          <div>
            <p className={dark ? "text-white/40 text-[10px] font-bold tracking-widest" : "text-black/40 text-[10px] font-bold tracking-widest"}>NEXT OBJECTIVE</p>
            <p className={dark ? "text-white text-sm font-semibold mt-0.5" : "text-black text-sm font-semibold mt-0.5"}>
              {proteinRemaining > 0 ? `Hit your protein target — ${proteinRemaining}g to go today.` : "Protein target hit — now prioritize recovery."}
            </p>
            <p className={dark ? "text-white/45 text-[13px] mt-0.5 leading-snug" : "text-black/45 text-[13px] mt-0.5 leading-snug"}>Refuel, hydrate, and get good sleep tonight to lock in today's session.</p>
          </div>
        </div>

        {habits.length > 0 && (
          <div className="w-full max-w-sm mt-4">
            <DailyHabitsCard habits={habits} completedIds={completedHabitIds} onToggle={onToggleHabit} />
          </div>
        )}

        <button onClick={onDone} className={dark ? "w-full max-w-sm mt-4 bg-white text-black font-bold py-4 rounded-2xl" : "w-full max-w-sm mt-4 bg-black text-white font-bold py-4 rounded-2xl"}>
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
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Log Activity">
      <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>ACTIVITY</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {CARDIO_ACTIVITIES.map((a) => {
          const Icon = a.icon;
          const active = activityId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setActivityId(a.id)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors ${
                active ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/5 text-white/60" : "bg-black/5 text-black/60"
              }`}
            >
              <Icon size={17} />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <NumberStepper dark={dark} label="DURATION (MIN)" value={duration} setValue={setDuration} step={5} min={0} />
        <NumberStepper dark={dark} label="DISTANCE (KM)" value={distance} setValue={setDistance} step={0.5} min={0} />
      </div>
      <div className="mb-5">
        <NumberStepper dark={dark} label="CALORIES BURNED (OPTIONAL)" value={caloriesBurned} setValue={setCaloriesBurned} step={25} min={0} />
      </div>

      <PrimaryButton dark={dark} className="w-full" disabled={duration <= 0} onClick={save}>
        <Check size={16} /> LOG ACTIVITY
      </PrimaryButton>
    </BottomSheet>
  );
}


function ClientPhaseHistorySheet({ open, onClose, phases, currentId, selectedId, onSelect }) {
  const dark = useClientDark();
  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Training Phases">
      {phases.length === 0 ? (
        <p className={dark ? "text-white/30 text-sm text-center py-6" : "text-black/30 text-sm text-center py-6"}>No phases yet.</p>
      ) : (
        <div className="space-y-1.5">
          {phases.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                p.id === selectedId ? (dark ? "bg-white/8" : "bg-black/8") : dark ? "hover:bg-white/[0.03]" : "hover:bg-black/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2">
                <p className={dark ? "text-white text-sm font-medium flex-1 truncate" : "text-black text-sm font-medium flex-1 truncate"}>{p.name}</p>
                {p.id === currentId && (
                  <span className={dark ? "text-[10px] font-bold text-black bg-white px-2 py-0.5 rounded-full shrink-0" : "text-[10px] font-bold text-white bg-black px-2 py-0.5 rounded-full shrink-0"}>CURRENT</span>
                )}
              </div>
              <p className={dark ? "text-white/35 text-xs mt-0.5" : "text-black/35 text-xs mt-0.5"}>
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
function ClientProgramTab({ onPreviewDay, showToast }) {
  const dark = useClientDark();
  const { db, currentUser, notifyCoach } = useApp();
  const phases = (db.clientPhases || {})[currentUser.id] || [];
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const todayStr = localDateKey();
  const current = getCurrentPhase(phases, todayStr);
  const [selectedId, setSelectedId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const logsForClient = db.workoutLogs[currentUser.id] || [];

  function requestWorkout(message) {
    notifyCoach(currentUser.id, currentUser.name, "workout_request", message);
    showToast?.("Sent to your coach");
  }

  if (phases.length === 0) {
    return (
      <div className="px-3">
        <Card dark={dark}>
          <p className={dark ? "text-white/40 text-sm text-center py-8" : "text-black/40 text-sm text-center py-8"}>No training program set up yet — your coach will assign one soon.</p>
        </Card>
      </div>
    );
  }

  const phase = phases.find((p) => p.id === selectedId) || current || sorted[sorted.length - 1];
  const days = phase?.weeks?.[0]?.days || [];

  return (
    <div className="px-3 space-y-4">
      <Card dark={dark}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className={dark ? "text-white text-lg font-bold min-w-0 truncate" : "text-black text-lg font-bold min-w-0 truncate"}>{phase.name}</h2>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold shrink-0"
          >
            <Calendar size={14} /> PHASES
          </button>
        </div>
        <p className={dark ? "text-white/40 text-xs mb-3" : "text-black/40 text-xs mb-3"}>
          {new Date(phase.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {phase.endDate
            ? ` – ${new Date(phase.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
            : ""}
          {phase.id === current?.id && <span className={dark ? "ml-2 text-white font-semibold" : "ml-2 text-black font-semibold"}>· Current</span>}
        </p>
        {phase.description && <p className={dark ? "text-white/60 text-sm leading-relaxed whitespace-pre-line" : "text-black/60 text-sm leading-relaxed whitespace-pre-line"}>{phase.description}</p>}
      </Card>

      <div>
        <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-y-1">
          <p className={dark ? "text-white/40 text-xs tracking-wide" : "text-black/40 text-xs tracking-wide"}>WORKOUTS IN THIS PHASE</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold">
              <Plus size={13} /> Add new workout
            </button>
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold">
              <Upload size={13} /> Import
            </button>
          </div>
        </div>
        {days.length === 0 ? (
          <Card dark={dark}>
            <p className={dark ? "text-white/30 text-sm text-center py-6" : "text-black/30 text-sm text-center py-6"}>No workouts added to this phase yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {days.map((d, i) => (
              <button key={d.id || i} onClick={() => onPreviewDay(d)} className="w-full text-left">
                <Card dark={dark} className="!py-3.5">
                  <div className="flex items-center gap-3">
                    {d.photoUrl ? (
                      <img src={d.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${dark ? "bg-white/8" : "bg-black/5"}`}>
                        <Dumbbell size={20} className={dark ? "text-white/25" : "text-black/20"} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={dark ? "text-white font-bold text-base truncate" : "text-black font-bold text-base truncate"}>{d.label}</p>
                      <p className={dark ? "text-white/40 text-xs mt-0.5 truncate" : "text-black/40 text-xs mt-0.5 truncate"}>
                        est. {estimateWorkoutMinutes(d.exercises)} min · {countExercises(d.exercises)} exercise{countExercises(d.exercises) === 1 ? "" : "s"}
                        {d.muscleGroups?.length ? ` · ${d.muscleGroups.join(", ")}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={16} className={dark ? "text-white/25 shrink-0" : "text-black/25 shrink-0"} />
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

      <RequestWorkoutSheet open={addOpen} onClose={() => setAddOpen(false)} onSend={requestWorkout} />
      <ImportPastWorkoutSheet open={importOpen} onClose={() => setImportOpen(false)} logs={logsForClient} onSend={requestWorkout} />
    </div>
  );
}

// Clients can't write to their own program (that stays coach-managed, same
// as every other phase edit), so "Add new workout" / "Import" send the
// coach a notification instead of touching clientPhases directly — no new
// write access needed, and it shows up right in the coach's existing
// notification bell.
function RequestWorkoutSheet({ open, onClose, onSend }) {
  const dark = useClientDark();
  const [name, setName] = useState("");

  function close() {
    setName("");
    onClose();
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSend(`Requested a new workout: "${name.trim()}"`);
    close();
  }

  return (
    <BottomSheet open={open} onClose={close} title="Add New Workout" dark={dark}>
      <form onSubmit={submit} className="space-y-4">
        <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
          Tell your coach what you'd like added to your program — they'll build it into your phase.
        </p>
        <TextInput dark={dark} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Extra arm day" autoFocus />
        <PrimaryButton dark={dark} type="submit" className="w-full" disabled={!name.trim()}>
          <Send size={15} /> SEND TO COACH
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function ImportPastWorkoutSheet({ open, onClose, logs, onSend }) {
  const dark = useClientDark();
  const past = [...(logs || [])]
    .filter((l) => !l.cardio)
    .sort((a, b) => b.date - a.date)
    .slice(0, 30);

  function pick(log) {
    onSend(`Asked to re-add a past workout to their program: "${log.dayLabel}" (${new Date(log.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })})`);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Import a Past Workout" dark={dark}>
      <p className={dark ? "text-white/40 text-xs mb-3" : "text-black/40 text-xs mb-3"}>
        Pick one of your completed workouts to ask your coach to add back into your program.
      </p>
      {past.length === 0 ? (
        <p className={dark ? "text-white/30 text-sm text-center py-8" : "text-black/30 text-sm text-center py-8"}>No completed workouts yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
          {past.map((log) => (
            <button
              key={log.id}
              onClick={() => pick(log)}
              className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left ${dark ? "bg-white/[0.06] hover:bg-white/[0.1]" : "bg-black/[0.03] hover:bg-black/[0.06]"}`}
            >
              <span className={dark ? "text-white text-sm truncate pr-2" : "text-black text-sm truncate pr-2"}>{log.dayLabel}</span>
              <span className={dark ? "text-white/40 text-xs shrink-0" : "text-black/40 text-xs shrink-0"}>
                {new Date(log.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function WorkoutsScreen({ todaySession, scheduledWorkouts, activeLog, completedOnDate, onStart, onViewWorkout, onPreviewWorkout, logsForClient, exercisesById, onLogCardio, dbReady, showToast }) {
  const dark = useClientDark();
  const [tab, setTab] = useState("today");
  const [cardioOpen, setCardioOpen] = useState(false);
  const todayStr = localDateKey();
  const upcoming = scheduledWorkouts.filter((w) => w.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="pb-28">
      <div className="px-3 pt-6 pb-4">
        <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Training</h1>
      </div>
      <div className="flex gap-2 px-3 mb-4 overflow-x-auto no-scrollbar">
        {["today", "program", "history", "upcoming"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap ${
              tab === t
                ? dark
                  ? "bg-white text-black"
                  : "bg-black text-white"
                : dark
                ? "bg-white/8 text-white/60"
                : "bg-black/8 text-black/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className={dark ? "space-y-4" : "px-3 space-y-4"}>
          <TodayWorkoutCard
            todaySession={todaySession}
            activeLog={activeLog}
            onStart={onStart}
            onView={onViewWorkout}
            isToday
            completedOnDate={completedOnDate}
            dbReady={dbReady}
            fullWidth
          />
          <div className="px-3 space-y-4">
          <button
            onClick={() => setCardioOpen(true)}
            className={dark ? "w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/8 text-white/70 text-sm font-semibold py-3.5 rounded-2xl active:scale-[0.98] transition-transform" : "w-full flex items-center justify-center gap-2 bg-black/5 hover:bg-black/8 text-black/70 text-sm font-semibold py-3.5 rounded-2xl active:scale-[0.98] transition-transform"}
          >
            <Footprints size={16} /> + Log a cardio session
          </button>
          {todaySession && (
            <Card dark={dark}>
              <h3 className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>Exercises</h3>
              <div className="space-y-2">
                {todaySession.exercises.map((e, i) => {
                  const ex = exercisesById[e.exerciseId];
                  if (!ex) return null;
                  return (
                    <div key={i} className={dark ? "flex items-center gap-3 py-2 border-b border-white/5 last:border-0" : "flex items-center gap-3 py-2 border-b border-black/5 last:border-0"}>
                      <span className={dark ? "w-7 h-7 rounded-full bg-white/8 text-white/50 text-xs font-bold flex items-center justify-center" : "w-7 h-7 rounded-full bg-black/8 text-black/50 text-xs font-bold flex items-center justify-center"}>
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={dark ? "text-white text-sm font-medium" : "text-black text-sm font-medium"}>{ex.name}</p>
                          {e.groupType && (
                            <span className={dark ? "bg-white/8 text-white/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded" : "bg-black/8 text-black/50 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"}>
                              {e.groupType === "superset" ? "SUPERSET" : "CIRCUIT"}
                            </span>
                          )}
                          {e.dropSet && (
                            <span className={dark ? "bg-orange-500/15 text-orange-400 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded" : "bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"}>
                              DROPSET
                            </span>
                          )}
                        </div>
                        <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                          {e.targetSets} sets × {formatTargetReps(e)} · RIR {e.targetRIR ?? 2}
                        </p>
                        {e.notes && <p className={dark ? "text-white/25 text-[11px] mt-0.5 italic" : "text-black/25 text-[11px] mt-0.5 italic"}>{e.notes}</p>}
                      </div>
                      <span className={dark ? "text-white/30 text-xs" : "text-black/30 text-xs"}>{ex.equipment}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          </div>
        </div>
      )}

      {tab === "program" && <ClientProgramTab onPreviewDay={onPreviewWorkout} showToast={showToast} />}

      {tab === "history" && (
        <div className="px-3 space-y-3">
          {logsForClient.length === 0 && (
            <Card dark={dark}>
              <p className={dark ? "text-white/40 text-sm text-center py-6" : "text-black/40 text-sm text-center py-6"}>No completed workouts yet — finish today's session to see it here.</p>
            </Card>
          )}
          {logsForClient.map((h) => {
            const volume = h.entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);
            const prCount = h.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
            return (
              <Card dark={dark} key={h.id}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>{h.dayLabel}</p>
                    <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>{new Date(h.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                  </div>
                  {h.cardio ? (
                    <Pill dark={dark} tone="outline">
                      {h.cardio.durationMin}min{h.cardio.distanceKm > 0 ? ` · ${h.cardio.distanceKm}km` : ""}
                      {h.cardio.caloriesBurned > 0 ? ` · ${h.cardio.caloriesBurned} kcal` : ""}
                    </Pill>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Pill dark={dark} tone="outline">{volume.toLocaleString()} kg</Pill>
                      {prCount > 0 && (
                        <span className="text-[11px] font-semibold" style={{ color: GOAL_GREEN }}>
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
            <Card dark={dark}>
              <p className={dark ? "text-white/40 text-sm text-center py-6" : "text-black/40 text-sm text-center py-6"}>
                {dbReady ? "Nothing scheduled yet — your coach will set up your upcoming workouts." : "Loading your schedule…"}
              </p>
            </Card>
          )}
          {upcoming.map((w) => (
            <Card dark={dark} key={w.id} className="!py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className={dark ? "text-white font-semibold text-sm" : "text-black font-semibold text-sm"}>{w.label}</p>
                  <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>
                    {new Date(w.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                  </p>
                </div>
                <span className={dark ? "text-white/30 text-xs" : "text-black/30 text-xs"}>{countExercises(w.exercises)} ex</span>
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
  const dark = useClientDark();
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
        className={dark ? "relative bg-black touch-pan-y select-none" : "relative bg-white touch-pan-y select-none"}
      >
        {children}
      </div>
    </div>
  );
}

// Lets a client swap an assigned meal for an alternative with similar
// calories/macros themselves, instead of having to message the coach —
// same best-fit matching the coach's Auto-Build uses, scoped to this one
// meal's own macros as the target so the replacement is a close match.
function SwapMealSheet({ open, onClose, meal, alternatives, onPick }) {
  const dark = useClientDark();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className={dark ? "bg-black rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[75vh] flex flex-col" : "bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[75vh] flex flex-col"} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-1 shrink-0">
          <p className={dark ? "text-white font-semibold truncate pr-3" : "text-black font-semibold truncate pr-3"}>Swap "{meal?.name}"</p>
          <button onClick={onClose} className={dark ? "text-white/50 shrink-0" : "text-black/50 shrink-0"}>
            <X size={20} />
          </button>
        </div>
        <p className={dark ? "text-white/40 text-xs px-5 pb-3" : "text-black/40 text-xs px-5 pb-3"}>Similar options from your Meal Library, closest match first</p>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1.5">
          {alternatives.length === 0 ? (
            <p className={dark ? "text-white/30 text-sm text-center py-8" : "text-black/30 text-sm text-center py-8"}>No similar alternatives available right now.</p>
          ) : (
            alternatives.map(({ meal: alt, score }) => (
              <button
                key={alt.id}
                onClick={() => onPick(alt.id)}
                className={dark ? "w-full flex items-center justify-between gap-2 bg-white/[0.03] rounded-xl px-3.5 py-2.5 text-left" : "w-full flex items-center justify-between gap-2 bg-black/[0.03] rounded-xl px-3.5 py-2.5 text-left"}
              >
                <div className="min-w-0">
                  <p className={dark ? "text-white text-sm font-medium truncate" : "text-black text-sm font-medium truncate"}>{alt.name}</p>
                  <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                    {alt.cals} kcal · P{alt.protein} C{alt.carbs} F{alt.fat}
                  </p>
                </div>
                <span className={dark ? "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-white/5 text-white/50" : "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-black/5 text-black/50"}>{matchPct(score)}% match</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Tapping a meal in "My Meal Plan" opens this instead of logging it
// immediately — shows the full ingredient breakdown and how-to-prepare
// notes, with logging as an explicit action from here (or via the quick
// "+" on the row itself).
function PlanMealDetailSheet({ open, onClose, meal, slot, onLog }) {
  const dark = useClientDark();
  if (!open || !meal) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className={dark ? "bg-black rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col" : "bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col"} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-1 shrink-0">
          <p className={dark ? "text-white font-semibold truncate pr-3" : "text-black font-semibold truncate pr-3"}>{meal.name}</p>
          <button onClick={onClose} className={dark ? "text-white/50 shrink-0" : "text-black/50 shrink-0"}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {meal.photoUrl && <img src={meal.photoUrl} alt="" className="w-full h-40 object-cover rounded-2xl mt-3" />}

          <div className={dark ? "grid grid-cols-4 gap-2 bg-white/[0.03] border border-white/8 rounded-2xl p-3.5 mt-4" : "grid grid-cols-4 gap-2 bg-black/[0.03] border border-black/8 rounded-2xl p-3.5 mt-4"}>
            {[
              ["Cals", meal.cals],
              ["Protein", `${meal.protein}g`],
              ["Carbs", `${meal.carbs}g`],
              ["Fat", `${meal.fat}g`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className={dark ? "text-white font-bold text-sm" : "text-black font-bold text-sm"}>{v}</p>
                <p className={dark ? "text-white/40 text-[10px] mt-0.5" : "text-black/40 text-[10px] mt-0.5"}>{l}</p>
              </div>
            ))}
          </div>

          {meal.ingredients?.length > 0 && (
            <div className="mt-4">
              <p className={dark ? "text-white/35 text-[11px] font-semibold tracking-wide mb-1.5" : "text-black/35 text-[11px] font-semibold tracking-wide mb-1.5"}>INGREDIENTS</p>
              <div className="space-y-1">
                {meal.ingredients.map((ing, i) => {
                  // Ingredient names carry their exact amount as a trailing
                  // "(150g)"/"(1 cup)" suffix (baked in when the ingredient was
                  // picked via the food-quantity picker) — split it out into its
                  // own non-truncating badge so a long food name can never push
                  // the amount off-screen.
                  const m = /^(.*)\s\(([^()]+)\)$/.exec(ing.name || "");
                  const baseName = m ? m[1] : ing.name;
                  const qtyLabel = m ? m[2] : null;
                  return (
                    <div key={i} className={dark ? "flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2" : "flex items-center justify-between bg-black/[0.03] rounded-xl px-3 py-2"}>
                      <p className={dark ? "text-white text-sm truncate pr-2" : "text-black text-sm truncate pr-2"}>{baseName}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {qtyLabel && (
                          <span className={dark ? "text-white/50 text-xs font-semibold bg-white/8 rounded-full px-2 py-0.5" : "text-black/50 text-xs font-semibold bg-black/8 rounded-full px-2 py-0.5"}>
                            {qtyLabel}
                          </span>
                        )}
                        <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>{ing.cals} kcal</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className={dark ? "text-white/35 text-[11px] font-semibold tracking-wide mb-1.5" : "text-black/35 text-[11px] font-semibold tracking-wide mb-1.5"}>HOW TO PREPARE</p>
            {meal.instructions ? (
              <p className={dark ? "text-white/70 text-sm whitespace-pre-line leading-relaxed" : "text-black/70 text-sm whitespace-pre-line leading-relaxed"}>{meal.instructions}</p>
            ) : (
              <p className={dark ? "text-white/30 text-sm" : "text-black/30 text-sm"}>No preparation notes added for this meal.</p>
            )}
          </div>

          <PrimaryButton dark={dark} className="w-full mt-5" onClick={() => onLog(meal, slot)}>
            <Plus size={16} /> LOG THIS MEAL
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function NutritionScreen({ nutrition, targets, onAddFood, onRemoveFood, onAddWater, savedMeals, onCreateSavedMeal, onDeleteSavedMeal, recentFoods, showToast }) {
  const dark = useClientDark();
  const { db, currentUser, swapMealPlanMeal } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState("Breakfast");
  const [detailMeal, setDetailMeal] = useState(null);
  const [waterSheetOpen, setWaterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [createMealOpen, setCreateMealOpen] = useState(false);
  const [mealPrefill, setMealPrefill] = useState(null);
  const [pendingFood, setPendingFood] = useState(null);

  const mealCategories = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-workout", "Post-workout"];
  // Coach-added and barcode-discovered foods (db.customFoods) are searched
  // alongside the static built-in database — they're what "save to food
  // library" from a barcode scan/manual entry is actually for.
  const customFoodIds = new Set((db.customFoods || []).map((f) => f.id));
  // A built-in food the coach has imported into customFoods (editable,
  // maybe with a photo now) replaces the static entry rather than
  // duplicating it — same id, so the imported version simply wins.
  const allFoods = [...(db.customFoods || []), ...FOOD_DATABASE.filter((f) => !customFoodIds.has(f.id))];
  const filteredFoods = allFoods.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

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

  const mealPlan = (db.mealPlans[currentUser.id] || [])[0] || null;
  const mealsById = Object.fromEntries((db.masterMeals || []).map((m) => [m.id, m]));
  // Plans built before the week-structure existed have no weekIndex on
  // their days — fall back to grouping them into blocks of 7 by position
  // so "Week X of Y" still works for older plans.
  const planWeeksCount = mealPlan
    ? Math.max(...mealPlan.days.map((d, i) => (d.weekIndex ?? Math.floor(i / 7)))) + 1
    : 1;
  const planCurrentWeek = (() => {
    if (!mealPlan?.startDate) return 0;
    const diffDays = Math.floor((Date.now() - new Date(mealPlan.startDate + "T00:00:00").getTime()) / 86400000);
    return Math.max(0, Math.min(planWeeksCount - 1, Math.floor(diffDays / 7)));
  })();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const activeWeek = selectedWeek != null ? selectedWeek : planCurrentWeek;
  const daysInActiveWeek = mealPlan
    ? mealPlan.days.filter((d, i) => (d.weekIndex ?? Math.floor(i / 7)) === activeWeek)
    : [];
  const [mealPlanDayId, setMealPlanDayId] = useState(null);
  const mealPlanDay = mealPlan ? daysInActiveWeek.find((d) => d.id === mealPlanDayId) || daysInActiveWeek[0] : null;
  const [swapping, setSwapping] = useState(null); // { slot, index, meal } | null
  const [planMealDetail, setPlanMealDetail] = useState(null); // { meal, slot } | null
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const swapAlternatives = useMemo(() => {
    if (!swapping || !mealPlanDay) return [];
    const usedIds = new Set(Object.values(mealPlanDay.meals || {}).flat());
    const pool = (db.masterMeals || []).filter(
      (m) => m.id !== swapping.meal.id && !usedIds.has(m.id) && eligibleForSlot(m, swapping.slot)
    );
    return bestMatches(
      pool,
      { calories: swapping.meal.cals, protein: swapping.meal.protein, carbs: swapping.meal.carbs, fat: swapping.meal.fat },
      8
    );
  }, [swapping, mealPlanDay, db.masterMeals]);

  function confirmSwap(newMealId) {
    if (!swapping || !mealPlanDay) return;
    swapMealPlanMeal(currentUser.id, mealPlanDay.id, swapping.slot, swapping.index, newMealId);
    showToast("Meal swapped");
    setSwapping(null);
  }

  return (
    <div className="pb-28">
      <div className="px-3 pt-6 pb-2 flex items-center justify-between">
        <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Nutrition</h1>
        <Search size={20} className={dark ? "text-white/40" : "text-black/40"} />
      </div>

      <div className="px-3 mt-3">
        <Card dark={dark}>
          <p className={dark ? "text-white/40 text-xs tracking-wide mb-1" : "text-black/40 text-xs tracking-wide mb-1"}>CALORIE TARGET</p>
          <div className="flex items-baseline gap-2">
            <span className={dark ? "text-white text-3xl font-bold" : "text-black text-3xl font-bold"}>{Math.max(0, targets.calories - nutrition.calories)}</span>
            <span className={dark ? "text-white/40 text-sm" : "text-black/40 text-sm"}>remaining of {targets.calories}</span>
          </div>
          <div className="mt-3">
            <ProgressBar trackClassName={dark ? "bg-white/8" : "bg-black/8"}
              value={nutrition.calories}
              max={targets.calories}
              color={nutrition.calories >= targets.calories ? GOAL_GREEN : MEASURE_BLUE}
            />
          </div>
          <div className={dark ? "space-y-3 mt-4 pt-4 border-t border-white/5" : "space-y-3 mt-4 pt-4 border-t border-black/5"}>
            {[
              { l: "Protein", v: round1(nutrition.protein), t: targets.protein },
              { l: "Carbs", v: round1(nutrition.carbs), t: targets.carbs },
              { l: "Fat", v: round1(nutrition.fat), t: targets.fat },
            ].map((m) => (
              <div key={m.l}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className={dark ? "text-white/70 text-sm font-medium" : "text-black/70 text-sm font-medium"}>{m.l}</span>
                  <span className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                    {m.v}g <span className={dark ? "text-white/25" : "text-black/25"}>/ {m.t}g</span>
                  </span>
                </div>
                <ProgressBar trackClassName={dark ? "bg-white/8" : "bg-black/8"} value={m.v} max={m.t} height={6} color={m.v >= m.t ? GOAL_GREEN : MEASURE_BLUE} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4">
        <Card dark={dark}>
          <div className="flex items-center gap-4">
            <WaterCup value={nutrition.water} max={targets.water} size={52} />
            <div className="flex-1 min-w-0">
              <p className={dark ? "text-white font-semibold flex items-center gap-2" : "text-black font-semibold flex items-center gap-2"}>
                {nutrition.water >= targets.water ? (
                  <Droplets size={16} className={dark ? "text-white" : "text-black"} />
                ) : (
                  <GlassWater size={16} className={dark ? "text-white/60" : "text-black/60"} />
                )}{" "}
                Water
              </p>
              <p className={dark ? "text-white/50 text-sm mt-0.5" : "text-black/50 text-sm mt-0.5"}>
                <span className={dark ? "text-white font-semibold" : "text-black font-semibold"}>{nutrition.water}L</span> / {targets.water}L
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onAddWater(0.25)}
              className={dark ? "flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150" : "flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150"}
            >
              +250ml
            </button>
            <button
              onClick={() => onAddWater(0.5)}
              className={dark ? "flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150" : "flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-90 transition-transform duration-150"}
            >
              +500ml
            </button>
            <button
              onClick={() => setWaterSheetOpen(true)}
              className={dark ? "flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl active:scale-[0.97] transition-transform" : "flex-1 bg-black/8 text-black text-sm font-semibold py-2.5 rounded-xl active:scale-[0.97] transition-transform"}
            >
              Custom
            </button>
          </div>
        </Card>
      </div>

      {mealPlan && mealPlanDay && (
        <div className="px-3 mt-7">
          <Card dark={dark}>
            <div className="flex items-center justify-between mb-1">
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>My Meal Plan</p>
              <span className={dark ? "text-white/40 text-[11px] font-semibold bg-white/5 px-2 py-0.5 rounded-full shrink-0" : "text-black/40 text-[11px] font-semibold bg-black/5 px-2 py-0.5 rounded-full shrink-0"}>
                {planWeeksCount === 1 ? "1-week plan" : `Week ${activeWeek + 1} of ${planWeeksCount}`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>Built by your coach — tap any meal to log it now</p>
              <button
                onClick={() => setShoppingListOpen(true)}
                className={dark ? "shrink-0 flex items-center gap-1.5 bg-white/8 hover:bg-white/15 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors" : "shrink-0 flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-bold px-3 py-1.5 rounded-full transition-colors"}
              >
                <ShoppingCart size={12} /> LIST
              </button>
            </div>
            {planWeeksCount > 1 && (
              <div className="flex items-center gap-2 mb-2 overflow-x-auto">
                {Array.from({ length: planWeeksCount }, (_, w) => w).map((w) => (
                  <button
                    key={w}
                    onClick={() => {
                      setSelectedWeek(w);
                      setMealPlanDayId(null);
                    }}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      w === activeWeek ? "bg-blue-500 text-white" : dark ? "bg-white/5 text-white/50" : "bg-black/5 text-black/50"
                    }`}
                  >
                    Week {w + 1}
                  </button>
                ))}
              </div>
            )}
            {daysInActiveWeek.length > 1 && (
              <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                {daysInActiveWeek.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setMealPlanDayId(d.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      d.id === mealPlanDay.id ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/5 text-white/50" : "bg-black/5 text-black/50"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {["Breakfast", "Lunch", "Dinner", "Snacks"].map((slot) => {
                const mealIds = mealPlanDay.meals?.[slot] || [];
                return mealIds.length === 0 ? null : (
                  <div key={slot}>
                    <p className={dark ? "text-white/35 text-[11px] font-semibold tracking-wide mb-1.5" : "text-black/35 text-[11px] font-semibold tracking-wide mb-1.5"}>{slot.toUpperCase()}</p>
                    <div className="space-y-1.5">
                      {mealIds.map((mealId, i) => {
                        const m = mealsById[mealId];
                        if (!m) return null;
                        return (
                          <div key={`${mealId}_${i}`} className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPlanMealDetail({ meal: m, slot })}
                              className={dark ? "flex-1 min-w-0 flex items-center gap-2.5 bg-white/[0.03] rounded-xl px-3 py-2.5 text-left" : "flex-1 min-w-0 flex items-center gap-2.5 bg-black/[0.03] rounded-xl px-3 py-2.5 text-left"}
                            >
                              {m.photoUrl && <img src={m.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <p className={dark ? "text-white text-sm font-medium truncate" : "text-black text-sm font-medium truncate"}>{m.name}</p>
                                <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                                  {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                                </p>
                              </div>
                            </button>
                            <button
                              onClick={() => logSavedMeal(m, slot)}
                              title="Log this meal now"
                              className={dark ? "shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.03] text-white/40 hover:text-white" : "shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-black/[0.03] text-black/40 hover:text-black"}
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => setSwapping({ slot, index: i, meal: m })}
                              title="Swap for a similar meal"
                              className={dark ? "shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.03] text-white/40 hover:text-white" : "shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-black/[0.03] text-black/40 hover:text-black"}
                            >
                              <Repeat size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div className="px-3 mt-7">
        <SavedMealsSection
          dark={dark}
          meals={savedMeals}
          onCreateNew={() => {
            setMealPrefill(null);
            setCreateMealOpen(true);
          }}
          onLog={logSavedMeal}
          onDelete={onDeleteSavedMeal}
        />
      </div>

      <div className="px-3 mt-7">
        <p className={dark ? "text-white/35 text-[11px] font-semibold tracking-wide mb-2 ml-1" : "text-black/35 text-[11px] font-semibold tracking-wide mb-2 ml-1"}>TODAY'S MEALS</p>
        <Card dark={dark} className="!p-0 overflow-hidden">
          {mealCategories.map((meal, i) => {
            const items = nutrition.meals[meal] || [];
            const totalCals = items.reduce((a, f) => a + f.cals, 0);
            return (
              <button
                key={meal}
                onClick={() => setDetailMeal(meal)}
                className={`w-full text-left px-5 py-4 flex items-center justify-between transition-colors ${dark ? "active:bg-white/[0.03]" : "active:bg-black/[0.03]"} ${
                  i > 0 ? (dark ? "border-t border-white/5" : "border-t border-black/5") : ""
                }`}
              >
                <div className="min-w-0">
                  <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>{meal}</p>
                  <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>
                    {items.length === 0 ? "No items logged" : `${items.length} item${items.length === 1 ? "" : "s"} logged`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={dark ? "text-white/50 text-sm font-medium" : "text-black/50 text-sm font-medium"}>{totalCals} kcal</span>
                  <ChevronRight size={16} className={dark ? "text-white/25" : "text-black/25"} />
                </div>
              </button>
            );
          })}
        </Card>
      </div>

      <BottomSheet dark={dark} open={!!detailMeal} onClose={() => setDetailMeal(null)} title={detailMeal || ""}>
        {detailMeal &&
          (() => {
            const items = nutrition.meals[detailMeal] || [];
            const totals = items.reduce(
              (a, f) => ({ cals: a.cals + f.cals, protein: a.protein + f.protein, carbs: a.carbs + f.carbs, fat: a.fat + f.fat }),
              { cals: 0, protein: 0, carbs: 0, fat: 0 }
            );
            return (
              <div>
                <div className={dark ? "bg-white/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-4" : "bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-4"}>
                  {[
                    ["Cals", Math.round(totals.cals)],
                    ["Protein", `${round1(totals.protein)}g`],
                    ["Carbs", `${round1(totals.carbs)}g`],
                    ["Fat", `${round1(totals.fat)}g`],
                  ].map(([l, v]) => (
                    <div key={l} className="text-center">
                      <p className={dark ? "text-white font-bold text-sm" : "text-black font-bold text-sm"}>{v}</p>
                      <p className={dark ? "text-white/40 text-[10px] mt-0.5" : "text-black/40 text-[10px] mt-0.5"}>{l}</p>
                    </div>
                  ))}
                </div>

                {items.length === 0 ? (
                  <p className={dark ? "text-white/30 text-sm text-center py-4" : "text-black/30 text-sm text-center py-4"}>No items logged yet</p>
                ) : (
                  <div className="space-y-2 mb-2">
                    {items.map((f) => (
                      <SwipeableRow key={f.id} onDelete={() => onRemoveFood(detailMeal, f.id)}>
                        <div className={dark ? "flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2.5" : "flex items-center gap-3 bg-black/[0.02] border border-black/5 rounded-xl px-3 py-2.5"}>
                          {f.photoUrl ? (
                            <img src={f.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className={dark ? "w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center shrink-0" : "w-10 h-10 rounded-lg bg-black/8 flex items-center justify-center shrink-0"}>
                              <UtensilsCrossed size={16} className={dark ? "text-white/30" : "text-black/30"} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={dark ? "text-white text-sm font-semibold truncate" : "text-black text-sm font-semibold truncate"}>{f.name}</p>
                            <p className={dark ? "text-white/40 text-[11px] mt-0.5" : "text-black/40 text-[11px] mt-0.5"}>
                              {round1(f.protein)}g P · {round1(f.carbs)}g C · {round1(f.fat)}g F
                            </p>
                          </div>
                          <span className={dark ? "text-white font-semibold text-sm shrink-0" : "text-black font-semibold text-sm shrink-0"}>{f.cals}</span>
                        </div>
                      </SwipeableRow>
                    ))}
                    <p className={dark ? "text-white/25 text-[10px] text-center pt-0.5" : "text-black/25 text-[10px] text-center pt-0.5"}>Swipe an item left to remove it</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setActiveMeal(detailMeal);
                    setDetailMeal(null);
                    setSheetOpen(true);
                  }}
                  className={dark ? "w-full mt-3 bg-white/5 text-white/70 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5" : "w-full mt-3 bg-black/5 text-black/70 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5"}
                >
                  <Plus size={14} /> Add food
                </button>
              </div>
            );
          })()}
      </BottomSheet>

      <BottomSheet dark={dark} open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Add to ${activeMeal}`}>
        <div className={dark ? "flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5 mb-3" : "flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-3"}>
          <Search size={16} className={dark ? "text-white/40" : "text-black/40"} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className={dark ? "bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30" : "bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"}
          />
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setSheetOpen(false);
              setBarcodeOpen(true);
            }}
            className={dark ? "flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/50 text-xs" : "flex-1 flex flex-col items-center gap-1 bg-black/5 rounded-xl py-3 text-black/50 text-xs"}
          >
            <ScanLine size={18} />
            Scan barcode
          </button>
          <button
            onClick={() => {
              setSheetOpen(false);
              setPhotoOpen(true);
            }}
            className={dark ? "flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/50 text-xs" : "flex-1 flex flex-col items-center gap-1 bg-black/5 rounded-xl py-3 text-black/50 text-xs"}
          >
            <Camera size={18} />
            Photo
          </button>
          <button
            onClick={() => {
              setSheetOpen(false);
              setQuickAddOpen(true);
            }}
            className={dark ? "flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/50 text-xs" : "flex-1 flex flex-col items-center gap-1 bg-black/5 rounded-xl py-3 text-black/50 text-xs"}
          >
            <Zap size={18} />
            Quick add
          </button>
        </div>
        {!search.trim() && recentFoods.length > 0 && (
          <div className="mb-4">
            <p className={dark ? "text-white/30 text-xs mb-2 tracking-wide" : "text-black/30 text-xs mb-2 tracking-wide"}>RECENTLY LOGGED</p>
            <div className="space-y-1">
              {recentFoods.map((f) => (
                <button
                  key={f.id}
                  onClick={() => addAndClose({ ...f, id: `recent_${Date.now()}` })}
                  className={dark ? "w-full flex items-center gap-3 py-3 border-b border-white/5 last:border-0" : "w-full flex items-center gap-3 py-3 border-b border-black/5 last:border-0"}
                >
                  {f.photoUrl && <img src={f.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />}
                  <div className="text-left flex-1 min-w-0">
                    <p className={dark ? "text-white text-sm font-medium truncate" : "text-black text-sm font-medium truncate"}>{f.name}</p>
                    <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                      P{round1(f.protein)} · C{round1(f.carbs)} · F{round1(f.fat)}
                    </p>
                  </div>
                  <span className={dark ? "text-white/50 text-sm shrink-0" : "text-black/50 text-sm shrink-0"}>{f.cals} kcal</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className={dark ? "text-white/30 text-xs mb-2 tracking-wide" : "text-black/30 text-xs mb-2 tracking-wide"}>SEARCH RESULTS · PER 100G</p>
        <div className="space-y-1">
          {filteredFoods.map((f) => (
            <button
              key={f.id}
              onClick={() => setPendingFood(f)}
              className={dark ? "w-full flex items-center gap-3 py-3 border-b border-white/5 last:border-0" : "w-full flex items-center gap-3 py-3 border-b border-black/5 last:border-0"}
            >
              {f.imageUrl && <img src={f.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />}
              <div className="text-left flex-1 min-w-0">
                <p className={dark ? "text-white text-sm font-medium truncate" : "text-black text-sm font-medium truncate"}>{f.name}</p>
                <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                  P{f.protein} · C{f.carbs} · F{f.fat}
                </p>
              </div>
              <span className={dark ? "text-white/50 text-sm shrink-0" : "text-black/50 text-sm shrink-0"}>{f.cals} kcal</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <FoodQuantitySheet
        dark={dark}
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          onAddFood(activeMeal, scaled);
          setPendingFood(null);
          setSheetOpen(false);
        }}
      />

      <BottomSheet dark={dark} open={waterSheetOpen} onClose={() => setWaterSheetOpen(false)} title="Log Water">
        <div className="grid grid-cols-3 gap-2">
          {[0.1, 0.2, 0.33, 0.5, 0.75, 1.0].map((v) => (
            <button
              key={v}
              onClick={() => {
                onAddWater(v);
                setWaterSheetOpen(false);
              }}
              className={dark ? "bg-white/8 rounded-xl py-4 text-white font-semibold" : "bg-black/8 rounded-xl py-4 text-black font-semibold"}
            >
              {v * 1000}ml
            </button>
          ))}
        </div>
      </BottomSheet>

      <BarcodeScanSheet
        dark={dark}
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onAdd={(food) => {
          setBarcodeOpen(false);
          setPendingFood(food);
        }}
      />
      <QuickAddFoodSheet
        dark={dark}
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdd={(food) => {
          setQuickAddOpen(false);
          addAndClose(food);
        }}
      />
      <PhotoEstimateSheet
        dark={dark}
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
        dark={dark}
        open={createMealOpen}
        onClose={() => setCreateMealOpen(false)}
        prefill={mealPrefill}
        onSave={(meal) => {
          onCreateSavedMeal(meal);
          showToast(`Saved "${meal.name}" to My Meals`);
          setCreateMealOpen(false);
        }}
      />

      <SwapMealSheet
        open={!!swapping}
        onClose={() => setSwapping(null)}
        meal={swapping?.meal}
        alternatives={swapAlternatives}
        onPick={confirmSwap}
      />

      <PlanMealDetailSheet
        open={!!planMealDetail}
        onClose={() => setPlanMealDetail(null)}
        meal={planMealDetail?.meal}
        slot={planMealDetail?.slot}
        onLog={(m, slot) => {
          logSavedMeal(m, slot);
          setPlanMealDetail(null);
        }}
      />

      <ShoppingListSheet
        dark={dark}
        open={shoppingListOpen}
        onClose={() => setShoppingListOpen(false)}
        plan={mealPlan}
        mealsById={mealsById}
        clientName={currentUser.name}
      />
    </div>
  );
}

/* ============================================================================
   PROGRESS TAB
============================================================================ */

function ChartCard({ title, subtitle, children }) {
  const dark = useClientDark();
  return (
    <Card dark={dark}>
      <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>{title}</p>
      {subtitle && <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>{subtitle}</p>}
      <div className="h-40 mt-3 -ml-4">{children}</div>
    </Card>
  );
}

const axisStyleFor = (dark) => ({ fontSize: 11, fill: dark ? "rgba(255,255,255,0.35)" : "rgba(10,10,11,0.35)" });

function MetricDetailSheet({ metric, onClose }) {
  const dark = useClientDark();
  const [range, setRange] = useState("7D");
  if (!metric) return null;
  const n = range === "7D" ? 7 : 30;
  const data = (metric.series || []).slice(-n);
  const valueLabel = typeof metric.latest === "number" ? `${metric.latest.toFixed(metric.decimals)}${metric.unit}` : `${metric.latest}`;

  return (
    <FullScreenOverlay>
      <div className={dark ? "fixed inset-0 z-[95] bg-black flex flex-col" : "fixed inset-0 z-[95] bg-white flex flex-col"}>
        <div className={dark ? "flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-black/5"}>
          <button onClick={onClose} className={dark ? "text-white/60" : "text-black/60"}>
            <X size={20} />
          </button>
          <span className={dark ? "text-white font-semibold" : "text-black font-semibold"}>{metric.label}</span>
          <div className="w-5" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className={dark ? "text-white text-3xl font-bold tabular-nums" : "text-black text-3xl font-bold tabular-nums"}>{valueLabel}</p>
          <p className={dark ? "text-white/40 text-xs mt-1" : "text-black/40 text-xs mt-1"}>Latest · {metric.date}</p>

          <div className="flex gap-2 mt-5">
            {["7D", "30D"].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                  range === r ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/8 text-white/50" : "bg-black/8 text-black/50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {!metric.series ? (
              <p className={dark ? "text-white/30 text-sm text-center py-16" : "text-black/30 text-sm text-center py-16"}>No detailed history available for this metric.</p>
            ) : data.length < 2 ? (
              <p className={dark ? "text-white/30 text-sm text-center py-16" : "text-black/30 text-sm text-center py-16"}>Not enough history yet for this range.</p>
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
                      <XAxis dataKey="date" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#1C1C1C" : "#FFFFFF",
                          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: dark ? "#FFFFFF" : "#0A0A0B",
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#mdGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className={dark ? "text-white/30 text-[11px] text-center mt-4" : "text-black/30 text-[11px] text-center mt-4"}>Showing the last {data.length} recorded entries.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

function LogWeightSheet({ open, onClose, onSave, lastWeight }) {
  const dark = useClientDark();
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (open) setWeight(lastWeight ? String(lastWeight) : "");
  }, [open, lastWeight]);

  const parsed = Number(weight);
  const valid = weight !== "" && !isNaN(parsed) && parsed > 0;

  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Log Weight">
      <Field dark={dark} label="WEIGHT (KG)">
        <TextInput dark={dark}
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 82.4"
          autoFocus
        />
      </Field>
      <PrimaryButton dark={dark}
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
  const dark = useClientDark();
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
      <div className={dark ? "fixed inset-0 z-[95] bg-black flex flex-col" : "fixed inset-0 z-[95] bg-white flex flex-col"}>
        <div className={dark ? "flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-white/5" : "flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b border-black/5"}>
          <button onClick={onClose} className={dark ? "text-white/60" : "text-black/60"}>
            <X size={20} />
          </button>
          <span className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Body Weight</span>
          <button onClick={() => setLogOpen(true)} className={dark ? "text-white font-bold text-sm" : "text-black font-bold text-sm"}>
            + Log
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {weighIns.length === 0 ? (
            <div className="py-16 text-center">
              <Scale size={28} className={dark ? "mx-auto text-white/15 mb-3" : "mx-auto text-black/15 mb-3"} />
              <p className={dark ? "text-white/40 text-sm mb-4" : "text-black/40 text-sm mb-4"}>No weigh-ins logged yet.</p>
              <PrimaryButton dark={dark} onClick={() => setLogOpen(true)} className="mx-auto">
                <Plus size={16} /> LOG YOUR FIRST WEIGHT
              </PrimaryButton>
            </div>
          ) : (
            <>
              <p className={dark ? "text-white text-3xl font-bold tabular-nums" : "text-black text-3xl font-bold tabular-nums"}>{latest.weight} kg</p>
              <p className={dark ? "text-white/40 text-xs mt-1" : "text-black/40 text-xs mt-1"}>
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
                      <XAxis dataKey="date" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#1C1C1C" : "#FFFFFF",
                          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: dark ? "#FFFFFF" : "#0A0A0B",
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#whGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className={dark ? "text-white/30 text-xs tracking-wide mt-6 mb-2" : "text-black/30 text-xs tracking-wide mt-6 mb-2"}>ALL ENTRIES · {weighIns.length}</p>
              <div className="space-y-1">
                {[...weighIns].reverse().map((w) => (
                  <div key={w.id} className={dark ? "flex items-center justify-between py-2.5 border-b border-white/5 last:border-0" : "flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"}>
                    <span className={dark ? "text-white/50 text-sm" : "text-black/50 text-sm"}>
                      {new Date(w.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={dark ? "text-white font-semibold text-sm" : "text-black font-semibold text-sm"}>{w.weight} kg</span>
                      {confirmDeleteId === w.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setConfirmDeleteId(null)} className={dark ? "text-white/40 text-xs font-semibold px-2 py-1" : "text-black/40 text-xs font-semibold px-2 py-1"}>
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
                        <button onClick={() => setConfirmDeleteId(w.id)} className={dark ? "text-white/25 hover:text-red-500 p-1" : "text-black/25 hover:text-red-500 p-1"} aria-label="Delete this entry">
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
  const dark = useClientDark();
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(null);

  return (
    <Card dark={dark}>
      <div className="flex items-center justify-between mb-3">
        <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Progress Photos</p>
        <ImageIcon size={16} className={dark ? "text-white/30" : "text-black/30"} />
      </div>
      <div className={dark ? "flex items-start gap-2 mb-3 bg-white/[0.03] rounded-xl p-3" : "flex items-start gap-2 mb-3 bg-black/[0.03] rounded-xl p-3"}>
        <Info size={14} className={dark ? "text-white/30 shrink-0 mt-0.5" : "text-black/30 shrink-0 mt-0.5"} />
        <p className={dark ? "text-white/40 text-[11px] leading-relaxed" : "text-black/40 text-[11px] leading-relaxed"}>
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
          className={dark ? "aspect-square rounded-xl border border-dashed border-white/15 bg-white/[0.03] flex flex-col items-center justify-center gap-1 text-white/40 disabled:opacity-40" : "aspect-square rounded-xl border border-dashed border-black/15 bg-black/[0.03] flex flex-col items-center justify-center gap-1 text-black/40 disabled:opacity-40"}
        >
          <Plus size={18} />
          <span className="text-[10px] font-medium">{busy ? "Uploading…" : "Add photo"}</span>
        </button>
        {photos.map((p) => (
          <button key={p.id} onClick={() => setViewing(p)} className={dark ? "relative aspect-square rounded-xl overflow-hidden bg-white/5" : "relative aspect-square rounded-xl overflow-hidden bg-black/5"}>
            <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[10px] font-medium px-1.5 py-1 text-center">
              {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </button>
        ))}
      </div>
      {photos.length === 0 && <p className={dark ? "text-white/25 text-xs mt-3" : "text-black/25 text-xs mt-3"}>No photos yet — add one to start a visual timeline.</p>}

      <BottomSheet dark={dark} open={!!viewing} onClose={() => setViewing(null)} title={viewing ? new Date(viewing.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}>
        {viewing && (
          <div>
            <img src={viewing.url} alt="Progress" className="w-full rounded-2xl mb-3" />
            {(() => {
              const w = closestWeighIn(weighIns, viewing.date);
              return w ? (
                <p className={dark ? "text-white/50 text-sm text-center mb-4" : "text-black/50 text-sm text-center mb-4"}>
                  {w.weight} kg around this time
                </p>
              ) : (
                <p className={dark ? "text-white/30 text-xs text-center mb-4" : "text-black/30 text-xs text-center mb-4"}>No weigh-in logged near this date.</p>
              );
            })()}
            <DangerButton dark={dark}
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
function PerformanceTimelineCard({ timeline, monthlyVolume }) {
  const dark = useClientDark();
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
      label: "Volume Lifted",
      sub: "this month",
      value: `${monthlyVolume.toLocaleString()} kg`,
    },
    { label: "PRs set", sub: "new heaviest lifts", value: `${timeline.prCount}` },
  ];
  return (
    <div className={`rounded-2xl p-5 border ${dark ? "border-white/8" : "border-black/8"}`} style={{ backgroundColor: dark ? "#141414" : "#F7F7F8" }}>
      <p className={dark ? "text-white/40 text-[11px] font-semibold tracking-wide uppercase" : "text-black/40 text-[11px] font-semibold tracking-wide uppercase"}>Last {timeline.days} Days</p>
      <p className={dark ? "text-white font-bold text-lg mt-0.5" : "text-black font-bold text-lg mt-0.5"}>Performance Timeline</p>
      <p className={dark ? "text-white/35 text-xs mt-1 mb-4" : "text-black/35 text-xs mt-1 mb-4"}>A quick read on how you've been trending: getting stronger, showing up, hitting new bests.</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {items.map((it) => (
          <div key={it.label}>
            <p className={dark ? "text-white text-xl font-bold tabular-nums" : "text-black text-xl font-bold tabular-nums"}>{it.value}</p>
            <p className={dark ? "text-white/40 text-[11px] mt-0.5" : "text-black/40 text-[11px] mt-0.5"}>
              {it.label} <span className={dark ? "text-white/25" : "text-black/25"}>· {it.sub}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Body Fat/Lean Mass configs, LogBodyMetricSheet, BodyMetricHistoryScreen,
// BodyMetricCard, and ConsistencyHeatmap now live in
// ../components/ProgressWidgets so the coach's web Progress tab can render
// the exact same graphs the client sees here (see CoachClientDetail.jsx).
const BODY_METRICS_CONFIG = [
  { key: "steps", label: "Steps", unit: "", icon: Footprints, placeholder: "e.g. 8500" },
  { key: "sleepHours", label: "Sleep", unit: "hrs", icon: Moon, placeholder: "e.g. 7.5" },
  { key: "restingHeartRate", label: "Resting Heart Rate", unit: "bpm", icon: Heart, placeholder: "e.g. 58" },
];

function ProgressScreen({ userId, photos, onAddPhoto, onDeletePhoto, weighIns, onLogWeight, onDeleteWeighIn, logsForClient, exercisesById, bodyMetrics, onLogBodyMetric, onDeleteBodyMetric, scheduledWorkouts, autoOpenWeighInKey }) {
  const dark = useClientDark();
  const [uploading, setUploading] = useState(false);
  const [openMetric, setOpenMetric] = useState(null);
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [logMetricConfig, setLogMetricConfig] = useState(null);
  const [historyMetricConfig, setHistoryMetricConfig] = useState(null);

  // "Body stats check-in due today" jumps straight here from Home/the
  // notification bell — landing on the tab isn't the ask, opening the log
  // sheet itself is. autoOpenWeighInKey increments each time that happens,
  // so a repeat tap re-opens it even if the client dismissed it last time.
  useEffect(() => {
    if (autoOpenWeighInKey) setQuickLogOpen(true);
  }, [autoOpenWeighInKey]);

  const bodyMetricEntries = useMemo(
    () => buildBodyMetricEntries(bodyMetrics, [...BODY_METRICS_CONFIG, BODY_FAT_CONFIG, LEAN_MASS_CONFIG, ...BODY_MEASUREMENTS_CONFIG]),
    [bodyMetrics]
  );

  const weeklyVolume = useMemo(() => computeWeeklyVolume(logsForClient), [logsForClient]);
  const personalBests = useMemo(() => computePersonalBests(logsForClient, exercisesById), [logsForClient, exercisesById]);
  const achievements = useMemo(
    () => computeAchievements(logsForClient, weighIns, exercisesById),
    [logsForClient, weighIns, exercisesById]
  );
  const timeline = useMemo(
    () => computePerformanceTimeline(logsForClient, weighIns, exercisesById, 30),
    [logsForClient, weighIns, exercisesById]
  );
  const monthlyVolume = useMemo(() => computeMonthlyVolume(logsForClient), [logsForClient]);
  const monthlyConsistency = useMemo(
    () => computeMonthlyConsistency(logsForClient, scheduledWorkouts),
    [logsForClient, scheduledWorkouts]
  );

  const tiles = useMemo(() => {
    const workoutsSeries = computeWorkoutsSeries(logsForClient);
    const streak = computeWorkoutStreak(logsForClient, scheduledWorkouts);
    return [
      { key: "workouts", label: "Workouts Completed", unit: "", decimals: 0, series: workoutsSeries, latest: logsForClient.length, date: "all-time" },
      {
        key: "streak",
        label: "Current Streak",
        unit: "",
        decimals: 0,
        series: null,
        latest: streak,
        date: streak === 1 ? "session in a row" : "sessions in a row",
      },
      {
        key: "prs",
        label: "Personal Bests",
        unit: "",
        decimals: 0,
        series: null,
        latest: computePRsInLastNDays(logsForClient, 30),
        date: "this month",
      },
      {
        key: "consistency",
        label: "Training Consistency",
        unit: "",
        decimals: 0,
        series: null,
        latest: monthlyConsistency.pct != null ? `${monthlyConsistency.pct}%` : "—",
        date:
          monthlyConsistency.pct != null ? `${monthlyConsistency.completed} of ${monthlyConsistency.expected} this month` : "this month",
      },
    ];
  }, [logsForClient, scheduledWorkouts, monthlyConsistency]);

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
    <div className="pb-28">
      <div className="px-3 pt-6 pb-4 flex items-center justify-between">
        <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Progress</h1>
        <BarChart3 size={20} className={dark ? "text-white/40" : "text-black/40"} />
      </div>

      <div className="px-3 space-y-4">
        <PerformanceTimelineCard timeline={timeline} monthlyVolume={monthlyVolume} />

        <div>
          <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>My Progress</p>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <MetricTile dark={dark}
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

        <Card dark={dark}>
          <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>Strength Personal Bests</p>
          <div className="space-y-2.5">
            {personalBests.map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <span className={dark ? "text-white/70 text-sm flex items-center gap-2" : "text-black/70 text-sm flex items-center gap-2"}>
                  <Trophy size={14} className={s.value ? (dark ? "text-white" : "text-black") : dark ? "text-white/25" : "text-black/25"} /> {s.name}
                </span>
                <span className={s.value ? (dark ? "text-white text-sm font-semibold" : "text-black text-sm font-semibold") : dark ? "text-white/30 text-xs" : "text-black/30 text-xs"}>
                  {s.value || "Not yet logged"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <ConsistencyHeatmap logs={logsForClient} dark={dark} />

        <PhotosSection photos={photos} onAdd={handleAddPhoto} onDelete={(id) => onDeletePhoto(userId, id)} busy={uploading} weighIns={weighIns} />

        <Card dark={dark}>
          <div className="flex items-center justify-between">
            <div>
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Body Weight</p>
              <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>
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
              className={dark ? "w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white shrink-0" : "w-8 h-8 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"}
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
                  <XAxis dataKey="date" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{
                          background: dark ? "#1C1C1C" : "#FFFFFF",
                          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: dark ? "#FFFFFF" : "#0A0A0B",
                        }} />
                  <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#wGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </button>
          ) : (
            <button
              onClick={() => setWeightHistoryOpen(true)}
              className={dark ? "w-full mt-3 text-center text-white/30 text-xs py-6 border border-dashed border-white/10 rounded-xl" : "w-full mt-3 text-center text-black/30 text-xs py-6 border border-dashed border-black/10 rounded-xl"}
            >
              {weighIns.length === 0 ? "Log a weight to start your history" : "Log another weigh-in to see a trend"}
            </button>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <BodyMetricCard
            dark={dark}
            config={BODY_FAT_CONFIG}
            entries={bodyMetricEntries.bodyFatPct}
            onLog={setLogMetricConfig}
            onOpenHistory={setHistoryMetricConfig}
          />
          <BodyMetricCard
            dark={dark}
            config={LEAN_MASS_CONFIG}
            entries={bodyMetricEntries.leanMassKg}
            onLog={setLogMetricConfig}
            onOpenHistory={setHistoryMetricConfig}
          />
        </div>

        <BodyMeasurementsListCard dark={dark} entriesByKey={bodyMetricEntries} onOpenHistory={setHistoryMetricConfig} onLog={setLogMetricConfig} />

        {BODY_METRICS_CONFIG.map((cfg) => (
          <BodyMetricCard
            dark={dark}
            key={cfg.key}
            config={cfg}
            entries={bodyMetricEntries[cfg.key]}
            onLog={setLogMetricConfig}
            onOpenHistory={setHistoryMetricConfig}
          />
        ))}

        {weeklyVolume.length >= 2 ? (
          <ChartCard
            title="Weekly Training Volume"
            subtitle={`${weeklyVolume[weeklyVolume.length - 1].volume.toLocaleString()} kg this week`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyVolume}>
                <XAxis dataKey="week" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={{
                          background: dark ? "#1C1C1C" : "#FFFFFF",
                          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                          borderRadius: 12,
                          fontSize: 12,
                          color: dark ? "#FFFFFF" : "#0A0A0B",
                        }} />
                <Bar dataKey="volume" fill={MEASURE_BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <Card dark={dark}>
            <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Weekly Training Volume</p>
            <p className={dark ? "text-white/30 text-sm mt-2" : "text-black/30 text-sm mt-2"}>Complete a few more weeks of logged workouts to see your volume trend.</p>
          </Card>
        )}

        <Card dark={dark}>
          <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>Achievements</p>
          {achievements.length === 0 ? (
            <p className={dark ? "text-white/30 text-sm" : "text-black/30 text-sm"}>Complete workouts to start unlocking milestones here.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((a) => (
                <div key={a.id} className={dark ? "bg-white/5 rounded-xl p-3 flex items-center gap-2.5" : "bg-black/5 rounded-xl p-3 flex items-center gap-2.5"}>
                  <span className="text-xl grayscale">{a.icon}</span>
                  <span className={dark ? "text-white/70 text-xs font-medium" : "text-black/70 text-xs font-medium"}>{a.label}</span>
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
          dark={dark}
          config={historyMetricConfig}
          entries={bodyMetricEntries[historyMetricConfig.key]}
          onClose={() => setHistoryMetricConfig(null)}
          onLog={(v) => onLogBodyMetric(historyMetricConfig.key, v)}
          onDelete={(dateKey) => onDeleteBodyMetric(dateKey, historyMetricConfig.key)}
        />
      )}
      <LogBodyMetricSheet
        dark={dark}
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
  const dark = useClientDark();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-xs font-semibold border ${
        active
          ? dark
            ? "bg-white text-black border-white"
            : "bg-black text-white border-black"
          : dark
          ? "bg-white/5 text-white/60 border-transparent"
          : "bg-black/5 text-black/60 border-transparent"
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
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={open} onClose={onClose} title={PREF_TITLES[section] || ""}>
      <div className="space-y-4">
        {section === "goals" && (
          <Field dark={dark} label="YOUR GOALS" hint="Shared with your coach">
            <TextArea dark={dark} rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Build muscle, lose fat, improve strength on my main lifts..." />
          </Field>
        )}
        {section === "equipment" && (
          <div>
            <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>WHAT DO YOU HAVE ACCESS TO?</p>
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
              <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>PREFERRED TRAINING DAYS</p>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((d) => (
                  <Chip key={d} active={trainingDays.includes(d)} onClick={() => toggle(trainingDays, setTrainingDays, d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>PREFERRED SESSION LENGTH</p>
              <div className="flex flex-wrap gap-2">
                {SESSION_LENGTH_OPTIONS.map((s) => (
                  <Chip key={s} active={sessionLength === s} onClick={() => setSessionLength(sessionLength === s ? "" : s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
            <Field dark={dark} label="ANYTHING ELSE?" hint="Injuries, limitations, preferred exercises...">
              <TextArea dark={dark} rows={3} value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} placeholder="e.g. Bad left knee, avoid deep squats..." />
            </Field>
          </>
        )}
        {section === "nutrition" && (
          <>
            <div>
              <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>DIET TYPE</p>
              <div className="flex flex-wrap gap-2">
                {DIET_OPTIONS.map((d) => (
                  <Chip key={d} active={dietType === d} onClick={() => setDietType(dietType === d ? "" : d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <Field dark={dark} label="ALLERGIES / DISLIKES" hint="Anything you can't or won't eat">
              <TextArea dark={dark} rows={2} value={nutritionNotes} onChange={(e) => setNutritionNotes(e.target.value)} placeholder="e.g. Allergic to peanuts, don't like fish..." />
            </Field>
          </>
        )}
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
      <button onClick={save} disabled={saving} className={dark ? "w-full mt-6 bg-white text-black font-bold py-4 rounded-2xl disabled:opacity-40" : "w-full mt-6 bg-black text-white font-bold py-4 rounded-2xl disabled:opacity-40"}>
        {saving ? "SAVING…" : "SAVE"}
      </button>
    </BottomSheet>
  );
}

function ConnectedDevicesSheet({ open, onClose }) {
  const dark = useClientDark();
  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Connected devices">
      <div className="text-center py-6">
        <Heart size={28} className={dark ? "text-white/20 mx-auto mb-3" : "text-black/20 mx-auto mb-3"} />
        <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Not available yet</p>
        <p className={dark ? "text-white/40 text-sm mt-1.5 max-w-xs mx-auto" : "text-black/40 text-sm mt-1.5 max-w-xs mx-auto"}>
          Syncing with wearables like Apple Health, Garmin or Whoop isn't built yet — it's on the roadmap for a future update.
        </p>
      </div>
    </BottomSheet>
  );
}

function PushNotificationsSheet({ open, onClose, showToast, userId }) {
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Push Notifications">
      <p className={dark ? "text-white/50 text-sm mb-4" : "text-black/50 text-sm mb-4"}>
        Get notified on this device when your coach messages you or reviews a check-in — even when the app is closed.
      </p>
      <div className={dark ? "flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5" : "flex items-center justify-between bg-black/5 rounded-xl px-4 py-3.5"}>
        <span className={dark ? "text-white font-medium text-sm" : "text-black font-medium text-sm"}>{enabled ? "Enabled on this device" : "Turn on"}</span>
        <button
          onClick={toggle}
          disabled={busy}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${enabled ? "bg-blue-500" : dark ? "bg-white/15" : "bg-black/15"}`}
          aria-label={enabled ? "Turn off push notifications" : "Turn on push notifications"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>}
      <p className={dark ? "text-white/30 text-[11px] mt-3" : "text-black/30 text-[11px] mt-3"}>This is per-device — turn it on separately on each phone or browser you use.</p>
    </BottomSheet>
  );
}

function NotificationRow({ icon: Icon, title, subtitle, onClick }) {
  const dark = useClientDark();
  return (
    <button onClick={onClick} className={dark ? "w-full text-left flex items-center gap-3 bg-white/5 rounded-xl px-3.5 py-3" : "w-full text-left flex items-center gap-3 bg-black/5 rounded-xl px-3.5 py-3"}>
      <div className={dark ? "w-9 h-9 rounded-lg bg-black flex items-center justify-center shrink-0" : "w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0"}>
        <Icon size={16} className={dark ? "text-white/70" : "text-black/70"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={dark ? "text-white text-sm font-semibold" : "text-black text-sm font-semibold"}>{title}</p>
        <p className={dark ? "text-white/40 text-xs mt-0.5 truncate" : "text-black/40 text-xs mt-0.5 truncate"}>{subtitle}</p>
      </div>
      <ChevronRight size={16} className={dark ? "text-white/25 shrink-0" : "text-black/25 shrink-0"} />
    </button>
  );
}

function NotificationsCenterSheet({ open, onClose, items }) {
  const dark = useClientDark();
  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Notifications">
      {items.length === 0 ? (
        <p className={dark ? "text-white/40 text-sm text-center py-8" : "text-black/40 text-sm text-center py-8"}>You're all caught up.</p>
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
  scheduledWorkouts,
  onOpenNotifications,
  notifCount,
  showToast,
  dueCheckInsCount,
  onOpenCheckIns,
}) {
  const dark = useClientDark();
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
    <div className="pb-28">
      <div className="px-3 pt-6 pb-4">
        <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Profile</h1>
      </div>
      <div className="px-3">
        <Card dark={dark}>
          <div className="flex items-center gap-4">
            <AvatarPicker dark={dark} name={user.name} url={user.avatarUrl} size={64} onChange={onAvatarChange} />
            <div>
              <p className={dark ? "text-white text-lg font-bold" : "text-black text-lg font-bold"}>{user.name}</p>
              <p className={dark ? "text-white/40 text-sm" : "text-black/40 text-sm"}>
                {user.fitnessLevel || "Beginner"} · {user.username}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4 space-y-3">
        <Card dark={dark} onClick={() => setMessagesOpen(true)}>
          <div className="flex items-center gap-3">
            <div className={dark ? "w-10 h-10 rounded-full bg-white/10 flex items-center justify-center relative" : "w-10 h-10 rounded-full bg-black/10 flex items-center justify-center relative"}>
              <MessageCircle size={18} className={dark ? "text-white" : "text-black"} />
              {unreadCount > 0 && (
                <span className={dark ? "absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center" : "absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center"}>
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Messages</p>
              <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>Chat directly with your coach</p>
            </div>
            <ChevronRight size={18} className={dark ? "text-white/30" : "text-black/30"} />
          </div>
        </Card>

        <Card dark={dark} onClick={onOpenCheckIns}>
          <div className="flex items-center gap-3">
            <div className={dark ? "w-10 h-10 rounded-full bg-white/10 flex items-center justify-center relative" : "w-10 h-10 rounded-full bg-black/10 flex items-center justify-center relative"}>
              <CalendarCheck size={18} className={dark ? "text-white" : "text-black"} />
              {dueCheckInsCount > 0 && (
                <span className={dark ? "absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center" : "absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center"}>
                  {dueCheckInsCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Check-ins</p>
              <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>{dueCheckInsCount > 0 ? `${dueCheckInsCount} due now` : "Fill out forms from your coach"}</p>
            </div>
            <ChevronRight size={18} className={dark ? "text-white/30" : "text-black/30"} />
          </div>
        </Card>

        <Card dark={dark} onClick={() => setCoachOpen(true)}>
          <div className="flex items-center gap-3">
            <div className={dark ? "w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" : "w-10 h-10 rounded-full bg-black/10 flex items-center justify-center"}>
              <Activity size={18} className={dark ? "text-white" : "text-black"} />
            </div>
            <div className="flex-1">
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Quick Tips</p>
              <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>Canned answers to common questions</p>
            </div>
            <ChevronRight size={18} className={dark ? "text-white/30" : "text-black/30"} />
          </div>
        </Card>
      </div>

      <div className="px-3 mt-4">
        <Card dark={dark}>
          {rows.map((r, i) => (
            <button
              key={r.label}
              onClick={r.onClick}
              className={`w-full flex items-center gap-3 py-3 text-left ${i !== rows.length - 1 ? (dark ? "border-b border-white/5" : "border-b border-black/5") : ""}`}
            >
              <r.icon size={17} className={dark ? "text-white/40" : "text-black/40"} />
              <span className={dark ? "text-white/80 text-sm flex-1" : "text-black/80 text-sm flex-1"}>{r.label}</span>
              {r.label === "Notifications" && notifCount > 0 && (
                <span className={dark ? "w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center" : "w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center"}>
                  {notifCount}
                </span>
              )}
              <ChevronRight size={16} className={dark ? "text-white/20" : "text-black/20"} />
            </button>
          ))}
        </Card>
      </div>

      <div className="px-3 mt-4">
        <button onClick={onLogout} className={dark ? "w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/70 font-semibold py-3.5 rounded-2xl" : "w-full flex items-center justify-center gap-2 bg-black/5 border border-black/10 text-black/70 font-semibold py-3.5 rounded-2xl"}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="flex justify-center mt-8">
        <Tagline tone="white" />
      </div>

      <PreferencesSheet section={prefSection} open={!!prefSection} onClose={() => setPrefSection(null)} user={user} />
      <ConnectedDevicesSheet open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <PushNotificationsSheet open={pushOpen} onClose={() => setPushOpen(false)} showToast={showToast} userId={user.id} />
    </div>
  );
}

function CoachSheet({ open, onClose, ctx }) {
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Quick Tips">
      <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                m.role === "user" ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/8 text-white/85" : "bg-black/8 text-black/85"
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
              <button onClick={() => send("more")} className={dark ? "text-xs bg-white text-black px-3 py-1.5 rounded-full font-semibold" : "text-xs bg-black text-white px-3 py-1.5 rounded-full font-semibold"}>
                More options
              </button>
            )
          );
        })()}
        {COACH_SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className={dark ? "text-xs bg-white/8 text-white/60 px-3 py-1.5 rounded-full" : "text-xs bg-black/8 text-black/60 px-3 py-1.5 rounded-full"}>
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
          className={dark ? "flex-1 bg-white/8 rounded-full px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" : "flex-1 bg-black/8 rounded-full px-4 py-3 text-sm text-black outline-none placeholder:text-black/30"}
        />
        <button onClick={() => send(input)} className={dark ? "w-11 h-11 rounded-full bg-white flex items-center justify-center" : "w-11 h-11 rounded-full bg-black flex items-center justify-center"}>
          <ChevronRight size={18} className={dark ? "text-black" : "text-white"} />
        </button>
      </div>
    </BottomSheet>
  );
}

function MessagesSheet({ open, onClose, user, thread, onSend, coachName }) {
  const dark = useClientDark();
  const [input, setInput] = useState("");
  const [uploadPct, setUploadPct] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const videoInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imageInputRef = useRef(null);
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

  async function handlePdfFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessagePdf(user.id, file, setUploadPct);
      onSend("", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessageImage(user.id, file, setUploadPct);
      onSend("", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Messages">
      <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto">
        {thread.length === 0 && (
          <div className="flex justify-start">
            <div className={dark ? "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-white/8 text-white/85" : "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-black/8 text-black/85"}>
              <p className="whitespace-pre-line">
                {`Hey, this is your 24/7 coach — ${coachName || "your coach"} will respond within due time. Ask any questions any time!`}
              </p>
            </div>
          </div>
        )}
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.from === "client" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.from === "client" ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/8 text-white/85" : "bg-black/8 text-black/85"
              }`}
            >
              {m.text && <p className="whitespace-pre-line">{m.text}</p>}
              {m.attachment && m.attachment.type === "video" ? (
                <video src={m.attachment.url} controls playsInline className={dark ? "mt-2 w-full max-w-[220px] rounded-lg bg-white" : "mt-2 w-full max-w-[220px] rounded-lg bg-black"} />
              ) : m.attachment && m.attachment.type === "image" ? (
                <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block mt-2">
                  <img src={m.attachment.url} alt={m.attachment.name || "Photo"} className="w-full max-w-[220px] rounded-lg object-cover" />
                </a>
              ) : (
                m.attachment && (
                  <a
                    href={m.attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 ${
                      m.from === "client" ? (dark ? "bg-black/15 text-black" : "bg-white/15 text-white") : dark ? "bg-white/8 text-white" : "bg-black/8 text-black"
                    }`}
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="text-xs font-medium truncate">{m.attachment.name}</span>
                  </a>
                )
              )}
              <p
                className={`text-[10px] mt-1 ${
                  m.from === "client" ? (dark ? "text-black/40" : "text-white/40") : dark ? "text-white/30" : "text-black/30"
                }`}
              >
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
          className={dark ? "w-11 h-11 rounded-full bg-white/8 flex items-center justify-center shrink-0 text-white/60 disabled:opacity-50" : "w-11 h-11 rounded-full bg-black/8 flex items-center justify-center shrink-0 text-black/60 disabled:opacity-50"}
        >
          {uploadPct !== null ? <span className="text-[10px] font-bold">{Math.round(uploadPct * 100)}%</span> : <Video size={17} />}
        </button>
        <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={handlePdfFile} className="hidden" />
        <button
          onClick={() => pdfInputRef.current?.click()}
          disabled={uploadPct !== null}
          aria-label="Attach a PDF"
          className={dark ? "w-11 h-11 rounded-full bg-white/8 flex items-center justify-center shrink-0 text-white/60 disabled:opacity-50" : "w-11 h-11 rounded-full bg-black/8 flex items-center justify-center shrink-0 text-black/60 disabled:opacity-50"}
        >
          <Paperclip size={17} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={uploadPct !== null}
          aria-label="Attach a photo"
          className={dark ? "w-11 h-11 rounded-full bg-white/8 flex items-center justify-center shrink-0 text-white/60 disabled:opacity-50" : "w-11 h-11 rounded-full bg-black/8 flex items-center justify-center shrink-0 text-black/60 disabled:opacity-50"}
        >
          <ImageIcon size={17} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message your coach..."
          className={dark ? "flex-1 bg-white/8 rounded-full px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" : "flex-1 bg-black/8 rounded-full px-4 py-3 text-sm text-black outline-none placeholder:text-black/30"}
        />
        <button onClick={send} className={dark ? "w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0" : "w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0"}>
          <Send size={16} className={dark ? "text-black" : "text-white"} />
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
  const dark = useClientDark();
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
    <BottomSheet dark={dark} open={open} onClose={onClose} title={form.name}>
      {form.description && <p className={dark ? "text-white/50 text-sm mb-4" : "text-black/50 text-sm mb-4"}>{form.description}</p>}
      <div className="space-y-4">
        {form.questions.map((q) => (
          <div key={q.id}>
            <p className={dark ? "text-white/40 text-xs tracking-wide mb-1.5" : "text-black/40 text-xs tracking-wide mb-1.5"}>
              {q.label || "Untitled question"} {q.required && <span className={dark ? "text-white/25" : "text-black/25"}>*</span>}
            </p>
            {q.type === "text" && (
              <textarea
                value={answers[q.id] || ""}
                onChange={(e) => set(q.id, e.target.value)}
                rows={2}
                className={dark ? "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/25 resize-none" : "w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none placeholder:text-black/25 resize-none"}
              />
            )}
            {q.type === "number" && (
              <input
                type="number"
                value={answers[q.id] || ""}
                onChange={(e) => set(q.id, e.target.value)}
                className={dark ? "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none" : "w-full bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none"}
              />
            )}
            {q.type === "rating" && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set(q.id, n)}
                    className={`flex-1 flex items-center justify-center py-2.5 rounded-xl ${
                      n <= (answers[q.id] || 0) ? (dark ? "bg-white" : "bg-black") : dark ? "bg-white/5" : "bg-black/5"
                    }`}
                  >
                    <Star
                      size={16}
                      className={n <= (answers[q.id] || 0) ? (dark ? "text-black" : "text-white") : dark ? "text-white/30" : "text-black/30"}
                      fill={n <= (answers[q.id] || 0) ? (dark ? "black" : "white") : "none"}
                    />
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
                      answers[q.id] === opt
                        ? dark
                          ? "bg-white text-black border-white"
                          : "bg-black text-white border-black"
                        : dark
                        ? "bg-white/5 text-white/70 border-transparent"
                        : "bg-black/5 text-black/70 border-transparent"
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
                  <label className={dark ? "w-full flex flex-col items-center justify-center gap-1.5 bg-white/5 border border-dashed border-white/15 rounded-xl py-6 cursor-pointer" : "w-full flex flex-col items-center justify-center gap-1.5 bg-black/5 border border-dashed border-black/15 rounded-xl py-6 cursor-pointer"}>
                    <Camera size={18} className={dark ? "text-white/40" : "text-black/40"} />
                    <span className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>{uploading === q.id ? "Uploading…" : "Add a photo"}</span>
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
        className={dark ? "w-full mt-6 bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-30" : "w-full mt-6 bg-black text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-30"}
      >
        <Check size={18} strokeWidth={3} /> SUBMIT CHECK-IN
      </button>
    </BottomSheet>
  );
}

function CheckInCard({ schedule, form, due, onFill }) {
  const dark = useClientDark();
  if (!form) return null;
  return (
    <div className={dark ? "flex items-center gap-3 bg-black border border-white/8 rounded-2xl px-4 py-3.5" : "flex items-center gap-3 bg-white border border-black/8 rounded-2xl px-4 py-3.5"}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${due ? (dark ? "bg-white" : "bg-black") : dark ? "bg-white/6" : "bg-black/6"}`}>
        <CalendarCheck size={17} className={due ? (dark ? "text-black" : "text-white") : dark ? "text-white/40" : "text-black/40"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={dark ? "text-white font-semibold text-sm truncate" : "text-black font-semibold text-sm truncate"}>{form.name}</p>
        <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>Every {DAY_LABELS[schedule.dayOfWeek]}</p>
      </div>
      {due ? (
        <button onClick={onFill} className={dark ? "bg-white text-black text-xs font-bold px-3.5 py-2 rounded-lg shrink-0" : "bg-black text-white text-xs font-bold px-3.5 py-2 rounded-lg shrink-0"}>
          Fill out
        </button>
      ) : (
        <span className={dark ? "text-white/30 text-xs shrink-0" : "text-black/30 text-xs shrink-0"}>Done</span>
      )}
    </div>
  );
}

function CheckInsScreen({ userId, showToast }) {
  const dark = useClientDark();
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
    <div className="pb-28 space-y-4">
      <div className="px-3 pt-6 pb-2">
        <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Check-ins</h1>
        <p className={dark ? "text-white/40 text-sm mt-0.5" : "text-black/40 text-sm mt-0.5"}>Scheduled by your coach</p>
      </div>

      {schedules.length === 0 ? (
        <Card dark={dark} className="mx-3 text-center py-10">
          <CalendarCheck size={26} className={dark ? "text-white/25 mx-auto mb-3" : "text-black/25 mx-auto mb-3"} />
          <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>No check-ins scheduled</p>
          <p className={dark ? "text-white/40 text-sm mt-1" : "text-black/40 text-sm mt-1"}>Your coach hasn't scheduled any check-ins yet.</p>
        </Card>
      ) : (
        <>
          {due.length > 0 && (
            <div className="px-3 space-y-2.5">
              <p className={dark ? "text-white/40 text-xs tracking-wide font-semibold" : "text-black/40 text-xs tracking-wide font-semibold"}>DUE NOW</p>
              {due.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due onFill={() => setFilling(s)} />
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="px-3 space-y-2.5">
              <p className={dark ? "text-white/40 text-xs tracking-wide font-semibold mt-2" : "text-black/40 text-xs tracking-wide font-semibold mt-2"}>UPCOMING</p>
              {upcoming.map((s) => (
                <CheckInCard key={s.id} schedule={s} form={formsById[s.formId]} due={false} />
              ))}
            </div>
          )}
        </>
      )}

      {responses.length > 0 && (
        <div className="px-3">
          <p className={dark ? "text-white/40 text-xs tracking-wide font-semibold mt-2 mb-2.5" : "text-black/40 text-xs tracking-wide font-semibold mt-2 mb-2.5"}>HISTORY</p>
          <Card className={dark ? "!p-0 divide-y divide-white/5 overflow-hidden" : "!p-0 divide-y divide-black/5 overflow-hidden"}>
            {responses.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <span className={dark ? "text-white/70 text-sm font-medium" : "text-black/70 text-sm font-medium"}>{formsById[r.formId]?.name || "Check-in"}</span>
                <span className={dark ? "text-white/35 text-xs" : "text-black/35 text-xs"}>{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
            ))}
          </Card>
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
// `onDelete` gets ignored whenever `draggable` is true — a still-pending
// item being drag-rescheduled (coach browsing "as client") already owns the
// pointer gesture on this exact card, and layering a second, competing
// swipe-to-delete gesture on the same element would fight it. Every other
// card (which for a real client is *every* card, since dragging is coach-only)
// gets the swipe.
function CalendarEventCard({ dot, done, title, subtitle, onClick, draggable, onPointerDown, onPointerMove, onPointerUp, dragging, onDelete }) {
  const dark = useClientDark();
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const swipeStartRef = useRef(0);
  const widthRef = useRef(0);
  const rowRef = useRef(null);
  // The drag gesture lives entirely on its own handle (touchAction: none,
  // rendered below) — the card body itself no longer competes for the
  // same touch, so swipe-to-delete works on a draggable card too, not
  // just non-draggable ones.
  const canSwipe = !!onDelete;

  function swipePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeStartRef.current = e.clientX;
    widthRef.current = rowRef.current?.offsetWidth || 300;
    setSwiping(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function swipePointerMove(e) {
    if (!swiping) return;
    const dx = e.clientX - swipeStartRef.current;
    setSwipeX(Math.min(0, Math.max(dx, -widthRef.current)));
  }
  function swipePointerUp(e) {
    if (!swiping) return;
    setSwiping(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (swipeX < -(widthRef.current * 0.35)) {
      setSwipeX(-widthRef.current);
      setTimeout(onDelete, 150);
    } else {
      setSwipeX(0);
    }
  }

  const Wrapper = onClick ? "button" : "div";
  const card = (
    <Wrapper
      onClick={onClick}
      onPointerDown={canSwipe ? swipePointerDown : undefined}
      onPointerMove={canSwipe ? swipePointerMove : undefined}
      onPointerUp={canSwipe ? swipePointerUp : undefined}
      onPointerCancel={canSwipe ? swipePointerUp : undefined}
      className={`w-full flex items-center gap-3 ${dark ? "bg-black border-white/8" : "bg-[#F7F7F8] border-black/8"} border rounded-2xl px-4 py-3.5 text-left transition-all duration-150 ${
        onClick ? (dark ? "hover:bg-white/[0.02]" : "hover:bg-black/[0.02]") : ""
      } ${dragging ? "opacity-30 scale-[0.97]" : ""}`}
      style={
        canSwipe
          ? { touchAction: "pan-y", transform: `translateX(${swipeX}px)`, transition: swiping ? "none" : "transform 200ms ease" }
          : undefined
      }
    >
      <span
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${dot.border} ${done ? dot.bg : dark ? "bg-black" : "bg-white"}`}
      >
        {done && <Check size={11} className={dark ? "text-black" : "text-white"} strokeWidth={3} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className={dark ? "text-white font-semibold text-[15px] truncate" : "text-black font-semibold text-[15px] truncate"}>{title}</p>
        {subtitle && <p className={dark ? "text-white/40 text-[13px] mt-0.5 truncate" : "text-black/40 text-[13px] mt-0.5 truncate"}>{subtitle}</p>}
      </div>
      {/* A dedicated grab handle, not the whole card, owns the drag gesture
          (touchAction: none, text-selection disabled) — the card body
          stays natively scrollable AND its text stays normally selectable,
          so starting an ordinary scroll swipe (or long-pressing the title
          to copy it) anywhere on a draggable card just does that, like any
          other card, instead of getting swallowed by the drag logic. Sized
          to a full 44px tap target (Apple's own minimum) since a small
          handle is fiddly to land a thumb on precisely. */}
      {draggable ? (
        <span
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={dark ? "w-11 h-11 -mr-2.5 shrink-0 flex items-center justify-center text-white/40 cursor-grab active:cursor-grabbing select-none" : "w-11 h-11 -mr-2.5 shrink-0 flex items-center justify-center text-black/40 cursor-grab active:cursor-grabbing select-none"}
          style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        >
          <GripVertical size={20} />
        </span>
      ) : (
        onClick && <ChevronRight size={18} className={dark ? "text-white/25 shrink-0" : "text-black/25 shrink-0"} />
      )}
    </Wrapper>
  );

  if (!canSwipe) return card;

  return (
    <div ref={rowRef} className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 bg-red-500 rounded-2xl flex items-center justify-end pr-4">
        <Trash2 size={16} className="text-white" />
      </div>
      {card}
    </div>
  );
}

// Shown instead of the whole app when the coach has paused this client's
// access (e.g. an unresolved payment) — everything about their program,
// history and progress stays intact server-side, they just can't browse it
// until the coach lifts the pause. Messaging stays open so they can sort it
// out directly rather than being locked out with no way to reach the coach.
function AccessPausedScreen({ onMessageCoach, onLogout }) {
  const dark = useClientDark();
  return (
    <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "70vh" }}>
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <Lock size={24} className="text-red-600" />
      </div>
      <p className={dark ? "text-white font-bold text-lg mb-1.5" : "text-black font-bold text-lg mb-1.5"}>Access paused</p>
      <p className={dark ? "text-white/50 text-sm max-w-xs mb-6" : "text-black/50 text-sm max-w-xs mb-6"}>
        Your coach has temporarily paused your access to your program and profile. Message them to sort it out.
      </p>
      <button onClick={onMessageCoach} className={dark ? "bg-white text-black text-sm font-bold px-5 py-3 rounded-xl w-full max-w-xs mb-2.5" : "bg-black text-white text-sm font-bold px-5 py-3 rounded-xl w-full max-w-xs mb-2.5"}>
        Message your coach
      </button>
      <button onClick={onLogout} className={dark ? "text-white/40 hover:text-white/60 text-sm font-medium py-2" : "text-black/40 hover:text-black/60 text-sm font-medium py-2"}>
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
  scheduledWorkoutsListByDate,
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
  onDeleteScheduledWorkout,
  onDeleteWorkoutLog,
  onDeleteBodyStatsSchedule,
  onDeleteWeighIn,
}) {
  const dark = useClientDark();
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
  const [dragItem, setDragItem] = useState(null); // { date, type: "workout" | "bodystats", label, workoutId }
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragPos, setDragPos] = useState(null); // { x, y } — pointer position while actively dragging, drives the floating ghost
  const pressRef = useRef(null); // { timer, startX, startY, date, type, label, fired }
  // Lets a drag reach days scrolled off-screen: holding near the top/bottom
  // edge of the scrollable list while dragging keeps auto-scrolling that
  // direction, and the drop target keeps re-evaluating under the finger
  // even while it's held still (a plain pointermove-only recheck would go
  // stale the moment content scrolls out from under a stationary finger).
  const scrollSpeedRef = useRef(0);
  const autoScrollRafRef = useRef(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  // A completed drag still ends in a native "click" on the same element
  // (pointer capture keeps the up-event's target pinned to it regardless of
  // where the finger ended up) — without this flag that click immediately
  // re-opened the workout/day right after dropping it.
  const suppressClickRef = useRef(false);

  function recheckDragOverDate() {
    const { x, y } = lastPointerRef.current;
    const target = document.elementFromPoint(x, y);
    const dayEl = target?.closest("[data-date]");
    const overDate = dayEl?.getAttribute("data-date") || null;
    setDragOverDate(overDate && overDate !== pressRef.current?.date ? overDate : null);
  }

  function autoScrollTick() {
    const el = scrollRef.current;
    if (el && scrollSpeedRef.current !== 0) {
      el.scrollTop += scrollSpeedRef.current;
      recheckDragOverDate();
    }
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }

  function updateAutoScroll(clientY) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 70;
    let speed = 0;
    if (clientY < rect.top + edge) speed = -(Math.round((rect.top + edge - clientY) / 3) + 3);
    else if (clientY > rect.bottom - edge) speed = Math.round((clientY - (rect.bottom - edge)) / 3) + 3;
    scrollSpeedRef.current = speed;
    if (speed !== 0 && !autoScrollRafRef.current) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    } else if (speed === 0 && autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }

  function stopAutoScroll() {
    scrollSpeedRef.current = 0;
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }

  function cardPointerDown(e, date, type, label, workoutId) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = setTimeout(() => {
      if (!pressRef.current) return;
      pressRef.current.fired = true;
      setDragItem({ date, type, label, workoutId });
      setDragPos({ x: startX, y: startY });
      try {
        el.setPointerCapture(pointerId);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(10);
    }, 220);
    pressRef.current = { timer, startX, startY, date, type, label, workoutId, fired: false };
  }

  function cardPointerMove(e) {
    const p = pressRef.current;
    if (!p) return;
    if (!p.fired) {
      // Moved before the long-press fired — this is a scroll, not a drag.
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 14) {
        clearTimeout(p.timer);
        pressRef.current = null;
      }
      return;
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setDragPos({ x: e.clientX, y: e.clientY });
    updateAutoScroll(e.clientY);
    recheckDragOverDate();
  }

  function cardPointerUp() {
    const p = pressRef.current;
    if (p?.fired) {
      suppressClickRef.current = true;
      if (dragOverDate && dragOverDate !== p.date) {
        onMoveItem(p.type, p.date, dragOverDate, p.workoutId);
      }
    }
    if (p?.timer) clearTimeout(p.timer);
    pressRef.current = null;
    setDragItem(null);
    setDragOverDate(null);
    setDragPos(null);
    stopAutoScroll();
  }

  // Wrap a card's real onClick so the click the browser fires right after a
  // completed drag gets swallowed once instead of opening whatever's under
  // the pointer at drop time.
  function guardedClick(fn) {
    return () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      fn();
    };
  }

  const logsByDate = useMemo(() => {
    const map = {};
    logsForClient.forEach((l) => {
      const key = localDateKey(l.date);
      if (!map[key]) map[key] = l;
    });
    return map;
  }, [logsForClient]);
  const weighInDates = useMemo(() => new Set(weighIns.map((w) => localDateKey(w.date))), [weighIns]);
  const weighInsByDate = useMemo(() => {
    const map = {};
    weighIns.forEach((w) => {
      const key = localDateKey(w.date);
      if (!map[key]) map[key] = w;
    });
    return map;
  }, [weighIns]);
  const activeFormSchedules = useMemo(() => (formSchedules || []).filter((s) => s.active), [formSchedules]);
  const formsById = useMemo(() => Object.fromEntries((forms || []).map((f) => [f.id, f])), [forms]);

  const todayStr = localDateKey();

  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - daysBack);
    const list = [];
    for (let i = 0; i <= daysBack + daysForward; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = localDateKey(d);
      const scheduledList = scheduledWorkoutsListByDate[dateStr] || [];
      const log = logsByDate[dateStr];
      const dayHabits = habits.filter((h) => {
        const createdKey = localDateKey(h.createdAt);
        if (dateStr < createdKey) return false;
        if (h.endsAt && dateStr > localDateKey(h.endsAt)) return false;
        return true;
      });
      const checkinsToday = activeFormSchedules.filter((s) => s.dayOfWeek === d.getDay());
      const bodyStatsToday = (bodyStatsSchedules || []).some((b) => b.date === dateStr);
      const hasContent = scheduledList.length > 0 || !!log || dayHabits.length > 0 || checkinsToday.length > 0 || bodyStatsToday;
      if (!hasContent && dateStr !== todayStr) continue;
      list.push({ date: d, dateStr, scheduledList, log, dayHabits, checkinsToday, bodyStatsToday, hasContent });
    }
    return list;
  }, [daysBack, daysForward, scheduledWorkoutsListByDate, logsByDate, habits, activeFormSchedules, bodyStatsSchedules, todayStr]);

  useEffect(() => {
    return () => {
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (scrolledToToday.current) return;
    const t = setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "start" });
      scrolledToToday.current = true;
    }, 50);
    return () => clearTimeout(t);
  }, [days]);

  // Loading more days near the top means the list grows FROM ABOVE — new
  // day blocks get inserted before everything currently on screen. With no
  // compensation the browser leaves scrollTop untouched, so the page the
  // client was actually looking at gets shoved down out of view and
  // whatever's now at that same pixel offset (much older days) appears in
  // its place — reads exactly like the visible content "got removed".
  // Capturing scrollHeight right before the prepend and re-adding the
  // difference once the new days are in the DOM keeps the same content
  // pinned under the finger/viewport.
  const prependAdjustRef = useRef(null);

  function handleScroll(e) {
    const el = e.target;
    if (el.scrollTop < 400) {
      setDaysBack((d) => {
        if (d >= 365) return d;
        prependAdjustRef.current = el.scrollHeight;
        return d + 30;
      });
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) setDaysForward((d) => Math.min(d + 30, 365));
  }

  useLayoutEffect(() => {
    if (prependAdjustRef.current == null) return;
    const el = scrollRef.current;
    if (el) {
      const delta = el.scrollHeight - prependAdjustRef.current;
      if (delta > 0) el.scrollTop += delta;
    }
    prependAdjustRef.current = null;
  }, [days]);

  function jumpToToday() {
    todayRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-6 pb-3 shrink-0 flex items-center justify-between">
        <div>
          <h1 className={dark ? "text-white text-2xl font-bold" : "text-black text-2xl font-bold"}>Calendar</h1>
          <p className={dark ? "text-white/40 text-sm mt-0.5" : "text-black/40 text-sm mt-0.5"}>Scroll to see anything past or upcoming.</p>
        </div>
        <button onClick={jumpToToday} className={dark ? "text-white/50 hover:text-white text-sm font-semibold shrink-0" : "text-black/50 hover:text-black text-sm font-semibold shrink-0"}>
          Today
        </button>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 pb-6" style={{ maxHeight: "calc(100vh - 180px)" }}>
        {days.map(({ date: d, dateStr, scheduledList, log, dayHabits, checkinsToday, bodyStatsToday, hasContent }, i) => {
          const isToday = dateStr === todayStr;
          const doneHabitIds = habitLogForClient[dateStr] || [];
          const habitsDone = dayHabits.filter((h) => doneHabitIds.includes(h.id)).length;
          const bodyStatsDone = weighInDates.has(dateStr);

          // A log only counts as completing one of THIS day's own scheduled
          // workouts when its label matches — a catch-up log for a
          // different, overdue day landing on this date must not mark this
          // day's own (still-undone) workout as done, hide its drag handle,
          // or get silently merged into its card. The client decides what
          // to do with the leftover scheduled item themselves (drag or
          // delete). The standalone "completed" card below only shows when
          // the log doesn't match ANY scheduled item on this day.
          const anyLogMatchesScheduled = !!(log && scheduledList.some((s) => log.dayLabel === s.label));
          const canDragBodyStats = canEdit && !!bodyStatsToday && !bodyStatsDone;
          const isDropTarget = canEdit && dragItem && dragItem.date !== dateStr;

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              ref={isToday ? todayRef : null}
              className={`${i > 0 ? "mt-5" : ""} transition-colors duration-150 ${
                isDropTarget && dragOverDate === dateStr ? "bg-blue-50 rounded-2xl ring-2 ring-blue-300" : ""
              }`}
            >
              <p className={`font-bold text-base mb-2 ${isToday ? "text-blue-600" : dark ? "text-white" : "text-black"}`}>
                {isToday ? "Today, " : ""}
                {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className={dark ? "border-b border-white/10 mb-3" : "border-b border-black/10 mb-3"} />
              <div className="space-y-2.5">
                {scheduledList.map((scheduled) => {
                  const logMatchesScheduled = !!(log && log.dayLabel === scheduled.label);
                  const canDragWorkout = canEdit && !logMatchesScheduled;
                  return (
                    <CalendarEventCard
                      key={scheduled.id}
                      dot={{ border: "border-blue-500", bg: "bg-blue-500" }}
                      done={logMatchesScheduled}
                      title={scheduled.label}
                      subtitle={
                        canDragWorkout
                          ? "Drag to a different day to reschedule."
                          : logMatchesScheduled
                          ? "Workout completed."
                          : "Complete your scheduled workout."
                      }
                      onClick={guardedClick(() =>
                        onPreviewWorkout({ label: scheduled.label, muscleGroups: scheduled.muscleGroups || [], exercises: scheduled.exercises })
                      )}
                      draggable={canDragWorkout}
                      dragging={dragItem?.workoutId === scheduled.id}
                      onPointerDown={(e) => cardPointerDown(e, dateStr, "workout", scheduled.label, scheduled.id)}
                      onPointerMove={cardPointerMove}
                      onPointerUp={cardPointerUp}
                      onDelete={canEdit ? () => onDeleteScheduledWorkout(scheduled.id) : undefined}
                    />
                  );
                })}
                {log && !anyLogMatchesScheduled && (
                  <CalendarEventCard
                    dot={{ border: "border-emerald-500", bg: "bg-emerald-500" }}
                    done
                    title={log.dayLabel}
                    subtitle="Completed."
                    onDelete={canEdit ? () => onDeleteWorkoutLog(log.id) : undefined}
                  />
                )}
                {dayHabits.map((h) => (
                  <CalendarEventCard
                    key={h.id}
                    dot={{ border: "border-teal-500", bg: "bg-teal-500" }}
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
                    onPointerDown={(e) => cardPointerDown(e, dateStr, "bodystats", "Body Stats Check-in")}
                    onPointerMove={cardPointerMove}
                    onPointerUp={cardPointerUp}
                    onDelete={
                      canEdit ? () => (bodyStatsDone ? onDeleteWeighIn(weighInsByDate[dateStr]?.id) : onDeleteBodyStatsSchedule(dateStr)) : undefined
                    }
                  />
                )}
                {!hasContent && (
                  <p className={dark ? "text-white/25 text-sm px-1" : "text-black/25 text-sm px-1"}>Nothing scheduled.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Floating "ghost" that tracks the finger/cursor once a drag has
          started — without this the dragged card just sits there dimmed,
          which reads as unresponsive rather than as an active drag.
          pointer-events-none so it never blocks the elementFromPoint()
          lookup that finds the day underneath it. */}
      {dragItem && dragPos && (
        <div
          className={dark ? "fixed z-[200] pointer-events-none flex items-center gap-2 bg-white text-black text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl" : "fixed z-[200] pointer-events-none flex items-center gap-2 bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl"}
          style={{ left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -130%)" }}
        >
          {dragItem.label}
        </div>
      )}
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
    deleteWorkoutLog,
    logBodyMetric,
    deleteBodyMetric,
    saveExerciseNote,
    viewingAsClient,
    stopViewAsClient,
    deleteScheduledWorkoutById,
    moveScheduledWorkout,
    scheduleBodyStatsCheckin,
    unscheduleBodyStatsCheckin,
    dbReady,
  } = useApp();
  const dark = db.appDesign?.clientDarkMode === true;
  const navigate = useNavigate();
  const [tab, setTab] = useState("home");
  const [activeLog, setActiveLog] = useState(null); // {exerciseId: [sets]} while a session is open
  // Which session is actually being run right now — defaults to todaySession
  // (the Home/Training-tab "Start" flow never passes one explicitly) but lets
  // the calendar hand in a DIFFERENT day's workout (e.g. running Friday's
  // plan on a Saturday), so starting isn't locked to whatever's scheduled
  // for today specifically.
  const [runningSession, setRunningSession] = useState(null);
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
  const [autoOpenWeighIn, setAutoOpenWeighIn] = useState(0);
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
  // Array form — a day can now hold more than one scheduled workout (e.g.
  // one dragged onto a day that already had its own), so the calendar
  // screen needs every entry for a date, not just one. Home/session
  // resolution above keeps using the single-value map for simplicity.
  const scheduledWorkoutsListByDate = useMemo(() => {
    const map = {};
    scheduledWorkoutsForClient.forEach((w) => {
      if (!map[w.date]) map[w.date] = [];
      map[w.date].push(w);
    });
    return map;
  }, [scheduledWorkoutsForClient]);
  const bodyStatsSchedulesForClient = (db.bodyStatsSchedules || {})[currentUser.id] || [];
  function scheduledToSession(entry) {
    return entry ? { label: entry.label, muscleGroups: entry.muscleGroups || [], exercises: entry.exercises } : null;
  }
  // A workout done late (e.g. Sunday's session finished Monday) is logged
  // with today's timestamp, not Sunday's — logWorkout always stamps the
  // actual moment it was completed, which is correct for the log itself.
  // When that log's own day matches what's actually scheduled for this
  // date, show the real completed sets/PRs (Trainerize-style) instead of
  // the plain prescription. But if this date still has its OWN different
  // workout scheduled (the client did a different, overdue day's session
  // instead), leave that scheduled workout showing as-is rather than
  // replacing it with the catch-up session — the client decides whether
  // to remove it (swipe on the calendar), not the app.
  function sessionForDate(dateKey, logs) {
    const scheduled = scheduledWorkoutsByDate[dateKey];
    const completedLog = logs.find((l) => !l.cardio && localDateKey(l.date) === dateKey);
    if (completedLog && (!scheduled || scheduled.label === completedLog.dayLabel)) {
      return {
        label: completedLog.dayLabel || "Workout",
        muscleGroups: scheduled?.muscleGroups || [],
        workoutLogId: completedLog.id,
        exercises: completedLog.entries.map((e) => ({
          exerciseId: e.exerciseId,
          targetSets: (e.sets || []).length,
          actualSets: e.sets || [],
          note: e.note || "",
        })),
      };
    }
    return scheduledToSession(scheduled);
  }
  // "Completed" for a date means a log exists AND it's actually that
  // date's own scheduled workout (or nothing was scheduled) — not just
  // any log landing on that date, so a catch-up completion of a
  // different, overdue day doesn't mark today's own workout done.
  function isDateActuallyCompleted(dateKey, logs) {
    const scheduled = scheduledWorkoutsByDate[dateKey];
    return logs.some(
      (l) => !l.cardio && localDateKey(l.date) === dateKey && (!scheduled || scheduled.label === l.dayLabel)
    );
  }
  const todayDateKey = localDateKey();
  const exercisesById = useMemo(() => Object.fromEntries(db.exercises.map((e) => [e.id, e])), [db.exercises]);
  const logsForClient = db.workoutLogs[currentUser.id] || [];
  const completedToday = isDateActuallyCompleted(todayDateKey, logsForClient);
  const todaySession = completedToday ? sessionForDate(todayDateKey, logsForClient) : scheduledToSession(scheduledWorkoutsByDate[todayDateKey]);
  const nutritionLogsForClient = db.nutritionLogs[currentUser.id] || [];
  const nutritionByDateKey = useMemo(
    () => Object.fromEntries(nutritionLogsForClient.map((n) => [n.date, n])),
    [nutritionLogsForClient]
  );
  const nutrition = nutritionByDateKey[todayDateKey] || DEFAULT_NUTRITION;
  // Distinct foods this client has actually logged before, most recent
  // first — surfaced in the food-add sheet the same way "My Meals" offers
  // one-tap re-logging, so a food they eat often (but never saved as a
  // meal) doesn't mean re-searching or re-typing it from scratch every time.
  const recentFoods = useMemo(() => {
    const seen = new Map();
    const sortedDays = [...nutritionLogsForClient].sort((a, b) => b.date.localeCompare(a.date));
    for (const day of sortedDays) {
      for (const items of Object.values(day.meals || {})) {
        for (const item of items) {
          const key = (item.name || "").toLowerCase();
          if (key && !seen.has(key)) seen.set(key, item);
        }
      }
      if (seen.size >= 10) break;
    }
    return [...seen.values()].slice(0, 10);
  }, [nutritionLogsForClient]);
  const targets = useMemo(() => resolveNutritionTargets(currentUser.nutritionTargets), [currentUser.nutritionTargets]);
  // Shared across every client, not just the one who created it — a meal
  // (or single food, via Quick Add/barcode's own library save) only needs
  // to be built once, then anyone can one-tap log it from here on.
  // Deduped by name so two clients creating the same thing (e.g. "Milo")
  // doesn't leave two near-identical entries sitting in the list.
  const savedMeals = useMemo(() => {
    const all = Object.values(db.savedMeals || {}).flat();
    const seen = new Map();
    for (const m of [...all].sort((a, b) => b.createdAt - a.createdAt)) {
      const key = (m.name || "").toLowerCase();
      if (key && !seen.has(key)) seen.set(key, m);
    }
    return [...seen.values()];
  }, [db.savedMeals]);
  const habits = ((db.habits || {})[currentUser.id] || []).filter((h) => !h.endsAt || h.endsAt >= Date.now());
  const todayKey = todayDateKey;
  const completedHabitIds = ((db.habitLog || {})[currentUser.id] || {})[todayKey] || [];
  const bodyStatsDueToday = bodyStatsSchedulesForClient.some((s) => s.date === todayDateKey) && !weighIns.some((w) => localDateKey(w.date) === todayDateKey);

  const isToday = dayOffset === 0;
  const selectedDateKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return localDateKey(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffset, dateTick]);
  const dayHabitCompletedIds = isToday ? completedHabitIds : ((db.habitLog || {})[currentUser.id] || {})[selectedDateKey] || [];
  const completedOnDate = isDateActuallyCompleted(selectedDateKey, logsForClient);
  const daySession = completedOnDate ? sessionForDate(selectedDateKey, logsForClient) : scheduledToSession(scheduledWorkoutsByDate[selectedDateKey]);
  const dayNutrition = isToday ? nutrition : nutritionByDateKey[selectedDateKey] || null;
  const cardioLogsForSelectedDate = useMemo(
    () => logsForClient.filter((l) => l.cardio && localDateKey(l.date) === selectedDateKey),
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
          setAutoOpenWeighIn((n) => n + 1);
        },
      });
    }
    return items;
  }, [unreadCount, thread, todaySession, completedOnDate, dueCheckInsCount, bodyStatsDueToday]);

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function startWorkout(session = todaySession) {
    if (!session) return;
    // Starting a different day's workout than whatever's currently tracked
    // (e.g. picking Friday's plan from the calendar while today's session
    // is still sitting half-logged) must not inherit those leftover sets —
    // they're keyed by exerciseId, and the two days can easily share
    // exercises, so stale numbers would silently show up as already logged.
    if (session !== todaySession) setActiveLog(null);
    setRunningSession(session);
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
    const session = runningSession || todaySession;
    const elapsedMs = Date.now() - (sessionStartedAtRef.current || Date.now());
    const durationMin = Math.floor(elapsedMs / 60000);
    const durationSec = Math.floor((elapsedMs % 60000) / 1000);
    sessionStartedAtRef.current = null;
    const raw = activeLog || {};
    const cleanedLog = {};
    Object.entries(raw).forEach(([exerciseId, sets]) => {
      // Only reps are required to count a set as logged — weight is
      // legitimately blank for a bodyweight exercise (push-ups, planks,
      // unweighted pull-ups) or a reps-only target. Requiring both used to
      // silently drop the entire exercise from the saved log the moment
      // weight was left empty, even though the workout-completed event
      // still fired — the exercise just vanished from the client's own log
      // while the coach's activity feed still showed the session as done.
      const cleaned = (sets || [])
        .filter((s) => s.reps !== "" && s.reps != null && !isNaN(Number(s.reps)))
        .map((s, i) => ({
          setNumber: i + 1,
          weight: s.weight !== "" && s.weight != null && !isNaN(Number(s.weight)) ? Number(s.weight) : 0,
          reps: Number(s.reps),
          completed: true,
          isPR: !!s.isPR,
        }));
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
      dayLabel: session.label,
      entries: Array.from(allExerciseIds).map((exerciseId) => ({
        exerciseId,
        sets: cleanedLog[exerciseId] || [],
        note: exerciseNotes[exerciseId] || "",
        ...(swapByToId[exerciseId] || {}),
      })),
    });
    setSummaryData({ daySession: session, activeLog: cleanedLog, durationMin, durationSec });
    setActiveLog(null);
    setExerciseNotes({});
    setExerciseSwaps({});
    setSessionOpen(false);
    setSummaryOpen(true);
    setRunningSession(null);
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
        calories: Math.round((base.calories || 0) + (Number(food.cals) || 0)),
        protein: round1((base.protein || 0) + (Number(food.protein) || 0)),
        carbs: round1((base.carbs || 0) + (Number(food.carbs) || 0)),
        fat: round1((base.fat || 0) + (Number(food.fat) || 0)),
        // base.meals[meal] can be missing on an older doc saved before this
        // category existed (e.g. Pre-workout/Post-workout added later) —
        // spreading undefined there threw, silently dropping the whole add.
        meals: { ...base.meals, [meal]: [...(base.meals?.[meal] || []), { ...food, id: food.id + "-" + Date.now() }] },
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
  // view of a client. Dropping a workout onto a day that already has one
  // (or more) never removes/overwrites what's already there — both just
  // coexist on that day afterward. Removing anything is only ever done by
  // explicit swipe-delete, never as a side effect of a drag.
  function moveScheduledItem(type, fromDate, toDate, workoutId) {
    if (!viewingAsClient || fromDate === toDate) return;
    if (type === "bodystats") {
      if (!bodyStatsSchedulesForClient.some((s) => s.date === fromDate)) return;
      scheduleBodyStatsCheckin(currentUser.id, { startDate: toDate, weeks: 1 });
      unscheduleBodyStatsCheckin(currentUser.id, fromDate);
      showToast("Check-in rescheduled");
      return;
    }
    if (!workoutId) return;
    moveScheduledWorkout(currentUser.id, workoutId, toDate)
      .then(() => showToast("Workout rescheduled"))
      .catch((err) => showToast(err.message || "Couldn't move that workout"));
  }

  return (
    <ClientThemeContext.Provider value={dark}>
    <div className={`w-full h-full min-h-screen font-sans flex justify-center ${dark ? "bg-[#090909]" : "bg-white"}`}>
      <div className="w-full max-w-md relative">
        {viewingAsClient && (
          <div className="sticky top-0 z-[70] bg-blue-600 text-white flex items-center justify-between gap-2 px-4 py-2 pt-safe">
            <span className="text-xs font-semibold truncate">Viewing as {currentUser.name}</span>
            <button onClick={stopViewAsClient} className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-lg shrink-0">
              <ChevronLeft size={12} /> Exit
            </button>
          </div>
        )}
        <BrandBar dark={dark} />
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
            onStartWorkout={() => startWorkout(daySession)}
            onViewWorkout={() => openPreview(daySession, !completedOnDate)}
            dayNutrition={dayNutrition}
            targets={targets}
            onLogFood={() => setTab("nutrition")}
            onLogWater={() => addWater(0.25)}
            showToast={showToast}
            habits={habits}
            completedHabitIds={completedHabitIds}
            onToggleHabit={(habitId) =>
              toggleHabitToday(currentUser.id, habitId).catch(() => showToast?.("Couldn't save — check your connection"))
            }
            onAvatarClick={() => setTab("profile")}
            dayOffset={dayOffset}
            onSelectDay={setDayOffset}
            daySession={daySession}
            isToday={isToday}
            completedOnDate={completedOnDate}
            dayHabitCompletedIds={dayHabitCompletedIds}
            exercisesById={exercisesById}
            bodyStatsDueToday={bodyStatsDueToday}
            onLogWeight={() => {
              setTab("progress");
              setAutoOpenWeighIn((n) => n + 1);
            }}
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
            onStart={() => startWorkout()}
            onViewWorkout={() => openPreview(todaySession, !completedToday)}
            onPreviewWorkout={(day) => openPreview(day, true)}
            logsForClient={logsForClient}
            exercisesById={exercisesById}
            onLogCardio={(cardio) => {
              logWorkout(currentUser.id, { dayLabel: `${cardio.activityLabel} (Cardio)`, entries: [], cardio });
              showToast(`${cardio.activityLabel} logged`);
            }}
            dbReady={dbReady}
            showToast={showToast}
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
            recentFoods={recentFoods}
            showToast={showToast}
          />
        )}
        {tab === "checkins" && <CheckInsScreen userId={currentUser.id} showToast={showToast} />}
        {tab === "calendar" && (
          <ClientCalendarScreen
            scheduledWorkoutsListByDate={scheduledWorkoutsListByDate}
            logsForClient={logsForClient}
            habits={habits}
            habitLogForClient={(db.habitLog || {})[currentUser.id] || {}}
            bodyStatsSchedules={bodyStatsSchedulesForClient}
            weighIns={weighIns}
            formSchedules={(db.formSchedules || {})[currentUser.id] || []}
            forms={db.forms || []}
            onPreviewWorkout={(day) => openPreview(day, true)}
            canEdit={viewingAsClient}
            onMoveItem={moveScheduledItem}
            onDeleteScheduledWorkout={(workoutId) => {
              deleteScheduledWorkoutById(workoutId);
              showToast("Workout removed");
            }}
            onDeleteWorkoutLog={(logId) => {
              deleteWorkoutLog(logId);
              showToast("Removed from history");
            }}
            onDeleteBodyStatsSchedule={(dateStr) => {
              unscheduleBodyStatsCheckin(currentUser.id, dateStr);
              showToast("Check-in removed");
            }}
            onDeleteWeighIn={(weighInId) => {
              if (!weighInId) return;
              deleteWeighIn(currentUser.id, weighInId);
              showToast("Weigh-in removed");
            }}
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
            autoOpenWeighInKey={autoOpenWeighIn}
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
            scheduledWorkouts={scheduledWorkoutsForClient}
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
          <div
            className={`w-full max-w-md backdrop-blur border-t flex px-2 pb-safe ${dark ? "border-white/8" : "border-black/8"}`}
            style={{ backgroundColor: dark ? "rgba(12,12,12,0.95)" : "rgba(255,255,255,0.95)" }}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const activeClass = dark ? "text-white" : "text-black";
              const inactiveClass = dark ? "text-white/35" : "text-black/35";
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-3 relative">
                  <Icon size={21} className={active ? activeClass : inactiveClass} strokeWidth={active ? 2.4 : 2} />
                  <span className={`text-[10px] font-medium ${active ? activeClass : inactiveClass}`}>{t.label}</span>
                  {t.id === "profile" && dueCheckInsCount > 0 && (
                    <span className={`absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full ${dark ? "bg-white" : "bg-black"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </>
        )}

        {sessionOpen && activeLog && (runningSession || todaySession) && (
          <WorkoutSession
            session={runningSession || todaySession}
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
            proteinTarget={targets.protein}
            proteinSoFar={nutrition.protein}
            habits={habits}
            completedHabitIds={completedHabitIds}
            onToggleHabit={(habitId) =>
              toggleHabitToday(currentUser.id, habitId).catch(() => showToast?.("Couldn't save — check your connection"))
            }
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
              const session = previewSession;
              setPreviewSession(null);
              startWorkout(session);
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
        <Toast dark={dark} message={toast.message} show={toast.show} />
      </div>
    </div>
    </ClientThemeContext.Provider>
  );
}
