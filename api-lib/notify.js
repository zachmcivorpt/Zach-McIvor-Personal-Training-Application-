// Ported from functions/index.js's notifyUser/getCoachId — identical
// logic, just callable from a Vercel serverless function instead of a
// Firestore-triggered Cloud Function. Keep these two files' versions of
// this logic in sync if either ever changes (functions/index.js still
// exists and still works for anyone who deploys it on Blaze instead of
// using this /api path — the two are alternatives, not layered on
// each other).

// Sends to every device token stored on a user's profile doc, then prunes
// any token Firebase reports as dead (uninstalled app, revoked
// permission, expired registration) so the array doesn't grow forever.
// `prefKey`, when given, is checked against that user's own
// notificationPrefs — false explicitly opts out of that one notification
// type; anything else (including the field never having been set at all)
// defaults to on.
export async function notifyUser(db, messaging, uid, { title, body }, prefKey) {
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
    await userRef.update({ fcmTokens: tokens.filter((t) => !deadTokens.includes(t)) });
  }
}

// An account recovery can leave more than one users/{uid} doc with
// role: "coach" behind — ordering by whoever actually logged in most
// recently picks the real, currently-used account every time.
export async function getCoachId(db) {
  const snap = await db.collection("users").where("role", "==", "coach").get();
  if (snap.empty) return null;
  const docs = snap.docs.slice().sort((a, b) => (b.data().lastLoginAt || 0) - (a.data().lastLoginAt || 0));
  return docs[0].id;
}

// Every per-client collection keyed by a `clientId` field — mirrors
// AppContext.jsx's per-client Firestore listeners and
// functions/index.js's own CLIENT_ID_COLLECTIONS.
export const CLIENT_ID_COLLECTIONS = [
  "workoutLogs", "messages", "workoutComments", "progressPhotos", "savedMeals",
  "habits", "clientPhases", "formSchedules", "formResponses", "weighIns",
  "scheduledWorkouts", "bodyStatsSchedules", "nutritionLogs", "bodyMetrics",
  "notifications", "clientNotes",
];
