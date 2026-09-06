// Attaches YouTube demo videos to a batch of common exercises in your
// exercise library, matching by name against exercises that already exist
// so it doesn't create duplicates.
//
// This session has no direct write access to the live Firebase project —
// this script uses the Firebase Admin SDK, which bypasses Firestore
// security rules entirely, so it must be run BY YOU from a trusted
// machine with your own service account key. Never commit that key file
// to git.
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
//   node scripts/attach-exercise-videos.js /path/to/service-account.json
//
// Add --dry-run to only print what it would match/create, without writing
// anything — useful for checking name matches against your real library
// first:
//   node scripts/attach-exercise-videos.js /path/to/service-account.json --dry-run
//
// This is safe to re-run: exercises are matched by name and only created
// if truly missing, never duplicated.

const admin = require("firebase-admin");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keyPathArg = args.find((a) => !a.startsWith("--"));

if (!keyPathArg) {
  console.error("Usage: node attach-exercise-videos.js <service-account.json> [--dry-run]");
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

function normalize(name) {
  return (name || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Exact match first; if none, fall back to a substring match in either
// direction (e.g. target "Barbell Bench Press" vs. existing "Bench Press")
// so a slightly different existing name gets updated instead of creating
// a near-duplicate. Multiple substring candidates are reported and
// skipped rather than guessed at.
function findMatch(allDocs, targetName) {
  const target = normalize(targetName);
  const exact = allDocs.find((d) => normalize(d.data().name) === target);
  if (exact) return { doc: exact, kind: "exact" };

  const candidates = allDocs.filter((d) => {
    const n = normalize(d.data().name);
    return n.includes(target) || target.includes(n);
  });
  if (candidates.length === 1) return { doc: candidates[0], kind: "fuzzy" };
  if (candidates.length > 1) return { doc: null, kind: "ambiguous", candidates };
  return { doc: null, kind: "none" };
}

async function main() {
  const snap = await db.collection("exercises").get();
  const allDocs = snap.docs;

  console.log(dryRun ? "DRY RUN — no changes will be written.\n" : "Attaching videos to your exercise library...\n");

  const summary = { matched: [], created: [], ambiguous: [] };

  for (const item of BATCH) {
    const result = findMatch(allDocs, item.name);

    if (result.kind === "exact" || result.kind === "fuzzy") {
      const existingName = result.doc.data().name;
      console.log(`  MATCH  "${item.name}" -> existing "${existingName}" (${result.doc.id})`);
      if (!dryRun) await result.doc.ref.update({ videoUrl: item.videoUrl });
      summary.matched.push({ target: item.name, existing: existingName, id: result.doc.id });
      continue;
    }

    if (result.kind === "ambiguous") {
      console.log(`  SKIP   "${item.name}" — multiple possible matches, resolve manually:`);
      result.candidates.forEach((d) => console.log(`           - "${d.data().name}" (${d.id})`));
      summary.ambiguous.push(item.name);
      continue;
    }

    const id = slugify(item.name);
    console.log(`  NEW    "${item.name}" — no match found, would create as ${id}`);
    if (!dryRun) {
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
    }
    summary.created.push(item.name);
  }

  console.log(
    `\n${dryRun ? "Would update" : "Updated"} ${summary.matched.length} existing exercise(s), ` +
      `${dryRun ? "would create" : "created"} ${summary.created.length} new one(s)` +
      (summary.ambiguous.length ? `, skipped ${summary.ambiguous.length} ambiguous match(es).` : ".")
  );
  if (dryRun) console.log("\nRe-run without --dry-run once this list looks right.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFailed:", err.message);
    process.exit(1);
  });
