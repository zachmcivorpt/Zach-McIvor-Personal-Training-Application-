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
