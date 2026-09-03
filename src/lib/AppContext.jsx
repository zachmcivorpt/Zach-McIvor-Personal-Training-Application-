import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { newId, inviteCode } from "./id";
import { SEED_EXERCISES, SEED_PROGRAMS } from "./seed";
import { COACH_SETUP_CODE } from "./config";

const DB_KEY = "mpt_db_v4";
const SESSION_KEY = "mpt_session_v2";

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
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
        const base = name.trim().toLowerCase().split(/\s+/)[0] || "client";
        let username = base;
        let n = 1;
        while (db.users.some((u) => u.username === username)) {
          username = `${base}${n}`;
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
        setDb((d) => ({
          ...d,
          users: d.users.map((x) => (x.id === u.id ? { ...x, password: newPassword, status: "active" } : x)),
        }));
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

      sendMessage(clientId, from, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        setDb((d) => ({
          ...d,
          messages: {
            ...d.messages,
            [clientId]: [...(d.messages[clientId] || []), { id: newId("m"), from, text: trimmed, date: Date.now() }],
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
