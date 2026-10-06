// Cloud Functions — requires Firebase's paid Blaze plan to deploy at all,
// even at zero usage. Push notifications and the client-activation data
// migration DON'T actually need this file anymore — see api/notify.js,
// api/client-activated.js, and api-lib/ instead, which do the exact same
// job as Vercel serverless functions (already hosting this app, free tier
// included) called directly from the client right after the write that
// used to trigger the Cloud Function equivalent below. See
// PUSH_NOTIFICATIONS_SETUP.txt for the full picture of which path is
// actually live.
//
// IMPORTANT if you ever DO deploy this file on Blaze: onNewMessage,
// onNewGroupMessage, onMealPlanChanged, onClientPhaseChanged, and
// onNewCheckIn below would then fire ALONGSIDE the equivalent /api/notify
// calls already wired into AppContext.jsx — every notification would be
// sent twice. Delete those five exports first (or comment them out) if
// you deploy this for its other, not-yet-migrated capabilities (the AI
// insight/nutrition-help functions, the WHOOP integration, and the
// account-deletion/invite-recovery onCall functions, none of which have
// a /api equivalent yet).
//
// Everything else in this app runs entirely client-side against
// Firestore; Cloud Functions / this Vercel equivalent is the deliberate,
// minimal exception, for whichever pieces genuinely need a privileged
// Admin SDK call the browser can never be trusted to make itself.

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();
const adminAuth = getAuth();

// Sends to every device token stored on a user's profile doc, then prunes
// any token Firebase reports as dead (uninstalled app, revoked
// permission, expired registration) so the array doesn't grow forever.
// `prefKey`, when given, is checked against that user's own
// notificationPrefs — false explicitly opts out of that one notification
// type; anything else (including the field never having been set at all,
// for a coach account that predates this setting) defaults to on.
async function notifyUser(uid, { title, body }, prefKey) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (prefKey && snap.data()?.notificationPrefs?.[prefKey] === false) return;
  const tokens = snap.data()?.fcmTokens || [];
  if (tokens.length === 0) return;

  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link: "/" } },
  });

  const deadTokens = [];
  res.responses.forEach((r, i) => {
    if (!r.success) deadTokens.push(tokens[i]);
  });
  if (deadTokens.length > 0) {
    await userRef.update({
      fcmTokens: tokens.filter((t) => !deadTokens.includes(t)),
    });
  }
}

// An account recovery (delete the wrong Firebase Auth user, recreate the
// coach account fresh) can leave more than one users/{uid} doc with
// role: "coach" behind — the old one's login is gone, but nothing ever
// deletes its Firestore doc automatically. A plain `.limit(1)` query has no
// way to prefer one over the other, so it could just as easily hand push
// notifications to the dead account as the live one. Ordering by whoever
// actually logged in most recently picks the real, currently-used account
// every time, with no manual cleanup required after a recovery like that.
async function getCoachId() {
  // Sorted in JS rather than via .orderBy() in the query itself — combining
  // that with the equality filter above would need a composite index, and
  // there's realistically only ever one or two coach docs to look at, so
  // there's nothing to gain from pushing the sort into Firestore here.
  const snap = await db.collection("users").where("role", "==", "coach").get();
  if (snap.empty) return null;
  const docs = snap.docs.slice().sort((a, b) => (b.data().lastLoginAt || 0) - (a.data().lastLoginAt || 0));
  return docs[0].id;
}

// Every per-client collection keyed by a `clientId` field (see
// AppContext.jsx's per-client Firestore listeners for the same list).
const CLIENT_ID_COLLECTIONS = [
  "workoutLogs", "messages", "workoutComments", "progressPhotos", "savedMeals",
  "habits", "clientPhases", "formSchedules", "formResponses", "weighIns",
  "scheduledWorkouts", "bodyStatsSchedules", "nutritionLogs", "bodyMetrics",
  "notifications", "clientNotes",
];

// Before a client accepts their invite, there's no real Firebase Auth
// account for them yet — so the coach can still build out their whole
// program, schedule, notes, etc. against a synthetic id (their invite's
// email-derived username; see activateAccount()'s comment in
// AppContext.jsx). The moment they set a password and Firebase Auth mints
// their real, randomly-generated uid, every one of those documents is left
// keyed to that OLD id — invisible from their real account forever unless
// it gets re-keyed to the new uid. A client's own Firestore rules can't
// safely do this re-keying themselves (most of these collections aren't
// even client-writable at all, by design), so it happens here, server-side
// with the Admin SDK, the instant their real account doc is created.
exports.onClientActivated = onDocumentCreated("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const data = event.data?.data();
  if (!data || data.role !== "client") return;
  const oldId = (data.email || "").trim().toLowerCase();
  // Nothing to migrate for a brand new client who never had pre-activation
  // data built for them (or if, somehow, the ids already match).
  if (!oldId || oldId === uid) return;

  for (const name of CLIENT_ID_COLLECTIONS) {
    const snap = await db.collection(name).where("clientId", "==", oldId).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { clientId: uid }));
    await batch.commit();
  }

  // habitLog/{clientId}: the doc id itself IS the clientId, not a field on
  // it, so this one's a read-write-delete rather than a field update.
  const oldHabitLogRef = db.collection("habitLog").doc(oldId);
  const oldHabitLogSnap = await oldHabitLogRef.get();
  if (oldHabitLogSnap.exists) {
    await db.collection("habitLog").doc(uid).set(oldHabitLogSnap.data(), { merge: true });
    await oldHabitLogRef.delete();
  }
});

exports.onNewMessage = onDocumentCreated("messages/{id}", async (event) => {
  const m = event.data?.data();
  if (!m) return;
  const preview = (m.text || "Sent an attachment").slice(0, 120);

  if (m.from === "client") {
    const coachId = await getCoachId();
    if (coachId) {
      const clientSnap = await db.collection("users").doc(m.clientId).get();
      const clientName = clientSnap.data()?.name || "A client";
      await notifyUser(coachId, { title: clientName, body: preview }, "messages");
    }
  } else if (m.from === "coach" && m.clientId) {
    await notifyUser(m.clientId, { title: "Your coach sent a message", body: preview });
  }
});

// Same "notify whoever didn't send it" shape as onNewMessage above, for
// the coach-side Groups tab's group chat. memberIds is already stamped
// onto the message itself at send time (see sendGroupMessage in
// AppContext.jsx) — the group's current roster, read once off that
// message doc rather than a second Firestore read of groups/{groupId}.
// Reuses the "messages" notification preference rather than adding a
// separate toggle for group chat specifically.
exports.onNewGroupMessage = onDocumentCreated("groupMessages/{id}", async (event) => {
  const m = event.data?.data();
  if (!m) return;
  const preview = (m.text || "").slice(0, 120);
  const memberIds = m.memberIds || [];

  const groupSnap = await db.collection("groups").doc(m.groupId).get();
  const groupName = groupSnap.data()?.name || "your group";

  if (m.from === "coach") {
    await Promise.all(memberIds.map((uid) => notifyUser(uid, { title: groupName, body: preview }, "messages")));
  } else if (m.from === "client") {
    const title = `${m.fromName || "A member"} · ${groupName}`;
    const coachId = await getCoachId();
    const others = memberIds.filter((uid) => uid !== m.fromClientId);
    await Promise.all([
      coachId ? notifyUser(coachId, { title, body: preview }, "messages") : Promise.resolve(),
      ...others.map((uid) => notifyUser(uid, { title, body: preview }, "messages")),
    ]);
  }
});

// A coach publishing a plan (MealPlanBuilder's publish(), the only path
// that calls setMealPlan) always bumps `updatedAt`; the client's own
// "swap this meal" action (swapMealPlanMeal) only ever writes `days` and
// never touches it — that's the signal used to notify only on an actual
// coach-made change, not the client's own edit to their own plan.
exports.onMealPlanChanged = onDocumentWritten("mealPlans/{clientId}", async (event) => {
  const after = event.data?.after?.data();
  if (!after) return; // deleted
  const before = event.data?.before?.data();
  const isNew = !before;
  if (!isNew && after.updatedAt === before.updatedAt) return;
  await notifyUser(
    event.params.clientId,
    { title: isNew ? "New meal plan" : "Your meal plan was updated", body: "Your coach just updated your meal plan — check the Nutrition tab." },
    "mealPlanUpdates"
  );
});

// clientPhases has no client write path at all (see FIRESTORE_RULES.txt),
// so any create/update here is always the coach assigning or editing a
// training phase — no extra "who changed it" check needed like mealPlans.
exports.onClientPhaseChanged = onDocumentWritten("clientPhases/{id}", async (event) => {
  const after = event.data?.after?.data();
  if (!after || !after.clientId) return;
  const before = event.data?.before?.data();
  await notifyUser(
    after.clientId,
    { title: before ? "Your training program was updated" : "New training program", body: "Your coach just updated your training — check the Training tab." },
    "programUpdates"
  );
});

exports.onNewCheckIn = onDocumentCreated("formResponses/{id}", async () => {
  const coachId = await getCoachId();
  if (coachId) {
    await notifyUser(coachId, { title: "New check-in submitted", body: "A client just submitted a check-in — tap to review." }, "checkins");
  }
});

// Same "already done it" window the client app itself uses (CheckInsScreen's
// isCheckInDue) — a check-in stays satisfied for 7 days after it's filled
// out, so this only reminds someone who's genuinely about to miss one.
const CHECK_IN_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Runs once a day at 9am Sydney time (this coach's own timezone — the
// functions themselves are deployed to australia-southeast2). Firestore's
// "dayOfWeek" on a form schedule (0=Sun..6=Sat, matching JS's own
// Date#getDay()) is a fixed weekday each week; "24 hours before" that day
// means firing on the day before it, so this checks whichever schedules
// are due tomorrow.
// Cloud Scheduler doesn't support every Cloud Functions region (notably not
// australia-southeast2, unlike the other two functions here) — left at the
// default us-central1 since this is a once-a-day background job with no
// latency requirement, so the region genuinely doesn't matter for it.
exports.checkInReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Australia/Sydney" },
  async () => {
    const todayName = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short" }).format(new Date());
    const tomorrowDow = (WEEKDAY_NAMES.indexOf(todayName) + 1) % 7;

    // Filtering "active" in JS rather than a second .where(...) avoids
    // needing a composite index for a query that only runs once a day.
    const schedulesSnap = await db.collection("formSchedules").where("dayOfWeek", "==", tomorrowDow).get();
    const dueTomorrow = schedulesSnap.docs.map((d) => d.data()).filter((s) => s.active);
    if (dueTomorrow.length === 0) return;

    const formNames = new Map();
    for (const schedule of dueTomorrow) {
      const responsesSnap = await db.collection("formResponses").where("scheduleId", "==", schedule.id).get();
      let lastDate = 0;
      responsesSnap.forEach((d) => {
        const t = d.data().date;
        if (t > lastDate) lastDate = t;
      });
      if (lastDate && Date.now() - lastDate < CHECK_IN_PERIOD_MS) continue; // already done recently — skip

      if (!formNames.has(schedule.formId)) {
        const formSnap = await db.collection("forms").doc(schedule.formId).get();
        formNames.set(schedule.formId, formSnap.exists ? formSnap.data().name : null);
      }
      const formName = formNames.get(schedule.formId) || "check-in";

      await notifyUser(schedule.clientId, {
        title: "Check-in due tomorrow",
        body: `Your "${formName}" is due tomorrow — fill it out when you get a chance.`,
      });
    }
  }
);

// ---------------------------------------------------------------------
// Inactivity-triggered "Reignition Workout" WOD — a client who's gone a few
// days without logging a workout gets a notification AND a ready-to-go
// full-body session auto-dropped onto today's calendar, pulled only from
// exercises already in their own assigned program (never invented), so
// getting back in doesn't require them (or their coach) to do anything
// first. Same split this app already uses everywhere else: a
// deterministic rule decides WHETHER this fires and WHAT exercises go in
// it (real data only); the LLM, when configured, is only ever asked to
// phrase a one-line blurb for it — see callClaude below.
// ---------------------------------------------------------------------
const INACTIVITY_DAYS = 4;
// Once nudged, leave it alone for a while rather than re-generating (and
// re-notifying about) a new WOD every single day a client stays away —
// one nudge, then let the existing one sit on their calendar.
const INACTIVITY_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;
// Two main lifts per session, so a client with e.g. a Push/Pull/Legs
// split gets a genuine taste of each day rather than a generic mix —
// capped overall so the reset day stays short and approachable rather
// than growing with however many sessions are in the program.
const EXERCISES_PER_SESSION = 2;
const MAX_WOD_EXERCISES = 6;

// Mirrors getCurrentPhase() in src/lib/AppContext.jsx exactly (duplicated
// rather than imported — functions/ is a separate CommonJS package with
// no build step pulling in the web app's ES modules, same reasoning as
// CONTEXT_CATEGORIES above): the phase whose date range contains today,
// else the most recently finished one, else the next upcoming one.
function pickCurrentPhase(phases, todayKey) {
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

// Used to prefer an actual main/compound lift over an accessory within
// the same session (e.g. Bench Press over Cable Fly on the same Push day)
// when picking that session's top EXERCISES_PER_SESSION exercises.
const COMPOUND_KEYWORDS = [
  "squat", "deadlift", "bench press", "overhead press", "shoulder press",
  "row", "pull up", "pull-up", "chin up", "chin-up", "press",
];
function isCompoundName(name) {
  const n = (name || "").toLowerCase();
  return COMPOUND_KEYWORDS.some((k) => n.includes(k));
}

// callClaude() and CLAUDE_MODEL are defined further down this file (the
// APEX AI Insights / Coach Notes section) — both are available here by the
// time this actually runs: function declarations hoist, and this code only
// executes when the scheduler fires, well after the whole module has
// finished loading.

// Builds a full-body "greatest hits" session from the client's own
// currently assigned sessions — the top EXERCISES_PER_SESSION main lifts
// from EACH session in their program (e.g. a Push/Pull/Legs split gets a
// taste of all three), in program order, capped overall at
// MAX_WOD_EXERCISES so the reset day stays short regardless of how many
// sessions the program has. Reads only phase.weeks[0].days — the single
// template week every other screen in the app already treats as "the"
// program (see ClientProgramTab in src/client/ClientApp.jsx), not every
// week's repeated copy of it. Returns null if their program has nothing
// usable at all (never fabricates an exercise they weren't assigned).
async function buildInactivityWod(clientId, todayKey) {
  const phasesSnap = await db.collection("clientPhases").where("clientId", "==", clientId).get();
  const phase = pickCurrentPhase(phasesSnap.docs.map((d) => d.data()), todayKey);
  if (!phase) return null;

  const days = phase.weeks?.[0]?.days || [];
  if (days.length === 0) return null;

  const exercisesSnap = await db.collection("exercises").get();
  const exercisesById = new Map(exercisesSnap.docs.map((d) => [d.id, d.data()]));

  // Pulls each session's own top picks in turn (round-robin by session,
  // not by raw ranking across the whole program) so a 6-exercise cap
  // still represents a Push day AND a Pull day AND a Leg day, say,
  // instead of accidentally filling up on one session's lifts alone.
  const used = new Set();
  const picked = [];
  for (const day of days) {
    // Only a session's genuine working exercises count as its "lifts" —
    // warm-up/cool-down entries exist to prepare/recover, not to reset
    // from.
    const ranked = (day.exercises || [])
      .filter((ex) => ex.exerciseId && (ex.section || "main") === "main")
      .map((ex) => ({ exerciseId: ex.exerciseId, targetSets: ex.targetSets || 1, exercise: exercisesById.get(ex.exerciseId) }))
      .filter((c) => c.exercise)
      // A name match against known compound-lift keywords first, then
      // the exercise with the most prescribed sets as the tiebreak — a
      // main lift is consistently programmed with more working sets
      // than an accessory in the same session, so this reliably lands
      // on that session's actual main lift(s) rather than whichever
      // exercises happened to be listed first.
      .sort((a, b) => {
        const compoundDiff = (isCompoundName(b.exercise.name) ? 1 : 0) - (isCompoundName(a.exercise.name) ? 1 : 0);
        return compoundDiff !== 0 ? compoundDiff : b.targetSets - a.targetSets;
      });

    let takenFromThisSession = 0;
    for (const candidate of ranked) {
      if (takenFromThisSession >= EXERCISES_PER_SESSION) break;
      if (used.has(candidate.exerciseId)) continue; // already pulled via an earlier session sharing this exact lift
      used.add(candidate.exerciseId);
      picked.push(candidate.exerciseId);
      takenFromThisSession++;
    }
  }
  if (picked.length === 0) return null;
  picked.length = Math.min(picked.length, MAX_WOD_EXERCISES);

  return picked.map((exerciseId) => ({
    exerciseId,
    section: "main",
    targetSets: 3,
    targetType: "reps",
    targetReps: "10",
    targetRIR: 3,
    restSeconds: 60,
    notes: "",
  }));
}

exports.inactivityWod = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Australia/Sydney" },
  async () => {
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
    const usersSnap = await db.collection("users").where("role", "==", "client").get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const uid = userDoc.id;
      if (user.status !== "active" || user.accessPaused) continue;
      if (user.lastInactivityNudgeAt && Date.now() - user.lastInactivityNudgeAt < INACTIVITY_COOLDOWN_MS) continue;

      const logsSnap = await db.collection("workoutLogs").where("clientId", "==", uid).get();
      let lastDate = 0;
      logsSnap.forEach((d) => {
        const t = d.data().date;
        if (t > lastDate) lastDate = t;
      });
      // Never logged a single workout at all — not "inactive," just brand
      // new, with nothing to measure a gap against yet.
      if (lastDate === 0) continue;
      const daysSince = Math.floor((Date.now() - lastDate) / (24 * 60 * 60 * 1000));
      if (daysSince < INACTIVITY_DAYS) continue;

      // A real session (coach-scheduled or an earlier broadcast) already
      // sits on today — never overwrite it with an auto-generated one.
      const scheduledId = `${uid}__${todayKey}`;
      const existing = await db.collection("scheduledWorkouts").doc(scheduledId).get();
      if (existing.exists) continue;

      let exercises;
      try {
        exercises = await buildInactivityWod(uid, todayKey);
      } catch (err) {
        console.error(`inactivityWod: couldn't build a session for ${uid}:`, err.message);
        continue;
      }
      if (!exercises) continue; // nothing in their program to build from

      let label = "Reignition Workout";
      try {
        label = (
          await callClaude(
            process.env.ANTHROPIC_API_KEY,
            `You name a single workout session for a personal-training app. Given how many days a client has been away from training, reply with ONLY a short (2-5 word) motivating session title — no quotes, no markdown, no explanation. Example: "Reignition Workout".`,
            `${daysSince} days since their last logged session.`,
            20
          )
        ).replace(/^"|"$/g, "") || label;
      } catch {
        // ANTHROPIC_API_KEY not configured, or the call failed — the
        // deterministic label above is a perfectly good fallback, so this
        // never blocks the WOD itself from going out.
      }

      await db.collection("scheduledWorkouts").doc(scheduledId).set({
        id: scheduledId,
        clientId: uid,
        date: todayKey,
        label,
        muscleGroups: [],
        exercises,
        broadcast: true,
        autoGenerated: true,
      });
      await userDoc.ref.update({ lastInactivityNudgeAt: Date.now() });

      // A real chat message rather than a bare push notification — it
      // persists in the client's Messages tab (so it's still there if the
      // push gets missed/dismissed), and onNewMessage above already pushes
      // a notification for any coach-authored message, so this is the
      // only send needed; no separate notifyUser call.
      const messageId = db.collection("messages").doc().id;
      await db.collection("messages").doc(messageId).set({
        id: messageId,
        clientId: uid,
        from: "coach",
        text: `It's been ${daysSince} days since your last session — your "${label}" has been added to your calendar for today, built from your own program and ready whenever you are.`,
        date: Date.now(),
      });
    }
  }
);

// removeClient (AppContext.jsx) can only ever delete a client's Firestore
// docs — the client-side Firebase Auth SDK has no way to delete a DIFFERENT
// user's account, only your own. Every client removed before this function
// existed left a real Auth account behind with no matching users/{uid} doc:
// invisible in the app, but still permanently holding their email, so
// re-inviting them at the same address later fails at the password-setting
// step with "email already in use" — the account looks live because it
// technically still is. This deletes the Auth account in the same breath as
// the Firestore cleanup, for every removal from now on.
exports.deleteClientAuthAccount = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");
  const callerSnap = await db.collection("users").doc(callerUid).get();
  if (callerSnap.data()?.role !== "coach") {
    throw new HttpsError("permission-denied", "Only the coach can do this.");
  }
  const uid = request.data?.uid;
  if (!uid || typeof uid !== "string") throw new HttpsError("invalid-argument", "Missing uid.");
  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    // Already gone (e.g. this ran once before, or the client never actually
    // activated) — not an error worth surfacing to the coach.
    if (err.code !== "auth/user-not-found") throw new HttpsError("internal", err.message);
  }
  return { deleted: true };
});

// App Store Guideline 5.1.1(v): any app that supports account creation must
// also offer account deletion within the app, self-service — not "email us
// to ask." Firestore's own rules only ever let a client's users/{uid} doc be
// deleted by the coach (see FIRESTORE_RULES.txt), so this can't be a plain
// client-side deleteDoc() call; it runs here with Admin SDK privileges
// instead, same as the two functions above. Deliberately takes NO uid
// parameter from the caller — it only ever acts on request.auth.uid, the
// signed-in caller's own account, so there is no way to point this at
// someone else's.
exports.deleteMyAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const selfSnap = await db.collection("users").doc(uid).get();
  const role = selfSnap.data()?.role;

  if (role === "client") {
    for (const name of CLIENT_ID_COLLECTIONS) {
      const snap = await db.collection(name).where("clientId", "==", uid).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    // habitLog/{uid} and mealPlans/{uid}: doc id IS the uid, not a
    // `clientId` field, so these two need a direct delete rather than the
    // where("clientId", ...) query used above.
    await db.collection("habitLog").doc(uid).delete().catch(() => {});
    await db.collection("mealPlans").doc(uid).delete().catch(() => {});
    await db.collection("users").doc(uid).delete();
  } else if (role === "coach") {
    // Deletes the coach's own account/profile, not the clients, programs,
    // and library they manage — that data isn't personal to the coach in
    // the sense Apple's guideline means, and wiping it out as a side effect
    // of one person deleting their own login would be actively harmful to
    // the coach's actual clients. Instead this re-opens coach signup, the
    // same recovery path used any time the sole coach account is lost, so
    // the platform doesn't end up permanently stuck with no way to sign up
    // a coach again.
    await db.collection("users").doc(uid).delete();
    await db.collection("settings").doc("appMeta").set({ hasCoach: false }, { merge: true });
  }
  // No matching users/{uid} doc at all (role is undefined) — nothing to
  // clean up in Firestore, but still remove the dangling Auth account below.

  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw new HttpsError("internal", err.message);
  }
  return { deleted: true };
});

// The self-healing counterpart for every account already stuck in that
// orphaned state from before deleteClientAuthAccount existed (or from any
// other way a users/{uid} doc could end up deleted out from under a live
// Auth account). Runs pre-auth, from the Activate Account screen itself, so
// it needs its own proof the caller is legitimate rather than relying on
// request.auth — the same proof activateAccount() already checks
// client-side: a valid, matching invites/{email} doc and its one-time code.
// Only ever deletes an ORPHANED account (no users/{uid} doc): a genuinely
// live client account with real data is never touched, even if someone
// somehow got hold of a matching invite for its email.
exports.cleanupOrphanedInvite = onCall(async (request) => {
  const email = (request.data?.email || "").trim().toLowerCase();
  const code = (request.data?.code || "").trim();
  if (!email || !code) throw new HttpsError("invalid-argument", "Missing email or code.");

  const inviteSnap = await db.collection("invites").doc(email).get();
  if (!inviteSnap.exists || inviteSnap.data().code !== code) {
    throw new HttpsError("permission-denied", "That invite doesn't match.");
  }

  let existing;
  try {
    existing = await adminAuth.getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return { cleaned: false, reason: "not-found" };
    throw new HttpsError("internal", err.message);
  }

  const userDoc = await db.collection("users").doc(existing.uid).get();
  if (userDoc.exists) return { cleaned: false, reason: "active" };

  await adminAuth.deleteUser(existing.uid);
  return { cleaned: true };
});

// Self-service "I lost/forgot my invite code" for a client still on the
// Activate screen — there's no Auth account yet at this point (that's only
// created once activateAccount succeeds), so none of Firebase Auth's own
// account-recovery flows apply; this is the pre-auth equivalent. Callable
// with no sign-in, same trust level as cleanupOrphanedInvite above, so it
// needs its own light checks rather than relying on Firestore rules (which
// keep invites/{id} create/update coach-only — see FIRESTORE_RULES.txt):
// the submitted name must match what the coach actually typed when they
// created the invite (not just the email, which is often guessable/public),
// and repeat requests are rate-limited so this can't be hammered to race a
// legitimate client's own activation attempt.
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars — matches src/lib/id.js's inviteCode()
const REGENERATE_COOLDOWN_MS = 60 * 1000;

exports.regenerateInviteCode = onCall(async (request) => {
  const email = (request.data?.email || "").trim().toLowerCase();
  const name = (request.data?.name || "").trim().toLowerCase();
  if (!email || !name) throw new HttpsError("invalid-argument", "Enter both your email and the name your coach has on file for you.");

  const inviteRef = db.collection("invites").doc(email);
  const inviteSnap = await inviteRef.get();
  // Deliberately the same message whether the invite doesn't exist at all or
  // the name just didn't match — telling them which one would let this be
  // used to probe whether a given email has a pending invite.
  const mismatch = new HttpsError("not-found", "No pending invite matches that email and name — check with your coach.");
  if (!inviteSnap.exists) throw mismatch;
  const invite = inviteSnap.data();
  if ((invite.name || "").trim().toLowerCase() !== name) throw mismatch;

  if (invite.lastRegeneratedAt && Date.now() - invite.lastRegeneratedAt < REGENERATE_COOLDOWN_MS) {
    throw new HttpsError("resource-exhausted", "Please wait a moment before requesting another code.");
  }

  let code = "";
  for (let i = 0; i < 6; i++) code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  await inviteRef.update({ code, lastRegeneratedAt: Date.now() });
  return { code };
});

// ---------------------------------------------------------------------
// APEX AI Insights / Coach Notes — the two Cloud Functions that let the
// rule-based engine in src/lib/apexInsights.js hand off to a real LLM
// call instead of its local keyword heuristics, without ever putting an
// API key in client-side code. This preserves the split described at the
// top of apexInsights.js: WHETHER an insight fires, and what real data
// backs it, always stays a deterministic rule running client-side against
// the coach's own Firestore data; only the natural-language PHRASING is
// delegated here, and only ever from data the rule already verified.
//
// Requires ANTHROPIC_API_KEY to be set as a runtime env var (see
// .env.zach-mcivor-pt-app in this directory — NOT committed to git) before
// either of these do anything real. Until it's a genuine key, both throw
// and the client-side callers in AppContext.jsx catch the error and fall
// back to their existing local heuristics — nothing in the app breaks,
// APEX just stays on keyword-matching until a real key is in place.
// ---------------------------------------------------------------------
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Must match CLIENT_CONTEXT_CATEGORIES in src/lib/apexInsights.js — kept
// as a literal here rather than imported since functions/ is a separate
// CommonJS package with no build step pulling in the web app's ES modules.
const CONTEXT_CATEGORIES = ["Training", "Lifestyle", "Nutrition", "Coaching Considerations", "Personal Preferences"];

async function callClaude(apiKey, system, userText, maxTokens) {
  if (!apiKey || apiKey === "not-configured-yet") throw new Error("ANTHROPIC_API_KEY isn't set yet");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((c) => c.text || "").join("").trim();
}

async function requireCoach(uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(uid).get();
  if (snap.data()?.role !== "coach") throw new HttpsError("permission-denied", "Only the coach can do this.");
}

// Replaces the client-side detectNoteContext() keyword heuristic with
// real language understanding — returns the exact same shape
// ({ items: [{category, suggestion}] }) so the coach's approve/reject UI
// in SummaryPanel needs no changes either way. The model is explicitly
// told to invent nothing beyond what the note says and to return an
// empty array rather than reach for something to flag.
exports.analyzeNoteContext = onCall(async (request) => {
  await requireCoach(request.auth?.uid);
  const text = (request.data?.text || "").trim();
  if (!text) return { items: [] };

  const system = `You help a personal trainer extract useful, ALREADY-STATED client context from a private note they just wrote about a client. You are not a medical professional and must never diagnose or speculate beyond what the note literally says.

Rules:
- Only report something the note actually says or clearly implies — never invent details, dates, or severity that aren't there.
- Each item must fit exactly one of these categories: ${CONTEXT_CATEGORIES.join(", ")}.
- Phrase "suggestion" as a short, hedged, reusable note for the client's profile (e.g. "Morning training consistency may currently be affected by disrupted sleep."), never as a command or a diagnosis.
- If the note has nothing clearly useful for future coaching context, return an empty array.
- Respond with ONLY a JSON array, no prose, no markdown fences. Example: [{"category":"Lifestyle","suggestion":"..."}]`;

  let raw;
  try {
    raw = await callClaude(process.env.ANTHROPIC_API_KEY, system, text, 400);
  } catch (err) {
    throw new HttpsError("internal", err.message);
  }

  let items;
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    items = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new HttpsError("internal", "Couldn't parse the model's response.");
  }
  if (!Array.isArray(items)) throw new HttpsError("internal", "Unexpected response shape.");

  return {
    items: items.filter((i) => i && typeof i.suggestion === "string" && CONTEXT_CATEGORIES.includes(i.category)).slice(0, 5),
  };
});

// Turns a fired insight rule's already-computed, real-data reasons into
// one natural sentence of coaching consideration. Never asked to decide
// WHETHER to flag anything (that's a deterministic rule in
// apexInsights.js already run before this is ever called) and given
// nothing beyond the reasons array it's handed, so it cannot introduce a
// fact, number, or cause the rule didn't already verify against real data.
exports.phraseApexSuggestion = onCall(async (request) => {
  await requireCoach(request.auth?.uid);
  const title = (request.data?.title || "").trim();
  const reasons = Array.isArray(request.data?.reasons) ? request.data.reasons.filter((r) => typeof r === "string") : [];
  if (!title || reasons.length === 0) throw new HttpsError("invalid-argument", "Missing title or reasons.");

  const system = `You write one short, neutral coaching-consideration sentence for a personal trainer's dashboard, based ONLY on the flagged pattern and reasons given to you.

Rules:
- Use only the facts in the reasons provided — never add a fact, number, or cause that isn't there.
- Never diagnose, and never state a conclusion as certain. Use hedged language: "Consider reviewing...", "May be worth...", "Possible contributing factor...".
- Never instruct a specific change to a program, sets/reps, calories, or macros — only suggest reviewing or checking in.
- Respond with exactly one plain-text sentence. No markdown, no quotes around it, no preamble.`;

  const userText = `Flagged pattern: ${title}\nReasons:\n${reasons.map((r) => `- ${r}`).join("\n")}`;

  let suggestion;
  try {
    suggestion = await callClaude(process.env.ANTHROPIC_API_KEY, system, userText, 120);
  } catch (err) {
    throw new HttpsError("internal", err.message);
  }
  return { suggestion: suggestion.replace(/^"|"$/g, "") };
});

// ---------------------------------------------------------------------
// AI Nutrition Help — the Nutrition tab's "what should I eat" assistant.
// Unlike the two functions above, this one is client-callable (any
// signed-in user acting on their own nutrition data, not coach-only).
// The client already holds everything needed to answer (today's targets
// and progress, computed from their own Firestore data) and sends it as
// `context` — this function never re-reads Firestore itself, it only
// turns real numbers the client already verified into a natural-language
// answer and, where a concrete food fits, a short list of structured
// suggestions the UI can turn into "Add to food log" buttons. The model
// is never allowed to invent a precise macro target or pretend
// restaurant nutrition is exact — see the system prompt below.
// ---------------------------------------------------------------------
exports.nutritionAiHelp = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const message = (request.data?.message || "").trim();
  const context = request.data?.context || {};
  const history = Array.isArray(request.data?.history) ? request.data.history.slice(-6) : [];
  if (!message) throw new HttpsError("invalid-argument", "Missing message.");

  const system = `You are the "AI Nutrition Help" assistant built into the APEX Coaching Platform's Nutrition tab. You help a client decide what to eat RIGHT NOW by fitting their choice into their own remaining calories/macros for today — you are not a generic chatbot and you are not a medical professional.

You will be given the client's real, current nutrition state as JSON (targets, what they've consumed today, what's remaining, what they've already logged, and any stored dietary preferences/allergies/goal context). Treat every number in it as ground truth — never substitute a generic target, and never assume a number that isn't given.

Rules:
- Prioritize fitting the client's REMAINING calories first, then make sensible macro choices given what's left and their goal/preference — never require an exact macro match.
- Restaurant/menu nutrition is approximate. Always hedge with words like "roughly", "approximately", "about", "good fit", "reasonably close" — never state a suspiciously precise number like "447 kcal"; round to a sensible approximate figure instead (e.g. "~450 kcal").
- If the client's profile lists an allergy or intolerance, never suggest an item that plausibly conflicts with it, and name the allergy if you steer them away from something because of it (e.g. "Your profile lists a peanut allergy, so I'd avoid this option.").
- Never make a medical or diagnostic claim. Never tell the client to skip a meal or go hungry just to hit an exact number — food is still the point.
- Keep the conversational reply short (2-5 sentences), warm but direct, no filler disclaimers beyond what's naturally relevant.
- When you have a concrete food/menu suggestion with real-enough numbers to act on, include it in "suggestions" (0-3 items) so the app can offer an "Add to food log" button — each with an approximate calories/protein/carbs/fat. Leave "suggestions" empty for general advice that isn't a specific loggable food.
- Respond with ONLY a JSON object, no markdown fences, no prose outside the JSON: {"reply": "...", "suggestions": [{"name": "...", "calories": number, "protein": number, "carbs": number, "fat": number}]}`;

  const historyText = history.length
    ? `Conversation so far:\n${history.map((h) => `${h.role === "user" ? "Client" : "You"}: ${h.text}`).join("\n")}\n\n`
    : "";
  const userText = `${historyText}Client's current nutrition state (JSON):\n${JSON.stringify(context)}\n\nClient's new message: "${message}"`;

  let raw;
  try {
    raw = await callClaude(process.env.ANTHROPIC_API_KEY, system, userText, 500);
  } catch (err) {
    throw new HttpsError("internal", err.message);
  }

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new HttpsError("internal", "Couldn't parse the model's response.");
  }
  if (!parsed || typeof parsed.reply !== "string") throw new HttpsError("internal", "Unexpected response shape.");

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((s) => s && typeof s.name === "string")
        .slice(0, 3)
        .map((s) => ({
          name: s.name,
          calories: Math.round(Number(s.calories)) || 0,
          protein: Math.round(Number(s.protein)) || 0,
          carbs: Math.round(Number(s.carbs)) || 0,
          fat: Math.round(Number(s.fat)) || 0,
        }))
    : [];

  return { reply: parsed.reply, suggestions };
});

// ---------------------------------------------------------------------
// WHOOP integration — a client connects their own WHOOP account (OAuth)
// so their recovery/sleep/strain show up automatically instead of being
// typed in by hand. The access/refresh tokens are the one piece of this
// that must never reach the browser (a leaked refresh token is a standing
// way into someone's real WHOOP account), so the whole OAuth code
// exchange and every WHOOP API call happen here. whoopTokens/{uid} holds
// them and has no client-readable rule at all (see FIRESTORE_RULES.txt) —
// this file's Admin SDK access is the only thing that ever reads it.
//
// Requires WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET as runtime env vars
// (see .env.zach-mcivor-pt-app in this directory — NOT committed to git,
// same as ANTHROPIC_API_KEY above). Until they're real values,
// whoopConnect throws and the client-side Connect button in Profile shows
// that as an error toast rather than silently doing nothing.
// ---------------------------------------------------------------------
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

function whoopConfigured() {
  return (
    process.env.WHOOP_CLIENT_ID &&
    process.env.WHOOP_CLIENT_ID !== "not-configured-yet" &&
    process.env.WHOOP_CLIENT_SECRET &&
    process.env.WHOOP_CLIENT_SECRET !== "not-configured-yet"
  );
}

async function whoopTokenRequest(params) {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`WHOOP token request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function whoopApiGet(accessToken, path) {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`WHOOP API ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Refreshes an access token whenever it's expired or about to be (a 60s
// buffer so a sync mid-call never gets cut off), persisting the new pair
// back onto whoopTokens/{uid} so the next call doesn't have to refresh
// again. Returns the token data to actually use for this call.
async function ensureFreshWhoopToken(uid, tokenData) {
  if (tokenData.expiresAt > Date.now() + 60000) return tokenData;
  const refreshed = await whoopTokenRequest({
    grant_type: "refresh_token",
    refresh_token: tokenData.refreshToken,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    scope: "offline",
  });
  const next = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokenData.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  };
  await db.collection("whoopTokens").doc(uid).update(next);
  return { ...tokenData, ...next };
}

// Most-recent-first by whichever date field a WHOOP collection response
// uses — fetched with a small limit rather than trusting the API's
// default ordering, since that's undocumented and worth not relying on.
function mostRecent(records, dateField) {
  return [...(records || [])].sort((a, b) => new Date(b[dateField]) - new Date(a[dateField]))[0] || null;
}

// Pulls the latest recovery, sleep, and cycle (strain) entries and merges
// them into one bodyMetrics doc — the exact same per-day collection the
// client's manual Steps/Sleep/Resting Heart Rate logging already uses, so
// the Progress screen needs no separate storage for WHOOP-sourced numbers.
async function syncWhoopData(uid, tokenData) {
  const fresh = await ensureFreshWhoopToken(uid, tokenData);

  const [recovery, sleep, cycle] = await Promise.all([
    whoopApiGet(fresh.accessToken, "/recovery?limit=5").catch(() => null),
    whoopApiGet(fresh.accessToken, "/activity/sleep?limit=5").catch(() => null),
    whoopApiGet(fresh.accessToken, "/cycle?limit=5").catch(() => null),
  ]);

  const recoveryRecord = mostRecent(recovery?.records, "created_at");
  const sleepRecord = mostRecent(sleep?.records, "end");
  const cycleRecord = mostRecent(cycle?.records, "start");
  if (!recoveryRecord && !sleepRecord && !cycleRecord) return;

  // WHOOP timestamps a sleep/cycle by when it STARTED, which for an
  // overnight sleep is the previous evening — bucket by that date, not
  // today's, so a recovery score computed from last night's sleep lands
  // on the day it's actually "for". Same idea as scheduledDate on
  // workoutLogs, applied here to wearable data instead of a late-finished
  // workout.
  const anchor = recoveryRecord?.created_at || sleepRecord?.end || cycleRecord?.start;
  const dateKey = new Date(anchor).toISOString().slice(0, 10);

  const patch = { id: `${uid}_${dateKey}`, clientId: uid, date: dateKey };
  if (recoveryRecord?.score) {
    patch.whoopRecoveryScore = recoveryRecord.score.recovery_score;
    patch.whoopHrvMilli = recoveryRecord.score.hrv_rmssd_milli;
    // Shares the same field the client can also type in by hand — WHOOP's
    // own reading is strictly more accurate once connected, so it's fine
    // for a sync to keep this current rather than needing a second field.
    if (recoveryRecord.score.resting_heart_rate != null) patch.restingHeartRate = recoveryRecord.score.resting_heart_rate;
  }
  if (sleepRecord?.score) {
    patch.whoopSleepPerformance = sleepRecord.score.sleep_performance_percentage;
  }
  if (cycleRecord?.score) {
    patch.whoopStrain = cycleRecord.score.strain;
  }
  await db.collection("bodyMetrics").doc(patch.id).set(patch, { merge: true });
}

// Finishes the OAuth redirect — the client already sent the user to
// WHOOP and got a `code` back (see connectWhoop in AppContext.jsx); this
// exchanges it for tokens (needs client_secret, so it can only happen
// here) and does an immediate first sync so Progress has something to
// show right away instead of waiting for the next scheduled run.
exports.whoopConnect = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!whoopConfigured()) throw new HttpsError("failed-precondition", "WHOOP isn't set up on this server yet — ask your coach.");

  const code = (request.data?.code || "").trim();
  const redirectUri = (request.data?.redirectUri || "").trim();
  if (!code || !redirectUri) throw new HttpsError("invalid-argument", "Missing code or redirectUri.");

  let tokenRes;
  try {
    tokenRes = await whoopTokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
    });
  } catch (err) {
    throw new HttpsError("internal", "Couldn't connect to WHOOP — " + err.message);
  }

  const tokenData = {
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token,
    expiresAt: Date.now() + tokenRes.expires_in * 1000,
    connectedAt: Date.now(),
  };
  await db.collection("whoopTokens").doc(uid).set(tokenData);
  await db.collection("users").doc(uid).update({ whoopConnected: true });

  try {
    await syncWhoopData(uid, tokenData);
  } catch (err) {
    // The connection itself succeeded — a sync hiccup (e.g. no WHOOP data
    // recorded yet) shouldn't fail the whole connect flow. The scheduled
    // sync below will pick it up once there's something to fetch.
    console.error(`Initial WHOOP sync failed for ${uid}:`, err.message);
  }

  return { connected: true };
});

exports.whoopDisconnect = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  await db.collection("whoopTokens").doc(uid).delete();
  await db.collection("users").doc(uid).update({ whoopConnected: false });
  return { connected: false };
});

// Every 4 hours, refreshes WHOOP's latest recovery/sleep/strain for every
// connected client — keeps Progress current without a client needing to
// open the app right after waking up for their recovery score to appear.
exports.whoopSync = onSchedule({ schedule: "0 */4 * * *", timeZone: "UTC" }, async () => {
  if (!whoopConfigured()) return;
  const snap = await db.collection("whoopTokens").get();
  for (const tokenDoc of snap.docs) {
    try {
      await syncWhoopData(tokenDoc.id, tokenDoc.data());
    } catch (err) {
      console.error(`WHOOP sync failed for ${tokenDoc.id}:`, err.message);
    }
  }
});
