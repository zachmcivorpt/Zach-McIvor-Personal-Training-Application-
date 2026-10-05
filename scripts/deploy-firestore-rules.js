// Publishes firestore.rules to the live Firebase project as part of every
// production build, so a rules change that's in the repo is automatically
// in effect too — this used to be a separate manual step (paste into
// Firebase Console → Rules → Publish), and forgetting it is exactly what
// caused the Groups "Missing or insufficient permissions" bug and would
// have caused the same thing again for errorLogs. Reuses the same
// FIREBASE_SERVICE_ACCOUNT_JSON Vercel environment variable already set up
// for /api/notify's Admin SDK access — no new secret needed. Deploying
// Firestore rules doesn't require the Blaze plan, same as everything else
// in this file.
//
// Runs after `vite build` (see package.json), and is deliberately
// best-effort: any failure here is logged clearly but never fails the
// build or blocks the app from deploying — a rules-publish hiccup should
// never take the whole site down.
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (process.env.VERCEL_ENV !== "production") {
  console.log("[firestore-rules] Not a production build — skipping rules deploy.");
  process.exit(0);
}

if (!serviceAccountJson) {
  console.warn("[firestore-rules] FIREBASE_SERVICE_ACCOUNT_JSON isn't set — skipping rules deploy.");
  process.exit(0);
}

const keyPath = join(tmpdir(), `firebase-sa-${Date.now()}.json`);

try {
  writeFileSync(keyPath, serviceAccountJson);
  execFileSync("npx", ["firebase-tools", "deploy", "--only", "firestore:rules", "--non-interactive"], {
    stdio: "inherit",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyPath },
  });
  console.log("[firestore-rules] Published successfully.");
} catch (err) {
  console.error("[firestore-rules] Deploy failed — rules may be out of date. Publish manually in Firebase Console if needed.");
  console.error(err.message || err);
} finally {
  try {
    unlinkSync(keyPath);
  } catch {
    // ignore
  }
}
