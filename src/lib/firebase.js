import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
