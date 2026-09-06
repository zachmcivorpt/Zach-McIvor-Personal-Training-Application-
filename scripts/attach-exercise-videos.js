// Attaches YouTube demo videos to a batch of common exercises, then
// schedules a clearly-labeled workout containing exactly those exercises
// onto a client's calendar so the coach can easily find and review them.
//
// This session has no direct write access to the live Firebase project —
// same reason the multi-tenant migration script (if you ever run that one)
// has to be run by you too. This script uses the Firebase Admin SDK, which
// bypasses Firestore security rules entirely, so it must be run from a
// trusted machine with your own service account key — never commit that
// key file to git.
//
// SETUP (one-time)
// -----------------
// 1. Firebase Console -> Project Settings (gear icon) -> Service Accounts
//    -> "Generate new private key". Save the downloaded JSON file
//    somewhere OUTSIDE this repo, e.g. ~/apex-service-account.json
// 2. From the repo root: npm install firebase-admin --no-save
//    (--no-save keeps it out of package.json since this is a one-off tool,
//    not something the deployed app needs)
//
// RUN
// ---
//   node scripts/attach-exercise-videos.js /path/to/service-account.json "Zach Mcivor" 2026-09-08
//
// Arguments:
//   1. Path to your service account JSON key (required)
//   2. Client name to search for, case-insensitive substring match
//      (required) — the script lists every match and stops if it finds
//      more than one, so you can be more specific and re-run.
//   3. Date (YYYY-MM-DD) to schedule the review workout on (optional,
//      defaults to today)
//
// This is safe to re-run: exercises are matched by name (created only if
// truly missing), and re-scheduling the same date cleanly replaces
// whatever was there before rather than duplicating.

const admin = require("firebase-admin");
const path = require("path");

const [, , keyPathArg, clientNameArg, dateArg] = process.argv;

if (!keyPathArg || !clientNameArg) {
  console.error("Usage: node attach-exercise-videos.js <service-account.json> <client name> [YYYY-MM-DD]");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyPathArg))),
});
const db = admin.firestore();

// Each entry: the exercise name to search/create, and the chosen YouTube
// video (found via web search + spot-checked for a clear, mainstream
// demonstration from a reputable source — not auto-picked blind).
const BATCH = [
  { name: "Barbell Back Squat", category: "Legs", videoUrl: "https://www.youtube.com/watch?v=8PMjqgR8Wa8" },
  { name: "Barbell Bench Press", category: "Chest", videoUrl: "https://www.youtube.com/watch?v=Pp8rHcFVIYg" },
  { name: "Conventional Deadlift", category: "Back", videoUrl: "https://www.youtube.com/watch?v=GxsLrTzyGUU" },
  { name: "Barbell Overhead Press", category: "Shoulders", videoUrl: "https://www.youtube.com/watch?v=GlyABLsPk-Q" },
  { name: "Barbell Bent-Over Row", category: "Back", videoUrl: "https://www.youtube.com/watch?v=rqTOAM8WoeM" },
  { name: "Pull-Up", category: "Back", videoUrl: "https://www.youtube.com/watch?v=vw5Xmu5CIew" },
  { name: "Lat Pulldown", category: "Back", videoUrl: "https://www.youtube.com/watch?v=JGeRYIZdojU" },
  { name: "Dumbbell Bicep Curl", category: "Arms", videoUrl: "https://www.youtube.com/watch?v=ykJmrZ5v0Oo" },
  { name: "Tricep Pushdown", category: "Arms", videoUrl: "https://www.youtube.com/watch?v=ozwo9RGm7QU" },
  { name: "Leg Press", category: "Legs", videoUrl: "https://www.youtube.com/watch?v=RbPmGoj6Db0" },
  { name: "Romanian Deadlift", category: "Legs", videoUrl: "https://www.youtube.com/watch?v=_oyxCn2iSjU" },
  { name: "Dumbbell Shoulder Press", category: "Shoulders", videoUrl: "https://www.youtube.com/watch?v=vlFGTI5JzjI" },
];

function slugify(name) {
  return "ex_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

async function findClient(nameQuery) {
  const snap = await db.collection("users").where("role", "==", "client").get();
  const needle = nameQuery.trim().toLowerCase();
  const matches = snap.docs.filter((d) => (d.data().name || "").toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new Error(`No client found matching "${nameQuery}". Check the name in your Clients list and try again.`);
  }
  if (matches.length > 1) {
    console.error(`Found ${matches.length} clients matching "${nameQuery}" — be more specific:`);
    matches.forEach((d) => console.error(`  - ${d.data().name} (${d.id})`));
    throw new Error("Ambiguous client name.");
  }
  return { id: matches[0].id, ...matches[0].data() };
}

async function upsertExercise(item) {
  const snap = await db.collection("exercises").get();
  const existing = snap.docs.find((d) => (d.data().name || "").toLowerCase() === item.name.toLowerCase());
  if (existing) {
    await existing.ref.update({ videoUrl: item.videoUrl });
    console.log(`  Updated existing exercise "${item.name}" (${existing.id}) with new video.`);
    return existing.id;
  }
  const id = slugify(item.name);
  await db.collection("exercises").doc(id).set({
    id,
    name: item.name,
    category: item.category,
    primaryMuscles: [item.category],
    secondaryMuscles: [],
    difficulty: "Intermediate",
    instructions: [],
    formCues: [],
    equipment: "",
    videoUrl: item.videoUrl,
  });
  console.log(`  Created new exercise "${item.name}" (${id}) with video.`);
  return id;
}

async function main() {
  const date = dateArg || new Date().toISOString().slice(0, 10);

  console.log(`Looking up client matching "${clientNameArg}"...`);
  const client = await findClient(clientNameArg);
  console.log(`Found: ${client.name} (${client.id})\n`);

  console.log("Attaching videos to exercises...");
  const exercises = [];
  for (const item of BATCH) {
    const exerciseId = await upsertExercise(item);
    exercises.push({ exerciseId, targetSets: 3, targetReps: 10, targetRIR: 2, notes: "Coach video-demo review batch." });
  }

  const workoutId = `${client.id}__${date}`;
  await db.collection("scheduledWorkouts").doc(workoutId).set({
    id: workoutId,
    clientId: client.id,
    date,
    label: "Video Demo Batch (Coach Review)",
    muscleGroups: [],
    exercises,
  });

  console.log(`\nDone. Scheduled "Video Demo Batch (Coach Review)" on ${date} for ${client.name}.`);
  console.log(`It'll show up on their Training tab / calendar for that date, with all ${exercises.length} exercises linked to their new videos.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFailed:", err.message);
    process.exit(1);
  });
