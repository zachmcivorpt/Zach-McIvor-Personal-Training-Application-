// @vitest-environment jsdom
//
// Register #102: finishing a Train Solo workout with no signal. Firestore's
// setDoc only settles when the server answers — offline, never — so
// awaiting it left "Complete Workout" spinning forever. logSoloWorkout must
// now come back within seconds, marked queued (kept on the phone).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: "u1", email: "u1@example.invalid" });
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(() => new Promise(() => {})), // no signal: the server never answers
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => true }),
  writeBatch: vi.fn(),
  collection: (_db, name) => ({ collection: name }),
  query: (ref) => ref,
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: () => () => {},
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let api;
function Probe() {
  api = useSoloApp();
  return null;
}

describe("Train Solo: finishing a workout offline", () => {
  it("comes back marked queued instead of waiting forever", async () => {
    vi.useFakeTimers();
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    let result = "still waiting";
    api.logSoloWorkout("u1", { purchaseId: "p", dayId: "d", weekNumber: 1, dayLabel: "Day 1", entries: [], durationMin: 30 }).then((r) => (result = r));
    await act(async () => vi.advanceTimersByTime(5000));
    expect(result).toMatchObject({ id: "p_d_w1", queued: true });
  });
});
