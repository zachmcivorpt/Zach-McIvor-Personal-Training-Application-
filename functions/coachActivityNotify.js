// Coach push notifications for client activity (#215): a coached client
// finished a workout, added progress photos or logged a weigh-in. Fired by
// Firestore "created" triggers (functions/index.js), so nothing in the
// client app changes and a workout finished offline still notifies the
// coach once it reaches the server. Each kind has its own switch in the
// coach console (More → Push Notifications → notificationPrefs.workouts /
// progressPhotos / weighIns, on unless turned off).
//
// Pure helpers are exported for tests (coachActivityNotify.test.js).

const PHOTO_QUIET_MS = 15 * 60 * 1000; // one notification per photo set
const WEIGH_IN_MAX_AGE_MS = 36 * 60 * 60 * 1000; // backdated history isn't news

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "A client";
}

function prCount(log) {
  let n = 0;
  for (const e of log?.entries || []) for (const s of e?.sets || []) if (s?.isPR) n++;
  return n;
}

function workoutMessage(log, clientName) {
  const label = String(log?.dayLabel || "a workout").slice(0, 80);
  const prs = prCount(log);
  return {
    title: `${firstName(clientName)} completed ${label}`,
    body: prs > 0 ? `${prs} new personal best${prs === 1 ? "" : "s"}.` : "Tap to see their session.",
  };
}

function photoMessage(clientName) {
  return { title: `${firstName(clientName)} added progress photos`, body: "Tap to see them." };
}

function weighInMessage(weighIn, clientName) {
  const kg = Number(weighIn?.weight);
  return {
    title: `${firstName(clientName)} logged a weigh-in`,
    body: Number.isFinite(kg) && kg > 0 ? `${Math.round(kg * 10) / 10} kg` : "Tap to see it.",
  };
}

// A weigh-in the coach typed in, or an old one (imported history, Apple
// Health's backfill of past days), isn't the client checking in now.
function weighInWorthNotifying(weighIn, now = Date.now()) {
  if (!weighIn || weighIn.loggedBy === "coach") return false;
  const at = Number(weighIn.date);
  return Number.isFinite(at) && at > now - WEIGH_IN_MAX_AGE_MS;
}

// The most recent coach in the users collection (same rule as
// api-lib/notify.js getCoachId).
async function getCoachId(db) {
  const snap = await db.collection("users").where("role", "==", "coach").get();
  if (snap.empty) return null;
  const docs = snap.docs.slice().sort((a, b) => (b.data().lastLoginAt || 0) - (a.data().lastLoginAt || 0));
  return docs[0].id;
}

async function clientNameOf(db, clientId) {
  if (!clientId) return null;
  const snap = await db.collection("users").doc(clientId).get();
  if (!snap.exists || snap.data()?.role !== "client") return null;
  return snap.data()?.name || "A client";
}

// One push per photo set: the first photo notifies, more within 15 minutes
// don't. coachNotifyState is server-only (no firestore.rules match).
async function claimPhotoSlot(db, clientId, now = Date.now()) {
  const ref = db.collection("coachNotifyState").doc(clientId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = Number(snap.exists ? snap.data()?.lastPhotoAt : 0) || 0;
    if (now - last < PHOTO_QUIET_MS) return false;
    tx.set(ref, { lastPhotoAt: now }, { merge: true });
    return true;
  });
}

// kind: "workout" | "photo" | "weighIn"; data: the created doc.
async function notifyCoachOfActivity(db, notifyUser, kind, data, now = Date.now()) {
  const clientId = data?.clientId;
  const clientName = await clientNameOf(db, clientId);
  if (!clientName) return false; // not a coached client (or the doc is malformed)
  let message;
  let prefKey;
  if (kind === "workout") {
    message = workoutMessage(data, clientName);
    prefKey = "workouts";
  } else if (kind === "photo") {
    if (!(await claimPhotoSlot(db, clientId, now))) return false;
    message = photoMessage(clientName);
    prefKey = "progressPhotos";
  } else if (kind === "weighIn") {
    if (!weighInWorthNotifying(data, now)) return false;
    message = weighInMessage(data, clientName);
    prefKey = "weighIns";
  } else {
    return false;
  }
  const coachId = await getCoachId(db);
  if (!coachId) return false;
  await notifyUser(coachId, message, prefKey);
  return true;
}

module.exports = {
  PHOTO_QUIET_MS,
  workoutMessage,
  photoMessage,
  weighInMessage,
  weighInWorthNotifying,
  notifyCoachOfActivity,
};
