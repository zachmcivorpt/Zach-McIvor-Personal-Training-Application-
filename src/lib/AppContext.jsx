import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { newId, inviteCode } from "./id";
import { SEED_EXERCISES, SEED_PROGRAMS } from "./seed";
import { COACH_SETUP_CODE } from "./config";

const DB_KEY = "mpt_db_v4";
const SESSION_KEY = "mpt_session_v2";

const DEFAULT_HABIT_PRESETS = [
  { id: "hp_steps", label: "12,000 steps" },
  { id: "hp_mobility", label: "Do your Mobility" },
  { id: "hp_nutrition", label: "Log your Nutrition" },
  { id: "hp_sleep", label: "Sleep 7+ Hours" },
];

const DEFAULT_WELCOME_MESSAGE = {
  text: [
    "Hi {name},",
    "",
    "Welcome to the app! Have a look around and familiarise yourself with everything — your training, progress tracking and other resources are all in there.",
    "",
    "I've also attached your Nutritional Tracking Guide as a PDF. Have a read through when you get a chance, and we'll go through anything you're unsure about.",
    "",
    "Looking forward to getting started!",
    "",
    "Zach McIvor",
    "Zach McIvor Personal Training",
  ].join("\n"),
  attachmentName: "",
  attachmentUrl: "",
  autoSend: false,
};

// Adds any exercise from the built-in library that isn't already present
// (by id) — lets us grow the shipped library over time without wiping or
// duplicating anything in an account that already exists.
function mergeSeedExercises(existing) {
  const existingIds = new Set((existing || []).map((e) => e.id));
  const missing = SEED_EXERCISES.filter((e) => !existingIds.has(e.id));
  return missing.length ? [...existing, ...missing] : existing;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        exercises: mergeSeedExercises(parsed.exercises),
        masterWorkouts: parsed.masterWorkouts || [],
        masterMeals: parsed.masterMeals || [],
        customFoods: parsed.customFoods || [],
        habitPresets: parsed.habitPresets || DEFAULT_HABIT_PRESETS,
        forms: parsed.forms || [],
        formSchedules: parsed.formSchedules || {},
        formResponses: parsed.formResponses || {},
        welcomeMessage: parsed.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
        clientTags: parsed.clientTags || {},
        clientNotes: parsed.clientNotes || {},
      };
    }
  } catch {
    // fall through to fresh install
  }
  return {
    users: [], // starts empty — the coach creates their own account on first visit
    exercises: SEED_EXERCISES,
    programs: SEED_PROGRAMS,
    workoutLogs: {}, // clientId -> [{ id, date, dayLabel, entries:[{exerciseId, sets:[{weight,reps,rpe,isPR}]}] }]
    nutrition: {}, // clientId -> nutrition state
    messages: {}, // clientId -> [{ id, from: 'coach'|'client', text, date }]
    progressPhotos: {}, // clientId -> [{ id, url, date, caption }]
    savedMeals: {}, // clientId -> [{ id, name, ingredients:[{name,cals,protein,carbs,fat}], cals, protein, carbs, fat, createdAt }]
    habits: {}, // clientId -> [{ id, label, createdAt }]
    habitLog: {}, // clientId -> { "YYYY-MM-DD": [habitId, ...] }
    clientPhases: {}, // clientId -> [{ id, name, level, description, startDate, endDate, weeks:[...] }]
    masterWorkouts: [], // [{ id, label, muscleGroups, exercises, instructions, createdAt }] — reusable workout templates
    masterMeals: [], // [{ id, name, ingredients, cals, protein, carbs, fat, createdAt }] — coach-authored meal templates
    customFoods: [], // [{ id, name, cals, protein, carbs, fat }] — merged with the static food database client-side
    habitPresets: DEFAULT_HABIT_PRESETS, // [{ id, label }] — suggested habits offered per-client
    forms: [], // [{ id, name, description, questions:[{id,type,label,required}], createdAt }]
    formSchedules: {}, // clientId -> [{ id, formId, dayOfWeek(0-6), active, createdAt }]
    formResponses: {}, // clientId -> [{ id, formId, scheduleId, date, answers:{questionId:value} }]
    welcomeMessage: DEFAULT_WELCOME_MESSAGE, // { text, attachmentName, attachmentUrl, autoSend } — sent to a client automatically when they activate
    clientTags: {}, // clientId -> [string] — free-form tags the coach adds on a client's Summary
    clientNotes: {}, // clientId -> [{ id, text, date }] — private trainer notes, coach-only
  };
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [db, setDb] = useState(loadDb);
  const [session, setSession] = useState(loadSession);

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      // storage unavailable (private mode, sandboxed viewer) — state still works in-memory
    }
  }, [db]);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // storage unavailable — session still works in-memory for this tab
    }
  }, [session]);

  const currentUser = useMemo(() => {
    if (!session) return null;
    return db.users.find((u) => u.id === session.userId) || null;
  }, [db.users, session]);

  const hasCoach = useMemo(() => db.users.some((u) => u.role === "coach"), [db.users]);

  const actions = useMemo(
    () => ({
      login(username, password) {
        const u = db.users.find(
          (x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.status === "active"
        );
        if (!u || u.password !== password) {
          throw new Error("Incorrect username or password.");
        }
        setSession({ userId: u.id });
        setDb((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, lastLoginAt: Date.now() } : x)) }));
        return u;
      },

      logout() {
        setSession(null);
      },

      createCoachAccount({ name, email, username, password, setupCode }) {
        if (setupCode !== COACH_SETUP_CODE) {
          throw new Error("That setup code isn't right.");
        }
        if (db.users.some((u) => u.role === "coach")) {
          throw new Error("A coach account already exists in this browser.");
        }
        const cleanUsername = username.trim();
        if (db.users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
          throw new Error("That username is taken.");
        }
        const id = newId("u");
        const coach = {
          id,
          role: "coach",
          name: name.trim(),
          email: email.trim(),
          username: cleanUsername,
          password,
          status: "active",
          createdAt: Date.now(),
        };
        setDb((d) => ({ ...d, users: [...d.users, coach] }));
        setSession({ userId: id });
        return coach;
      },

      createInvite({ name, email }) {
        const id = newId("u");
        // Username = the client's own email address, so it's something they
        // already know rather than a coach-generated slug they have to remember.
        const base = email.trim().toLowerCase();
        let username = base;
        let n = 1;
        while (db.users.some((u) => u.username.toLowerCase() === username)) {
          username = `${base}+${n}`;
          n++;
        }
        const code = inviteCode();
        const newUser = {
          id,
          role: "client",
          name: name.trim(),
          email: email.trim(),
          username,
          password: code, // temp password == invite code, client resets on activation
          status: "invited",
          createdAt: Date.now(),
          assignedProgramId: null,
          currentSessionIndex: 0,
          fitnessLevel: "Beginner",
          streak: 0,
        };
        setDb((d) => ({ ...d, users: [...d.users, newUser] }));
        return { id, username, code };
      },

      activateAccount({ username, code, newPassword }) {
        const u = db.users.find(
          (x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.status === "invited"
        );
        if (!u || u.password !== code.trim()) {
          throw new Error("That username or invite code doesn't match an active invite.");
        }
        const welcome = db.welcomeMessage;
        setDb((d) => {
          const next = {
            ...d,
            users: d.users.map((x) =>
              x.id === u.id ? { ...x, password: newPassword, status: "active", lastLoginAt: Date.now() } : x
            ),
          };
          if (welcome?.autoSend && welcome.text?.trim()) {
            const text = welcome.text.replace(/\{name\}/gi, u.name.split(" ")[0]);
            const message = { id: newId("m"), from: "coach", text, date: Date.now() };
            if (welcome.attachmentUrl) {
              message.attachment = { name: welcome.attachmentName || "Attachment.pdf", url: welcome.attachmentUrl };
            }
            next.messages = { ...d.messages, [u.id]: [...(d.messages[u.id] || []), message] };
          }
          return next;
        });
        setSession({ userId: u.id });
        return u;
      },

      resendInvite(clientId) {
        const code = inviteCode();
        setDb((d) => ({
          ...d,
          users: d.users.map((x) => (x.id === clientId ? { ...x, password: code } : x)),
        }));
        return code;
      },

      removeClient(clientId) {
        setDb((d) => ({ ...d, users: d.users.filter((u) => u.id !== clientId) }));
      },

      assignProgram(clientId, programId) {
        setDb((d) => ({
          ...d,
          users: d.users.map((u) =>
            u.id === clientId ? { ...u, assignedProgramId: programId, currentSessionIndex: 0 } : u
          ),
        }));
      },

      createProgram(data) {
        const id = newId("prog");
        const program = { id, weeks: [], ...data };
        setDb((d) => ({ ...d, programs: [...d.programs, program] }));
        return program;
      },

      updateProgram(id, data) {
        setDb((d) => ({ ...d, programs: d.programs.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
      },

      deleteProgram(id) {
        setDb((d) => ({
          ...d,
          programs: d.programs.filter((p) => p.id !== id),
          users: d.users.map((u) => (u.assignedProgramId === id ? { ...u, assignedProgramId: null } : u)),
        }));
      },

      // Per-client training timeline — each phase is that client's own copy of
      // a plan (optionally started from a program template) with its own date
      // range, independent of every other client's phases.
      addClientPhase(clientId, data) {
        const id = newId("phase");
        const phase = {
          id,
          name: "New Phase",
          level: "Intermediate",
          description: "",
          startDate: new Date().toISOString().slice(0, 10),
          endDate: "",
          weeks: [],
          createdAt: Date.now(),
          ...data,
        };
        setDb((d) => ({
          ...d,
          clientPhases: {
            ...(d.clientPhases || {}),
            [clientId]: [...((d.clientPhases || {})[clientId] || []), phase],
          },
        }));
        return phase;
      },

      updateClientPhase(clientId, phaseId, patch) {
        setDb((d) => ({
          ...d,
          clientPhases: {
            ...(d.clientPhases || {}),
            [clientId]: ((d.clientPhases || {})[clientId] || []).map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
          },
        }));
      },

      deleteClientPhase(clientId, phaseId) {
        setDb((d) => ({
          ...d,
          clientPhases: {
            ...(d.clientPhases || {}),
            [clientId]: ((d.clientPhases || {})[clientId] || []).filter((p) => p.id !== phaseId),
          },
        }));
      },

      duplicateClientPhase(clientId, phaseId, overrides) {
        const phases = (db.clientPhases || {})[clientId] || [];
        const src = phases.find((p) => p.id === phaseId);
        if (!src) return null;
        const cloned = {
          ...JSON.parse(JSON.stringify(src)),
          id: newId("phase"),
          createdAt: Date.now(),
          ...overrides,
        };
        setDb((d) => ({
          ...d,
          clientPhases: {
            ...(d.clientPhases || {}),
            [clientId]: [...((d.clientPhases || {})[clientId] || []), cloned],
          },
        }));
        return cloned;
      },

      createExercise(data) {
        const id = newId("ex");
        const exercise = { id, instructions: [], formCues: [], secondaryMuscles: [], videoUrl: "", ...data };
        setDb((d) => ({ ...d, exercises: [...d.exercises, exercise] }));
        return exercise;
      },

      updateExercise(id, data) {
        setDb((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === id ? { ...e, ...data } : e)) }));
      },

      deleteExercise(id) {
        setDb((d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== id) }));
      },

      logWorkout(clientId, entry) {
        setDb((d) => ({
          ...d,
          workoutLogs: {
            ...d.workoutLogs,
            [clientId]: [{ id: newId("log"), date: Date.now(), ...entry }, ...(d.workoutLogs[clientId] || [])],
          },
          users: d.users.map((u) =>
            u.id === clientId ? { ...u, currentSessionIndex: (u.currentSessionIndex || 0) + 1 } : u
          ),
        }));
      },

      setNutrition(clientId, updater) {
        setDb((d) => ({
          ...d,
          nutrition: { ...d.nutrition, [clientId]: updater(d.nutrition[clientId]) },
        }));
      },

      sendMessage(clientId, from, text, attachment) {
        const trimmed = (text || "").trim();
        if (!trimmed && !attachment) return;
        setDb((d) => ({
          ...d,
          messages: {
            ...d.messages,
            [clientId]: [
              ...(d.messages[clientId] || []),
              { id: newId("m"), from, text: trimmed, date: Date.now(), ...(attachment ? { attachment } : {}) },
            ],
          },
        }));
      },

      addProgressPhoto(clientId, dataUrl, caption = "") {
        setDb((d) => ({
          ...d,
          progressPhotos: {
            ...d.progressPhotos,
            [clientId]: [
              { id: newId("photo"), url: dataUrl, date: Date.now(), caption },
              ...(d.progressPhotos[clientId] || []),
            ],
          },
        }));
      },

      deleteProgressPhoto(clientId, photoId) {
        setDb((d) => ({
          ...d,
          progressPhotos: {
            ...d.progressPhotos,
            [clientId]: (d.progressPhotos[clientId] || []).filter((p) => p.id !== photoId),
          },
        }));
      },

      updateUser(id, data) {
        setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, ...data } : u)) }));
      },

      createSavedMeal(clientId, meal) {
        const savedMeal = { id: newId("meal"), createdAt: Date.now(), ...meal };
        setDb((d) => ({
          ...d,
          savedMeals: {
            ...(d.savedMeals || {}),
            [clientId]: [savedMeal, ...((d.savedMeals || {})[clientId] || [])],
          },
        }));
        return savedMeal;
      },

      deleteSavedMeal(clientId, mealId) {
        setDb((d) => ({
          ...d,
          savedMeals: {
            ...(d.savedMeals || {}),
            [clientId]: ((d.savedMeals || {})[clientId] || []).filter((m) => m.id !== mealId),
          },
        }));
      },

      addHabit(clientId, label) {
        const habit = { id: newId("habit"), label: label.trim(), createdAt: Date.now() };
        setDb((d) => ({
          ...d,
          habits: { ...(d.habits || {}), [clientId]: [...((d.habits || {})[clientId] || []), habit] },
        }));
        return habit;
      },

      removeHabit(clientId, habitId) {
        setDb((d) => ({
          ...d,
          habits: {
            ...(d.habits || {}),
            [clientId]: ((d.habits || {})[clientId] || []).filter((h) => h.id !== habitId),
          },
        }));
      },

      toggleHabitToday(clientId, habitId) {
        const dateKey = new Date().toISOString().slice(0, 10);
        setDb((d) => {
          const clientLog = (d.habitLog || {})[clientId] || {};
          const today = clientLog[dateKey] || [];
          const nextToday = today.includes(habitId) ? today.filter((id) => id !== habitId) : [...today, habitId];
          return {
            ...d,
            habitLog: { ...(d.habitLog || {}), [clientId]: { ...clientLog, [dateKey]: nextToday } },
          };
        });
      },

      // Master workout templates — reusable building blocks, independent of
      // any single program, that can be dropped into a phase.
      createMasterWorkout(data) {
        const id = newId("mwk");
        const workout = { id, label: "New Workout", muscleGroups: [], exercises: [], instructions: "", createdAt: Date.now(), ...data };
        setDb((d) => ({ ...d, masterWorkouts: [...(d.masterWorkouts || []), workout] }));
        return workout;
      },
      updateMasterWorkout(id, data) {
        setDb((d) => ({ ...d, masterWorkouts: (d.masterWorkouts || []).map((w) => (w.id === id ? { ...w, ...data } : w)) }));
      },
      deleteMasterWorkout(id) {
        setDb((d) => ({ ...d, masterWorkouts: (d.masterWorkouts || []).filter((w) => w.id !== id) }));
      },

      // Master meal templates — coach-authored, reusable across clients.
      createMasterMeal(data) {
        const id = newId("mmeal");
        const meal = { id, name: "New Meal", ingredients: [], cals: 0, protein: 0, carbs: 0, fat: 0, createdAt: Date.now(), ...data };
        setDb((d) => ({ ...d, masterMeals: [...(d.masterMeals || []), meal] }));
        return meal;
      },
      updateMasterMeal(id, data) {
        setDb((d) => ({ ...d, masterMeals: (d.masterMeals || []).map((m) => (m.id === id ? { ...m, ...data } : m)) }));
      },
      deleteMasterMeal(id) {
        setDb((d) => ({ ...d, masterMeals: (d.masterMeals || []).filter((m) => m.id !== id) }));
      },

      // Custom foods — coach-added, merged with the static FOOD_DATABASE
      // wherever the client searches for food to log.
      createFood(data) {
        const id = newId("food");
        const food = { id, name: "", cals: 0, protein: 0, carbs: 0, fat: 0, ...data };
        setDb((d) => ({ ...d, customFoods: [...(d.customFoods || []), food] }));
        return food;
      },
      updateFood(id, data) {
        setDb((d) => ({ ...d, customFoods: (d.customFoods || []).map((f) => (f.id === id ? { ...f, ...data } : f)) }));
      },
      deleteFood(id) {
        setDb((d) => ({ ...d, customFoods: (d.customFoods || []).filter((f) => f.id !== id) }));
      },

      // Habit presets — the master suggestion list offered when adding a
      // client's daily habits (replaces a hardcoded constant).
      createHabitPreset(label) {
        const preset = { id: newId("hp"), label: label.trim() };
        setDb((d) => ({ ...d, habitPresets: [...(d.habitPresets || []), preset] }));
        return preset;
      },
      deleteHabitPreset(id) {
        setDb((d) => ({ ...d, habitPresets: (d.habitPresets || []).filter((h) => h.id !== id) }));
      },

      // Check-in form templates — a custom question builder (text/number/
      // rating/photo questions), scheduled recurring onto a client's week.
      createForm(data) {
        const id = newId("form");
        const form = { id, name: "New Check-in", description: "", questions: [], createdAt: Date.now(), ...data };
        setDb((d) => ({ ...d, forms: [...(d.forms || []), form] }));
        return form;
      },
      updateForm(id, data) {
        setDb((d) => ({ ...d, forms: (d.forms || []).map((f) => (f.id === id ? { ...f, ...data } : f)) }));
      },
      deleteForm(id) {
        setDb((d) => ({
          ...d,
          forms: (d.forms || []).filter((f) => f.id !== id),
          formSchedules: Object.fromEntries(
            Object.entries(d.formSchedules || {}).map(([cid, list]) => [cid, list.filter((s) => s.formId !== id)])
          ),
        }));
      },

      // Recurring weekly form schedules per client — same mental model as a
      // program day recurring on the client's rotation, but for check-ins.
      scheduleForm(clientId, formId, dayOfWeek) {
        const schedule = { id: newId("sched"), formId, dayOfWeek, active: true, createdAt: Date.now() };
        setDb((d) => ({
          ...d,
          formSchedules: { ...(d.formSchedules || {}), [clientId]: [...((d.formSchedules || {})[clientId] || []), schedule] },
        }));
        return schedule;
      },
      unscheduleForm(clientId, scheduleId) {
        setDb((d) => ({
          ...d,
          formSchedules: {
            ...(d.formSchedules || {}),
            [clientId]: ((d.formSchedules || {})[clientId] || []).filter((s) => s.id !== scheduleId),
          },
        }));
      },
      toggleFormSchedule(clientId, scheduleId) {
        setDb((d) => ({
          ...d,
          formSchedules: {
            ...(d.formSchedules || {}),
            [clientId]: ((d.formSchedules || {})[clientId] || []).map((s) => (s.id === scheduleId ? { ...s, active: !s.active } : s)),
          },
        }));
      },

      // Free-form client tags, shown on the Summary tab.
      addClientTag(clientId, label) {
        const trimmed = label.trim();
        if (!trimmed) return;
        setDb((d) => {
          const existing = (d.clientTags || {})[clientId] || [];
          if (existing.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return d;
          return { ...d, clientTags: { ...(d.clientTags || {}), [clientId]: [...existing, trimmed] } };
        });
      },
      removeClientTag(clientId, label) {
        setDb((d) => ({
          ...d,
          clientTags: { ...(d.clientTags || {}), [clientId]: ((d.clientTags || {})[clientId] || []).filter((t) => t !== label) },
        }));
      },

      // Private trainer notes on a client's Summary — coach-only, never shown to the client.
      addClientNote(clientId, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const note = { id: newId("note"), text: trimmed, date: Date.now() };
        setDb((d) => ({
          ...d,
          clientNotes: { ...(d.clientNotes || {}), [clientId]: [note, ...((d.clientNotes || {})[clientId] || [])] },
        }));
      },
      deleteClientNote(clientId, noteId) {
        setDb((d) => ({
          ...d,
          clientNotes: {
            ...(d.clientNotes || {}),
            [clientId]: ((d.clientNotes || {})[clientId] || []).filter((n) => n.id !== noteId),
          },
        }));
      },

      // The coach's automated welcome message template (text + optional PDF),
      // auto-sent when a client activates their account.
      updateWelcomeMessage(patch) {
        setDb((d) => ({ ...d, welcomeMessage: { ...(d.welcomeMessage || DEFAULT_WELCOME_MESSAGE), ...patch } }));
      },

      // Client-submitted check-in responses.
      submitFormResponse(clientId, { formId, scheduleId, answers }) {
        const response = { id: newId("resp"), formId, scheduleId, date: Date.now(), answers };
        setDb((d) => ({
          ...d,
          formResponses: { ...(d.formResponses || {}), [clientId]: [response, ...((d.formResponses || {})[clientId] || [])] },
        }));
        return response;
      },
    }),
    [db]
  );

  const value = { db, session, currentUser, hasCoach, ...actions };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/* ============================================================================
   SELECTORS
============================================================================ */

// Flattens every program into an ordered list of "sessions" (days), each
// tagged with its program/week context, so a client can rotate through them.
export function flattenSessions(program) {
  if (!program) return [];
  const out = [];
  for (const week of program.weeks) {
    for (const d of week.days) {
      out.push({ ...d, weekLabel: week.label, programId: program.id, programName: program.name });
    }
  }
  return out;
}

// Picks which of a client's phases is "current" for a given date: the one
// whose date range contains it, else the most recently finished one, else
// the next upcoming one — so there's always a sensible program to show.
export function getCurrentPhase(phases, todayKey) {
  if (!phases || phases.length === 0) return null;
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const active = sorted.find((p) => p.startDate <= todayKey && (!p.endDate || p.endDate >= todayKey));
  if (active) return active;
  const past = sorted.filter((p) => p.endDate && p.endDate < todayKey);
  if (past.length) return past[past.length - 1];
  const upcoming = sorted.find((p) => p.startDate > todayKey);
  if (upcoming) return upcoming;
  return sorted[sorted.length - 1] || null;
}

export function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Most recent logged performance for a given exercise, newest log first.
export function getPreviousPerformance(logs, exerciseId) {
  for (const log of logs || []) {
    const entry = log.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && entry.sets.length) return entry.sets[entry.sets.length - 1];
  }
  return null;
}

// Every set from the most recent logged session for this exercise, in order —
// used to show "12 x 22.5 kg" per set row, not just the single last value.
export function getPreviousSets(logs, exerciseId) {
  for (const log of logs || []) {
    const entry = log.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && entry.sets.length) return entry.sets;
  }
  return [];
}
