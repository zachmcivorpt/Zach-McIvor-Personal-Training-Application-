// Shared Firebase Admin SDK init for every /api/*.js serverless function.
// Lives outside the api/ directory on purpose — Vercel turns every file
// directly under api/ into its own HTTP endpoint, so a shared helper has
// to sit beside it instead, or it would itself become a (broken,
// argument-less) route.
//
// This replaces functions/index.js's Cloud Functions for the pieces this
// app actually needs server-side (sending a push requires a privileged
// Admin SDK call; re-keying a client's pre-activation data needs it too)
// — same Admin SDK, same Firestore project, just invoked from a Vercel
// serverless function (already hosting this app, free tier included)
// over HTTP instead of a Firestore-triggered Cloud Function, which
// requires Firebase's paid Blaze plan to run at all.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";

let app = null;

// Lazy — so importing this module never throws at cold start just because
// the env var isn't set yet; the first real request surfaces a clear
// error instead of every function failing to even load.
function getAdminApp() {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON isn't set — generate a service account key in Firebase Console (Project Settings -> Service accounts -> Generate new private key) and add its full JSON as a Vercel environment variable."
    );
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON isn't valid JSON — paste the whole downloaded key file's contents, unmodified.");
  }
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

export function getDb() {
  return getFirestore(getAdminApp());
}

export function getMessagingClient() {
  return getMessaging(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

// Every serverless function here requires a real, verified Firebase ID
// token — never a bare uid taken from the request body, which anyone
// could spoof. The token proves who's actually calling, same trust level
// request.auth.uid had inside a Cloud Function.
export async function requireUid(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    const err = new Error("Missing Authorization: Bearer <idToken> header.");
    err.statusCode = 401;
    throw err;
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    const err = new Error("Invalid or expired ID token.");
    err.statusCode = 401;
    throw err;
  }
}
