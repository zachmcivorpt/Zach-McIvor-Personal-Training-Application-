import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";
import { doc, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, onSnapshot, collection, query, where } from "firebase/firestore";
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
  const [soloProgramCategories, setSoloProgramCategories] = useState([]);
  const [soloPrograms, setSoloPrograms] = useState([]);
  const [soloPurchases, setSoloPurchases] = useState([]);
  // The shared exercise library — same collection Coaching's Program
  // Builder/WorkoutEditor reads from and the same one Solo programs'
  // phases/days already reference by exerciseId (see
  // src/coach/CoachTrainSolo.jsx's WorkoutEditor usage). Read-only reuse:
  // firestore.rules' exercises/{id} block is `allow read: if isSignedIn()`
  // with no role check at all, so a Train Solo account authenticated via
  // soloAuth already satisfies it with zero rule changes — write access
  // stays isCoach()-only, unchanged, so a Solo customer can only ever read
  // exercise names/videos, never create or edit one.
  const [soloExercises, setSoloExercises] = useState([]);
  // A customer's own completed-workout history — Phase 3's training
  // experience. Same isolation as soloPurchases: never Coaching's
  // workoutLogs collection, never another customer's logs.
  const [soloWorkoutLogs, setSoloWorkoutLogs] = useState([]);
  // The full phases/days/exercises for programs this customer actually
  // OWNS — keyed by programId. Deliberately fetched per owned program
  // (never a collection-wide listener): soloProgramContent/{id} is gated
  // to a coach or a customer with a matching soloPurchases doc (see
  // firestore.rules), so a program this customer hasn't bought is simply
  // never requested, not merely hidden in the UI.
  const [soloProgramContentByProgramId, setSoloProgramContentByProgramId] = useState({});
  // The coach's existing login background setting (settings/appDesign) —
  // public read, same doc Coaching's own LoginScreen reads, just via
  // soloDb instead of the Coaching `db` (see firebase.js's comment on why
  // those two clients must never be mixed). Re-read here rather than
  // duplicated into a Solo-specific setting, per the explicit "no
  // duplicate setting" requirement — there is exactly one coach-configured
  // background in this app, Coaching's, and the questionnaire reuses it.
  const [soloAppDesign, setSoloAppDesign] = useState({});
  const [soloBranding, setSoloBranding] = useState({ accent: "blue" });

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

  // Public-read catalogue data — loads before/without a signed-in Train
  // Solo session (see firestore.rules' soloProgramCategories/soloPrograms
  // blocks), same as the login background above.
  useEffect(() => {
    return onSnapshot(collection(soloDb, "soloProgramCategories"), (snap) => {
      setSoloProgramCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);
  useEffect(() => {
    return onSnapshot(collection(soloDb, "soloPrograms"), (snap) => {
      setSoloPrograms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);
  useEffect(() => {
    return onSnapshot(doc(soloDb, "settings", "appDesign"), (snap) => {
      setSoloAppDesign(snap.exists() ? snap.data() : {});
    });
  }, []);
  // Train Solo's own accent-colour setting — public read, see
  // firestore.rules' settings/soloBranding comment for why this is a
  // separate doc from settings/appDesign above.
  useEffect(() => {
    return onSnapshot(doc(soloDb, "settings", "soloBranding"), (snap) => {
      setSoloBranding(snap.exists() ? snap.data() : { accent: "blue" });
    });
  }, []);
  // Only subscribed once signed in (exercises/{id} requires isSignedIn());
  // nothing in the catalogue/program-details flow is reachable before
  // that anyway (see SoloRoutes.jsx's RequireSoloAuth gate).
  useEffect(() => {
    if (!soloAuthUser) {
      setSoloExercises([]);
      return;
    }
    return onSnapshot(collection(soloDb, "exercises"), (snap) => {
      setSoloExercises(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [soloAuthUser]);

  // A customer's own purchases only — scoped by the firestore.rules
  // soloPurchases block to exactly this uid, never another customer's.
  useEffect(() => {
    if (!soloAuthUser) {
      setSoloPurchases([]);
      return;
    }
    const q = query(collection(soloDb, "soloPurchases"), where("soloUserId", "==", soloAuthUser.uid));
    return onSnapshot(q, (snap) => {
      setSoloPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [soloAuthUser]);

  // One content listener per distinct owned programId — re-subscribes
  // only when the actual set of owned programs changes (not on every
  // soloPurchases field edit, e.g. a start-date change), via the joined-
  // ids dependency string below. A program this customer doesn't (or no
  // longer) own is dropped from state entirely rather than left stale.
  const ownedProgramIdsKey = soloPurchases.map((p) => p.programId).sort().join(",");
  useEffect(() => {
    const programIds = ownedProgramIdsKey ? ownedProgramIdsKey.split(",") : [];
    const unsubs = programIds.map((programId) =>
      onSnapshot(doc(soloDb, "soloProgramContent", programId), (snap) => {
        setSoloProgramContentByProgramId((prev) => ({ ...prev, [programId]: snap.exists() ? snap.data() : null }));
      })
    );
    setSoloProgramContentByProgramId((prev) => {
      const keep = new Set(programIds);
      const next = {};
      for (const [id, val] of Object.entries(prev)) if (keep.has(id)) next[id] = val;
      return next;
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedProgramIdsKey]);

  useEffect(() => {
    if (!soloAuthUser) {
      setSoloWorkoutLogs([]);
      return;
    }
    const q = query(collection(soloDb, "soloWorkoutLogs"), where("soloUserId", "==", soloAuthUser.uid));
    return onSnapshot(q, (snap) => {
      // Newest first — same ordering AppContext.jsx's bucket() gives
      // Coaching's workoutLogs, which is what getBestEverStats/
      // getPreviousSets (both reused as-is from lib/AppContext.jsx) expect:
      // "most recent logged performance" means the first match in the list.
      setSoloWorkoutLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date - a.date));
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

      // The Phase 2 "purchase" placeholder — no payment processor is
      // involved (see firestore.rules' soloPurchases comment). What this
      // actually does is real: it creates the ownership record that gates
      // every locked screen (Program Details' full Week 1+, My Training),
      // so the rest of the access-control path can be built and tested
      // end-to-end now, with only the payment step itself left for later.
      // No-ops if the customer already owns this program rather than
      // creating a second purchase of the same one.
      // The doc id is deterministic — `${uid}_${programId}` — rather than
      // random. This is what firestore.rules' soloProgramContent block
      // checks for with a direct exists() (rules can't run an arbitrary
      // query), so it's the mechanism that actually gates full program
      // content to owners. It also means "purchasing" the same program
      // twice can only ever overwrite the one real doc, never create a
      // second — the existingPurchases check below is just a client-side
      // short-circuit to skip the redundant write; the id scheme itself is
      // what makes a duplicate structurally impossible, not this check.
      async purchaseProgramPlaceholder(uid, programId, existingPurchases) {
        const already = (existingPurchases || []).find((p) => p.programId === programId);
        if (already) return already;
        const id = `${uid}_${programId}`;
        const purchase = {
          id,
          soloUserId: uid,
          programId,
          purchasedAt: Date.now(),
          placeholder: true, // no real payment was taken — see Phase 2 scope
          startDate: null,
        };
        await setDoc(doc(soloDb, "soloPurchases", id), purchase);
        return purchase;
      },

      // A customer picks or changes which calendar date Week 1, Day 1
      // starts on — everything else (which week they're "in" right now)
      // is derived from this plus today's date, never stored separately,
      // so it can never drift out of sync with the calendar.
      async setPurchaseStartDate(purchaseId, startDateKey) {
        await updateDoc(doc(soloDb, "soloPurchases", purchaseId), { startDate: startDateKey });
      },

      // Finishing a workout. `dayId` + `weekNumber` make a deterministic
      // doc id (same reasoning as Coaching's workoutLogDocId.js) — finishing
      // the same program week/day twice (two devices, a double-tap, a
      // reopened-to-fix-a-stat edit) overwrites the one real log instead of
      // creating a duplicate.
      async logSoloWorkout(uid, { purchaseId, dayId, weekNumber, dayLabel, entries, durationMin }) {
        const id = `${purchaseId}_${dayId}_w${weekNumber}`;
        const log = { id, soloUserId: uid, purchaseId, dayId, weekNumber, dayLabel, entries, durationMin, date: Date.now() };
        await setDoc(doc(soloDb, "soloWorkoutLogs", id), log);
        return log;
      },

      // Self-service account deletion — same App Store/Play Data Safety
      // requirement Coaching's own deleteMyAccount exists for, but doable
      // entirely client-side here rather than through a Cloud Function:
      // firestore.rules already lets a Train Solo customer delete their
      // own soloUsers/soloPurchases/soloWorkoutLogs docs outright (unlike
      // Coaching's users/{uid}, which Firestore rules never let a client
      // delete directly), and deleteUser() removes a signed-in user's own
      // Firebase Auth entry without needing Admin SDK privileges. Re-
      // authenticating first is the same safety check against a mis-tap
      // Coaching's version uses.
      async deleteMySoloAccount(password) {
        const user = soloAuth.currentUser;
        if (!user) throw new Error("Not signed in.");
        try {
          const credential = EmailAuthProvider.credential(user.email, password);
          await reauthenticateWithCredential(user, credential);
        } catch (err) {
          throw new Error(friendlySoloAuthError(err));
        }
        try {
          const batch = writeBatch(soloDb);
          const [purchasesSnap, logsSnap] = await Promise.all([
            getDocs(query(collection(soloDb, "soloPurchases"), where("soloUserId", "==", user.uid))),
            getDocs(query(collection(soloDb, "soloWorkoutLogs"), where("soloUserId", "==", user.uid))),
          ]);
          purchasesSnap.forEach((d) => batch.delete(d.ref));
          logsSnap.forEach((d) => batch.delete(d.ref));
          batch.delete(doc(soloDb, "soloUsers", user.uid));
          await batch.commit();
          await deleteUser(user);
        } catch (err) {
          throw new Error(err.message || "Couldn't delete your account — please try again.");
        }
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
      soloProgramCategories,
      soloPrograms,
      soloPurchases,
      soloAppDesign,
      soloBranding,
      soloExercises,
      soloWorkoutLogs,
      soloProgramContentByProgramId,
      ...actions,
    }),
    [
      soloAuthUser,
      soloProfile,
      soloSessionLoading,
      soloProgramCategories,
      soloPrograms,
      soloPurchases,
      soloAppDesign,
      soloBranding,
      soloExercises,
      soloWorkoutLogs,
      soloProgramContentByProgramId,
      actions,
    ]
  );

  return <SoloAppCtx.Provider value={value}>{children}</SoloAppCtx.Provider>;
}

export function useSoloApp() {
  const ctx = useContext(SoloAppCtx);
  if (!ctx) throw new Error("useSoloApp must be used within a SoloAppProvider");
  return ctx;
}
