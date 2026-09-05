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
async function notifyUser(uid, { title, body }) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
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

exports.onNewMessage = onDocumentCreated("messages/{id}", async (event) => {
  const m = event.data?.data();
  if (!m) return;
  const preview = (m.text || "Sent an attachment").slice(0, 120);

  if (m.from === "client") {
    const coachId = await getCoachId();
    if (coachId) await notifyUser(coachId, { title: "New message", body: preview });
  } else if (m.from === "coach" && m.clientId) {
    await notifyUser(m.clientId, { title: "Your coach sent a message", body: preview });
  }
});

exports.onNewCheckIn = onDocumentCreated("formResponses/{id}", async () => {
  const coachId = await getCoachId();
  if (coachId) {
    await notifyUser(coachId, { title: "New check-in submitted", body: "A client just submitted a check-in — tap to review." });
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
exports.checkInReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Australia/Sydney", region: "australia-southeast2" },
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
