// @vitest-environment jsdom
//
// #157: with no signal, a Train Solo customer's own saves (a built session,
// a start date, a progress photo, the questionnaire's Finish…) awaited a
// server answer that never came — the button sat on "Saving…" for good — and
// Log out waited on the push-token clean-up the same way. They now come back
// within seconds, kept on the phone (Firestore sends them later). Also: the
// Train Solo password reset.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";
import { setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { signOut, sendPasswordResetEmail } from "firebase/auth";
import { removeSoloPushToken } from "./push";

const never = () => new Promise(() => {}); // no signal: the server never answers

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => () => Promise.resolve({ data: {} })) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: "u1", email: "u1@example.invalid" });
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
  sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ id: "newid", path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  increment: (n) => ({ increment: n }),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => true }),
  writeBatch: vi.fn(),
  collection: (_db, name) => ({ collection: name }),
  query: (ref) => ref,
  where: vi.fn(),
  onSnapshot: () => () => {},
}));

let api;
function Probe() {
  api = useSoloApp();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  setDoc.mockImplementation(never);
  updateDoc.mockImplementation(never);
  deleteDoc.mockImplementation(never);
  writeBatch.mockImplementation(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: never }));
  render(
    <SoloAppProvider>
      <Probe />
    </SoloAppProvider>
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function settlesOffline(promise) {
  let state = "still waiting";
  promise.then(
    () => (state = "settled"),
    () => (state = "rejected")
  );
  await act(async () => vi.advanceTimersByTime(5000));
  return state;
}

describe("Train Solo saves with no signal", () => {
  const cases = [
    ["saving a built session", () => api.saveSoloCustomSession("u1", { name: "Push", exercises: [] })],
    ["deleting a built session", () => api.deleteSoloCustomSession("s1")],
    ["saving a built program", () => api.saveSoloCustomProgram("u1", { name: "Block" })],
    ["a program start date", () => api.setPurchaseStartDate("u1_p1", "2026-11-10")],
    ["an All Access start date", () => api.setEnrolmentStartDate("e1", "2026-11-10")],
    ["a progress photo", () => api.addSoloProgressPhoto("u1", "data:image/jpeg;base64,x", "", "2026-11-04")],
    ["a weigh-in", () => api.logSoloWeight("u1", 80)],
    ["a body metric", () => api.logSoloBodyMetric("u1", "2026-11-04", "bodyFat", 15)],
    ["a questionnaire answer (Finish)", () => api.saveOnboardingAnswer("u1", {}, "goal", "strength")],
    ["a recovery add-on", () => api.setRecoveryAddon("u1", "r1")],
    ["moving a missed session", () => api.setSoloSessionPlan("u1", "u1_p1", "w1_d1", { skipped: true })],
    ["planning a session", () => api.planSoloSession("u1", "plan1", "s1", "2026-11-05")],
    ["water", () => api.addSoloWater("u1", "2026-11-04", 250, 0)],
  ];
  for (const [label, run] of cases) {
    it(`${label} comes back instead of waiting forever`, async () => {
      expect(await settlesOffline(run())).toBe("settled");
    });
  }

  it("still reports a quick refusal from the server", async () => {
    vi.useRealTimers();
    setDoc.mockImplementation(() => Promise.reject(new Error("permission-denied")));
    await expect(api.saveSoloCustomSession("u1", { name: "Push", exercises: [] })).rejects.toThrow("permission-denied");
  });
});

describe("Train Solo log out with no signal", () => {
  it("signs out even when the push-token clean-up never answers", async () => {
    removeSoloPushToken.mockImplementation(never);
    const { soloAuth } = await import("./firebase");
    soloAuth.currentUser = { uid: "u1" };
    expect(await settlesOffline(api.soloLogout())).toBe("settled");
    expect(signOut).toHaveBeenCalled();
  });
});

describe("Train Solo password reset", () => {
  it("sends Firebase's reset email for the Train Solo login, returning to Train Solo's sign-in", async () => {
    vi.useRealTimers();
    await api.sendSoloPasswordReset("  me@example.invalid ");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), "me@example.invalid", expect.objectContaining({ url: expect.stringMatching(/\/solo\/login$/) }));
  });
  it("never says whether an account exists", async () => {
    vi.useRealTimers();
    sendPasswordResetEmail.mockImplementationOnce(() => Promise.reject({ code: "auth/user-not-found" }));
    await expect(api.sendSoloPasswordReset("nobody@example.invalid")).resolves.toBeUndefined();
  });
  it("explains a bad address", async () => {
    vi.useRealTimers();
    sendPasswordResetEmail.mockImplementationOnce(() => Promise.reject({ code: "auth/invalid-email" }));
    await expect(api.sendSoloPasswordReset("nope")).rejects.toThrow("That doesn't look like a valid email.");
  });
});

describe("signed in to Train Solo on this phone (#161)", () => {
  it("is remembered so the app opens back into Train Solo", () => {
    expect(localStorage.getItem("apexSoloSignedIn")).toBe("1");
  });
});
