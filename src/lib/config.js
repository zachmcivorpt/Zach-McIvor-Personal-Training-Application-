// Web Push "VAPID" public key — from Firebase Console → Project Settings →
// Cloud Messaging → Web Push certificates → generate a key pair. Public by
// design (like the rest of firebase.js's config), safe to ship in the
// client bundle. Push notifications are silently unavailable until this is
// filled in — see PUSH_NOTIFICATIONS_SETUP.txt for the full setup.
export const VAPID_KEY = "BKhC7dAggWvL9P4lbtTmpenxKmu9ape7fyuc9fpv4nkJay4fhkOVBY8c6sWBCZ4fk3FkjE-7MgMyfEonrzDBLwU";
