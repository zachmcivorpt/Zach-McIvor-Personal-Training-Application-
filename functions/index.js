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

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

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

async function getCoachId() {
  const snap = await db.collection("users").where("role", "==", "coach").limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
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
