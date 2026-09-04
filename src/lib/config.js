// Gate on coach self-signup. This is a deterrent, not real security — this
// repo is public, so anyone determined enough can read this value in the
// source. It stops a casual visitor from tapping "Coach" and creating an
// account; it does not replace real auth. Change it any time (ask to have
// it updated, or edit this file directly) and redeploy.
export const COACH_SETUP_CODE = "MPTCOACH26";

// Web Push "VAPID" public key — from Firebase Console → Project Settings →
// Cloud Messaging → Web Push certificates → generate a key pair. Public by
// design (like the rest of firebase.js's config), safe to ship in the
// client bundle. Push notifications are silently unavailable until this is
// filled in — see PUSH_NOTIFICATIONS_SETUP.txt for the full setup.
export const VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE";
