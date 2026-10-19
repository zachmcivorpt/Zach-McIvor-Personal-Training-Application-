import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Firebase config values are not secrets — the real access control lives in
// Firestore/Storage security rules (see FIRESTORE_RULES.txt), not in hiding
// this object. Safe to ship in client-side code.
const firebaseConfig = {
  apiKey: "AIzaSyAmKtzgfyJ14CjybJzoz2vabfsGxOZw0I4",
  authDomain: "zach-mcivor-pt-app.firebaseapp.com",
  projectId: "zach-mcivor-pt-app",
  storageBucket: "zach-mcivor-pt-app.firebasestorage.app",
  messagingSenderId: "558700619647",
  appId: "1:558700619647:web:3ac804c953f67884659c4a",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Persist every synced document to IndexedDB so the app isn't blank on
// every single open — without this, a fresh page load has an empty local
// cache and every onSnapshot listener (clients, stats, everything) has to
// wait on a full network round-trip before showing anything, even for a
// coach who was just looking at the same data a minute ago. With a
// persistent cache, the listeners fire instantly from what's already on
// disk, then quietly reconcile with the server once that round-trip
// finishes — so clients/stats appear immediately on open instead of
// popping in after a beat. Falls back to the plain in-memory client if
// persistence can't init (e.g. no IndexedDB — very old browser, some
// private-browsing modes) so the app still works either way.
export const db = (() => {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.error("Firestore persistent cache unavailable, falling back to in-memory:", err);
    return getFirestore(firebaseApp);
  }
})();

export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp);

// A second, independently-NAMED Firebase app — same project/config, not a
// new project — used exclusively by Train Solo (src/lib/SoloAppContext.jsx
// and src/solo/*). Firebase Auth keeps one "currently signed in user" per
// app INSTANCE, not per project: the Coaching side's onAuthStateChanged
// listener (AppContext.jsx) is registered on `auth` above, a specific JS
// object. Signing a Train Solo user in/up against THIS separate `soloAuth`
// object instead never touches that listener or `auth.currentUser` at
// all — there is no shared mutable state between the two for Firebase to
// ever cross-wire, regardless of how many tabs are open. (Verified: each
// named app's persisted session is independently keyed — e.g.
// `firebase:authUser:{apiKey}:[DEFAULT]` vs `...:solo` — so this holds
// across page reloads too, not just within one page's lifetime.)
//
// Firestore access for Train Solo must go through `soloDb` (bound to this
// same `soloApp`), never the Coaching `db` above — a Firestore client only
// auto-attaches the ID token of the Auth instance it's bound to, so a
// Train Solo write through the Coaching `db` would carry the Coaching
// user's token (or none), not the Train Solo user's.
export const soloApp = initializeApp(firebaseConfig, "solo");
export const soloAuth = getAuth(soloApp);
export const soloDb = (() => {
  try {
    return initializeFirestore(soloApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.error("Solo Firestore persistent cache unavailable, falling back to in-memory:", err);
    return getFirestore(soloApp);
  }
})();
