// Train Solo comeback push (#244). Once a member has gone 4+ days without a
// session (and was training in the last 30), ONE push for that gap offers a
// short comeback session; never a second for the same gap, none if their
// alerts are off (notificationPrefs.comeback). The session itself is built
// in the app from their latest log (src/solo/workoutSummary.js).
const { dateKeyInTz } = require("./soloPartners");

const COMEBACK_DAYS = 4;
const MAX_GAP_DAYS = 30;
const DAY = 86400000;

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

// Pure: is this member due a comeback push now? Returns the gap's id
// (their last training day) and length, or null.
function comebackDue({ logs = [], tz, nowMs, prefs = {} }) {
  if (prefs.comeback === false) return null;
  const days = logs.map((l) => Number(l.date) || Date.parse(l.date) || 0).filter(Boolean).map((at) => dateKeyInTz(at, tz));
  if (!days.length) return null;
  const last = days.sort().pop();
  const gap = daysBetween(last, dateKeyInTz(nowMs, tz));
  if (gap < COMEBACK_DAYS || gap > MAX_GAP_DAYS) return null;
  return { lastKey: last, gap };
}

function comebackPushText({ firstName = "", gap }) {
  return {
    title: firstName ? `Pick up where you left off, ${firstName}` : "Pick up where you left off",
    body: `${gap} days since your last session. A 20-minute comeback session is ready — one tap to start.`,
  };
}

async function sendComebackPushes(db, messaging, nowMs = Date.now()) {
  const users = await db.collection("soloUsers").get();
  let sent = 0;
  for (const userDoc of users.docs) {
    const data = userDoc.data() || {};
    const tokens = data.fcmTokens || [];
    if (!tokens.length || data.notificationPrefs?.comeback === false) continue;
    try {
      const logsSnap = await db.collection("soloWorkoutLogs").where("soloUserId", "==", userDoc.id).get();
      const due = comebackDue({ logs: logsSnap.docs.map((d) => d.data()), tz: data.tz, nowMs, prefs: data.notificationPrefs || {} });
      if (!due) continue;
      // Once per gap, ever: create() fails if this gap already had its push.
      try {
        await db.collection("soloComebackPushes").doc(`${userDoc.id}_${due.lastKey}`).create({ at: nowMs, gap: due.gap });
      } catch {
        continue;
      }
      const firstName = String(data.name || "").trim().split(/\s+/)[0] || "";
      const res = await messaging.sendEachForMulticast({ tokens, notification: comebackPushText({ firstName, gap: due.gap }), webpush: { fcmOptions: { link: "/solo/home" } } });
      const dead = tokens.filter((_, i) => !res.responses[i].success);
      if (dead.length) await userDoc.ref.update({ fcmTokens: tokens.filter((t) => !dead.includes(t)) });
      sent += 1;
    } catch (err) {
      console.error("comeback push failed for", userDoc.id, err.message);
    }
  }
  return sent;
}

module.exports = { COMEBACK_DAYS, MAX_GAP_DAYS, comebackDue, comebackPushText, sendComebackPushes };
