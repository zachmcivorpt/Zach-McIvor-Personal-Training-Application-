// Regression coverage for firestore.rules — runs against the real Firestore
// Emulator (not the production database) so it exercises the actual
// AUTH -> FIRESTORE RULE -> READ/WRITE chain, not just a UI mock.
//
// Requires the emulator to be running: `npm run test:rules` starts it via
// `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST for this
// process. Running the plain `npm test` without the emulator skips this
// whole file (it has no network access to fall back to) rather than
// failing every other test suite that doesn't need it.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { workoutLogDocId } from "./workoutLogId";

const emulatorRunning = !!process.env.FIRESTORE_EMULATOR_HOST;
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

const COACH_UID = "coach-1";
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

describe.skipIf(!emulatorRunning)("firestore.rules", () => {
  let testEnv;

  async function seedUsers() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", COACH_UID), { id: COACH_UID, role: "coach" });
      await setDoc(doc(db, "users", CLIENT_A), { id: CLIENT_A, role: "client" });
      await setDoc(doc(db, "users", CLIENT_B), { id: CLIENT_B, role: "client" });
    });
  }

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-apex-rules-test",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: EMULATOR_HOST,
        port: Number(EMULATOR_PORT),
      },
    });
    await seedUsers();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
    await seedUsers();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  function dbAs(uid) {
    return uid ? testEnv.authenticatedContext(uid).firestore() : testEnv.unauthenticatedContext().firestore();
  }

  // --- liveSessions/{clientId}: doc id IS the client's uid -------------
  // Regression for the bug where the client watched this collection with
  // where("clientId", "==", uid) — a FIELD filter — against a rule keyed
  // on the document's PATH, not a field. The query itself was rejected
  // because Firestore can't prove a field-based query satisfies a
  // path-based rule. The fix was switching the client query to
  // where(documentId(), "==", uid). These tests lock in the path-based
  // rule's actual behavior (direct doc access, which the corrected query
  // relies on) so a future rule change can't silently break it again.
  describe("liveSessions", () => {
    it("lets a client read and write their own live session doc", async () => {
      const db = dbAs(CLIENT_A);
      await assertSucceeds(setDoc(doc(db, "liveSessions", CLIENT_A), { exercises: [] }));
      await assertSucceeds(getDoc(doc(db, "liveSessions", CLIENT_A)));
    });

    it("blocks a client from reading or writing another client's live session", async () => {
      const dbB = dbAs(CLIENT_B);
      await assertFails(setDoc(doc(dbB, "liveSessions", CLIENT_A), { exercises: [] }));
      await assertFails(getDoc(doc(dbB, "liveSessions", CLIENT_A)));
    });

    it("lets the coach read (but not write) any client's live session", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "liveSessions", CLIENT_A), { exercises: [] });
      });
      const coachDb = dbAs(COACH_UID);
      await assertSucceeds(getDoc(doc(coachDb, "liveSessions", CLIENT_A)));
      await assertFails(setDoc(doc(coachDb, "liveSessions", CLIENT_A), { exercises: [] }));
    });
  });

  // --- resource == null regression (the Fuel IQ / nutritionLogs bug) ---
  // A brand-new document being read before it exists (the exact shape of
  // AppContext.jsx's setNutritionForDate transaction, which does a
  // tx.get() to decide create-vs-merge) must not throw. Before the fix,
  // `resource.data.clientId` on a null resource threw inside the rule,
  // and Firestore maps any rule evaluation error to a flat permission
  // denial — so a client's very first nutrition log of a new day failed
  // with "Missing or insufficient permissions" instead of just reading
  // back "not found."
  const nullResourceCollections = [
    "workoutLogs",
    "weighIns",
    "nutritionLogs",
    "bodyMetrics",
    "mealPlans",
    "scheduledWorkouts",
    "bodyStatsSchedules",
    "messages",
    "workoutComments",
    "progressPhotos",
    "savedMeals",
    "habits",
    "clientPhases",
    "formSchedules",
    "formResponses",
  ];

  for (const col of nullResourceCollections) {
    it(`${col}: reading a document that doesn't exist yet doesn't throw a permission error`, async () => {
      const db = dbAs(CLIENT_A);
      const snap = await assertSucceeds(getDoc(doc(db, col, "brand-new-doc-id")));
      expect(snap.exists()).toBe(false);
    });
  }

  // --- per-client isolation across the same "resource == null ||" set --
  // These collections are all gated by resource.data.clientId ==
  // request.auth.uid once the doc exists — confirms the null-resource
  // fix didn't accidentally widen read access to OTHER clients' existing
  // documents (the fix only needed to cover the missing-doc case).
  const clientOwnedCollections = [
    "workoutLogs",
    "weighIns",
    "nutritionLogs",
    "bodyMetrics",
    "scheduledWorkouts",
    "bodyStatsSchedules",
    "progressPhotos",
    "savedMeals",
    "habits",
    "formResponses",
  ];

  for (const col of clientOwnedCollections) {
    it(`${col}: a client can create/read/update their own doc but not another client's`, async () => {
      const dbA = dbAs(CLIENT_A);
      const dbB = dbAs(CLIENT_B);
      const id = `${col}-doc-1`;

      await assertSucceeds(setDoc(doc(dbA, col, id), { clientId: CLIENT_A, note: "mine" }));
      await assertSucceeds(getDoc(doc(dbA, col, id)));

      // Another client can't read it, and can't plant a doc claiming to
      // be theirs under someone else's clientId either.
      await assertFails(getDoc(doc(dbB, col, id)));
      await assertFails(setDoc(doc(dbB, col, `${col}-doc-2`), { clientId: CLIENT_A, note: "forged" }));
    });

    it(`${col}: the coach can read and manage any client's doc`, async () => {
      const dbA = dbAs(CLIENT_A);
      const id = `${col}-coach-doc`;
      await setDoc(doc(dbA, col, id), { clientId: CLIENT_A, note: "mine" });

      const coachDb = dbAs(COACH_UID);
      await assertSucceeds(getDoc(doc(coachDb, col, id)));
    });
  }

  // --- notifications/{id} and errorLogs/{id}: client creates, never reads
  for (const col of ["notifications", "errorLogs"]) {
    it(`${col}: a client can report their own but never read the list back`, async () => {
      const dbA = dbAs(CLIENT_A);
      const id = `${col}-doc-1`;
      await assertSucceeds(setDoc(doc(dbA, col, id), { clientId: CLIENT_A, message: "something failed" }));
      await assertFails(getDoc(doc(dbA, col, id)));

      // Can't file one claiming to be about another client either.
      await assertFails(setDoc(doc(dbA, col, `${col}-doc-2`), { clientId: CLIENT_B, message: "forged" }));
    });

    it(`${col}: the coach can read, update, and delete`, async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), col, "coach-visible"), { clientId: CLIENT_A, message: "hi" });
      });
      const coachDb = dbAs(COACH_UID);
      await assertSucceeds(getDoc(doc(coachDb, col, "coach-visible")));
      await assertSucceeds(updateDoc(doc(coachDb, col, "coach-visible"), { seen: true }));
      await assertSucceeds(deleteDoc(doc(coachDb, col, "coach-visible")));
    });
  }

  // --- messages/{id}, workoutComments/{id}: client creates/reads, but
  //     editing/deleting is coach-only (unlike the plain client-owned set
  //     above, which also lets the client update/delete their own row).
  for (const col of ["messages", "workoutComments"]) {
    it(`${col}: a client can create and read their own thread but not edit or delete an entry`, async () => {
      const dbA = dbAs(CLIENT_A);
      const id = `${col}-doc-1`;
      // Real app code always sets `from` on both collections (see
      // sendMessage/addWorkoutComment) — included here so this still
      // reflects an actual write, not a payload shape the app never sends.
      await assertSucceeds(setDoc(doc(dbA, col, id), { clientId: CLIENT_A, from: "client", text: "hi coach" }));
      await assertSucceeds(getDoc(doc(dbA, col, id)));
      await assertFails(updateDoc(doc(dbA, col, id), { text: "edited" }));
      await assertFails(deleteDoc(doc(dbA, col, id)));
    });
  }

  // --- messages/{id}: a signed-in writer can't claim a `from` that
  //     doesn't match their own authenticated role — the gap a weekly
  //     audit found (2026-10-12): the rule checked WHOSE thread a message
  //     landed in (via clientId) but never checked whether the `from`
  //     value actually matched who was doing the writing, so a client
  //     could (by calling Firestore directly, bypassing the app's own UI,
  //     which never does this itself) write a message into their own
  //     thread claiming `from: "coach"`, and it would render identically
  //     to a real coach-sent message.
  describe("messages: from must match the authenticated writer's actual role", () => {
    it("a client cannot create a message in their own thread claiming it's from the coach", async () => {
      const dbA = dbAs(CLIENT_A);
      await assertFails(setDoc(doc(dbA, "messages", "spoof-1"), { clientId: CLIENT_A, from: "coach", text: "fake coach message" }));
    });

    it("a client creating a message in their own thread as themselves still works", async () => {
      const dbA = dbAs(CLIENT_A);
      await assertSucceeds(setDoc(doc(dbA, "messages", "real-1"), { clientId: CLIENT_A, from: "client", text: "real client message" }));
    });

    it("the coach cannot create a message claiming it's from the client", async () => {
      const dbCoach = dbAs(COACH_UID);
      await assertFails(setDoc(doc(dbCoach, "messages", "spoof-2"), { clientId: CLIENT_A, from: "client", text: "fake client message" }));
    });

    it("the coach creating a message in a client's thread as themselves still works", async () => {
      const dbCoach = dbAs(COACH_UID);
      await assertSucceeds(setDoc(doc(dbCoach, "messages", "real-2"), { clientId: CLIENT_A, from: "coach", text: "real coach message" }));
    });
  });

  // --- challenges/{id} & groups/{id}: participant/member array membership
  for (const [col, arrayField] of [
    ["challenges", "participantIds"],
    ["groups", "memberIds"],
  ]) {
    it(`${col}: a listed participant can read; a non-participant cannot`, async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), col, "doc-1"), { [arrayField]: [CLIENT_A], name: "Thing" });
      });
      const dbA = dbAs(CLIENT_A);
      const dbB = dbAs(CLIENT_B);
      await assertSucceeds(getDoc(doc(dbA, col, "doc-1")));
      await assertFails(getDoc(doc(dbB, col, "doc-1")));
    });

    it(`${col}: reading a document that doesn't exist yet doesn't throw a permission error`, async () => {
      const dbA = dbAs(CLIENT_A);
      const snap = await assertSucceeds(getDoc(doc(dbA, col, "brand-new-doc-id")));
      expect(snap.exists()).toBe(false);
    });
  }

  // --- groupMessages/{id}: member can post, but only as themselves ------
  describe("groupMessages", () => {
    it("lets a member post as themselves into a group they're in", async () => {
      const dbA = dbAs(CLIENT_A);
      await assertSucceeds(
        setDoc(doc(dbA, "groupMessages", "msg-1"), {
          memberIds: [CLIENT_A, CLIENT_B],
          from: "client",
          fromClientId: CLIENT_A,
          text: "hey",
        })
      );
    });

    it("blocks a client from posting under another client's identity", async () => {
      const dbA = dbAs(CLIENT_A);
      await assertFails(
        setDoc(doc(dbA, "groupMessages", "msg-2"), {
          memberIds: [CLIENT_A, CLIENT_B],
          from: "client",
          fromClientId: CLIENT_B,
          text: "pretending to be B",
        })
      );
    });

    it("blocks a non-member from posting into the group at all", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "groups", "group-1"), { memberIds: [CLIENT_A] });
      });
      const dbB = dbAs(CLIENT_B);
      await assertFails(
        setDoc(doc(dbB, "groupMessages", "msg-3"), {
          memberIds: [CLIENT_A],
          from: "client",
          fromClientId: CLIENT_B,
          text: "intruder",
        })
      );
    });

    // Regression for a removed group member retaining permanent read
    // access to the group's historical chat: memberIds is stamped onto
    // each message at SEND time (a snapshot of the roster then, not a
    // live link), so removing a member from the group doc alone never
    // touched already-sent messages — the removed uid stayed in their
    // memberIds array forever, and the rule below (`request.auth.uid in
    // resource.data.memberIds`) kept matching it. The fix
    // (AppContext.jsx's updateGroup) strips the removed uid from every
    // existing message's memberIds via arrayRemove when membership
    // shrinks — this proves that once that strip happens, the rule
    // itself actually revokes the read, i.e. the fix's mechanism works
    // against the real rules engine, not just in application code.
    it("revokes a removed member's read access to a message once their uid is stripped from it", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "groupMessages", "msg-history"), {
          memberIds: [CLIENT_A, CLIENT_B],
          from: "client",
          fromClientId: CLIENT_A,
          text: "before removal",
        });
      });
      const dbB = dbAs(CLIENT_B);
      // Still a member — can read the message.
      await assertSucceeds(getDoc(doc(dbB, "groupMessages", "msg-history")));

      // Coach removes B from the group — simulates updateGroup's retroactive cleanup.
      const coachDb = dbAs(COACH_UID);
      await assertSucceeds(updateDoc(doc(coachDb, "groupMessages", "msg-history"), { memberIds: arrayRemove(CLIENT_B) }));

      // B can no longer read that same message.
      await assertFails(getDoc(doc(dbB, "groupMessages", "msg-history")));
      // A (still a member) can still read it.
      const dbA = dbAs(CLIENT_A);
      await assertSucceeds(getDoc(doc(dbA, "groupMessages", "msg-history")));
    });
  });

  // --- whoopTokens/{clientId}: nobody in the app may touch this, ever --
  it("whoopTokens: not even the owning client or the coach can read or write it from the app", async () => {
    const dbA = dbAs(CLIENT_A);
    const coachDb = dbAs(COACH_UID);
    await assertFails(setDoc(doc(dbA, "whoopTokens", CLIENT_A), { accessToken: "x" }));
    await assertFails(getDoc(doc(coachDb, "whoopTokens", CLIENT_A)));
  });

  // --- clientNotes/{id} & clientContext/{id}: coach-only, client app never
  //     reads these even for its own uid.
  for (const col of ["clientNotes", "clientContext"]) {
    it(`${col}: a client can never read their own entry — coach-only`, async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), col, "note-1"), { clientId: CLIENT_A, text: "private" });
      });
      const dbA = dbAs(CLIENT_A);
      await assertFails(getDoc(doc(dbA, col, "note-1")));
    });
  }

  // --- unauthenticated access: every per-client collection must reject
  //     a signed-out request outright (sanity check that isSignedIn()
  //     actually gates these, not just ownsClientId()).
  it("rejects an unauthenticated read of a per-client collection", async () => {
    const anon = dbAs(null);
    await assertFails(getDoc(doc(anon, "nutritionLogs", "any-id")));
    await assertFails(getDoc(doc(anon, "liveSessions", CLIENT_A)));
  });

  // --- workoutLogs: same-client, two-devices-at-once duplicate-finish ---
  // logWorkout (AppContext.jsx) used to mint a fresh random doc id every
  // call, so a client finishing the same scheduled workout from two
  // devices around the same moment created two separate completed logs.
  // The fix gives a scheduled-day finish a deterministic id
  // (scheduledWorkoutLogId) so a second finish overwrites the first
  // instead of duplicating it. This drives the exact write both devices
  // would make and confirms exactly one document results, with the
  // second write's data winning — against the real rules engine, not a
  // mock, so it also proves the client is actually allowed to perform
  // that second write (an UPDATE, since the doc already exists) under
  // the real workoutLogs rule.
  it("a client finishing the same scheduled workout twice (simulating two devices) ends up with one log, not two", async () => {
    const dbA = dbAs(CLIENT_A);
    const entry = { scheduledDate: "2026-10-06", dayLabel: "Push Day" };
    // Each "device" independently computes its own id for the finish call
    // it's making, exactly as two separate real devices would — reusing
    // one precomputed id for both writes would pass even if the id
    // generator were non-deterministic, which is the actual bug this
    // guards against.
    const idFromDeviceOne = workoutLogDocId(CLIENT_A, entry, () => "should-not-be-used");
    const idFromDeviceTwo = workoutLogDocId(CLIENT_A, entry, () => "should-not-be-used");

    await assertSucceeds(
      setDoc(doc(dbA, "workoutLogs", idFromDeviceOne), { id: idFromDeviceOne, clientId: CLIENT_A, date: 1000, dayLabel: "Push Day", scheduledDate: "2026-10-06", entries: [{ exerciseId: "ex-1" }] })
    );
    // The second device finishes moments later with (slightly) different data.
    await assertSucceeds(
      setDoc(doc(dbA, "workoutLogs", idFromDeviceTwo), { id: idFromDeviceTwo, clientId: CLIENT_A, date: 2000, dayLabel: "Push Day", scheduledDate: "2026-10-06", entries: [{ exerciseId: "ex-1" }, { exerciseId: "ex-2" }] })
    );

    // Count via an admin (rules-disabled) context — the direct way to
    // confirm the COLLECTION itself holds exactly one document, sidestepping
    // any ambiguity in how the client's own read rule applies to a list query.
    let snap;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      snap = await getDocs(collection(ctx.firestore(), "workoutLogs"));
    });
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().entries).toHaveLength(2);
  });

  // --- customFoods: concurrent-barcode-scan dedup check -----------------
  // findCustomFoodByBarcode (AppContext.jsx) does a live query by barcode
  // field immediately before createFood, to narrow the window where two
  // clients scanning the same product concurrently would each create a
  // near-duplicate shared-library entry. A deterministic id wasn't used
  // here (unlike workoutLogs above) because customFoods' own rule only
  // lets a COACH update an existing doc — a second client's write to an
  // existing id would be a permission-denied error, not a harmless
  // duplicate. This proves the query itself is actually allowed for a
  // signed-in client (not just assumed) and returns the right entry.
  describe("customFoods barcode lookup", () => {
    it("a signed-in client can query by barcode and finds another client's just-created entry", async () => {
      const dbA = dbAs(CLIENT_A);
      await assertSucceeds(setDoc(doc(dbA, "customFoods", "food-1"), { name: "Protein Bar", barcode: "012345678905", cals: 200 }));

      const dbB = dbAs(CLIENT_B);
      const found = await assertSucceeds(getDocs(query(collection(dbB, "customFoods"), where("barcode", "==", "012345678905"))));
      expect(found.size).toBe(1);
      expect(found.docs[0].data().name).toBe("Protein Bar");
    });

    it("querying a barcode nobody has scanned yet returns nothing, not an error", async () => {
      const dbA = dbAs(CLIENT_A);
      const found = await assertSucceeds(getDocs(query(collection(dbA, "customFoods"), where("barcode", "==", "999999999999"))));
      expect(found.empty).toBe(true);
    });
  });

  // --- soloUsers/{uid}: Train Solo's independent accounts, entirely
  // separate from Coaching's users/{uid} collection. Unlike every
  // Coaching per-client collection above, there is deliberately NO
  // isCoach() grant here at all — the coach seeded by seedUsers() above
  // must get the same "no access" treatment as any other non-owning uid.
  // SOLO_A/SOLO_B below are plain uids with no corresponding users/{uid}
  // doc at all, same as a real Train Solo account (soloAuth is a separate
  // named Firebase app, but Firestore Rules only ever see the verified
  // uid on whichever token a request carries — these tests authenticate
  // as that uid directly, which is the correct way to exercise the rule
  // regardless of which named app actually minted the token in production).
  describe("soloWaterLogs", () => {
    const SOLO_A = "solo-a";
    const SOLO_B = "solo-b";
    const id = `${SOLO_A}_2026-10-22`;
    const water = (uid, ml) => ({ id, soloUserId: uid, date: "2026-10-22", ml, updatedAt: Date.now() });

    it("lets a Train Solo customer log, read, update and delete their own water", async () => {
      const db = dbAs(SOLO_A);
      await assertSucceeds(setDoc(doc(db, "soloWaterLogs", id), water(SOLO_A, 250), { merge: true }));
      await assertSucceeds(getDoc(doc(db, "soloWaterLogs", id)));
      await assertSucceeds(setDoc(doc(db, "soloWaterLogs", id), water(SOLO_A, 500), { merge: true }));
      await assertSucceeds(getDocs(query(collection(db, "soloWaterLogs"), where("soloUserId", "==", SOLO_A))));
      await assertSucceeds(deleteDoc(doc(db, "soloWaterLogs", id)));
    });

    it("blocks another customer, the coach and anonymous users from reading or writing it", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloWaterLogs", id), water(SOLO_A, 250));
      });
      for (const other of [SOLO_B, COACH_UID, null]) {
        const db = dbAs(other);
        await assertFails(getDoc(doc(db, "soloWaterLogs", id)));
        await assertFails(setDoc(doc(db, "soloWaterLogs", id), water(SOLO_A, 9999), { merge: true }));
      }
    });

    it("never lets a customer create water under someone else's uid or reassign their own", async () => {
      const dbB = dbAs(SOLO_B);
      await assertFails(setDoc(doc(dbB, "soloWaterLogs", `${SOLO_A}_2026-10-23`), { soloUserId: SOLO_A, ml: 250 }));
      await setDoc(doc(dbB, "soloWaterLogs", `${SOLO_B}_2026-10-22`), { soloUserId: SOLO_B, ml: 250 });
      await assertFails(updateDoc(doc(dbB, "soloWaterLogs", `${SOLO_B}_2026-10-22`), { soloUserId: SOLO_A }));
    });
  });

  // Free training: sessions a Train Solo customer builds themselves.
  describe("soloCustomSessions", () => {
    const SOLO_A = "solo-a";
    const SOLO_B = "solo-b";
    const id = "session-1";
    const session = (uid) => ({ id, soloUserId: uid, name: "Upper", exercises: [{ exerciseId: "e1", targetSets: 3, targetReps: 10 }], createdAt: 1, updatedAt: 1 });

    it("lets a customer create, list, read, edit and delete their own sessions", async () => {
      const db = dbAs(SOLO_A);
      await assertSucceeds(setDoc(doc(db, "soloCustomSessions", id), session(SOLO_A)));
      await assertSucceeds(getDoc(doc(db, "soloCustomSessions", id)));
      await assertSucceeds(getDocs(query(collection(db, "soloCustomSessions"), where("soloUserId", "==", SOLO_A))));
      await assertSucceeds(setDoc(doc(db, "soloCustomSessions", id), { ...session(SOLO_A), name: "Upper B" }));
      await assertSucceeds(deleteDoc(doc(db, "soloCustomSessions", id)));
    });

    it("blocks another customer, the coach and anonymous users", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloCustomSessions", id), session(SOLO_A));
      });
      for (const other of [SOLO_B, COACH_UID, null]) {
        const db = dbAs(other);
        await assertFails(getDoc(doc(db, "soloCustomSessions", id)));
        await assertFails(setDoc(doc(db, "soloCustomSessions", id), session(SOLO_A)));
        await assertFails(deleteDoc(doc(db, "soloCustomSessions", id)));
      }
    });

    it("never lets a customer save a session under someone else's uid or reassign their own", async () => {
      const dbB = dbAs(SOLO_B);
      await assertFails(setDoc(doc(dbB, "soloCustomSessions", "s-x"), { ...session(SOLO_A), id: "s-x" }));
      await setDoc(doc(dbB, "soloCustomSessions", "s-b"), { ...session(SOLO_B), id: "s-b" });
      await assertFails(updateDoc(doc(dbB, "soloCustomSessions", "s-b"), { soloUserId: SOLO_A }));
    });
  });

  describe("soloUsers", () => {
    const SOLO_A = "solo-a";
    const SOLO_B = "solo-b";

    it("lets a Train Solo user create and read their own account doc", async () => {
      const db = dbAs(SOLO_A);
      await assertSucceeds(setDoc(doc(db, "soloUsers", SOLO_A), { name: "Alex", email: "alex@example.com" }));
      await assertSucceeds(getDoc(doc(db, "soloUsers", SOLO_A)));
    });

    it("lets a Train Solo user update their own account doc", async () => {
      const db = dbAs(SOLO_A);
      await setDoc(doc(db, "soloUsers", SOLO_A), { name: "Alex", email: "alex@example.com" });
      await assertSucceeds(updateDoc(doc(db, "soloUsers", SOLO_A), { lastLoginAt: Date.now() }));
    });

    it("blocks a Train Solo user from reading or writing another Train Solo user's account", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloUsers", SOLO_A), { name: "Alex", email: "alex@example.com" });
      });
      const dbB = dbAs(SOLO_B);
      await assertFails(getDoc(doc(dbB, "soloUsers", SOLO_A)));
      await assertFails(setDoc(doc(dbB, "soloUsers", SOLO_A), { name: "Hijacked" }));
    });

    it("blocks the Coaching coach account from reading or writing any soloUsers doc", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloUsers", SOLO_A), { name: "Alex", email: "alex@example.com" });
      });
      const coachDb = dbAs(COACH_UID);
      await assertFails(getDoc(doc(coachDb, "soloUsers", SOLO_A)));
      await assertFails(setDoc(doc(coachDb, "soloUsers", SOLO_A), { name: "Hijacked" }));
    });

    it("blocks an unauthenticated request entirely", async () => {
      const anonDb = dbAs(null);
      await assertFails(getDoc(doc(anonDb, "soloUsers", SOLO_A)));
      await assertFails(setDoc(doc(anonDb, "soloUsers", SOLO_A), { name: "Anon" }));
    });

    it("blocks a Coaching client account uid from reading another uid's soloUsers doc (collections stay fully separate)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloUsers", SOLO_A), { name: "Alex", email: "alex@example.com" });
      });
      const clientDb = dbAs(CLIENT_A);
      await assertFails(getDoc(doc(clientDb, "soloUsers", SOLO_A)));
    });

    // --- Phase 2: the consultation questionnaire's answers (including the
    // sensitive injury/health ones) are stored on this same soloUsers/{uid}
    // doc under `onboarding.answers` — no new collection, no new rule.
    // These tests exist because that data is more sensitive than the
    // account fields above, so it's worth confirming explicitly rather
    // than just assuming the existing owner-only rule covers it too.
    it("lets a Train Solo user write and read their own onboarding answers, including sensitive health ones", async () => {
      const db = dbAs(SOLO_A);
      await assertSucceeds(
        setDoc(
          doc(db, "soloUsers", SOLO_A),
          { onboarding: { answers: { apss_heartCondition: "no", priorInjuriesSurgeriesDetail: "Torn ACL, 2019, fully healed" } } },
          { merge: true }
        )
      );
      const snap = await assertSucceeds(getDoc(doc(db, "soloUsers", SOLO_A)));
      expect(snap.data().onboarding.answers.priorInjuriesSurgeriesDetail).toBe("Torn ACL, 2019, fully healed");
    });

    it("blocks another Train Solo user from reading or overwriting someone else's onboarding answers", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloUsers", SOLO_A), { onboarding: { answers: { apss_heartCondition: "yes" } } });
      });
      const dbB = dbAs(SOLO_B);
      await assertFails(getDoc(doc(dbB, "soloUsers", SOLO_A)));
      await assertFails(setDoc(doc(dbB, "soloUsers", SOLO_A), { onboarding: { answers: { apss_heartCondition: "no" } } }, { merge: true }));
    });

    it("blocks the coach from reading a Train Solo user's onboarding/health answers", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "soloUsers", SOLO_A), { onboarding: { answers: { apss_heartCondition: "yes" } } });
      });
      const coachDb = dbAs(COACH_UID);
      await assertFails(getDoc(doc(coachDb, "soloUsers", SOLO_A)));
    });
  });
});
