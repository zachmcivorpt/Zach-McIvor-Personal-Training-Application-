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
export const VAPID_KEY = "BKhC7dAggWvL9P4lbtTmpenxKmu9ape7fyuc9fpv4nkJay4fhkOVBY8c6sWBCZ4fk3FkjE-7MgMyfEonrzDBLwU";

// WHOOP OAuth "Client ID" — from the WHOOP Developer Dashboard
// (developer.whoop.com) after registering an app there. The client ID is
// meant to be public (it's embedded in every OAuth app, mobile or web) —
// only the matching Client Secret is sensitive, and that one lives
// server-side only in functions/.env.<project-id> (see WHOOP_SETUP.txt).
// Until this is a real value, the "Connect WHOOP" button in Profile shows
// a "not set up yet" message instead of attempting a broken redirect.
export const WHOOP_CLIENT_ID = "not-configured-yet";
