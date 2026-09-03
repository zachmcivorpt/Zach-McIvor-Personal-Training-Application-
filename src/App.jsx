import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Home as HomeIcon,
  Dumbbell,
  Utensils,
  TrendingUp,
  User,
  Play,
  Pause,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Minus,
  Flame,
  Droplet,
  Moon,
  Activity,
  Footprints,
  Heart,
  Trophy,
  Search,
  Clock,
  Bell,
  Settings,
  ChevronDown,
  Info,
  Repeat,
  Award,
  Target,
  BarChart3,
  Camera,
  ScanLine,
  Star,
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
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ============================================================================
   DESIGN TOKENS
   Background: #0A0A0B (near-black)  Surface: #17181B  Surface-raised: #1F2023
   Text: #F5F5F4 / #9A9A9E (muted)   Accent: #FF5A1F (signal orange)
   Success: #33C27F   Gold (PR): #F2B84B
============================================================================ */
const ACCENT = "#FF5A1F";
const SUCCESS = "#33C27F";
const GOLD = "#F2B84B";

// Brand mark — white-on-transparent version of the uploaded "M Personal Training" logo,
// cropped to content, for use on the dark theme.
const LOGO_WHITE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANMAAADFCAYAAADOiMdfAAAGzklEQVR4nO3d23LbMAxFUabT//9l9SHj1JFFinfhAHu9tI5vJIVDMJ5J8nUcR5pk2gtt8vX0AAJRqo3uuvgzcxRilC4w9umui1lhojDhSVc9zwiTcpCUx461mmsj8jEPuNMUqNEwedjZPcwB61TXx0iYPBWhp7lgvqr64JgH1LkNVG+YPO7kHueEjXrCRNEhqmLtc8z7jY0Cd7I10hqmCMUWYY4Yc1kjdCagz0egWsIUaceONFf0+1UndCZgzE+gCFMe3Qm1jpQI0x0CVcb6/He0hIkfpgMKWjtTxECx+15jXU445qHHkfl/aD1hojvhXcR6uERnqkegvrEOGb1hYjcCTkY6U8RARd+Vo8+/6BymI7FgQJf3MPV8QkN3iiPqvKvxAUSfaIUVbb5dXmG6Wiy6E9DgTyqHhh0pL8raRJnnsFnHPLoTwqsJE8e9PO+7tvf5TcUHEOMoOKSU6sNEd4qHTaIRvwNiDm9r420+W6w45tGdENKq35sXMVBednMv89iODyDmohADW/m7xiN2J3VsBgPoTPOpFqTquM1Y/Sdl6E4IY8dfDowYKLVdXm28JnHMW4cCDWbXH4iO2J1UEPpJ6ExrUaiBzAgT3anMcqAsj03OrM5EoPQQpMk45u1B4QYwM0x0Jx2EewE60z4UsHOzw0R3KrMQKAtjcGlFZyJQdhGkhTjm7UdBO7UqTHQnewjxYnSmZ1DYDq0ME93JDsK7werOxEXMY22csXLMi9qddgSK0G6yI0wc955DkDay0pkio+Cd2BUmulPZikAR0s12diYuLlyzeMyjO9l6LVTaHSaOe+sRpIdY7EyREQRhT4SJ7rQOYXwQnckeAiHqqTDRncp6AkUIH/ZkZyJQcIVjnl0tnYauZMDTYaI7ldWsD0Ey4ukwAW5YCBPdqay0PnQlQyyEKSUCBQeshAllV5sNXckYS2GiO5URHuMshQn1CJZB1sJEdyo7EkEyy1qYUqJYIMpimGpF7U4wymqYOO5BjtUwAXIsh4nuBCmWw5QSH0ZAiPUw1aI74XEKYeK4BwkKYQIkqISJ7gTzVMIEmKcUJroTTFMKU0oECoaphQkwSzFMdCeYpBgmwCTVMNGdYI5qmFIiUDBGOUyAKephojvBDPUwpcSPacAID2GqRXfCUl7CxHEPj/MSJuBxnsJEd8KjPIUJeJS3MNGd9mId33gLU0p8VI6HeAxTLXbVMazfSeQwpURB9GLdLngNE0c9bOc1TC3YZduwXhmECZiEMH1jt63DOhUQpv8oFAwhTKjFZnODMP1GwVxjXSoQJmASwvSJXfg31qMSYbpGAaEZYUIJm0oDwpRHIaEJYUIOm0kjwlQWtaCiznsIYbpHYaEKYcIZm0cnwlSHAsMtwoR3bBoDCFM974XmfX7LESZgEsLUxuvu7XVeWxGmdhQeLhEmsDlMQpj6UID4QJhiY1OYiDD1Uy9E9fGbQ5jGUJD4QZhiYhNYgDCNozCRUiJMERH+RQjTHBQoCNNECoFSGKMswhQHQVqMMM1FwQZGmGIg5BsQpvko3KAI0xqWAmVpLK4RJt8I0kaEaR0KORjC5Bdh3owwrUVBfwuxDl7DZOniPTEWS/MPw2uYYI/7gHsMk8WLtnNMFucfgrcwRS8k6/O3Pr4hnsJk/UJZHx8GeQpTdCphVRlnMy9hUrlAKuNEBy9hUrIiUGohVRtvFQ9hcnlhGqjOX3XcWephUr0gquNGgXKYKEj9NVAf/y/KYVLnqpCgGyYvhTgyD9bAGMUwuVl8+KIYJm96NgdvG4qL+aiFycWiD2INjFIKk+ci8jy3WvJroBQm72qKSb7gbkjPTyVM0ouMGBTCFClIpblGWQfZeSqECZBgPUyyu9SAqzlHWwfJ+VoOk+SCLsA6iLAcpsgIkOAaWA2T3EIu8JVYB6n5/01iA0Y4MvVptTMBcggTMAlhAiYhTMAkhAmYhDABkxAmYBLCBExCmIBJCBMwCWECJiFMwCSECZiEMAGTECZgEsIETEKYgEn+Pj2AAcfb/88/jXmkT18X9139FOfo/auV5na+Pze+o3DfKk+v23LKYUrps4i+MvfVPu+uyM73n5979do1X6t575eW98u919X7vT/27rVr5t1y2wWOeZ+udv7X188F8F54V7dzah9X8zqlr9WEqKRljOfHHm//Xq2bO+qdqXSxW4+Br8cdN8+9c965z++7upDOc8sdAV+3c+Op7datjy11S2nqYer93dylAjvfVyqQu1DePWdFuGqOjy0dp6WL5o6Iva8nRT1MJaWQ3D0nd3y6+74i9/jXa98Vdc+Ya418r9YbqPNtt0FKKaV/pqf1odAMmIwAAAAASUVORK5CYII=";

/* ============================================================================
   MOCK DATA LAYER
   Structured so a real backend/API can be swapped in later without touching
   UI components. Every component reads from these shapes only.
============================================================================ */

const EXERCISE_LIBRARY = {
  "bench-press": {
    id: "bench-press",
    name: "Bench Press",
    equipment: "Barbell",
    primaryMuscles: ["Chest"],
    secondaryMuscles: ["Triceps", "Shoulders"],
    category: "Chest",
    difficulty: "Intermediate",
    videoUrl: null,
    instructions: [
      "Lie flat on the bench with eyes under the bar.",
      "Grip slightly wider than shoulder width.",
      "Lower the bar to mid-chest with control.",
      "Press up until arms are fully extended.",
    ],
    formCues: ["Keep shoulder blades pinched", "Feet flat on the floor", "Slight arch, don't bounce the bar"],
    commonMistakes: ["Flaring elbows to 90°", "Bouncing off the chest", "Lifting hips off the bench"],
    alternatives: ["dumbbell-bench-press", "incline-bench-press", "push-up"],
  },
  "incline-dumbbell-press": {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    equipment: "Dumbbell",
    primaryMuscles: ["Chest"],
    secondaryMuscles: ["Shoulders", "Triceps"],
    category: "Chest",
    difficulty: "Intermediate",
    videoUrl: null,
    instructions: ["Set bench to 30-45°.", "Press dumbbells up and slightly in.", "Lower under control to chest level."],
    formCues: ["Don't flare wrists back", "Control the negative"],
    commonMistakes: ["Bench angle too steep", "Uneven arm paths"],
    alternatives: ["bench-press", "cable-fly"],
  },
  "cable-fly": {
    id: "cable-fly",
    name: "Cable Fly",
    equipment: "Cable",
    primaryMuscles: ["Chest"],
    secondaryMuscles: [],
    category: "Chest",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Set cables at chest height.", "Step forward, slight bend in elbows.", "Squeeze hands together in an arc."],
    formCues: ["Lead with the chest, not the hands"],
    commonMistakes: ["Using shoulders instead of chest", "Too much weight causing shrugging"],
    alternatives: ["incline-dumbbell-press"],
  },
  "lat-pulldown": {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    equipment: "Cable",
    primaryMuscles: ["Back"],
    secondaryMuscles: ["Biceps"],
    category: "Back",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Grip slightly wider than shoulders.", "Pull bar to upper chest.", "Control the return to full stretch."],
    formCues: ["Drive elbows down, not back"],
    commonMistakes: ["Leaning back excessively", "Using momentum"],
    alternatives: ["pull-up", "seated-row"],
  },
  "seated-row": {
    id: "seated-row",
    name: "Seated Cable Row",
    equipment: "Cable",
    primaryMuscles: ["Back"],
    secondaryMuscles: ["Biceps"],
    category: "Back",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Sit tall, slight lean forward at the hip.", "Pull handle to lower ribs.", "Squeeze shoulder blades together."],
    formCues: ["Chest up throughout"],
    commonMistakes: ["Rounding the back", "Yanking with momentum"],
    alternatives: ["lat-pulldown"],
  },
  "overhead-press": {
    id: "overhead-press",
    name: "Overhead Press",
    equipment: "Barbell",
    primaryMuscles: ["Shoulders"],
    secondaryMuscles: ["Triceps"],
    category: "Shoulders",
    difficulty: "Intermediate",
    videoUrl: null,
    instructions: ["Bar at collarbone, grip just outside shoulders.", "Press overhead, head through at the top.", "Lower with control."],
    formCues: ["Brace core, squeeze glutes"],
    commonMistakes: ["Excessive lower back arch", "Pressing forward instead of up"],
    alternatives: ["dumbbell-shoulder-press", "lateral-raise"],
  },
  "lateral-raise": {
    id: "lateral-raise",
    name: "Lateral Raise",
    equipment: "Dumbbell",
    primaryMuscles: ["Shoulders"],
    secondaryMuscles: [],
    category: "Shoulders",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Slight bend in elbows.", "Raise arms to shoulder height.", "Lower with control."],
    formCues: ["Lead with elbows, not hands"],
    commonMistakes: ["Using momentum/swinging", "Shrugging shoulders up"],
    alternatives: ["cable-lateral-raise"],
  },
  "bicep-curl": {
    id: "bicep-curl",
    name: "Barbell Bicep Curl",
    equipment: "Barbell",
    primaryMuscles: ["Biceps"],
    secondaryMuscles: [],
    category: "Biceps",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Stand tall, elbows at sides.", "Curl bar up without swinging.", "Lower fully under control."],
    formCues: ["Keep elbows pinned"],
    commonMistakes: ["Swinging the torso", "Partial range of motion"],
    alternatives: ["dumbbell-curl", "hammer-curl"],
  },
  "tricep-pushdown": {
    id: "tricep-pushdown",
    name: "Tricep Pushdown",
    equipment: "Cable",
    primaryMuscles: ["Triceps"],
    secondaryMuscles: [],
    category: "Triceps",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Elbows pinned to sides.", "Extend down fully.", "Control the return."],
    formCues: ["Don't let elbows drift forward"],
    commonMistakes: ["Using body weight to push", "Elbows flaring out"],
    alternatives: ["skull-crusher"],
  },
  squat: {
    id: "squat",
    name: "Barbell Back Squat",
    equipment: "Barbell",
    primaryMuscles: ["Quads", "Glutes"],
    secondaryMuscles: ["Core"],
    category: "Legs",
    difficulty: "Advanced",
    videoUrl: null,
    instructions: ["Bar on upper traps.", "Break at hips and knees together.", "Descend to depth, drive up."],
    formCues: ["Knees track over toes", "Chest up"],
    commonMistakes: ["Knees caving in", "Heels rising off floor"],
    alternatives: ["leg-press", "front-squat"],
  },
  "romanian-deadlift": {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    equipment: "Barbell",
    primaryMuscles: ["Hamstrings", "Glutes"],
    secondaryMuscles: ["Back"],
    category: "Legs",
    difficulty: "Intermediate",
    videoUrl: null,
    instructions: ["Soft knees, hinge at hips.", "Bar stays close to legs.", "Drive hips forward to stand."],
    formCues: ["Feel the hamstring stretch, not the low back"],
    commonMistakes: ["Rounding the spine", "Bending knees too much"],
    alternatives: ["good-morning"],
  },
  "leg-press": {
    id: "leg-press",
    name: "Leg Press",
    equipment: "Machine",
    primaryMuscles: ["Quads", "Glutes"],
    secondaryMuscles: [],
    category: "Legs",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Feet shoulder width on platform.", "Lower until knees at ~90°.", "Press through heels."],
    formCues: ["Don't let lower back round off the pad"],
    commonMistakes: ["Locking knees hard at top", "Too shallow range"],
    alternatives: ["squat"],
  },
  plank: {
    id: "plank",
    name: "Plank",
    equipment: "Bodyweight",
    primaryMuscles: ["Core"],
    secondaryMuscles: [],
    category: "Core",
    difficulty: "Beginner",
    videoUrl: null,
    instructions: ["Forearms on floor, body in a straight line.", "Brace core, don't let hips sag."],
    formCues: ["Squeeze glutes to protect the lower back"],
    commonMistakes: ["Hips sagging", "Holding breath"],
    alternatives: ["dead-bug"],
  },
};

const TODAY_WORKOUT = {
  id: "w-today",
  name: "Upper Body Strength",
  estMinutes: 58,
  difficulty: "Intermediate",
  muscleGroups: ["Chest", "Back", "Shoulders", "Arms"],
  exercises: [
    { exerciseId: "bench-press", targetSets: 4, targetReps: 8, targetWeight: 80, previous: { reps: 8, weight: 77.5 } },
    { exerciseId: "incline-dumbbell-press", targetSets: 3, targetReps: 10, targetWeight: 28, previous: { reps: 10, weight: 26 } },
    { exerciseId: "cable-fly", targetSets: 3, targetReps: 12, targetWeight: 18, previous: { reps: 12, weight: 18 } },
    { exerciseId: "lat-pulldown", targetSets: 4, targetReps: 10, targetWeight: 62, previous: { reps: 10, weight: 60 } },
    { exerciseId: "seated-row", targetSets: 3, targetReps: 10, targetWeight: 55, previous: { reps: 10, weight: 55 } },
    { exerciseId: "overhead-press", targetSets: 3, targetReps: 8, targetWeight: 42, previous: { reps: 8, weight: 40 } },
    { exerciseId: "lateral-raise", targetSets: 3, targetReps: 15, targetWeight: 10, previous: { reps: 15, weight: 10 } },
    { exerciseId: "bicep-curl", targetSets: 3, targetReps: 10, targetWeight: 30, previous: { reps: 10, weight: 30 } },
  ],
};

const WEEKLY_SCHEDULE = [
  { day: "MON", status: "done", label: "Push Day" },
  { day: "TUE", status: "done", label: "Pull Day" },
  { day: "WED", status: "rest", label: "Rest Day" },
  { day: "THU", status: "today", label: "Upper Body Strength" },
  { day: "FRI", status: "upcoming", label: "Leg Day" },
  { day: "SAT", status: "upcoming", label: "Conditioning" },
  { day: "SUN", status: "rest", label: "Rest Day" },
];

const GOALS = [
  { id: "g1", label: "Bench 100kg", current: 82.5, target: 100, unit: "kg" },
  { id: "g2", label: "Lose 5kg", current: 2.4, target: 5, unit: "kg" },
  { id: "g3", label: "Train 4× this week", current: 2, target: 4, unit: "sessions" },
  { id: "g4", label: "Hit 160g protein daily", current: 112, target: 160, unit: "g" },
];

const RECOVERY = { score: 82, status: "Ready to train", sleep: "8h 12m", hrv: "Normal", restingHr: 58 };
const ACTIVITY = { steps: 8421, stepGoal: 10000, activeCalories: 412, distanceKm: 5.8, activeMinutes: 47 };

const NUTRITION_TARGETS = { calories: 2200, protein: 160, carbs: 240, fat: 70, water: 3.0 };
const INITIAL_NUTRITION = {
  calories: 1420,
  protein: 112,
  carbs: 145,
  fat: 48,
  water: 1.8,
  meals: {
    Breakfast: [{ id: "f1", name: "Greek Yogurt Bowl", cals: 320, protein: 28, carbs: 32, fat: 8 }],
    Lunch: [{ id: "f2", name: "Chicken & Rice", cals: 560, protein: 48, carbs: 62, fat: 12 }],
    Dinner: [],
    Snacks: [{ id: "f3", name: "Protein Shake", cals: 220, protein: 36, carbs: 8, fat: 3 }],
    "Pre-workout": [],
    "Post-workout": [{ id: "f4", name: "Banana", cals: 105, protein: 1, carbs: 27, fat: 0 }],
  },
};

const FOOD_DATABASE = [
  { id: "d1", name: "Chicken Breast (150g)", cals: 248, protein: 46, carbs: 0, fat: 5 },
  { id: "d2", name: "White Rice (1 cup)", cals: 205, protein: 4, carbs: 45, fat: 0 },
  { id: "d3", name: "Eggs (2 large)", cals: 156, protein: 12, carbs: 1, fat: 11 },
  { id: "d4", name: "Oatmeal (1 cup)", cals: 158, protein: 6, carbs: 27, fat: 3 },
  { id: "d5", name: "Salmon Fillet (150g)", cals: 280, protein: 39, carbs: 0, fat: 13 },
  { id: "d6", name: "Protein Shake", cals: 220, protein: 36, carbs: 8, fat: 3 },
  { id: "d7", name: "Avocado (half)", cals: 120, protein: 1, carbs: 6, fat: 11 },
  { id: "d8", name: "Sweet Potato (medium)", cals: 112, protein: 2, carbs: 26, fat: 0 },
];

const WEIGHT_HISTORY = [
  { date: "Jul 5", weight: 84.2 }, { date: "Jul 12", weight: 83.9 }, { date: "Jul 19", weight: 83.5 },
  { date: "Jul 26", weight: 83.1 }, { date: "Aug 2", weight: 82.8 }, { date: "Aug 9", weight: 82.6 },
  { date: "Aug 16", weight: 82.0 }, { date: "Aug 23", weight: 81.9 }, { date: "Aug 30", weight: 81.8 },
];

const BENCH_HISTORY = [
  { date: "Jun", e1rm: 92 }, { date: "Jul", e1rm: 96 }, { date: "Aug", e1rm: 101 }, { date: "Sep", e1rm: 103 },
];

const VOLUME_HISTORY = [
  { week: "W1", volume: 18200 }, { week: "W2", volume: 19100 }, { week: "W3", volume: 17800 },
  { week: "W4", volume: 20400 }, { week: "W5", volume: 21200 }, { week: "W6", volume: 22600 },
];

const ACHIEVEMENTS = [
  { id: "a1", label: "12-day streak", icon: "🔥" },
  { id: "a2", label: "50 workouts completed", icon: "🏆" },
  { id: "a3", label: "New bench PR", icon: "💪" },
  { id: "a4", label: "30-day nutrition log", icon: "🥗" },
];

const USER = {
  name: "Alex",
  fitnessLevel: "Intermediate",
  streak: 12,
  totalWorkouts: 214,
};

const COACH_SUGGESTIONS = [
  "What should I train today?",
  "I only have 30 minutes.",
  "How much protein do I have left?",
  "Should I increase my bench weight?",
];

function coachReply(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes("30 minutes") || p.includes("short"))
    return "With 30 minutes, let's hit a condensed version of today's Upper Body session: Bench Press, Lat Pulldown, and Lateral Raises — 3 sets each, 60-second rests. Want me to swap your plan for today?";
  if (p.includes("protein"))
    return `You've had ${INITIAL_NUTRITION.protein}g of your ${NUTRITION_TARGETS.protein}g target — that leaves ${NUTRITION_TARGETS.protein - INITIAL_NUTRITION.protein}g. A chicken breast and a scoop of whey would close most of that gap.`;
  if (p.includes("bench"))
    return "Your bench e1RM has climbed from 92kg to 103kg over the last 3 months. You're recovering well — try 82.5kg × 8 today and see how bar speed feels before pushing further.";
  if (p.includes("today") || p.includes("train"))
    return "Today's plan is Upper Body Strength — 8 exercises, about 58 minutes, hitting chest, back, shoulders and arms. Your recovery score is 82%, so you're clear to push intensity.";
  if (p.includes("shoulder") && p.includes("hurt"))
    return "Sorry to hear that. For pressing work, try swapping Overhead Press for a neutral-grip Landmine Press — it's easier on the front of the shoulder. Want me to update today's workout?";
  if (p.includes("progress"))
    return "Your weekly volume has trended up for 4 of the last 6 weeks and body weight is down 2.4kg over 8 weeks — that's steady progress. Recovery has dipped slightly on Thursdays, so consider an extra rest day around there.";
  return "Here's a mocked coach response — once connected to a live model, I'll tailor this to your actual training history, recovery, and goals.";
}

/* ============================================================================
   SMALL PRIMITIVES
============================================================================ */

// Renders full-screen overlays (workout session, summary, sheets) directly on
// document.body via a portal. This guarantees `fixed inset-0` covers the true
// viewport instead of being clipped/misaligned by an ancestor's scroll context.
function FullScreenOverlay({ children }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function ProgressBar({ value, max, color = ACCENT, height = 8 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full rounded-full bg-white/10" style={{ height }}>
      <div
        className="rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, height, backgroundColor: color }}
      />
    </div>
  );
}

function Ring({ value, max, color = ACCENT, size = 64, stroke = 7, children }) {
  const pct = Math.min(1, value / max);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - c * pct}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Card({ children, className = "", onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#17181B] rounded-3xl p-5 border border-white/5 ${onClick ? "active:scale-[0.98] cursor-pointer" : ""} transition-transform ${className}`}
    >
      {children}
    </div>
  );
}

function Pill({ children, tone = "default" }) {
  const tones = {
    default: "bg-white/8 text-white/70",
    accent: "bg-[#FF5A1F]/15 text-[#FF5A1F]",
    success: "bg-[#33C27F]/15 text-[#33C27F]",
    gold: "bg-[#F2B84B]/15 text-[#F2B84B]",
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tones[tone]}`}>{children}</span>;
}

function Toast({ message, show }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="bg-white text-black text-sm font-medium px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
        <Check size={16} strokeWidth={3} />
        {message}
      </div>
    </div>,
    document.body
  );
}

function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[70] flex items-end justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-md bg-[#141518] rounded-t-3xl max-h-[85vh] overflow-y-auto animate-[slideUp_0.25s_ease-out]">
          <div className="sticky top-0 bg-[#141518] pt-3 pb-2 px-5 border-b border-white/5 flex items-center justify-between">
            <div className="w-10" />
            <div className="w-10 h-1 rounded-full bg-white/20 absolute left-1/2 -translate-x-1/2 top-2" />
            <span className="font-semibold text-white">{title}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10">
              <X size={16} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   HOME SCREEN
============================================================================ */

function BrandBar() {
  return (
    <div className="flex items-center justify-center gap-2 pt-3 pb-1">
      <img src={LOGO_WHITE} alt="M Personal Training" className="h-5 w-auto opacity-90" />
      <span className="text-white/40 text-[10px] font-semibold tracking-[0.2em]">PERSONAL TRAINING</span>
    </div>
  );
}

function Header({ user }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex items-center justify-between px-5 pt-6 pb-2">
      <div>
        <p className="text-white text-xl font-semibold">
          {greeting}, {user.name} 💪🏼
        </p>
        <p className="text-white/40 text-sm mt-0.5">{dateStr}</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center relative">
          <Bell size={18} className="text-white/80" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-[#FF5A1F]" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#F2B84B] flex items-center justify-center text-sm font-bold">
          {user.name[0]}
        </div>
      </div>
    </div>
  );
}

function TodayWorkoutCard({ workout, workoutState, onStart, onView }) {
  const completedSets = workoutState.log ? Object.values(workoutState.log).flat().filter((s) => s.completed).length : 0;
  const totalSets = workout.exercises.reduce((a, e) => a + e.targetSets, 0);
  const started = workoutState.status !== "not-started";
  const done = workoutState.status === "completed";

  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-3">
        <Pill tone="accent">TODAY'S WORKOUT</Pill>
        {done && <Pill tone="success">Completed</Pill>}
      </div>
      <h2 className="text-white text-2xl font-bold">{workout.name}</h2>
      <p className="text-white/50 text-sm mt-1">
        {workout.estMinutes} min · {workout.exercises.length} exercises
      </p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {workout.muscleGroups.map((m) => (
          <Pill key={m}>{m}</Pill>
        ))}
      </div>

      {started && !done && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>Progress</span>
            <span>
              {completedSets}/{totalSets} sets
            </span>
          </div>
          <ProgressBar value={completedSets} max={totalSets} />
        </div>
      )}

      <button
        onClick={onStart}
        className="w-full mt-5 bg-[#FF5A1F] text-white font-bold py-4 rounded-2xl text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Play size={18} fill="white" />
        {done ? "WORKOUT COMPLETE" : started ? "RESUME WORKOUT" : "START WORKOUT"}
      </button>
      <div className="flex gap-2 mt-2.5">
        <button onClick={onView} className="flex-1 text-white/60 text-sm font-medium py-2.5 rounded-xl bg-white/5">
          View workout
        </button>
        <button className="flex-1 text-white/60 text-sm font-medium py-2.5 rounded-xl bg-white/5">Swap</button>
      </div>
    </Card>
  );
}

function NutritionSummaryCard({ nutrition, targets, onLogFood, onLogWater }) {
  const items = [
    { label: "CALORIES", value: nutrition.calories, target: targets.calories, unit: "", color: ACCENT },
    { label: "PROTEIN", value: nutrition.protein, target: targets.protein, unit: "g", color: "#4C9EFF" },
    { label: "CARBS", value: nutrition.carbs, target: targets.carbs, unit: "g", color: GOLD },
    { label: "FAT", value: nutrition.fat, target: targets.fat, unit: "g", color: "#C084FC" },
  ];
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Nutrition Today</h3>
        <Utensils size={16} className="text-white/30" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/40 tracking-wide">{it.label}</span>
            </div>
            <p className="text-white text-sm font-semibold mb-1.5">
              {it.value}
              {it.unit} <span className="text-white/30 font-normal">/ {it.target}{it.unit}</span>
            </p>
            <ProgressBar value={it.value} max={it.target} color={it.color} height={6} />
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
        <Droplet size={16} className="text-[#4C9EFF]" />
        <span className="text-white/70 text-sm flex-1">
          Water: <span className="font-semibold text-white">{nutrition.water}L</span> / {targets.water}L
        </span>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onLogFood} className="flex-1 bg-white/8 text-white text-sm font-semibold py-3 rounded-xl">
          + LOG FOOD
        </button>
        <button onClick={onLogWater} className="flex-1 bg-white/8 text-white text-sm font-semibold py-3 rounded-xl">
          + LOG WATER
        </button>
      </div>
    </Card>
  );
}

function RecoveryCard({ recovery }) {
  const color = recovery.score >= 70 ? SUCCESS : recovery.score >= 40 ? GOLD : "#FF5A5A";
  return (
    <Card className="mx-5">
      <div className="flex items-center gap-4">
        <Ring value={recovery.score} max={100} color={color} size={64}>
          <span className="text-white font-bold text-lg">{recovery.score}%</span>
        </Ring>
        <div className="flex-1">
          <p className="text-white/40 text-xs tracking-wide">RECOVERY</p>
          <p className="text-white font-semibold">{recovery.status}</p>
          <div className="flex gap-3 mt-1.5 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Moon size={12} /> {recovery.sleep}
            </span>
            <span className="flex items-center gap-1">
              <Heart size={12} /> {recovery.restingHr} bpm
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActivityCard({ activity }) {
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white/40 text-xs tracking-wide">TODAY'S ACTIVITY</p>
        <Footprints size={16} className="text-white/30" />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-white text-2xl font-bold">{activity.steps.toLocaleString()}</p>
          <p className="text-white/40 text-xs">of {activity.stepGoal.toLocaleString()} steps</p>
        </div>
        <div className="text-right">
          <p className="text-white text-sm font-semibold">{activity.activeCalories} kcal</p>
          <p className="text-white/40 text-xs">{activity.distanceKm} km</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar value={activity.steps} max={activity.stepGoal} color="#4C9EFF" height={6} />
      </div>
    </Card>
  );
}

function GoalsCard({ goals }) {
  return (
    <Card className="mx-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Goals</h3>
        <Target size={16} className="text-white/30" />
      </div>
      <div className="space-y-4">
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-white/70">{g.label}</span>
              <span className="text-white/40">
                {g.current}/{g.target}
                {g.unit === "kg" || g.unit === "g" ? g.unit : ""}
              </span>
            </div>
            <ProgressBar value={g.current} max={g.target} color={GOLD} height={6} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function WeeklyScheduleCard({ schedule, onSelectDay }) {
  const icon = { done: "✓", today: "●", upcoming: "○", rest: "—" };
  const color = { done: SUCCESS, today: ACCENT, upcoming: "rgba(255,255,255,0.3)", rest: "rgba(255,255,255,0.2)" };
  return (
    <Card className="mx-5">
      <h3 className="text-white font-semibold mb-4">This Week</h3>
      <div className="flex justify-between">
        {schedule.map((d) => (
          <button key={d.day} onClick={() => onSelectDay(d)} className="flex flex-col items-center gap-2">
            <span className="text-white/30 text-[10px] font-medium">{d.day}</span>
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: d.status === "today" ? color[d.status] : "rgba(255,255,255,0.06)",
                color: d.status === "today" ? "#fff" : color[d.status],
              }}
            >
              {icon[d.status]}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function HomeScreen({ workout, workoutState, onStartWorkout, onViewWorkout, nutrition, onLogFood, onLogWater, onSelectDay }) {
  return (
    <div className="pb-6 space-y-4">
      <Header user={USER} />
      <TodayWorkoutCard workout={workout} workoutState={workoutState} onStart={onStartWorkout} onView={onViewWorkout} />
      <NutritionSummaryCard nutrition={nutrition} targets={NUTRITION_TARGETS} onLogFood={onLogFood} onLogWater={onLogWater} />
      <div className="grid grid-cols-2 gap-4 px-5">
        <RecoveryCardCompact recovery={RECOVERY} />
        <ActivityCardCompact activity={ACTIVITY} />
      </div>
      <GoalsCard goals={GOALS} />
      <WeeklyScheduleCard schedule={WEEKLY_SCHEDULE} onSelectDay={onSelectDay} />
    </div>
  );
}

function RecoveryCardCompact({ recovery }) {
  const color = recovery.score >= 70 ? SUCCESS : recovery.score >= 40 ? GOLD : "#FF5A5A";
  return (
    <Card>
      <Ring value={recovery.score} max={100} color={color} size={48} stroke={5}>
        <span className="text-white font-bold text-sm">{recovery.score}%</span>
      </Ring>
      <p className="text-white/40 text-[11px] tracking-wide mt-3">RECOVERY</p>
      <p className="text-white text-sm font-semibold">{recovery.status}</p>
    </Card>
  );
}

function ActivityCardCompact({ activity }) {
  return (
    <Card>
      <Footprints size={22} className="text-[#4C9EFF]" />
      <p className="text-white/40 text-[11px] tracking-wide mt-3">STEPS</p>
      <p className="text-white text-lg font-bold">{activity.steps.toLocaleString()}</p>
      <p className="text-white/30 text-[11px]">{activity.activeCalories} kcal</p>
    </Card>
  );
}

/* ============================================================================
   WORKOUT SESSION FLOW
============================================================================ */

function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function WorkoutSession({ workout, session, setSession, onFinish, onExit }) {
  const exIndex = session.currentExerciseIndex;
  const exMeta = workout.exercises[exIndex];
  const exercise = EXERCISE_LIBRARY[exMeta.exerciseId];
  const log = session.log[exMeta.exerciseId] || [];
  const currentSetNum = log.filter((s) => s.completed).length + 1;
  const isLastSetOfExercise = currentSetNum > exMeta.targetSets;

  const [weight, setWeight] = useState(exMeta.targetWeight);
  const [reps, setReps] = useState(exMeta.targetReps);
  const [rpe, setRpe] = useState(8);
  const [resting, setResting] = useState(false);
  const [restTime, setRestTime] = useState(90);
  const [restTotal, setRestTotal] = useState(90);
  const [prToast, setPrToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    setWeight(exMeta.targetWeight);
    setReps(exMeta.targetReps);
  }, [exIndex]);

  useEffect(() => {
    if (resting && restTime > 0) {
      timerRef.current = setTimeout(() => setRestTime((t) => t - 1), 1000);
    } else if (resting && restTime === 0) {
      setResting(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [resting, restTime]);

  function completeSet() {
    const e1rm = estimate1RM(weight, reps);
    const prevBestE1rm = estimate1RM(exMeta.previous.weight, exMeta.previous.reps);
    const isWeightPR = weight > exMeta.previous.weight;
    const isE1rmPR = e1rm > prevBestE1rm;

    const newSet = { setNumber: currentSetNum, weight, reps, rpe, completed: true, isPR: isWeightPR || isE1rmPR };
    const newLog = { ...session.log, [exMeta.exerciseId]: [...log, newSet] };
    setSession({ ...session, log: newLog });

    if (isWeightPR || isE1rmPR) {
      setPrToast({ weight, reps, prevWeight: exMeta.previous.weight, prevReps: exMeta.previous.reps });
      setTimeout(() => setPrToast(null), 3200);
    }

    if (currentSetNum < exMeta.targetSets) {
      setRestTime(90);
      setRestTotal(90);
      setResting(true);
    }
  }

  function nextExercise() {
    if (exIndex < workout.exercises.length - 1) {
      setSession({ ...session, currentExerciseIndex: exIndex + 1 });
    } else {
      onFinish(session);
    }
  }

  function prevExercise() {
    if (exIndex > 0) setSession({ ...session, currentExerciseIndex: exIndex - 1 });
  }

  if (resting) {
    return (
      <FullScreenOverlay>
        <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col">
          <div className="flex items-center justify-between px-5 pt-6">
            <button onClick={() => setResting(false)} className="text-white/50 text-sm font-medium">
              End rest
            </button>
            <span className="text-white/40 text-sm font-medium">Rest</span>
            <button onClick={onExit} className="text-white/50">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <Ring value={restTotal - restTime} max={restTotal} color={ACCENT} size={220} stroke={10}>
              <div className="text-center">
                <p className="text-white text-5xl font-bold tabular-nums">
                  {Math.floor(restTime / 60)}:{String(restTime % 60).padStart(2, "0")}
                </p>
                <p className="text-white/40 text-sm mt-1">Next: Set {currentSetNum} of {exMeta.targetSets}</p>
              </div>
            </Ring>
          </div>
          <div className="flex gap-3 px-6 pb-10">
            <button
              onClick={() => {
                setRestTime((t) => t + 15);
                setRestTotal((t) => t + 15);
              }}
              className="flex-1 bg-white/8 text-white font-semibold py-4 rounded-2xl"
            >
              +15s
            </button>
            <button onClick={() => setResting(false)} className="flex-1 bg-[#FF5A1F] text-white font-bold py-4 rounded-2xl">
              SKIP REST
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    );
  }

  return (
    <FullScreenOverlay>
    <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2 sticky top-0 bg-[#0A0A0B] z-10">
        <button onClick={onExit} className="text-white/50">
          <ChevronDown size={22} />
        </button>
        <div className="flex-1 mx-4">
          <ProgressBar value={exIndex + 1} max={workout.exercises.length} color={ACCENT} height={5} />
        </div>
        <span className="text-white/40 text-xs font-medium">
          {exIndex + 1}/{workout.exercises.length}
        </span>
      </div>

      <div className="px-5 pt-4">
        <div className="w-full h-44 rounded-3xl bg-gradient-to-br from-white/10 to-white/[0.03] flex items-center justify-center border border-white/5">
          <Play size={36} className="text-white/30" />
        </div>

        <div className="flex items-center justify-between mt-4">
          <h2 className="text-white text-2xl font-bold">{exercise.name}</h2>
          <Pill>{exercise.equipment}</Pill>
        </div>
        <p className="text-white/40 text-sm mt-1">{exercise.primaryMuscles.join(" · ")}</p>

        <div className="flex gap-3 mt-4">
          <div className="flex-1 bg-white/5 rounded-2xl p-3">
            <p className="text-white/40 text-[11px] tracking-wide">SET</p>
            <p className="text-white font-bold text-lg">
              {Math.min(currentSetNum, exMeta.targetSets)} / {exMeta.targetSets}
            </p>
          </div>
          <div className="flex-1 bg-white/5 rounded-2xl p-3">
            <p className="text-white/40 text-[11px] tracking-wide">TARGET</p>
            <p className="text-white font-bold text-lg">
              {exMeta.targetReps} × {exMeta.targetWeight}kg
            </p>
          </div>
          <div className="flex-1 bg-white/5 rounded-2xl p-3">
            <p className="text-white/40 text-[11px] tracking-wide">PREVIOUS</p>
            <p className="text-white font-bold text-lg">
              {exMeta.previous.reps} × {exMeta.previous.weight}kg
            </p>
          </div>
        </div>

        {!isLastSetOfExercise ? (
          <div className="mt-6 bg-[#17181B] rounded-3xl p-5 border border-white/5">
            <p className="text-white/40 text-xs tracking-wide mb-4">LOG SET {currentSetNum}</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberStepper label="WEIGHT (KG)" value={weight} setValue={setWeight} step={2.5} />
              <NumberStepper label="REPS" value={reps} setValue={setReps} step={1} />
            </div>
            <div className="mt-4">
              <p className="text-white/40 text-xs tracking-wide mb-2">RPE</p>
              <div className="flex gap-2">
                {[6, 7, 8, 9, 10].map((v) => (
                  <button
                    key={v}
                    onClick={() => setRpe(v)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
                      rpe === v ? "bg-[#FF5A1F] text-white" : "bg-white/8 text-white/50"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={completeSet}
              className="w-full mt-5 bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Check size={18} strokeWidth={3} />
              COMPLETE SET
            </button>
          </div>
        ) : (
          <div className="mt-6 bg-[#17181B] rounded-3xl p-6 border border-white/5 text-center">
            <Check size={28} className="mx-auto text-[#33C27F] mb-2" />
            <p className="text-white font-semibold">Exercise complete</p>
            <p className="text-white/40 text-sm mt-1">All {exMeta.targetSets} sets logged</p>
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          {log.map((s) => (
            <div key={s.setNumber} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-2.5">
              <span className="text-white/40 text-sm">Set {s.setNumber}</span>
              <span className="text-white text-sm font-medium">
                {s.reps} reps × {s.weight}kg · RPE {s.rpe}
              </span>
              {s.isPR ? <Trophy size={14} style={{ color: GOLD }} /> : <Check size={14} className="text-[#33C27F]" />}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6 mb-8">
          <button
            onClick={prevExercise}
            disabled={exIndex === 0}
            className="flex-1 bg-white/8 text-white font-semibold py-3.5 rounded-2xl disabled:opacity-30 flex items-center justify-center gap-1"
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <button
            onClick={nextExercise}
            className="flex-1 bg-white/8 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-1"
          >
            {exIndex === workout.exercises.length - 1 ? "Finish workout" : "Next exercise"} <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {prToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-[88%] max-w-sm animate-[fadeIn_0.3s_ease-out]">
          <div className="bg-gradient-to-r from-[#F2B84B] to-[#FF5A1F] rounded-2xl p-4 shadow-2xl text-center">
            <p className="text-white font-bold text-sm tracking-wide">🔥 NEW PERSONAL RECORD</p>
            <p className="text-white text-lg font-bold mt-1">{exercise.name}</p>
            <p className="text-white/90 text-sm mt-0.5">
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

function NumberStepper({ label, value, setValue, step }) {
  return (
    <div>
      <p className="text-white/40 text-xs tracking-wide mb-2">{label}</p>
      <div className="flex items-center bg-white/5 rounded-xl">
        <button onClick={() => setValue(Math.max(0, value - step))} className="w-11 h-11 flex items-center justify-center text-white/60">
          <Minus size={16} />
        </button>
        <span className="flex-1 text-center text-white font-bold text-lg">{value}</span>
        <button onClick={() => setValue(value + step)} className="w-11 h-11 flex items-center justify-center text-white/60">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function WorkoutSummary({ workout, session, onDone }) {
  const allSets = Object.values(session.log).flat();
  const totalVolume = allSets.reduce((a, s) => a + s.weight * s.reps, 0);
  const totalSets = allSets.length;
  const prCount = allSets.filter((s) => s.isPR).length;
  const durationMin = 58;
  const calories = Math.round(totalVolume * 0.05 + durationMin * 4);

  return (
    <FullScreenOverlay>
    <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10">
      <img src={LOGO_WHITE} alt="M Personal Training" className="h-6 w-auto opacity-70 mb-6" />
      <div className="w-20 h-20 rounded-full bg-[#33C27F]/15 flex items-center justify-center mb-5">
        <Check size={36} className="text-[#33C27F]" strokeWidth={3} />
      </div>
      <p className="text-white/40 text-xs tracking-widest font-semibold">WORKOUT COMPLETE</p>
      <h2 className="text-white text-3xl font-bold mt-1">{workout.name}</h2>
      <p className="text-white text-4xl font-bold tabular-nums mt-6">{durationMin}:42</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-6">
        <div className="bg-[#17181B] rounded-2xl p-4">
          <p className="text-white text-xl font-bold">{totalSets}</p>
          <p className="text-white/40 text-xs mt-0.5">Sets completed</p>
        </div>
        <div className="bg-[#17181B] rounded-2xl p-4">
          <p className="text-white text-xl font-bold">{totalVolume.toLocaleString()} kg</p>
          <p className="text-white/40 text-xs mt-0.5">Total volume</p>
        </div>
        <div className="bg-[#17181B] rounded-2xl p-4">
          <p className="text-white text-xl font-bold">{calories}</p>
          <p className="text-white/40 text-xs mt-0.5">Calories burned</p>
        </div>
        <div className="bg-[#17181B] rounded-2xl p-4">
          <p className="text-xl font-bold" style={{ color: prCount ? GOLD : "white" }}>
            {prCount} new
          </p>
          <p className="text-white/40 text-xs mt-0.5">Personal records</p>
        </div>
      </div>

      <button onClick={onDone} className="w-full max-w-sm mt-8 bg-[#FF5A1F] text-white font-bold py-4 rounded-2xl">
        DONE
      </button>
      <button className="w-full max-w-sm mt-3 text-white/50 text-sm font-medium py-2">Share workout</button>
    </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   WORKOUTS TAB
============================================================================ */

function WorkoutsScreen({ workout, workoutState, onStart, history }) {
  const [tab, setTab] = useState("today");
  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-white text-2xl font-bold">Workouts</h1>
      </div>
      <div className="flex gap-2 px-5 mb-4 overflow-x-auto no-scrollbar">
        {["today", "history", "programs"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap ${
              tab === t ? "bg-white text-black" : "bg-white/8 text-white/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className="px-5 space-y-4">
          <TodayWorkoutCard workout={workout} workoutState={workoutState} onStart={onStart} onView={() => {}} />
          <Card>
            <h3 className="text-white font-semibold mb-3">Exercises</h3>
            <div className="space-y-2">
              {workout.exercises.map((e, i) => {
                const ex = EXERCISE_LIBRARY[e.exerciseId];
                return (
                  <div key={e.exerciseId} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="w-7 h-7 rounded-full bg-white/8 text-white/50 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{ex.name}</p>
                      <p className="text-white/40 text-xs">
                        {e.targetSets} sets × {e.targetReps} reps
                      </p>
                    </div>
                    <span className="text-white/30 text-xs">{ex.equipment}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <div className="px-5 space-y-3">
          {history.length === 0 && (
            <Card>
              <p className="text-white/40 text-sm text-center py-6">No completed workouts yet — finish today's session to see it here.</p>
            </Card>
          )}
          {history.map((h, i) => (
            <Card key={i}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">{h.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">{h.date} · {h.duration}</p>
                </div>
                <Pill tone="success">{h.volume.toLocaleString()} kg</Pill>
              </div>
            </Card>
          ))}
          {[
            { name: "Pull Day", date: "Tue, Sep 1", duration: "51 min", volume: 8420 },
            { name: "Push Day", date: "Mon, Aug 31", duration: "49 min", volume: 7180 },
            { name: "Leg Day", date: "Fri, Aug 28", duration: "62 min", volume: 11200 },
          ].map((h, i) => (
            <Card key={`m${i}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">{h.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {h.date} · {h.duration}
                  </p>
                </div>
                <Pill>{h.volume.toLocaleString()} kg</Pill>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "programs" && (
        <div className="px-5 space-y-3">
          {[
            { name: "Push / Pull / Legs", weeks: 8, level: "Intermediate" },
            { name: "Upper / Lower Split", weeks: 6, level: "Beginner" },
            { name: "5-Day Bodybuilding", weeks: 12, level: "Advanced" },
          ].map((p) => (
            <Card key={p.name} onClick={() => {}}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">{p.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {p.weeks} weeks · {p.level}
                  </p>
                </div>
                <ChevronRight size={18} className="text-white/30" />
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

function NutritionScreen({ nutrition, onAddFood, onAddWater }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState("Breakfast");
  const [waterSheetOpen, setWaterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  const mealCategories = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-workout", "Post-workout"];
  const filteredFoods = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Nutrition</h1>
        <Search size={20} className="text-white/40" />
      </div>

      <div className="px-5 mt-3">
        <Card>
          <p className="text-white/40 text-xs tracking-wide mb-1">CALORIE TARGET</p>
          <div className="flex items-baseline gap-2">
            <span className="text-white text-3xl font-bold">{NUTRITION_TARGETS.calories - nutrition.calories}</span>
            <span className="text-white/40 text-sm">remaining of {NUTRITION_TARGETS.calories}</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={nutrition.calories} max={NUTRITION_TARGETS.calories} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { l: "Protein", v: nutrition.protein, t: NUTRITION_TARGETS.protein, c: "#4C9EFF" },
              { l: "Carbs", v: nutrition.carbs, t: NUTRITION_TARGETS.carbs, c: GOLD },
              { l: "Fat", v: nutrition.fat, t: NUTRITION_TARGETS.fat, c: "#C084FC" },
            ].map((m) => (
              <div key={m.l} className="text-center">
                <Ring value={m.v} max={m.t} color={m.c} size={56} stroke={5}>
                  <span className="text-white text-xs font-bold">
                    {m.v}/{m.t}
                  </span>
                </Ring>
                <p className="text-white/40 text-xs mt-1.5">{m.l}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="text-white font-semibold flex items-center gap-2">
              <Droplet size={16} className="text-[#4C9EFF]" /> Water
            </p>
            <span className="text-white/50 text-sm">
              {nutrition.water}L / {NUTRITION_TARGETS.water}L
            </span>
          </div>
          <ProgressBar value={nutrition.water} max={NUTRITION_TARGETS.water} color="#4C9EFF" height={6} />
          <div className="flex gap-2 mt-3">
            <button onClick={() => onAddWater(0.25)} className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl">
              +250ml
            </button>
            <button onClick={() => onAddWater(0.5)} className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl">
              +500ml
            </button>
            <button onClick={() => setWaterSheetOpen(true)} className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl">
              Custom
            </button>
          </div>
        </Card>
      </div>

      <div className="px-5 mt-5 space-y-3">
        {mealCategories.map((meal) => {
          const items = nutrition.meals[meal] || [];
          const totalCals = items.reduce((a, f) => a + f.cals, 0);
          return (
            <Card key={meal}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-semibold">{meal}</p>
                <span className="text-white/40 text-xs">{totalCals} kcal</span>
              </div>
              {items.length === 0 ? (
                <p className="text-white/30 text-sm py-1">No items logged</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {items.map((f) => (
                    <div key={f.id} className="flex justify-between text-sm">
                      <span className="text-white/70">{f.name}</span>
                      <span className="text-white/40">{f.cals} kcal</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setActiveMeal(meal);
                  setSheetOpen(true);
                }}
                className="w-full mt-1 bg-white/5 text-white/70 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Add food
              </button>
            </Card>
          );
        })}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Add to ${activeMeal}`}>
        <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5 mb-3">
          <Search size={16} className="text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30"
          />
        </div>
        <div className="flex gap-2 mb-4">
          <button className="flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/40 text-xs">
            <ScanLine size={18} />
            Scan barcode
          </button>
          <button className="flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/40 text-xs">
            <Camera size={18} />
            Photo
          </button>
          <button className="flex-1 flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 text-white/40 text-xs">
            <Star size={18} />
            Favorites
          </button>
        </div>
        <p className="text-white/30 text-xs mb-2 tracking-wide">SEARCH RESULTS</p>
        <div className="space-y-1">
          {filteredFoods.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                onAddFood(activeMeal, f);
                setSheetOpen(false);
              }}
              className="w-full flex items-center justify-between py-3 border-b border-white/5 last:border-0"
            >
              <div className="text-left">
                <p className="text-white text-sm font-medium">{f.name}</p>
                <p className="text-white/40 text-xs">
                  P{f.protein} · C{f.carbs} · F{f.fat}
                </p>
              </div>
              <span className="text-white/50 text-sm">{f.cals} kcal</span>
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
              className="bg-white/8 rounded-xl py-4 text-white font-semibold"
            >
              {v * 1000}ml
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

/* ============================================================================
   PROGRESS TAB
============================================================================ */

function ChartCard({ title, subtitle, children }) {
  return (
    <Card>
      <p className="text-white font-semibold">{title}</p>
      {subtitle && <p className="text-white/40 text-xs mt-0.5">{subtitle}</p>}
      <div className="h-40 mt-3 -ml-4">{children}</div>
    </Card>
  );
}

const axisStyle = { fontSize: 11, fill: "rgba(255,255,255,0.35)" };

function ProgressScreen() {
  const [range, setRange] = useState("30D");
  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Progress</h1>
        <BarChart3 size={20} className="text-white/40" />
      </div>
      <div className="flex gap-2 px-5 mb-4">
        {["7D", "30D", "90D", "1Y"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              range === r ? "bg-white text-black" : "bg-white/8 text-white/50"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="px-5 space-y-4">
        <ChartCard title="Body Weight" subtitle="81.8 kg · down 2.4kg over 8 weeks">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={WEIGHT_HISTORY}>
              <defs>
                <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: "#1F2023", border: "none", borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="weight" stroke={ACCENT} strokeWidth={2} fill="url(#wGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Bench Press e1RM" subtitle="103 kg estimated · +11kg in 3 months">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={BENCH_HISTORY}>
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: "#1F2023", border: "none", borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="e1rm" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: GOLD }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly Training Volume" subtitle="22,600 kg this week · trending up">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={VOLUME_HISTORY}>
              <XAxis dataKey="week" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={{ background: "#1F2023", border: "none", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="volume" fill="#4C9EFF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <p className="text-white font-semibold mb-3">Strength Personal Bests</p>
          <div className="space-y-2.5">
            {[
              { name: "Bench Press", value: "82.5 kg × 8" },
              { name: "Back Squat", value: "120 kg × 5" },
              { name: "Deadlift", value: "150 kg × 3" },
              { name: "Pull-ups", value: "18 reps" },
            ].map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <span className="text-white/70 text-sm flex items-center gap-2">
                  <Trophy size={14} style={{ color: GOLD }} /> {s.name}
                </span>
                <span className="text-white text-sm font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-white font-semibold mb-3">Achievements</p>
          <div className="grid grid-cols-2 gap-3">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.id} className="bg-white/5 rounded-xl p-3 flex items-center gap-2.5">
                <span className="text-xl">{a.icon}</span>
                <span className="text-white/70 text-xs font-medium">{a.label}</span>
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

function ProfileScreen({ coachOpen, setCoachOpen }) {
  const rows = [
    { label: "Goals", icon: Target },
    { label: "Equipment", icon: Dumbbell },
    { label: "Training preferences", icon: Settings },
    { label: "Nutrition preferences", icon: Utensils },
    { label: "Units", icon: Activity },
    { label: "Notifications", icon: Bell },
    { label: "Connected devices", icon: Heart },
    { label: "Subscription", icon: Award },
  ];
  return (
    <div className="pb-6">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-white text-2xl font-bold">Profile</h1>
      </div>
      <div className="px-5">
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#F2B84B] flex items-center justify-center text-2xl font-bold text-white">
              {USER.name[0]}
            </div>
            <div>
              <p className="text-white text-lg font-bold">{USER.name}</p>
              <p className="text-white/40 text-sm">{USER.fitnessLevel} · {USER.totalWorkouts} workouts</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 bg-white/5 rounded-xl py-2.5 text-center">
              <p className="text-white font-bold">{USER.streak}🔥</p>
              <p className="text-white/40 text-[11px]">day streak</p>
            </div>
            <div className="flex-1 bg-white/5 rounded-xl py-2.5 text-center">
              <p className="text-white font-bold">{USER.totalWorkouts}</p>
              <p className="text-white/40 text-[11px]">total workouts</p>
            </div>
            <div className="flex-1 bg-white/5 rounded-xl py-2.5 text-center">
              <p className="text-white font-bold">3</p>
              <p className="text-white/40 text-[11px]">PRs this month</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <Card onClick={() => setCoachOpen(true)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FF5A1F]/15 flex items-center justify-center">
              <Activity size={18} className="text-[#FF5A1F]" />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold">AI Coach</p>
              <p className="text-white/40 text-xs">Ask about training, nutrition, and recovery</p>
            </div>
            <ChevronRight size={18} className="text-white/30" />
          </div>
        </Card>
      </div>

      <div className="px-5 mt-4">
        <Card>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center gap-3 py-3 ${i !== rows.length - 1 ? "border-b border-white/5" : ""}`}
            >
              <r.icon size={17} className="text-white/40" />
              <span className="text-white/80 text-sm flex-1">{r.label}</span>
              <ChevronRight size={16} className="text-white/20" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function CoachSheet({ open, onClose }) {
  const [messages, setMessages] = useState([
    { role: "coach", text: "Hey Alex — I'm your AI coach. Ask me anything about training, nutrition, or recovery." },
  ]);
  const [input, setInput] = useState("");

  function send(text) {
    if (!text.trim()) return;
    const userMsg = { role: "user", text };
    const reply = { role: "coach", text: coachReply(text) };
    setMessages((m) => [...m, userMsg, reply]);
    setInput("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="AI Coach">
      <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-[#FF5A1F] text-white" : "bg-white/8 text-white/85"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {COACH_SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="text-xs bg-white/8 text-white/60 px-3 py-1.5 rounded-full">
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
          className="flex-1 bg-white/8 rounded-full px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
        />
        <button onClick={() => send(input)} className="w-11 h-11 rounded-full bg-[#FF5A1F] flex items-center justify-center">
          <ChevronRight size={18} className="text-white" />
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================================
   APP SHELL
============================================================================ */

const TABS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "workouts", label: "Workouts", icon: Dumbbell },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "profile", label: "Profile", icon: User },
];

export default function FitnessApp() {
  const [tab, setTab] = useState("home");
  const [workoutState, setWorkoutState] = useState({ status: "not-started", currentExerciseIndex: 0, log: {} });
  const [sessionOpen, setSessionOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [nutrition, setNutrition] = useState(INITIAL_NUTRITION);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [coachOpen, setCoachOpen] = useState(false);

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function startWorkout() {
    setWorkoutState((s) => ({ ...s, status: "in-progress" }));
    setSessionOpen(true);
  }

  function finishWorkout(session) {
    setWorkoutState({ ...session, status: "completed" });
    setSessionOpen(false);
    setSummaryOpen(true);
    setHistory((h) => [
      { name: TODAY_WORKOUT.name, date: "Today", duration: "58 min", volume: Object.values(session.log).flat().reduce((a, s) => a + s.weight * s.reps, 0) },
      ...h,
    ]);
  }

  function addFood(meal, food) {
    setNutrition((n) => ({
      ...n,
      calories: n.calories + food.cals,
      protein: n.protein + food.protein,
      carbs: n.carbs + food.carbs,
      fat: n.fat + food.fat,
      meals: { ...n.meals, [meal]: [...n.meals[meal], { ...food, id: food.id + "-" + Date.now() }] },
    }));
    showToast(`${food.name} added to ${meal}`);
  }

  function addWater(liters) {
    setNutrition((n) => ({ ...n, water: Math.round((n.water + liters) * 100) / 100 }));
    showToast(`+${Math.round(liters * 1000)}ml logged`);
  }

  return (
    <div className="w-full h-full min-h-screen bg-[#0A0A0B] font-sans flex justify-center">
      <div className="w-full max-w-md relative">
        <BrandBar />
        {tab === "home" && (
          <HomeScreen
            workout={TODAY_WORKOUT}
            workoutState={workoutState}
            onStartWorkout={startWorkout}
            onViewWorkout={() => setTab("workouts")}
            nutrition={nutrition}
            onLogFood={() => setTab("nutrition")}
            onLogWater={() => addWater(0.25)}
            onSelectDay={() => {}}
          />
        )}
        {tab === "workouts" && (
          <WorkoutsScreen workout={TODAY_WORKOUT} workoutState={workoutState} onStart={startWorkout} history={history} />
        )}
        {tab === "nutrition" && <NutritionScreen nutrition={nutrition} onAddFood={addFood} onAddWater={addWater} />}
        {tab === "progress" && <ProgressScreen />}
        {tab === "profile" && <ProfileScreen coachOpen={coachOpen} setCoachOpen={setCoachOpen} />}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50">
          <div className="w-full max-w-md bg-[#0F1012]/95 backdrop-blur border-t border-white/5 flex px-2 pb-safe">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 flex flex-col items-center gap-1 py-3"
                >
                  <Icon size={21} className={active ? "text-[#FF5A1F]" : "text-white/35"} strokeWidth={active ? 2.4 : 2} />
                  <span className={`text-[10px] font-medium ${active ? "text-[#FF5A1F]" : "text-white/35"}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {sessionOpen && (
          <WorkoutSession
            workout={TODAY_WORKOUT}
            session={workoutState}
            setSession={setWorkoutState}
            onFinish={finishWorkout}
            onExit={() => setSessionOpen(false)}
          />
        )}
        {summaryOpen && (
          <WorkoutSummary workout={TODAY_WORKOUT} session={workoutState} onDone={() => setSummaryOpen(false)} />
        )}

        <CoachSheet open={coachOpen} onClose={() => setCoachOpen(false)} />
        <Toast message={toast.message} show={toast.show} />
      </div>
    </div>
  );
}
