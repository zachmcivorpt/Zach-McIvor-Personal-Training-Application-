// Web Push registration via Firebase Cloud Messaging. Additive and
// self-contained — nothing else in the app needs to change to use this;
// a screen just imports enablePush/disablePush and calls them from a
// button tap (they must run from a real user gesture, per the browser
// Notification permission API).
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { firebaseApp, db as firestore } from "./firebase";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { VAPID_KEY } from "./config";

// Registered at a distinct, non-root scope so it coexists with the PWA's
// own precache service worker (which stays registered at "/") instead of
// fighting it for control of the same scope — this is Firebase's own
// documented pattern for apps that already have another service worker.
const SW_SCOPE = "/firebase-cloud-messaging-push-scope";

export async function pushSupported() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

// Requests permission, registers the messaging service worker, and saves
// the resulting device token onto the signed-in user's own profile doc
// (an array field, since one account can have several devices). Must be
// called from a user gesture (a click/tap handler), not on mount.
export async function enablePush(uid) {
  if (VAPID_KEY.includes("PASTE_YOUR")) {
    throw new Error("Push notifications aren't set up yet on this app — see PUSH_NOTIFICATIONS_SETUP.txt.");
  }
  if (!(await pushSupported())) {
    throw new Error("Push notifications aren't supported on this device or browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission wasn't granted — enable it in your browser/device settings and try again.");
  }
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: SW_SCOPE });
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Couldn't get a notification token — please try again.");
  await updateDoc(doc(firestore, "users", uid), { fcmTokens: arrayUnion(token) });
  return token;
}

export async function disablePush(uid, token) {
  if (!token) return;
  await updateDoc(doc(firestore, "users", uid), { fcmTokens: arrayRemove(token) }).catch(() => {});
}

// Messages that arrive while the app is open in the foreground don't go
// through the service worker's background handler — this is the
// foreground equivalent, so the app can show its own in-app toast instead.
export function listenForegroundPush(onReceive) {
  let unsub = () => {};
  let cancelled = false;
  pushSupported().then((ok) => {
    if (!ok || cancelled || VAPID_KEY.includes("PASTE_YOUR")) return;
    const messaging = getMessaging(firebaseApp);
    unsub = onMessage(messaging, (payload) => {
      onReceive(payload.notification?.title, payload.notification?.body);
    });
  });
  return () => {
    cancelled = true;
    unsub();
  };
}
