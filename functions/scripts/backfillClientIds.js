// One-time recovery script — run this yourself, locally, with your OWN
// Firebase service account key. Never paste that key/file into a chat with
// Claude or anyone else.
//
// WHAT THIS FIXES
// ----------------
// Before a client accepts their invite, the coach can build out their whole
// program/schedule/notes against a synthetic id (their invite's
// email-derived username) because there's no real Firebase Auth account for
// them yet. When they activate (set a password for the first time),
// Firebase Auth mints a brand-new random uid for their real account — a
// completely different id from that email-based one — so everything built
// for them before that moment (clientPhases, scheduledWorkouts, notes,
// logs, etc.) is left keyed to the OLD id and becomes invisible from their
// real account. Nothing was deleted — it's just stranded under the old id.
// This script finds that stranded data for every already-activated client
// and re-keys it to their real uid.
//
// A Cloud Function (onClientActivated in functions/index.js) now does this
// automatically for every FUTURE activation. This script is only needed to
// repair clients who activated before that fix was deployed.
//
// HOW TO RUN IT
// -------------
// 1. In the Firebase console: Project Settings -> Service Accounts ->
//    "Generate new private key". Save the downloaded JSON file somewhere
//    OUTSIDE this git repo (e.g. your Desktop) — never commit it.
// 2. cd functions && npm install (if you haven't already)
// 3. GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json node scripts/backfillClientIds.js
//    This first run is DRY RUN — it only logs what it would change, no writes.
// 4. Check the log output looks right, then run it for real:
//    GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json node scripts/backfillClientIds.js --apply

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const CLIENT_ID_COLLECTIONS = [
  "workoutLogs", "messages", "workoutComments", "progressPhotos", "savedMeals",
  "habits", "clientPhases", "formSchedules", "formResponses", "weighIns",
  "scheduledWorkouts", "bodyStatsSchedules", "nutritionLogs", "bodyMetrics",
  "notifications", "clientNotes",
];

const APPLY = process.argv.includes("--apply");

async function main() {
  const usersSnap = await db.collection("users").where("role", "==", "client").get();
  const clients = usersSnap.docs.map((d) => ({ uid: d.id, email: (d.data().email || "").trim().toLowerCase(), name: d.data().name }));

  console.log(`Found ${clients.length} activated client account(s). Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}\n`);

  let totalFixed = 0;

  for (const client of clients) {
    if (!client.email || client.email === client.uid) continue;

    for (const name of CLIENT_ID_COLLECTIONS) {
      const snap = await db.collection(name).where("clientId", "==", client.email).get();
      if (snap.empty) continue;

      console.log(`[${client.name || client.email}] ${snap.size} stray doc(s) in "${name}" keyed to old id "${client.email}" -> ${client.uid}`);
      totalFixed += snap.size;

      if (APPLY) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.update(d.ref, { clientId: client.uid }));
        await batch.commit();
      }
    }

    const oldHabitLogRef = db.collection("habitLog").doc(client.email);
    const oldHabitLogSnap = await oldHabitLogRef.get();
    if (oldHabitLogSnap.exists) {
      console.log(`[${client.name || client.email}] habitLog doc under old id "${client.email}" -> ${client.uid}`);
      totalFixed += 1;
      if (APPLY) {
        await db.collection("habitLog").doc(client.uid).set(oldHabitLogSnap.data(), { merge: true });
        await oldHabitLogRef.delete();
      }
    }
  }

  console.log(`\n${APPLY ? "Fixed" : "Would fix"} ${totalFixed} stray document(s) total.`);
  if (!APPLY && totalFixed > 0) {
    console.log("Re-run with --apply to actually make these changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
