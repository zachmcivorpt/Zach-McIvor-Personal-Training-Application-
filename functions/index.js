// Cloud Functions — the one piece of this app that genuinely needs a
// server, because sending a push notification requires a privileged
// Admin SDK call the browser is never trusted to make itself. Everything
// else in this app runs entirely client-side against Firestore; this is
// the deliberate, minimal exception.
//
// Three triggers:
//   - a new "messages" doc  -> push the other party (coach <-> client), event-driven
//   - a new "formResponses" doc -> push the coach ("check-in submitted"), event-driven
//   - a daily schedule -> push a client whose weekly check-in form is due
//     tomorrow and who hasn't already filled it out this week

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
    if (coachId) await notifyUser(coachId, { title: "New message", body: preview }, "messages");
  } else if (m.from === "coach" && m.clientId) {
    await notifyUser(m.clientId, { title: "Your coach sent a message", body: preview });
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
