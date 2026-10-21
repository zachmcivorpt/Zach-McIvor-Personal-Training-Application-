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
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  getDocFromServer,
  writeBatch,
  onSnapshot,
  collection,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { soloAuth, soloDb, soloFunctions } from "./firebase";
import { isComplete } from "../solo/onboarding/questionnaireConfig";
import { localDateKey } from "./dateKey";
import { removeSoloPushToken } from "./push";

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
  // A customer's own body-weight log — the Progress tab. Same isolation
  // as soloWorkoutLogs: never Coaching's weighIns collection, never
  // visible to a coach.
  const [soloWeighIns, setSoloWeighIns] = useState([]);
  // A customer's own progress photos / manually-logged body metrics
  // (steps, sleep, resting heart rate, body fat %, lean mass,
  // measurements) — completing the Progress tab. Same isolation as
  // soloWeighIns above: never Coaching's progressPhotos/bodyMetrics
  // collections, never visible to a coach.
  const [soloProgressPhotos, setSoloProgressPhotos] = useState([]);
  const [soloBodyMetrics, setSoloBodyMetrics] = useState([]);
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

  // Oldest first — same ordering WeightHistoryScreen (reused as-is from
  // ClientApp.jsx) expects: it treats the LAST array entry as "latest".
  useEffect(() => {
    if (!soloAuthUser) {
      setSoloWeighIns([]);
      return;
    }
    const q = query(collection(soloDb, "soloWeighIns"), where("soloUserId", "==", soloAuthUser.uid));
    return onSnapshot(q, (snap) => {
      setSoloWeighIns(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.date - b.date));
    });
  }, [soloAuthUser]);

  // Newest first — same ordering PhotosSection (reused as-is from
  // ClientApp.jsx) expects, matching Coaching's own progressPhotos bucket.
  useEffect(() => {
    if (!soloAuthUser) {
      setSoloProgressPhotos([]);
      return;
    }
    const q = query(collection(soloDb, "soloProgressPhotos"), where("soloUserId", "==", soloAuthUser.uid));
    return onSnapshot(q, (snap) => {
      setSoloProgressPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date - a.date));
    });
  }, [soloAuthUser]);

  // One doc per calendar day (id `{uid}_{dateKey}`), same shape as
  // Coaching's bodyMetrics — buildBodyMetricEntries (reused as-is) sorts
  // these itself, so no ordering requirement here.
  useEffect(() => {
    if (!soloAuthUser) {
      setSoloBodyMetrics([]);
      return;
    }
    const q = query(collection(soloDb, "soloBodyMetrics"), where("soloUserId", "==", soloAuthUser.uid));
    return onSnapshot(q, (snap) => {
      setSoloBodyMetrics(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
          // updateDoc(), not setDoc(..., {merge: true}) — confirmed live
          // that setDoc+merge here, on a brand-new login session against
          // soloDb's real persistentLocalCache/persistentMultipleTabManager
          // (not reproducible against a plain in-memory Firestore client),
          // could silently wipe the entire soloUsers/{uid} document down
          // to just this one lastLoginAt field — destroying name, email,
          // onboarding.answers/completed, legalAcceptance, everything, on
          // ordinary login. updateDoc() sends the same single-field
          // server-side merge but never reproduced the wipe in repeated
          // live testing (register → fresh login cycle, twice, both
          // clean). Fire-and-forget on purpose: a slow/failed timestamp
          // bump should never block getting into the app.
          updateDoc(doc(soloDb, "soloUsers", cred.user.uid), { lastLoginAt: Date.now() }).catch(() => {});
          return cred.user;
        } catch (err) {
          throw new Error(friendlySoloAuthError(err));
        }
      },

      // soloDb uses persistentLocalCache (see firebase.js) specifically so
      // onSnapshot listeners "fire instantly from what's already on disk,
      // then quietly reconcile with the server" — exactly what makes the
      // FIRST soloCurrentUser a login delivers potentially a stale,
      // locally-cached document from a previous session on this same
      // browser/origin, corrected only moments later. That's harmless for
      // most of the app, but wrong for the one-time "where do I send this
      // login" decision: an account that completed onboarding after this
      // browser last cached it would read as incomplete just long enough
      // to get redirected to the questionnaire before the real value
      // arrives. getDocFromServer bypasses the cache for this one check.
      async fetchOnboardingCompletedFromServer(uid) {
        const snap = await getDocFromServer(doc(soloDb, "soloUsers", uid));
        const data = snap.data();
        if (data?.onboarding?.completed) return true;
        // Self-heal for accounts caught by either historical write bug in
        // this file (a nested-object write replacing the whole `onboarding`
        // field, then later a setDoc+merge dot-key write that silently
        // never touched the real nested path at all — see
        // saveOnboardingAnswer's and recordHealthConsent's own comments):
        // both could leave `completed: false` (or missing) stuck on an
        // account whose `answers` were, in fact, already complete. Never
        // touches `answers` itself and never fabricates completion for an
        // account that genuinely hasn't finished: `completed` is only ever
        // set here when isComplete() — the same function that gates the
        // questionnaire's own Finish button — says the stored answers
        // already satisfy it.
        const answers = data?.onboarding?.answers || {};
        if (!isComplete(answers)) return false;
        try {
          // A dotted string key only parses as a nested field path on
          // updateDoc() — setDoc's own {merge: true} treats it as one
          // literal field named "onboarding.completed" (dot included in
          // the name), never touching the real nested onboarding.completed
          // path at all. That's exactly the bug this self-heal exists to
          // repair, so using the same broken call here would silently
          // write a second, equally-unread field instead of actually
          // fixing anything — confirmed live: a setDoc({merge:true}) write
          // here left the document with a literal top-level
          // "onboarding.completed" key sitting beside an untouched,
          // still-wrong nested onboarding.completed.
          await updateDoc(doc(soloDb, "soloUsers", uid), { "onboarding.completed": true });
        } catch {
          // Best-effort repair — the next read tries again; this read
          // already knows the true answer regardless.
        }
        return true;
      },

      async soloLogout() {
        // Take this device's push token off the account first, while still
        // signed in (the rules only let the owner edit soloUsers/{uid}).
        const uid = soloAuth.currentUser?.uid;
        if (uid) await removeSoloPushToken(uid);
        await signOut(soloAuth);
      },

      // The customer's one active recovery add-on (a free kind:"recovery"
      // soloPrograms product), or null to remove it. Only one at a time —
      // setting a new one replaces the old. Its sessions are laid onto the
      // rest days of their started programs by src/solo/soloCalendar.js.
      async setRecoveryAddon(uid, programId) {
        await updateDoc(doc(soloDb, "soloUsers", uid), { recoveryAddon: programId ? { programId, addedAt: Date.now() } : null });
      },

      // Monday check-in reminders on/off (soloWeeklyCheckInReminder in
      // functions/index.js skips anyone with this set to false).
      async setSoloReminderPref(uid, enabled) {
        await updateDoc(doc(soloDb, "soloUsers", uid), { "notificationPrefs.weeklyCheckIn": !!enabled });
      },

      // Writes one answer and re-derives `onboarding.completed` from the
      // full answer set every time (via the same isComplete() the UI uses
      // to decide what's left) — so completion can never drift out of sync
      // with the actual questions, including when editing an earlier
      // answer in review mode flips something that was previously
      // complete back to incomplete (e.g. changing "not training" to
      // "training inconsistently" reveals a new required follow-up).
      //
      // The write sends the FULL `nextAnswers` map, not just the one
      // changed key, and uses dot-notation field paths rather than a
      // nested `onboarding: {...}` object: a plain nested object value
      // passed to setDoc's `{merge: true}` replaces the field's entire
      // previous value instead of merging into it, which previously wiped
      // every earlier answer (and, independently, recordHealthConsent's
      // own write wiped `answers`/`completed` the same way) on every save.
      //
      // Dot-notation keys only parse as nested field paths on updateDoc()
      // though — setDoc's {merge: true} does NOT special-case a dotted
      // string key the same way; it stores "onboarding.answers" as one
      // literal top-level field (dot included in the name), never
      // actually touching the real onboarding.answers/onboarding.completed
      // paths every read in this app (fetchOnboardingCompletedFromServer,
      // SoloRoutes' RequireOnboardingComplete, SoloOnboarding itself) is
      // looking at. That meant `onboarding.completed` could never
      // genuinely become true from this call, for any account, ever —
      // confirmed live: the document ends up with a bogus
      // "onboarding.answers"/"onboarding.completed" pair sitting at the
      // top level while the real nested onboarding.answers/completed stay
      // exactly as they were. updateDoc() is what these dot-paths actually
      // needed; the soloUsers/{uid} doc always already exists by the time
      // this runs (created with a real nested `onboarding` object at
      // registration), so updateDoc never hits a missing-document error.
      async saveOnboardingAnswer(uid, currentAnswers, questionId, value) {
        const nextAnswers = { ...currentAnswers, [questionId]: value };
        await updateDoc(doc(soloDb, "soloUsers", uid), {
          "onboarding.answers": nextAnswers,
          "onboarding.completed": isComplete(nextAnswers),
        });
      },

      // A separate, explicit consent record for the sensitive health
      // information collected in the questionnaire's safety section —
      // distinct from the Terms/Privacy acceptance recorded at
      // registration (OAIC APP 3.3 guidance: sensitive information needs
      // its own express consent, not implied by a general privacy notice
      // acceptance taken before the user even knew this section existed).
      // Dot-notation field path, not a nested `onboarding: {...}` object:
      // a plain nested object here would replace the ENTIRE onboarding
      // field — wiping out `answers` and `completed` (see
      // saveOnboardingAnswer's comment above for the same bug class).
      // updateDoc() is what actually implements dot-notation as a nested
      // field path — setDoc's own {merge: true} does not (it stores the
      // dotted string as one literal field name instead), so this used to
      // silently write a useless top-level "onboarding.healthConsentAcceptedAt"
      // field while never touching the real nested one. updateDoc() here
      // updates only this one nested field and leaves every sibling
      // (answers, completed) untouched, same as intended all along.
      async recordHealthConsent(uid) {
        await updateDoc(doc(soloDb, "soloUsers", uid), { "onboarding.healthConsentAcceptedAt": Date.now() });
      },

      // Starts a real Stripe purchase — replaces the old Phase 2
      // placeholder (which just wrote a soloPurchases doc directly from
      // the client; firestore.rules now makes that `allow create: if
      // false`, so that path would just fail). Calls
      // createSoloCheckoutSession (functions/index.js) over soloFunctions
      // (not the Coaching `functions` export — see firebase.js's comment)
      // so the Cloud Function sees this customer's own verified uid, gets
      // back a Stripe-hosted Checkout URL, and the caller navigates there
      // (window.location.href = url) exactly like redirecting to any other
      // external page. The actual soloPurchases doc only ever gets created
      // after Stripe confirms payment, by the webhook — never here.
      // `{ alreadyOwned: true }` comes back instead of a URL when the
      // customer already holds a non-refunded purchase for this program,
      // so the caller can skip straight to My Training without starting a
      // pointless second checkout.
      async startSoloCheckout(programId) {
        const createCheckout = httpsCallable(soloFunctions, "createSoloCheckoutSession");
        const result = await createCheckout({ programId, returnOrigin: window.location.origin });
        return result.data;
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

      // Mirrors Coaching's own logWeight (AppContext.jsx) exactly — same
      // dateKey-to-noon-local-time handling so a backdated entry sorts
      // correctly against same-day workout logs.
      async logSoloWeight(uid, weight, dateKey) {
        const id = doc(collection(soloDb, "soloWeighIns")).id;
        let date = Date.now();
        if (dateKey && dateKey !== localDateKey()) {
          const [y, m, d] = dateKey.split("-").map(Number);
          date = new Date(y, m - 1, d, 12, 0, 0).getTime();
        }
        await setDoc(doc(soloDb, "soloWeighIns", id), { id, soloUserId: uid, weight, date });
      },
      async deleteSoloWeighIn(id) {
        await deleteDoc(doc(soloDb, "soloWeighIns", id));
      },

      // Mirrors Coaching's own addProgressPhoto/deleteProgressPhoto exactly
      // — same dataUrl-in-Firestore storage (fileToCompressedDataUrl on the
      // caller side keeps each doc well under Firestore's 1MB limit, same
      // as Coaching) and the same dateKey-to-noon-local-time backdating.
      async addSoloProgressPhoto(uid, dataUrl, caption = "", dateKey) {
        const id = doc(collection(soloDb, "soloProgressPhotos")).id;
        let date = Date.now();
        if (dateKey && dateKey !== localDateKey()) {
          const [y, m, d] = dateKey.split("-").map(Number);
          date = new Date(y, m - 1, d, 12, 0, 0).getTime();
        }
        await setDoc(doc(soloDb, "soloProgressPhotos", id), { id, soloUserId: uid, url: dataUrl, date, caption });
      },
      async deleteSoloProgressPhoto(id) {
        await deleteDoc(doc(soloDb, "soloProgressPhotos", id));
      },

      // Mirrors Coaching's own logBodyMetric/deleteBodyMetric exactly —
      // one merge-upserted doc per calendar day so logging a second field
      // for the same day fills it in alongside whatever's already there.
      async logSoloBodyMetric(uid, dateKey, field, value) {
        const id = `${uid}_${dateKey}`;
        await setDoc(doc(soloDb, "soloBodyMetrics", id), { id, soloUserId: uid, date: dateKey, [field]: value }, { merge: true });
      },
      async deleteSoloBodyMetric(uid, dateKey, field) {
        const id = `${uid}_${dateKey}`;
        await updateDoc(doc(soloDb, "soloBodyMetrics", id), { [field]: deleteField() });
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
          const [purchasesSnap, logsSnap, weighInsSnap, photosSnap, bodyMetricsSnap] = await Promise.all([
            getDocs(query(collection(soloDb, "soloPurchases"), where("soloUserId", "==", user.uid))),
            getDocs(query(collection(soloDb, "soloWorkoutLogs"), where("soloUserId", "==", user.uid))),
            getDocs(query(collection(soloDb, "soloWeighIns"), where("soloUserId", "==", user.uid))),
            getDocs(query(collection(soloDb, "soloProgressPhotos"), where("soloUserId", "==", user.uid))),
            getDocs(query(collection(soloDb, "soloBodyMetrics"), where("soloUserId", "==", user.uid))),
          ]);
          purchasesSnap.forEach((d) => batch.delete(d.ref));
          logsSnap.forEach((d) => batch.delete(d.ref));
          weighInsSnap.forEach((d) => batch.delete(d.ref));
          photosSnap.forEach((d) => batch.delete(d.ref));
          bodyMetricsSnap.forEach((d) => batch.delete(d.ref));
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
      soloWeighIns,
      soloProgressPhotos,
      soloBodyMetrics,
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
      soloWeighIns,
      soloProgressPhotos,
      soloBodyMetrics,
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
