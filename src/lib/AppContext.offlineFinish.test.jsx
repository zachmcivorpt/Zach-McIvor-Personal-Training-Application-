// @vitest-environment jsdom
//
// Register #102: finishing a coached workout with no signal. Firestore's
// setDoc only settles when the server answers — offline, never — so
// awaiting it left "Finish" spinning forever. logWorkout must now come back
// within seconds as "queued" (kept on the phone, sent later).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppProvider, useApp } from "./AppContext";

vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => {};
  },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(() => new Promise(() => {})), // no signal: the server never answers
  updateDoc: vi.fn(() => new Promise(() => {})),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  query: (ref) => ref,
  where: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: () => () => {},
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let api;
function Probe() {
  api = useApp();
  return null;
}

describe("coached app: finishing a workout offline", () => {
  it("logWorkout comes back queued instead of waiting forever", async () => {
    vi.useFakeTimers();
    render(<AppProvider><Probe /></AppProvider>);
    let result = "still waiting";
    api.logWorkout("c1", { dayLabel: "Push", entries: [], durationMin: 40 }).then((r) => (result = r));
    await act(async () => vi.advanceTimersByTime(5000));
    expect(result).toBe("queued");
  });

  it("an edit to a logged workout comes back queued too", async () => {
    vi.useFakeTimers();
    render(<AppProvider><Probe /></AppProvider>);
    let result = "still waiting";
    api.updateWorkoutLogEntries("log1", [], { sessionNote: "" }).then((r) => (result = r));
    await act(async () => vi.advanceTimersByTime(5000));
    expect(result).toBe("queued");
  });
});
