import { sendPasswordResetEmail } from "firebase/auth";

// #316 (owner, 2026-11-20): "Forgot password?" failed with
// auth/unauthorized-continue-uri. The reset email asks Firebase to show a
// "Continue" link back to the page it came from (window.location.origin),
// and Firebase refuses the WHOLE email when that site isn't on the project's
// authorised domains (the iPhone app's site wasn't). The link back is only a
// nicety: if Firebase refuses it, send the plain reset email instead.
const CONTINUE_REFUSED = ["auth/unauthorized-continue-uri", "auth/invalid-continue-uri", "auth/unauthorized-domain", "auth/missing-continue-uri"];

export async function sendResetEmail(authInstance, email, path) {
  try {
    await sendPasswordResetEmail(authInstance, email, { url: `${window.location.origin}${path}`, handleCodeInApp: false });
  } catch (err) {
    if (!CONTINUE_REFUSED.includes(err?.code)) throw err;
    await sendPasswordResetEmail(authInstance, email);
  }
}
