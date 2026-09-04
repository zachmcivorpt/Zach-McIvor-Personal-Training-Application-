// Cloud Functions — the one piece of this app that genuinely needs a
// server, because sending a push notification requires a privileged
// Admin SDK call the browser is never trusted to make itself. Everything
// else in this app runs entirely client-side against Firestore; this is
// the deliberate, minimal exception.
//
// Two triggers, both event-driven off collections the client already
// writes to — no new data model, no polling, no schedule:
//   - a new "messages" doc  -> push the other party (coach <-> client)
//   - a new "formResponses" doc -> push the coach ("check-in submitted")

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
