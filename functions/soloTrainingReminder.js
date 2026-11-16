// Train Solo training reminder (#245). Runs hourly. A member who picked a
// training time (soloUsers.trainingTime "18:00") gets ONE push at that hour
// on a training day, only if they haven't trained yet today, and never
// twice on a day (claimed in soloTrainingReminders/{uid}_{day}).
// Training days: their questionnaire days (answers.trainingDays, 0 = Sunday),
// else a day they planned a session for, else weekdays they've trained on at
// least twice in the last 4 weeks.
const { dateKeyInTz } = require("./soloPartners");

const DAY = 86400000;

function localParts(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Australia/Sydney", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { hour: Number(get("hour")), weekday };
}

// Pure: is a reminder due for this member right now?
function trainingReminderDue({ profile = {}, logs = [], nowMs }) {
  const time = profile.trainingTime;
  if (!time || profile.notificationPrefs?.trainingTime === false) return null;
  const tz = profile.tz || "Australia/Sydney";
  const { hour, weekday } = localParts(nowMs, tz);
  if (hour !== Number(String(time).slice(0, 2))) return null;
  const today = dateKeyInTz(nowMs, tz);
  const dates = logs.map((l) => Number(l.date) || Date.parse(l.date) || 0).filter(Boolean);
  if (dates.some((at) => dateKeyInTz(at, tz) === today)) return null; // already trained
  const chosen = profile.onboarding?.answers?.trainingDays;
  let trainingDay;
  if (Array.isArray(chosen) && chosen.length) trainingDay = chosen.map(Number).includes(weekday);
  else if (Object.values(profile.plannedSessions || {}).some((p) => p?.date === today)) trainingDay = true;
  else {
    const counts = {};
    for (const at of dates) if (at > nowMs - 28 * DAY) counts[localParts(at, tz).weekday] = (counts[localParts(at, tz).weekday] || 0) + 1;
    trainingDay = (counts[weekday] || 0) >= 2;
  }
  return trainingDay ? { today } : null;
}

function reminderText({ firstName = "" }) {
  return { title: firstName ? `Training time, ${firstName}` : "Training time", body: "Today's session is ready when you are." };
}

async function sendTrainingReminders(db, messaging, nowMs = Date.now()) {
  const users = await db.collection("soloUsers").where("trainingTime", ">", "").get();
  let sent = 0;
  for (const userDoc of users.docs) {
    const data = userDoc.data() || {};
    const tokens = data.fcmTokens || [];
    if (!tokens.length) continue;
    try {
      // Cheap check first: only members whose hour it is.
      if (localParts(nowMs, data.tz).hour !== Number(String(data.trainingTime).slice(0, 2))) continue;
      const logsSnap = await db.collection("soloWorkoutLogs").where("soloUserId", "==", userDoc.id).get();
      const due = trainingReminderDue({ profile: data, logs: logsSnap.docs.map((d) => d.data()), nowMs });
      if (!due) continue;
      try {
        await db.collection("soloTrainingReminders").doc(`${userDoc.id}_${due.today}`).create({ at: nowMs });
      } catch {
        continue; // already reminded today
      }
      const firstName = String(data.name || "").trim().split(/\s+/)[0] || "";
      const res = await messaging.sendEachForMulticast({ tokens, notification: reminderText({ firstName }), webpush: { fcmOptions: { link: "/solo/home" } } });
      const dead = tokens.filter((_, i) => !res.responses[i].success);
      if (dead.length) await userDoc.ref.update({ fcmTokens: tokens.filter((t) => !dead.includes(t)) });
      sent += 1;
    } catch (err) {
      console.error("training reminder failed for", userDoc.id, err.message);
    }
  }
  return sent;
}

module.exports = { localParts, trainingReminderDue, reminderText, sendTrainingReminders };
