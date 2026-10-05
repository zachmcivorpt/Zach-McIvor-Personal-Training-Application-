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
import { collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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
      await assertSucceeds(setDoc(doc(dbA, col, id), { clientId: CLIENT_A, text: "hi coach" }));
      await assertSucceeds(getDoc(doc(dbA, col, id)));
      await assertFails(updateDoc(doc(dbA, col, id), { text: "edited" }));
      await assertFails(deleteDoc(doc(dbA, col, id)));
    });
  }

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
});
