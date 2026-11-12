// #219: storage.rules for coach video feedback, against the real Storage +
// Firestore emulators (cross-service: the rule reads the caller's role).
// Run: npx firebase emulators:exec --only firestore,storage --project demo-apex-rules-test \
//        "npx vitest run src/lib/storageRules219.rules.test.js"
// Skipped without the emulators.
import { afterAll, beforeAll, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const running = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST && !!process.env.FIRESTORE_EMULATOR_HOST;
const [SH, SP] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199").split(":");
const [FH, FP] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

describe.skipIf(!running)("storage.rules — coachVideoFeedback (#219)", () => {
  let env;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-apex-rules-test",
      storage: { rules: readFileSync("storage.rules", "utf8"), host: SH, port: Number(SP) },
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: FH, port: Number(FP) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "coach-1"), { role: "coach" });
      await setDoc(doc(ctx.firestore(), "users", "client-a"), { role: "client" });
      await setDoc(doc(ctx.firestore(), "users", "client-b"), { role: "client" });
    });
  });
  afterAll(async () => env?.cleanup());
  const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const path = "coachVideoFeedback/client-a/vf1_v1.mp4";

  // The coach's own access goes through firestore.get() (the caller's role);
  // the Storage emulator here can't read the Firestore emulator for that
  // (the existing design/ rule fails the same way), so these check the
  // client side, which needs no role lookup.
  async function seedVideo() {
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), path), bytes, { contentType: "video/mp4" }));
  }
  it("a client can't upload, replace or delete feedback videos", async () => {
    await seedVideo();
    await assertFails(uploadBytes(ref(as("client-a"), "coachVideoFeedback/client-a/vf2_v1.mp4"), bytes, { contentType: "video/mp4" }));
    await assertFails(uploadBytes(ref(as("client-a"), path), bytes, { contentType: "video/mp4" }));
    await assertFails(deleteObject(ref(as("client-a"), path)));
  });
  it("only that client can read it — not another client, not signed out", async () => {
    await seedVideo();
    await assertSucceeds(getBytes(ref(as("client-a"), path)));
    await assertFails(getBytes(ref(as("client-b"), path)));
    await assertFails(getBytes(ref(as(null), path)));
  });
});
