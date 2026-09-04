import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { auth, db as firestore } from "./firebase";
import { inviteCode } from "./id";
import { SEED_EXERCISES, SEED_PROGRAMS } from "./seed";
import { COACH_SETUP_CODE } from "./config";

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

// Firebase Auth error codes -> the same plain-language messages the app
// showed when this was a localStorage-only login system.
function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Incorrect email or password.";
  }
  if (code.includes("email-already-in-use")) return "That email is already registered.";
  if (code.includes("weak-password")) return "Choose a password with at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email.";
  if (code.includes("network-request-failed")) return "Network error — check your connection and try again.";
  return err?.message || "Something went wrong. Please try again.";
}

// A fresh, never-written Firestore document id for a given collection —
// lets create-actions return the new record synchronously (matching how
// this app's ~40 call sites already use them) while the actual write
// happens in the background.
function newDocId(name) {
  return doc(collection(firestore, name)).id;
}

// One-time seed of the shared exercise/program library into a brand new
// Firebase project, so a freshly created coach account isn't empty —
// mirrors what loadDb() used to default to under localStorage.
async function seedCoachData() {
  try {
    const exBatch = writeBatch(firestore);
    SEED_EXERCISES.forEach((ex) => exBatch.set(doc(firestore, "exercises", ex.id), ex));
    await exBatch.commit();
    const progBatch = writeBatch(firestore);
    SEED_PROGRAMS.forEach((p) => progBatch.set(doc(firestore, "programs", p.id), p));
    await progBatch.commit();
  } catch (err) {
    console.error("seedCoachData failed:", err);
  }
}

// Best-effort delete of every doc in `collectionName` where clientId
// matches — used to clean up a removed client's history.
async function deleteWhereClientId(collectionName, clientId) {
  try {
    const snap = await getDocs(query(collection(firestore, collectionName), where("clientId", "==", clientId)));
    if (!snap.docs.length) return;
    const batch = writeBatch(firestore);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error(`cleanup ${collectionName} for ${clientId} failed:`, err);
  }
}

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(null); // users/{uid} doc for whoever is signed in
  const [raw, setRaw] = useState({}); // aggregated Firestore snapshots, keyed by our own names

  useEffect(() => onAuthStateChanged(auth, (u) => setAuthUser(u)), []);

  // The signed-in user's own profile doc — this is also how we learn their role.
  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      return;
    }
    return onSnapshot(doc(firestore, "users", authUser.uid), (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [authUser]);

  const role = profile?.role;

  useEffect(() => {
    const unsubs = [];
    function watch(name, key, constraints) {
      const colRef = collection(firestore, name);
      const q = constraints?.length ? query(colRef, ...constraints) : colRef;
      unsubs.push(
        onSnapshot(
          q,
          (snap) => setRaw((r) => ({ ...r, [key]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
          (err) => console.error(`listener ${name} failed:`, err)
        )
      );
    }
    function watchDoc(collectionName, docId, key, fallback) {
      unsubs.push(
        onSnapshot(doc(firestore, collectionName, docId), (snap) =>
          setRaw((r) => ({ ...r, [key]: snap.exists() ? snap.data() : fallback }))
        )
      );
    }

    // Readable before sign-in — lets the Login screen know whether to show
    // "create the coach account" or a normal sign-in form, and lets
    // activateAccount() send the auto-welcome message the moment a brand
    // new client account is created (before its role/profile has loaded).
    watchDoc("settings", "appMeta", "appMeta", { hasCoach: false });
    watchDoc("settings", "welcomeMessage", "welcomeMessage", DEFAULT_WELCOME_MESSAGE);

    if (!authUser || !role) return () => unsubs.forEach((u) => u());

    // Shared library data — every signed-in user (coach or client) can read it.
    watch("exercises", "exercises");
    watch("programs", "programs");
    watch("masterWorkouts", "masterWorkouts");
    watch("masterMeals", "masterMeals");
    watch("customFoods", "customFoods");
    watch("habitPresets", "habitPresets");
    watch("forms", "forms");

    if (role === "coach") {
      watch("users", "users");
      watch("invites", "invites");
      watch("workoutLogs", "workoutLogs");
      watch("messages", "messages");
      watch("progressPhotos", "progressPhotos");
      watch("savedMeals", "savedMeals");
      watch("habits", "habits");
      watch("clientPhases", "clientPhases");
      watch("formSchedules", "formSchedules");
      watch("formResponses", "formResponses");
      watch("clientNotes", "clientNotes");
      watch("habitLog", "habitLog");
      watch("weighIns", "weighIns");
      watch("scheduledWorkouts", "scheduledWorkouts");
      watch("bodyStatsSchedules", "bodyStatsSchedules");
      watch("notifications", "notifications");
      watch("challenges", "challenges");
      watch("nutritionLogs", "nutritionLogs");
    } else if (role === "client") {
      const uid = authUser.uid;
      watch("workoutLogs", "workoutLogs", [where("clientId", "==", uid)]);
      watch("messages", "messages", [where("clientId", "==", uid)]);
      watch("progressPhotos", "progressPhotos", [where("clientId", "==", uid)]);
      watch("savedMeals", "savedMeals", [where("clientId", "==", uid)]);
      watch("habits", "habits", [where("clientId", "==", uid)]);
      watch("clientPhases", "clientPhases", [where("clientId", "==", uid)]);
      watch("formSchedules", "formSchedules", [where("clientId", "==", uid)]);
      watch("formResponses", "formResponses", [where("clientId", "==", uid)]);
      watch("weighIns", "weighIns", [where("clientId", "==", uid)]);
      watch("scheduledWorkouts", "scheduledWorkouts", [where("clientId", "==", uid)]);
      watch("bodyStatsSchedules", "bodyStatsSchedules", [where("clientId", "==", uid)]);
      watch("nutritionLogs", "nutritionLogs", [where("clientId", "==", uid)]);
      watch("challenges", "challenges", [where("participantIds", "array-contains", uid)]);
      // clientNotes intentionally NOT synced here — they're the coach's
      // private notes about the client, never shown in the client app.
      unsubs.push(
        onSnapshot(doc(firestore, "habitLog", uid), (snap) =>
          setRaw((r) => ({ ...r, habitLog: snap.exists() ? [{ id: uid, ...snap.data() }] : [{ id: uid }] }))
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [authUser, role]);

  // Assembles every Firestore listener's output into the exact same shape
  // the rest of this app already expects (db.users, db.workoutLogs, ...) —
  // so components built against the old localStorage blob barely change.
  const db = useMemo(() => {
    const usersFromAuth = role === "client" ? (profile ? [profile] : []) : raw.users || [];
    const usersFromInvites = (raw.invites || []).map((inv) => ({
      id: inv.id,
      role: "client",
      name: inv.name,
      email: inv.email,
      username: inv.email,
      password: inv.code,
      status: "invited",
      createdAt: inv.createdAt,
      assignedProgramId: null,
      currentSessionIndex: 0,
      fitnessLevel: "Beginner",
      streak: 0,
      _source: "invite",
    }));
    const users = [...usersFromAuth, ...usersFromInvites];

    function bucket(list, sortFn) {
      const out = {};
      for (const item of list || []) {
        const k = item.clientId;
        (out[k] = out[k] || []).push(item);
      }
      if (sortFn) Object.values(out).forEach((arr) => arr.sort(sortFn));
      return out;
    }

    return {
      users,
      exercises: raw.exercises?.length ? raw.exercises : SEED_EXERCISES,
      programs: raw.programs?.length ? raw.programs : SEED_PROGRAMS,
      workoutLogs: bucket(raw.workoutLogs, (a, b) => b.date - a.date),
      nutritionLogs: bucket(raw.nutritionLogs, (a, b) => a.date.localeCompare(b.date)),
      messages: bucket(raw.messages, (a, b) => a.date - b.date),
      progressPhotos: bucket(raw.progressPhotos, (a, b) => b.date - a.date),
      savedMeals: bucket(raw.savedMeals, (a, b) => b.createdAt - a.createdAt),
      habits: bucket(raw.habits, (a, b) => a.createdAt - b.createdAt),
      habitLog: Object.fromEntries((raw.habitLog || []).map(({ id, ...rest }) => [id, rest])),
      clientPhases: bucket(raw.clientPhases, (a, b) => (a.startDate || "").localeCompare(b.startDate || "")),
      masterWorkouts: raw.masterWorkouts || [],
      masterMeals: raw.masterMeals || [],
      customFoods: raw.customFoods || [],
      habitPresets: raw.habitPresets?.length ? raw.habitPresets : DEFAULT_HABIT_PRESETS,
      forms: raw.forms || [],
      formSchedules: bucket(raw.formSchedules),
      formResponses: bucket(raw.formResponses, (a, b) => b.date - a.date),
      welcomeMessage: raw.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
      clientTags: Object.fromEntries(users.filter((u) => u.role === "client").map((u) => [u.id, u.clientTags || []])),
      clientNotes: bucket(raw.clientNotes, (a, b) => b.date - a.date),
      weighIns: bucket(raw.weighIns, (a, b) => a.date - b.date),
      scheduledWorkouts: bucket(raw.scheduledWorkouts, (a, b) => a.date.localeCompare(b.date)),
      bodyStatsSchedules: bucket(raw.bodyStatsSchedules, (a, b) => a.date.localeCompare(b.date)),
      notifications: (raw.notifications || []).slice().sort((a, b) => b.createdAt - a.createdAt),
      challenges: (raw.challenges || []).slice().sort((a, b) => b.createdAt - a.createdAt),
    };
  }, [raw, role, profile]);

  const currentUser = profile;
  const session = authUser ? { userId: authUser.uid } : null;
  const hasCoach = !!raw.appMeta?.hasCoach;
  const authReady = authUser !== undefined;

  const actions = useMemo(
    () => ({
      async login(email, password) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          updateDoc(doc(firestore, "users", cred.user.uid), { lastLoginAt: Date.now() }).catch(() => {});
          return cred.user;
        } catch (err) {
          throw new Error(friendlyAuthError(err));
        }
      },

      async logout() {
        await signOut(auth);
      },

      async createCoachAccount({ name, email, username, password, setupCode }) {
        if (setupCode !== COACH_SETUP_CODE) {
          throw new Error("That setup code isn't right.");
        }
        if (hasCoach) {
          throw new Error("A coach account already exists.");
        }
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
          throw new Error(friendlyAuthError(err));
        }
        const uid = cred.user.uid;
        const coach = {
          role: "coach",
          name: name.trim(),
          email: email.trim(),
          username: username.trim(),
          status: "active",
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        };
        await setDoc(doc(firestore, "users", uid), coach);
        await setDoc(doc(firestore, "settings", "appMeta"), { hasCoach: true });
        seedCoachData();
        return { id: uid, ...coach };
      },

      async createInvite({ name, email }) {
        const base = email.trim().toLowerCase();
        let username = base;
        let n = 1;
        while (db.users.some((u) => u.username.toLowerCase() === username)) {
          username = `${base}+${n}`;
          n++;
        }
        const code = inviteCode();
        const invite = { name: name.trim(), email: username, code, createdAt: Date.now() };
        try {
          await setDoc(doc(firestore, "invites", username), invite);
        } catch (err) {
          throw new Error("Couldn't create that client — " + (err.message || "please try again."));
        }
        return { id: username, username, code };
      },

      async activateAccount({ username, code, newPassword }) {
        const email = username.trim().toLowerCase();
        // A direct get() by a known doc id (rather than a list query) so
        // Firestore rules can let this run pre-auth without exposing the
        // full invites collection to anyone unauthenticated.
        const inviteRef = doc(firestore, "invites", email);
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists() || inviteSnap.data().code !== code.trim()) {
          throw new Error("That username or invite code doesn't match an active invite.");
        }
        const invite = inviteSnap.data();
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, newPassword);
        } catch (err) {
          throw new Error(friendlyAuthError(err));
        }
        const uid = cred.user.uid;
        const client = {
          role: "client",
          name: invite.name,
          email,
          username: email,
          status: "active",
          createdAt: invite.createdAt,
          lastLoginAt: Date.now(),
          assignedProgramId: null,
          currentSessionIndex: 0,
          fitnessLevel: "Beginner",
          streak: 0,
          clientTags: [],
        };
        await setDoc(doc(firestore, "users", uid), client);
        await deleteDoc(inviteRef);
        const welcome = raw.welcomeMessage;
        if (welcome?.autoSend && welcome.text?.trim()) {
          const text = welcome.text.replace(/\{name\}/gi, invite.name.split(" ")[0]);
          const msgId = newDocId("messages");
          const msg = { id: msgId, clientId: uid, from: "coach", text, date: Date.now() };
          if (welcome.attachmentUrl) {
            msg.attachment = { name: welcome.attachmentName || "Attachment.pdf", url: welcome.attachmentUrl };
          }
          setDoc(doc(firestore, "messages", msgId), msg).catch(console.error);
        }
        return { id: uid, ...client };
      },

      resendInvite(clientId) {
        const code = inviteCode();
        updateDoc(doc(firestore, "invites", clientId), { code }).catch(console.error);
        return code;
      },

      // For a client who's already activated their own account (so there's
      // no invite code to resend) — Firebase's own "forgot password" email,
      // triggered by the coach on the client's behalf when they've lost
      // their login details.
      async sendPasswordReset(email) {
        try {
          // After the client sets a new password on Firebase's reset page,
          // this is the "Continue" link back into the app it shows them —
          // without it they'd be left on a bare Firebase page with nowhere
          // to go next.
          await sendPasswordResetEmail(auth, email, {
            url: `${window.location.origin}/login`,
            handleCodeInApp: false,
          });
        } catch (err) {
          throw new Error("Couldn't send that reset email — " + (err.message || "please try again."));
        }
      },

      removeClient(clientId) {
        const target = db.users.find((u) => u.id === clientId);
        if (!target) return;
        if (target._source === "invite") {
          deleteDoc(doc(firestore, "invites", clientId)).catch(console.error);
          return;
        }
        deleteDoc(doc(firestore, "users", clientId)).catch(console.error);
        deleteDoc(doc(firestore, "habitLog", clientId)).catch(() => {});
        [
          "workoutLogs",
          "messages",
          "progressPhotos",
          "savedMeals",
          "habits",
          "clientPhases",
          "formSchedules",
          "formResponses",
          "clientNotes",
          "weighIns",
          "scheduledWorkouts",
          "bodyStatsSchedules",
          "notifications",
        ].forEach((name) => deleteWhereClientId(name, clientId));
      },

      assignProgram(clientId, programId) {
        updateDoc(doc(firestore, "users", clientId), { assignedProgramId: programId, currentSessionIndex: 0 }).catch(console.error);
      },

      async createProgram(data) {
        const id = newDocId("programs");
        const program = { id, phases: [], ...data };
        try {
          await setDoc(doc(firestore, "programs", id), program);
        } catch (err) {
          throw new Error("Couldn't create that program — " + (err.message || "please try again."));
        }
        return program;
      },

      updateProgram(id, data) {
        updateDoc(doc(firestore, "programs", id), data).catch(console.error);
      },

      deleteProgram(id) {
        deleteDoc(doc(firestore, "programs", id)).catch(console.error);
        db.users
          .filter((u) => u.assignedProgramId === id && u._source !== "invite")
          .forEach((u) => updateDoc(doc(firestore, "users", u.id), { assignedProgramId: null }).catch(console.error));
      },

      // Per-client training timeline — each phase is that client's own copy of
      // a plan (optionally started from a program template) with its own date
      // range, independent of every other client's phases.
      addClientPhase(clientId, data) {
        const id = newDocId("clientPhases");
        const phase = {
          id,
          clientId,
          name: "New Phase",
          level: "Intermediate",
          description: "",
          startDate: new Date().toISOString().slice(0, 10),
          endDate: "",
          weeks: [],
          createdAt: Date.now(),
          ...data,
        };
        setDoc(doc(firestore, "clientPhases", id), phase).catch(console.error);
        return phase;
      },

      updateClientPhase(clientId, phaseId, patch) {
        updateDoc(doc(firestore, "clientPhases", phaseId), patch).catch(console.error);
      },

      deleteClientPhase(clientId, phaseId) {
        deleteDoc(doc(firestore, "clientPhases", phaseId)).catch(console.error);
      },

      duplicateClientPhase(clientId, phaseId, overrides) {
        const phases = db.clientPhases[clientId] || [];
        const src = phases.find((p) => p.id === phaseId);
        if (!src) return null;
        const id = newDocId("clientPhases");
        const cloned = { ...JSON.parse(JSON.stringify(src)), id, clientId, createdAt: Date.now(), ...overrides };
        setDoc(doc(firestore, "clientPhases", id), cloned).catch(console.error);
        return cloned;
      },

      async createExercise(data) {
        const id = newDocId("exercises");
        const exercise = { id, instructions: [], formCues: [], secondaryMuscles: [], videoUrl: "", ...data };
        try {
          await setDoc(doc(firestore, "exercises", id), exercise);
        } catch (err) {
          throw new Error("Couldn't add that exercise — " + (err.message || "please try again."));
        }
        return exercise;
      },

      updateExercise(id, data) {
        updateDoc(doc(firestore, "exercises", id), data).catch(console.error);
      },

      deleteExercise(id) {
        deleteDoc(doc(firestore, "exercises", id)).catch(console.error);
      },

      logWorkout(clientId, entry) {
        const id = newDocId("workoutLogs");
        setDoc(doc(firestore, "workoutLogs", id), { id, clientId, date: Date.now(), ...entry }).catch(console.error);
      },

      // A client's own note on an exercise, saved as soon as they finish
      // typing it (not just bundled into the log when the whole workout is
      // finished) so it survives a refresh or an abandoned session.
      saveExerciseNote(clientId, exerciseId, note) {
        updateDoc(doc(firestore, "users", clientId), { [`draftExerciseNotes.${exerciseId}`]: note }).catch(console.error);
      },

      // Nutrition logged per calendar day — doc id is deterministic
      // (clientId__date) so each day's log is separate, mirroring the
      // scheduledWorkouts date-keyed pattern.
      setNutritionForDate(clientId, date, updater) {
        const id = `${clientId}__${date}`;
        const current = (db.nutritionLogs[clientId] || []).find((n) => n.date === date);
        const base = current
          ? { calories: current.calories, protein: current.protein, carbs: current.carbs, fat: current.fat, water: current.water, meals: current.meals }
          : null;
        const next = updater(base);
        setDoc(doc(firestore, "nutritionLogs", id), { id, clientId, date, ...next }).catch(console.error);
      },

      sendMessage(clientId, from, text, attachment) {
        const trimmed = (text || "").trim();
        if (!trimmed && !attachment) return;
        const id = newDocId("messages");
        const msg = { id, clientId, from, text: trimmed, date: Date.now(), ...(attachment ? { attachment } : {}) };
        setDoc(doc(firestore, "messages", id), msg).catch(console.error);
      },

      addProgressPhoto(clientId, dataUrl, caption = "") {
        const id = newDocId("progressPhotos");
        setDoc(doc(firestore, "progressPhotos", id), { id, clientId, url: dataUrl, date: Date.now(), caption }).catch(console.error);
      },

      deleteProgressPhoto(clientId, photoId) {
        deleteDoc(doc(firestore, "progressPhotos", photoId)).catch(console.error);
      },

      logWeight(clientId, weight) {
        const id = newDocId("weighIns");
        setDoc(doc(firestore, "weighIns", id), { id, clientId, weight, date: Date.now() }).catch(console.error);
      },

      deleteWeighIn(clientId, weighInId) {
        deleteDoc(doc(firestore, "weighIns", weighInId)).catch(console.error);
      },

      // Workouts scheduled onto specific calendar dates for a client — the
      // doc id is deterministic (clientId__date) so re-scheduling a date
      // cleanly replaces whatever was there before instead of duplicating.
      async scheduleWorkout(clientId, { date, label, muscleGroups, exercises }) {
        const id = `${clientId}__${date}`;
        const entry = { id, clientId, date, label, muscleGroups: muscleGroups || [], exercises };
        try {
          await setDoc(doc(firestore, "scheduledWorkouts", id), entry);
        } catch (err) {
          throw new Error("Couldn't schedule that workout — " + (err.message || "please try again."));
        }
        return entry;
      },

      async scheduleWorkoutRecurring(clientId, { startDate, weeks, label, muscleGroups, exercises }) {
        const dates = [];
        const d = new Date(startDate);
        for (let i = 0; i < weeks; i++) {
          dates.push(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 7);
        }
        const batch = writeBatch(firestore);
        dates.forEach((date) => {
          const id = `${clientId}__${date}`;
          batch.set(doc(firestore, "scheduledWorkouts", id), { id, clientId, date, label, muscleGroups: muscleGroups || [], exercises });
        });
        try {
          await batch.commit();
        } catch (err) {
          throw new Error("Couldn't schedule that workout — " + (err.message || "please try again."));
        }
        return dates;
      },

      // Same as scheduleWorkout, but for an arbitrary hand-picked set of
      // dates (e.g. every Mon/Wed/Fri circled on a calendar) rather than a
      // fixed weekly cadence.
      async scheduleWorkoutDates(clientId, { dates, label, muscleGroups, exercises }) {
        const batch = writeBatch(firestore);
        dates.forEach((date) => {
          const id = `${clientId}__${date}`;
          batch.set(doc(firestore, "scheduledWorkouts", id), { id, clientId, date, label, muscleGroups: muscleGroups || [], exercises });
        });
        try {
          await batch.commit();
        } catch (err) {
          throw new Error("Couldn't schedule that workout — " + (err.message || "please try again."));
        }
        return dates;
      },

      unscheduleWorkout(clientId, date) {
        deleteDoc(doc(firestore, "scheduledWorkouts", `${clientId}__${date}`)).catch(console.error);
      },

      // Reminders for the client to log a bodyweight/measurements check-in
      // on a given date — completion is derived from whether a weighIn
      // exists for that date, not tracked separately here.
      async scheduleBodyStatsCheckin(clientId, { startDate, weeks = 1 }) {
        const dates = [];
        const d = new Date(startDate);
        for (let i = 0; i < weeks; i++) {
          dates.push(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 7);
        }
        const batch = writeBatch(firestore);
        dates.forEach((date) => {
          const id = `${clientId}__${date}`;
          batch.set(doc(firestore, "bodyStatsSchedules", id), { id, clientId, date });
        });
        try {
          await batch.commit();
        } catch (err) {
          throw new Error("Couldn't schedule that check-in — " + (err.message || "please try again."));
        }
        return dates;
      },

      unscheduleBodyStatsCheckin(clientId, date) {
        deleteDoc(doc(firestore, "bodyStatsSchedules", `${clientId}__${date}`)).catch(console.error);
      },

      async updateUser(id, data) {
        try {
          await updateDoc(doc(firestore, "users", id), data);
        } catch (err) {
          throw new Error("Couldn't save — " + (err.message || "please try again."));
        }
      },

      // Coach-facing notifications — events that can't be derived live from
      // existing state (unlike unread messages / due check-ins / today's
      // workout, which the client app already computes on the fly).
      async notifyCoach(clientId, clientName, type, message) {
        const id = newDocId("notifications");
        const notification = { id, clientId, clientName, type, message, createdAt: Date.now(), read: false };
        try {
          await setDoc(doc(firestore, "notifications", id), notification);
        } catch (err) {
          console.error("Couldn't send notification to coach:", err);
        }
      },
      markNotificationRead(id) {
        updateDoc(doc(firestore, "notifications", id), { read: true }).catch(console.error);
      },
      markAllNotificationsRead() {
        (db.notifications || []).filter((n) => !n.read).forEach((n) => updateDoc(doc(firestore, "notifications", n.id), { read: true }).catch(console.error));
      },

      // Challenges — leaderboard/threshold competitions computed live from
      // existing workout/weigh-in/check-in data, not tracked separately.
      async createChallenge(data) {
        const id = newDocId("challenges");
        const challenge = { id, name: "", description: "", type: "leaderboard", metric: "workouts", participantIds: [], createdAt: Date.now(), ...data };
        try {
          await setDoc(doc(firestore, "challenges", id), challenge);
        } catch (err) {
          throw new Error("Couldn't create that challenge — " + (err.message || "please try again."));
        }
        return challenge;
      },
      async updateChallenge(id, data) {
        try {
          await updateDoc(doc(firestore, "challenges", id), data);
        } catch (err) {
          throw new Error("Couldn't save that challenge — " + (err.message || "please try again."));
        }
      },
      deleteChallenge(id) {
        deleteDoc(doc(firestore, "challenges", id)).catch(console.error);
      },

      createSavedMeal(clientId, meal) {
        const id = newDocId("savedMeals");
        const savedMeal = { id, clientId, createdAt: Date.now(), ...meal };
        setDoc(doc(firestore, "savedMeals", id), savedMeal).catch(console.error);
        return savedMeal;
      },

      deleteSavedMeal(clientId, mealId) {
        deleteDoc(doc(firestore, "savedMeals", mealId)).catch(console.error);
      },

      addHabit(clientId, label) {
        const id = newDocId("habits");
        const habit = { id, clientId, label: label.trim(), createdAt: Date.now() };
        setDoc(doc(firestore, "habits", id), habit).catch(console.error);
        return habit;
      },

      removeHabit(clientId, habitId) {
        deleteDoc(doc(firestore, "habits", habitId)).catch(console.error);
      },

      toggleHabitToday(clientId, habitId) {
        const dateKey = new Date().toISOString().slice(0, 10);
        const current = (db.habitLog[clientId] || {})[dateKey] || [];
        const next = current.includes(habitId) ? current.filter((id) => id !== habitId) : [...current, habitId];
        setDoc(doc(firestore, "habitLog", clientId), { [dateKey]: next }, { merge: true }).catch(console.error);
      },

      // Master workout templates — reusable building blocks, independent of
      // any single program, that can be dropped into a phase.
      createMasterWorkout(data) {
        const id = newDocId("masterWorkouts");
        const workout = { id, label: "New Workout", muscleGroups: [], exercises: [], instructions: "", createdAt: Date.now(), ...data };
        setDoc(doc(firestore, "masterWorkouts", id), workout).catch(console.error);
        return workout;
      },
      updateMasterWorkout(id, data) {
        updateDoc(doc(firestore, "masterWorkouts", id), data).catch(console.error);
      },
      deleteMasterWorkout(id) {
        deleteDoc(doc(firestore, "masterWorkouts", id)).catch(console.error);
      },

      // Master meal templates — coach-authored, reusable across clients.
      createMasterMeal(data) {
        const id = newDocId("masterMeals");
        const meal = { id, name: "New Meal", ingredients: [], cals: 0, protein: 0, carbs: 0, fat: 0, createdAt: Date.now(), ...data };
        setDoc(doc(firestore, "masterMeals", id), meal).catch(console.error);
        return meal;
      },
      updateMasterMeal(id, data) {
        updateDoc(doc(firestore, "masterMeals", id), data).catch(console.error);
      },
      deleteMasterMeal(id) {
        deleteDoc(doc(firestore, "masterMeals", id)).catch(console.error);
      },

      // Custom foods — coach-added, merged with the static FOOD_DATABASE
      // wherever the client searches for food to log.
      createFood(data) {
        const id = newDocId("customFoods");
        const food = { id, name: "", cals: 0, protein: 0, carbs: 0, fat: 0, ...data };
        setDoc(doc(firestore, "customFoods", id), food).catch(console.error);
        return food;
      },
      updateFood(id, data) {
        updateDoc(doc(firestore, "customFoods", id), data).catch(console.error);
      },
      deleteFood(id) {
        deleteDoc(doc(firestore, "customFoods", id)).catch(console.error);
      },

      // Habit presets — the master suggestion list offered when adding a
      // client's daily habits (replaces a hardcoded constant).
      createHabitPreset(label) {
        const id = newDocId("habitPresets");
        const preset = { id, label: label.trim() };
        setDoc(doc(firestore, "habitPresets", id), preset).catch(console.error);
        return preset;
      },
      deleteHabitPreset(id) {
        deleteDoc(doc(firestore, "habitPresets", id)).catch(console.error);
      },

      // Check-in form templates — a custom question builder (text/number/
      // rating/photo questions), scheduled recurring onto a client's week.
      async createForm(data) {
        const id = newDocId("forms");
        const form = { id, name: "New Check-in", description: "", questions: [], createdAt: Date.now(), ...data };
        try {
          await setDoc(doc(firestore, "forms", id), form);
        } catch (err) {
          throw new Error("Couldn't create that form — " + (err.message || "please try again."));
        }
        return form;
      },
      async updateForm(id, data) {
        try {
          await updateDoc(doc(firestore, "forms", id), data);
        } catch (err) {
          throw new Error("Couldn't save that form — " + (err.message || "please try again."));
        }
      },
      deleteForm(id) {
        deleteDoc(doc(firestore, "forms", id)).catch(console.error);
        Object.values(db.formSchedules)
          .flat()
          .filter((s) => s.formId === id)
          .forEach((s) => deleteDoc(doc(firestore, "formSchedules", s.id)).catch(console.error));
      },

      // Recurring weekly form schedules per client — same mental model as a
      // program day recurring on the client's rotation, but for check-ins.
      scheduleForm(clientId, formId, dayOfWeek) {
        const id = newDocId("formSchedules");
        const schedule = { id, clientId, formId, dayOfWeek, active: true, createdAt: Date.now() };
        setDoc(doc(firestore, "formSchedules", id), schedule).catch(console.error);
        return schedule;
      },
      unscheduleForm(clientId, scheduleId) {
        deleteDoc(doc(firestore, "formSchedules", scheduleId)).catch(console.error);
      },
      toggleFormSchedule(clientId, scheduleId) {
        const schedules = db.formSchedules[clientId] || [];
        const current = schedules.find((s) => s.id === scheduleId);
        if (!current) return;
        updateDoc(doc(firestore, "formSchedules", scheduleId), { active: !current.active }).catch(console.error);
      },

      // Free-form client tags, shown on the Summary tab.
      addClientTag(clientId, label) {
        const trimmed = label.trim();
        if (!trimmed) return;
        const existing = db.clientTags[clientId] || [];
        if (existing.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
        updateDoc(doc(firestore, "users", clientId), { clientTags: [...existing, trimmed] }).catch(console.error);
      },
      removeClientTag(clientId, label) {
        const existing = db.clientTags[clientId] || [];
        updateDoc(doc(firestore, "users", clientId), { clientTags: existing.filter((t) => t !== label) }).catch(console.error);
      },

      // Private trainer notes on a client's Summary — coach-only, never shown to the client.
      addClientNote(clientId, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const id = newDocId("clientNotes");
        setDoc(doc(firestore, "clientNotes", id), { id, clientId, text: trimmed, date: Date.now() }).catch(console.error);
      },
      deleteClientNote(clientId, noteId) {
        deleteDoc(doc(firestore, "clientNotes", noteId)).catch(console.error);
      },

      // The coach's automated welcome message template (text + optional PDF),
      // auto-sent when a client activates their account.
      async updateWelcomeMessage(patch) {
        const next = { ...(db.welcomeMessage || DEFAULT_WELCOME_MESSAGE), ...patch };
        try {
          await setDoc(doc(firestore, "settings", "welcomeMessage"), next);
        } catch (err) {
          throw new Error("Couldn't save — " + (err.message || "please try again."));
        }
      },

      // Client-submitted check-in responses.
      submitFormResponse(clientId, { formId, scheduleId, answers }) {
        const id = newDocId("formResponses");
        const response = { id, clientId, formId, scheduleId, date: Date.now(), answers, read: false };
        setDoc(doc(firestore, "formResponses", id), response).catch(console.error);
        return response;
      },
      markFormResponseRead(id) {
        updateDoc(doc(firestore, "formResponses", id), { read: true }).catch(console.error);
      },
    }),
    [db, raw, hasCoach]
  );

  const value = { db, session, currentUser, hasCoach, authReady, ...actions };
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

// Normalizes a master program template to its current {phases:[{id, name,
// durationWeeks, days}]} shape — whether it was saved that way already, or
// (for a coach account whose programs collection was seeded/created before
// phases existed) still carries the older {weeks:[{id, label, days}]}
// shape. Reading through this instead of `program.phases` directly means an
// existing coach's programs keep working with no migration step; any save
// from the Program Templates editor writes the current shape, which
// upgrades the doc in place.
export function programPhases(program) {
  if (!program) return [];
  if (program.phases) return program.phases;
  return (program.weeks || []).map((w) => ({ id: w.id, name: w.label, durationWeeks: 1, days: w.days || [] }));
}

// Flattens every program into an ordered list of "sessions" (days), each
// tagged with its program/phase context, so a client can rotate through them.
export function flattenSessions(program) {
  if (!program) return [];
  const out = [];
  for (const phase of programPhases(program)) {
    for (const d of phase.days) {
      out.push({ ...d, weekLabel: phase.name, programId: program.id, programName: program.name });
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

// The phase immediately after whichever one getCurrentPhase() picked —
// the earliest phase starting after the current one ends, if any.
export function getNextPhase(phases, todayKey) {
  const current = getCurrentPhase(phases, todayKey);
  if (!current) return null;
  const sorted = [...(phases || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sorted.find((p) => p.startDate > (current.endDate || current.startDate) && p !== current) || null;
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
