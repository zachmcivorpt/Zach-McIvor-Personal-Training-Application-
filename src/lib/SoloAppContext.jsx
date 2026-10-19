import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { soloAuth, soloDb } from "./firebase";

// Completely separate from AppContext.jsx/AppProvider on purpose — Train
// Solo's session must never share a React context, a listener, or an
// in-memory Auth object with Coaching's. See firebase.js's comment on
// `soloApp`/`soloAuth`/`soloDb` for why that's a real, verified guarantee
// and not just a naming convention. This provider is only ever mounted
// under the /solo/* route subtree (see App.jsx) — a Coaching user never
// loads this code or runs this listener at all.
function friendlySoloAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Incorrect email or password.";
  }
  if (code.includes("email-already-in-use")) return "That email is already registered.";
  if (code.includes("weak-password")) return "Choose a password with at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email.";
  if (code.includes("network-request-failed")) return "Network error — check your connection and try again.";
  return err?.message || "Something went wrong. Please try again.";
}

const SoloAppCtx = createContext(null);

export function SoloAppProvider({ children }) {
  const [soloAuthUser, setSoloAuthUser] = useState(undefined); // undefined = still checking, null = signed out
  const [soloProfile, setSoloProfile] = useState(null); // soloUsers/{uid} doc

  useEffect(() => onAuthStateChanged(soloAuth, (u) => setSoloAuthUser(u)), []);

  useEffect(() => {
    if (!soloAuthUser) {
      setSoloProfile(null);
      return;
    }
    return onSnapshot(doc(soloDb, "soloUsers", soloAuthUser.uid), (snap) => {
      setSoloProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [soloAuthUser]);

  const soloSessionLoading = soloAuthUser === undefined || (!!soloAuthUser && soloProfile === null && soloAuthUser !== null);

  const actions = useMemo(
    () => ({
      async registerSoloAccount({ name, email, password }) {
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(soloAuth, email.trim(), password);
        } catch (err) {
          throw new Error(friendlySoloAuthError(err));
        }
        const uid = cred.user.uid;
        const account = {
          name: (name || "").trim(),
          email: email.trim(),
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        };
        try {
          await setDoc(doc(soloDb, "soloUsers", uid), account);
        } catch (err) {
          // The Auth account now exists even though its profile doc
          // failed to write (offline, a rules issue) — surfacing this
          // distinctly means a retry can go through soloLogin + a profile
          // repair step later, rather than this error being confused with
          // "the email/password itself was rejected."
          throw new Error(
            "Your account was created, but saving your details failed — " +
              (err.message || "check your connection and try again, then sign in.")
          );
        }
        return { id: uid, ...account };
      },

      async soloLogin(email, password) {
        try {
          const cred = await signInWithEmailAndPassword(soloAuth, email.trim(), password);
          setDoc(doc(soloDb, "soloUsers", cred.user.uid), { lastLoginAt: Date.now() }, { merge: true }).catch(() => {});
          return cred.user;
        } catch (err) {
          throw new Error(friendlySoloAuthError(err));
        }
      },

      async soloLogout() {
        await signOut(soloAuth);
      },
    }),
    []
  );

  const value = useMemo(
    () => ({
      soloAuthUser,
      soloProfile,
      soloCurrentUser: soloProfile,
      soloSessionLoading,
      ...actions,
    }),
    [soloAuthUser, soloProfile, soloSessionLoading, actions]
  );

  return <SoloAppCtx.Provider value={value}>{children}</SoloAppCtx.Provider>;
}

export function useSoloApp() {
  const ctx = useContext(SoloAppCtx);
  if (!ctx) throw new Error("useSoloApp must be used within a SoloAppProvider");
  return ctx;
}
