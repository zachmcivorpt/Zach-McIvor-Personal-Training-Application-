import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { soloAuth, soloDb } from "./firebase";
import { isComplete } from "../solo/onboarding/questionnaireConfig";

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
      // `legalAcceptance` is required, not optional — SoloRegisterScreen's
      // own checkboxes gate the submit button, but this is the actual
      // enforcement point: there is no code path that creates a Train
      // Solo account without recording which document versions (the
      // `effectiveDate` string already on each src/legal/legalContent.js
      // entry — not a separately-invented version scheme) were accepted,
      // and when.
      async registerSoloAccount({ name, email, password, legalAcceptance }) {
        if (!legalAcceptance?.termsAcceptedAt || !legalAcceptance?.privacyAcceptedAt) {
          throw new Error("You must accept the Terms of Service and Privacy Policy to continue.");
        }
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
          legalAcceptance,
          onboarding: { completed: false, answers: {} },
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

      // Writes one answer and re-derives `onboarding.completed` from the
      // full answer set every time (via the same isComplete() the UI uses
      // to decide what's left) — so completion can never drift out of sync
      // with the actual questions, including when editing an earlier
      // answer in review mode flips something that was previously
      // complete back to incomplete (e.g. changing "not training" to
      // "training inconsistently" reveals a new required follow-up).
      async saveOnboardingAnswer(uid, currentAnswers, questionId, value) {
        const nextAnswers = { ...currentAnswers, [questionId]: value };
        await setDoc(
          doc(soloDb, "soloUsers", uid),
          { onboarding: { answers: { [questionId]: value }, completed: isComplete(nextAnswers) } },
          { merge: true }
        );
      },

      // A separate, explicit consent record for the sensitive health
      // information collected in the questionnaire's safety section —
      // distinct from the Terms/Privacy acceptance recorded at
      // registration (OAIC APP 3.3 guidance: sensitive information needs
      // its own express consent, not implied by a general privacy notice
      // acceptance taken before the user even knew this section existed).
      async recordHealthConsent(uid) {
        await setDoc(doc(soloDb, "soloUsers", uid), { onboarding: { healthConsentAcceptedAt: Date.now() } }, { merge: true });
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
